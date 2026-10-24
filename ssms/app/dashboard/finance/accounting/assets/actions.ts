'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Fixed assets register and depreciation (migration 047).
//   See:    FINANCE_VIEW / FINANCE_APPROVE
//   Change: FINANCE_APPROVE — an asset's cost, useful life, salvage value and
//           accounts; post or undo a month's depreciation.
// The database writes every entry: gl_post_asset (the cost into the books),
// gl_post_depreciation (a month), gl_post_disposal (an asset disposed of or
// lost, from the property pages).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { loadAccounts, readGlSettings } from '@/lib/finance/gl-data';
import { ASSETS_MIGRATION, type DepreciationLine, type FixedAsset, type FixedAssetsData } from '@/lib/finance/assets';

type Row = Record<string, unknown>;

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Not found — reload the page');
const month = z.string().regex(/^\d{4}-\d{2}-01$/, 'Choose a month');

function friendly(e: unknown): string {
  const msg = errorMessage(e);
  if (/useful_life_months|booked_against_id|asset_id|gl_depreciation|gl_post_depreciation|gl_undo_depreciation|depreciation_month/.test(msg) && /does not exist|schema cache|Could not find/.test(msg)) {
    return ASSETS_MIGRATION;
  }
  if (/DEP_ORDER/.test(msg)) return 'A later month is already posted. Months go in order — undo the later month first.';
  if (/DEP_NOT_ENDED/.test(msg)) return 'A month can be posted once it has ended.';
  return msg;
}

const ASSET_COLUMNS =
  'id, tag, name_en, name_am, category, status, acquisition_type, value, acquired_on, useful_life_months, salvage_value, depreciation_start, gl_account_id, booked_against_id, disposed_on, unit:organization_units(name_en, name_am)';

