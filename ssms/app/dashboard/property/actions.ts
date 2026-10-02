'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Property: asset register, custody changes, maintenance and stocktake.
//   ASSET_VIEW                       see everything
//   ASSET_CREATE                     register / edit, repairs, stocktake, dispose
//   ASSET_ASSIGN or ASSET_TRANSFER   change department / custodian
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type {
  AcquisitionType,
  Asset,
  AssetCondition,
  AssetMovement,
  AssetStatus,
  MaintenanceJob,
  MaintenanceKind,
  MaintenanceStatus,
  PropertyData,
} from '@/lib/property/types';

type Row = Record<string, unknown> & { id: string };
type Named = { full_name_en?: string | null; name_en?: string | null; name_am?: string | null } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const optionalDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date');
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
const today = () => new Date().toISOString().slice(0, 10);

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadProperty(): Promise<Loaded<PropertyData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('ASSET_VIEW', 'AUDIT_VIEW_ALL');
    const [assetRows, movementRows, maintenanceRows, units, persons, students] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('assets')
          .select('*, unit:organization_units(name_en, name_am), custodian:persons!assets_custodian_person_id_fkey(full_name_en)')
          .order('tag')
          .range(a, b)
      ),
      selectAll<Row>((a, b) =>
        db.from('asset_movements')
          .select('*, from_unit:organization_units!asset_movements_from_unit_id_fkey(name_en), to_unit:organization_units!asset_movements_to_unit_id_fkey(name_en), from_person:persons!asset_movements_from_person_id_fkey(full_name_en), to_person:persons!asset_movements_to_person_id_fkey(full_name_en), recorder:system_users!asset_movements_recorded_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .order('moved_on', { ascending: false })
          .order('created_at', { ascending: false })
          .range(a, b)
      ),
      selectAll<Row>((a, b) =>
        db.from('asset_maintenance').select('*').order('reported_on', { ascending: false }).order('id').range(a, b)
      ),
      db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check) as Promise<PropertyData['units']>,
      selectAll<{ id: string; full_name_en: string }>((a, b) =>
        db.from('persons').select('id, full_name_en').eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
    ]);
    const studentPersons = new Set(students.map((s) => s.person_id));

    const assets: Asset[] = assetRows.map((r) => {
      const unit = r.unit as Named;
      return {
        id: r.id,
        tag: r.tag as string,
        name_en: r.name_en as string,
        name_am: (r.name_am as string) || (r.name_en as string),
        category: r.category as string,
        serial_no: (r.serial_no as string) ?? '',
        condition: r.condition as AssetCondition,
        status: r.status as AssetStatus,
        unit_id: (r.organization_unit_id as string) ?? null,
        unit: unit?.name_en ?? '',
        unit_am: unit?.name_am || unit?.name_en || '',
        custodian_id: (r.custodian_person_id as string) ?? null,
        custodian: (r.custodian as Named)?.full_name_en ?? '',
        location: (r.location as string) ?? '',
        acquired_on: (r.acquired_on as string) ?? null,
        acquisition_type: r.acquisition_type as AcquisitionType,
        value: r.value === null || r.value === undefined ? null : Number(r.value),
        notes: (r.notes as string) ?? '',
        last_verified_on: (r.last_verified_on as string) ?? null,
      };
    });

    const movements: AssetMovement[] = movementRows.map((m) => ({
      id: m.id,
      asset_id: m.asset_id as string,
      from_unit: (m.from_unit as Named)?.name_en ?? '',
      to_unit: (m.to_unit as Named)?.name_en ?? '',
      from_person: (m.from_person as Named)?.full_name_en ?? '',
      to_person: (m.to_person as Named)?.full_name_en ?? '',
      moved_on: m.moved_on as string,
      reason: (m.reason as string) ?? '',
      recorded_by: ((m.recorder as { person?: Named } | null)?.person?.full_name_en) ?? '',
    }));

    const maintenance: MaintenanceJob[] = maintenanceRows.map((m) => ({
      id: m.id,
      asset_id: m.asset_id as string,
      kind: m.kind as MaintenanceKind,
      description: m.description as string,
      reported_on: m.reported_on as string,
      completed_on: (m.completed_on as string) ?? null,
      cost: m.cost === null || m.cost === undefined ? null : Number(m.cost),
      handled_by: (m.handled_by as string) ?? '',
      status: m.status as MaintenanceStatus,
      expense_booked: Boolean(m.transaction_id),
    }));

    return {
      mode: 'live',
      data: {
        assets,
        movements,
        maintenance,
        units,
        people: persons.filter((p) => !studentPersons.has(p.id)).map((p) => ({ id: p.id, name: p.full_name_en })),
      },
    };
  } catch (e) {
    const msg = errorMessage(e);
    return { mode: 'error', error: msg.includes('assets') ? 'Run database migration 014 (property) first' : msg };
  }
}

// ── Register / edit ──────────────────────────────────────────────────────────

const AssetSchema = z.object({
  name_en: z.string().trim().min(2, 'Enter the item name'),
  name_am: z.string().trim(),
  category: z.string().trim().min(1, 'Choose a category'),
  serial_no: z.string().trim(),
  condition: z.enum(CONDITIONS),
  location: z.string().trim(),
  acquired_on: optionalDate,
  acquisition_type: z.enum(['PURCHASE', 'DONATION', 'OTHER']),
  value: z.union([z.literal(''), z.coerce.number().min(0).max(1_000_000_000)]),
  notes: z.string().trim(),
  // only used when registering
  unit_id: z.string(),
  custodian_id: z.string(),
  in_store: z.boolean(),
});

export type AssetInput = z.input<typeof AssetSchema>;

export async function saveAsset(id: string | null, input: AssetInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ASSET_CREATE');
    const a = AssetSchema.parse(input);
    const details = {
      name_en: a.name_en,
      name_am: a.name_am || null,
      category: a.category,
      serial_no: a.serial_no || null,
      condition: a.condition,
      location: a.location || null,
      acquired_on: a.acquired_on || null,
      acquisition_type: a.acquisition_type,
      value: a.value === '' ? null : a.value,
      notes: a.notes || null,
    };
    if (id) {
      await db.from('assets').update(details).eq('id', id).then(check);
      return { ok: true };
    }
    const created = (await db.from('assets')
      .insert({
        ...details,
        status: a.in_store ? 'IN_STORE' : 'IN_USE',
        organization_unit_id: a.unit_id || null,
        custodian_person_id: a.custodian_id || null,
        last_verified_on: today(),
        verified_by: me.systemUser.id,
        created_by: me.systemUser.id,
      })
      .select('id')
      .single()
      .then(check)) as { id: string };
    if (a.unit_id || a.custodian_id) {
      await db.from('asset_movements').insert({
        asset_id: created.id,
        to_unit_id: a.unit_id || null,
        to_person_id: a.custodian_id || null,
        moved_on: today(),
        reason: 'Registered',
        recorded_by: me.systemUser.id,
      }).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Custody ──────────────────────────────────────────────────────────────────

const TransferSchema = z.object({
  to_unit_id: z.string(),
  to_person_id: z.string(),
  moved_on: isoDate,
  reason: z.string().trim().min(2, 'Give a short reason'),
  in_store: z.boolean(),
});

export async function transferAsset(assetId: string, input: z.input<typeof TransferSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ASSET_ASSIGN', 'ASSET_TRANSFER');
    const t = TransferSchema.parse(input);
    const asset = (await db.from('assets')
      .select('organization_unit_id, custodian_person_id, status')
      .eq('id', assetId)
      .single()
      .then(check)) as { organization_unit_id: string | null; custodian_person_id: string | null; status: AssetStatus };
    if (asset.status === 'DISPOSED' || asset.status === 'LOST') throw new Error('This asset is no longer held');
    if ((t.to_unit_id || null) === asset.organization_unit_id && (t.to_person_id || null) === asset.custodian_person_id) {
      throw new Error('Choose a different department or person');
    }

    await db.from('asset_movements').insert({
      asset_id: assetId,
      from_unit_id: asset.organization_unit_id,
      to_unit_id: t.to_unit_id || null,
      from_person_id: asset.custodian_person_id,
      to_person_id: t.to_person_id || null,
      moved_on: t.moved_on,
      reason: t.reason,
      recorded_by: me.systemUser.id,
    }).then(check);

    await db.from('assets')
      .update({
        organization_unit_id: t.to_unit_id || null,
        custodian_person_id: t.to_person_id || null,
        ...(asset.status === 'UNDER_REPAIR' ? {} : { status: t.in_store ? 'IN_STORE' : 'IN_USE' }),
      })
      .eq('id', assetId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Dispose of / write off an asset, or bring a lost one back. */
export async function setAssetStatus(assetId: string, status: 'DISPOSED' | 'LOST' | 'IN_STORE', note: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('ASSET_CREATE');
    if (!['DISPOSED', 'LOST', 'IN_STORE'].includes(status)) throw new Error('Invalid status');
    if (status !== 'IN_STORE' && note.trim().length < 3) throw new Error('Explain why (e.g. broken beyond repair, stolen)');
    const asset = (await db.from('assets').select('notes').eq('id', assetId).single().then(check)) as { notes: string | null };
    const stamped = note.trim() ? `${today()}: ${note.trim()}` : '';
    await db.from('assets')
      .update({ status, notes: [asset.notes, stamped].filter(Boolean).join('\n') || null })
      .eq('id', assetId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Maintenance ──────────────────────────────────────────────────────────────

const OpenSchema = z.object({
  kind: z.enum(['REPAIR', 'SERVICE', 'INSPECTION']),
  description: z.string().trim().min(3, 'Describe the problem or work'),
  reported_on: isoDate,
  handled_by: z.string().trim(),
});

export async function openMaintenance(assetId: string, input: z.input<typeof OpenSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ASSET_CREATE');
    const m = OpenSchema.parse(input);
    await db.from('asset_maintenance').insert({
      asset_id: assetId,
      kind: m.kind,
      description: m.description,
      reported_on: m.reported_on,
      handled_by: m.handled_by || null,
      status: 'OPEN',
      recorded_by: me.systemUser.id,
    }).then(check);
    if (m.kind === 'REPAIR') {
      await db.from('assets').update({ status: 'UNDER_REPAIR' }).eq('id', assetId).in('status', ['IN_USE', 'IN_STORE']).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const CloseSchema = z.object({
  completed_on: isoDate,
  cost: z.union([z.literal(''), z.coerce.number().min(0).max(100_000_000)]),
  condition: z.enum(CONDITIONS),
  book_expense: z.boolean(),
});

export async function closeMaintenance(jobId: string, input: z.input<typeof CloseSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ASSET_CREATE');
    const c = CloseSchema.parse(input);
    const cost = c.cost === '' ? null : c.cost;
    if (c.book_expense && !me.permissions.includes('FINANCE_CREATE')) {
      throw new Error('Only finance staff can add the cost to Expenses — save without that option');
    }
    const job = (await db.from('asset_maintenance')
      .select('id, asset_id, description, status, asset:assets(tag, organization_unit_id)')
      .eq('id', jobId)
      .single()
      .then(check)) as unknown as {
      id: string; asset_id: string; description: string; status: MaintenanceStatus; asset: { tag: string; organization_unit_id: string | null } | null;
    };
    if (job.status !== 'OPEN') throw new Error('This job is already closed');

    let transactionId: string | null = null;
    if (c.book_expense && cost) {
      const txn = (await db.from('finance_transactions')
        .insert({
          txn_type: 'EXPENSE',
          category: 'Maintenance & Repair',
          amount: cost,
          txn_date: c.completed_on,
          description: `${job.asset?.tag ?? ''} — ${job.description}`,
          organization_unit_id: job.asset?.organization_unit_id ?? null,
          recorded_by: me.systemUser.id,
        })
        .select('id')
        .single()
        .then(check)) as { id: string };
      transactionId = txn.id;
    }

    await db.from('asset_maintenance')
      .update({ status: 'DONE', completed_on: c.completed_on, cost, transaction_id: transactionId })
      .eq('id', jobId)
      .then(check);

    // Back in service unless another repair is still open
    const { count } = await db.from('asset_maintenance')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', job.asset_id)
      .eq('kind', 'REPAIR')
      .eq('status', 'OPEN');
    if ((count ?? 0) === 0) {
      await db.from('assets').update({ status: 'IN_USE' }).eq('id', job.asset_id).eq('status', 'UNDER_REPAIR').then(check);
    }
    await db.from('assets').update({ condition: c.condition }).eq('id', job.asset_id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function cancelMaintenance(jobId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('ASSET_CREATE');
    const job = (await db.from('asset_maintenance').select('asset_id, status').eq('id', jobId).single().then(check)) as {
      asset_id: string; status: MaintenanceStatus;
    };
    if (job.status !== 'OPEN') throw new Error('This job is already closed');
    await db.from('asset_maintenance').update({ status: 'CANCELLED' }).eq('id', jobId).then(check);
    const { count } = await db.from('asset_maintenance')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', job.asset_id)
      .eq('kind', 'REPAIR')
      .eq('status', 'OPEN');
    if ((count ?? 0) === 0) {
      await db.from('assets').update({ status: 'IN_USE' }).eq('id', job.asset_id).eq('status', 'UNDER_REPAIR').then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Stocktake ────────────────────────────────────────────────────────────────

export async function verifyAsset(
  assetId: string,
  input: { condition: AssetCondition; location: string }
): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ASSET_CREATE');
    const condition = z.enum(CONDITIONS).parse(input.condition);
    await db.from('assets')
      .update({ condition, location: input.location.trim() || null, last_verified_on: today(), verified_by: me.systemUser.id })
      .eq('id', assetId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