export async function loadFixedAssets(): Promise<Loaded<FixedAssetsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'FINANCE_APPROVE');
    const [rows, settings, accounts, mappings, entries, lines] = await Promise.all([
      selectAll<Row>((a, b) => db.from('assets').select(ASSET_COLUMNS).order('tag').order('id').range(a, b)),
      readGlSettings(db),
      loadAccounts(db),
      db.from('gl_mappings').select('source, key, account_id').then(check) as Promise<{ source: string; key: string; account_id: string }[]>,
      selectAll<Row>((a, b) =>
        db.from('journal_entries')
          .select('entry_no, source, asset_id, depreciation_month, total, entry_date')
          .in('source', ['ASSET', 'DISPOSAL', 'DEPRECIATION'])
          .order('id')
          .range(a, b)
      ),
      selectAll<Row>((a, b) =>
        db.from('journal_lines')
          .select('asset_id, credit, entry:journal_entries!inner(source, status)')
          .not('asset_id', 'is', null)
          .eq('entry.source', 'DEPRECIATION')
          .eq('entry.status', 'POSTED')
          .gt('credit', 0)
          .order('id')
          .range(a, b)
      ),
    ]);
    if (!settings) throw new Error('Open Finance → Accounting → Chart of accounts once to set up the books');

    const accumulated = new Map<string, number>();
    for (const l of lines) accumulated.set(l.asset_id as string, (accumulated.get(l.asset_id as string) ?? 0) + Number(l.credit));
    const inBooks = new Map<string, string>();
    const disposals = new Map<string, string>();
    const runs: FixedAssetsData['runs'] = [];
    for (const e of entries) {
      if (e.source === 'ASSET') inBooks.set(e.asset_id as string, e.entry_no as string);
      else if (e.source === 'DISPOSAL') disposals.set(e.asset_id as string, e.entry_no as string);
      else runs.push({ month: e.depreciation_month as string, entry_no: e.entry_no as string, total: Number(e.total), entry_date: e.entry_date as string });
    }
    runs.sort((a, b) => b.month.localeCompare(a.month));

    const assets: FixedAsset[] = rows.map((r) => {
      const unit = (r.unit ?? null) as { name_en?: string; name_am?: string | null } | null;
      return {
        id: r.id as string,
        tag: r.tag as string,
        name_en: r.name_en as string,
        name_am: (r.name_am as string) || (r.name_en as string),
        category: r.category as string,
        status: r.status as string,
        unit: unit?.name_en ?? '',
        unit_am: unit?.name_am || unit?.name_en || '',
        acquisition_type: r.acquisition_type as FixedAsset['acquisition_type'],
        cost: r.value === null ? null : Number(r.value),
        acquired_on: (r.acquired_on as string) ?? null,
        useful_life_months: (r.useful_life_months as number) ?? null,
        salvage_value: Number(r.salvage_value ?? 0),
        depreciation_start: (r.depreciation_start as string) ?? null,
        gl_account_id: (r.gl_account_id as string) ?? null,
        booked_against_id: (r.booked_against_id as string) ?? null,
        disposed_on: (r.disposed_on as string) ?? null,
        accumulated: Math.round((accumulated.get(r.id as string) ?? 0) * 100) / 100,
        entry_no: inBooks.get(r.id as string) ?? null,
        disposal_no: disposals.get(r.id as string) ?? null,
      };
    });

    const rule = (source: string, key: string) => mappings.find((m) => m.source === source && m.key === key)?.account_id ?? null;
    return {
      mode: 'live',
      data: {
        assets,
        runs,
        accounts: accounts.filter((a) => !a.is_header && a.is_active),
        categoryAccount: Object.fromEntries(mappings.filter((m) => m.source === 'ASSET_CATEGORY').map((m) => [m.key, m.account_id])),
        defaultAccount: rule('DEFAULT', 'FIXED_ASSETS'),
        suggestions: { opening: rule('DEFAULT', 'OPENING_BALANCE'), donations: rule('INCOME_CATEGORY', 'Donations') },
        lockDate: settings.lock_date,
        canManage: me.permissions.includes('FINANCE_APPROVE') && me.tenant.access.mode === 'full',
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

const SetupSchema = z
  .object({
    cost: z.coerce.number().min(0, 'The cost cannot be negative').max(1_000_000_000),
    depreciate: z.boolean(),
    life_months: z.coerce.number().int().min(1, 'The useful life is at least one month').max(1200, 'At most 100 years'),
    salvage: z.coerce.number().min(0, 'The salvage value cannot be negative'),
    start: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
    gl_account_id: z.string(),
    booked_against_id: z.string(),
  })
  .refine((s) => !s.depreciate || s.salvage < s.cost, { message: 'The salvage value must be less than the cost' })
  .refine((s) => !s.booked_against_id || s.cost > 0, { message: 'Enter the cost to put the asset in the books' });

export type AssetSetupInput = z.input<typeof SetupSchema>;

/** An asset's cost, depreciation and accounts. Changing them posts its entries again. */
export async function saveAssetSetup(assetId: string, input: AssetSetupInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_APPROVE');
    const s = SetupSchema.parse(input);
    const { data: asset } = await db.from('assets').select('id, acquired_on').eq('id', uuid.parse(assetId)).maybeSingle();
    if (!asset) throw new Error('Not found — reload the page');
    if (s.depreciate && !s.start && !(asset as { acquired_on: string | null }).acquired_on) {
      throw new Error('Choose when depreciation starts (the asset has no acquisition date)');
    }
    const res = await db.from('assets')
      .update({
        value: s.cost || null,
        useful_life_months: s.depreciate ? s.life_months : null,
        salvage_value: s.depreciate ? s.salvage : 0,
        depreciation_start: s.depreciate ? s.start || null : null,
        gl_account_id: s.gl_account_id ? uuid.parse(s.gl_account_id) : null,
        booked_against_id: s.booked_against_id ? uuid.parse(s.booked_against_id) : null,
      })
      .eq('id', (asset as { id: string }).id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** What posting a month would write, asset by asset. */
export async function previewDepreciation(m: string): Promise<{ ok: true; lines: DepreciationLine[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('FINANCE_VIEW', 'FINANCE_APPROVE');
    const rows = (await db.rpc('gl_depreciation_preview', { p_month: month.parse(m) }).then(check)) as Row[];
    return {
      ok: true,
      lines: (rows ?? []).map((r) => ({
        asset_id: r.asset_id as string,
        tag: r.tag as string,
        name_en: r.name_en as string,
        cost: Number(r.cost),
        salvage: Number(r.salvage),
        life: Number(r.life),
        months: Number(r.months),
        booked: Number(r.booked),
        amount: Number(r.amount),
      })),
    };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function postDepreciation(m: string): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const total = await db.rpc('gl_post_depreciation', { p_month: month.parse(m), p_by: me.systemUser.id }).then(check);
    return { ok: true, total: Number(total ?? 0) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Removes the latest month's depreciation, e.g. to correct an asset and post it again. */
export async function undoDepreciation(m: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_APPROVE');
    await db.rpc('gl_undo_depreciation', { p_month: month.parse(m) }).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
