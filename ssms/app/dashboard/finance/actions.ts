'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Finance server actions — payment requests (department → finance head) and
// the income/expense ledger.
//
//   submit   (FINANCE_REQUEST, own unit)       → PENDING
//   review   (FINANCE_APPROVE, not own request) → APPROVED | REJECTED | RETURNED
//   resubmit (requester, RETURNED)              → PENDING
//   cancel   (requester, PENDING/RETURNED)      → CANCELLED
//   pay      (FINANCE_CREATE, APPROVED)         → COMPLETED + EXPENSE in ledger
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type {
  FinanceData,
  FinanceRequest,
  FinanceTxn,
  FinanceUnit,
  RequestPriority,
  RequestStatus,
} from '@/lib/finance/types';

type Row = Record<string, unknown> & { id: string };
type ByUser = { person?: { full_name_en?: string | null } | null } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const STAFF = ['FINANCE_VIEW', 'FINANCE_APPROVE', 'FINANCE_CREATE'] as const;

function isStaff(me: SessionUser) {
  return STAFF.some((p) => me.permissions.includes(p));
}

const personName = (u: unknown) => (u as ByUser)?.person?.full_name_en ?? '';

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadFinance(): Promise<Loaded<FinanceData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'FINANCE_REQUEST', 'FINANCE_APPROVE', 'FINANCE_CREATE');
    const staff = isStaff(me);

    const unitRows = (await db.from('organization_units')
      .select('id, name_en, name_am')
      .eq('is_active', true)
      .order('sort_order')
      .then(check)) as FinanceUnit[];

    const requestRows = await selectAll<Row>((a, b) => {
      let q = db.from('finance_requests')
        .select('*, unit:organization_units(name_en, name_am), requester:system_users!finance_requests_requested_by_fkey(person:persons!system_users_person_id_fkey(full_name_en)), reviewer:system_users!finance_requests_reviewed_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
        .order('created_at', { ascending: false })
        .order('id');
      if (!staff) {
        // Requesters see their own requests and those of the units they belong to
        const units = me.organizationIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        q = units.length
          ? q.or(`requested_by.eq.${me.systemUser.id},organization_unit_id.in.(${units.join(',')})`)
          : q.eq('requested_by', me.systemUser.id);
      }
      return q.range(a, b);
    });

    const requests: FinanceRequest[] = requestRows.map((r) => {
      const unit = (r.unit ?? {}) as { name_en?: string; name_am?: string | null };
      return {
        id: r.id,
        request_no: r.request_no as string,
        unit_id: r.organization_unit_id as string,
        unit: unit.name_en ?? '—',
        unit_am: unit.name_am || unit.name_en || '—',
        requested_by_id: r.requested_by as string,
        requested_by: personName(r.requester) || '—',
        title: r.title as string,
        category: r.category as string,
        amount: Number(r.amount),
        needed_by: (r.needed_by as string) ?? null,
        justification: (r.justification as string) ?? '',
        priority: r.priority as RequestPriority,
        status: r.status as RequestStatus,
        review_note: (r.review_note as string) ?? '',
        reviewed_by: personName(r.reviewer),
        reviewed_at: (r.reviewed_at as string) ?? null,
        paid_at: (r.paid_at as string) ?? null,
        payment_reference: (r.payment_reference as string) ?? '',
        created_at: r.created_at as string,
      };
    });

    let transactions: FinanceTxn[] = [];
    if (me.permissions.includes('FINANCE_VIEW')) {
      const txnRows = await selectAll<Row>((a, b) =>
        db.from('finance_transactions')
          .select('*, unit:organization_units(name_en), request:finance_requests(request_no), recorder:system_users!finance_transactions_recorded_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .order('txn_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(a, b)
      );
      transactions = txnRows.map((t) => ({
        id: t.id,
        type: t.txn_type as FinanceTxn['type'],
        category: t.category as string,
        amount: Number(t.amount),
        date: t.txn_date as string,
        description: (t.description as string) ?? '',
        party: (t.party as string) ?? '',
        receipt_no: (t.receipt_no as string) ?? '',
        unit: ((t.unit as { name_en?: string } | null)?.name_en) ?? '',
        request_no: ((t.request as { request_no?: string } | null)?.request_no) ?? '',
        recorded_by: personName(t.recorder),
      }));
    }

    // Requesters only need their own units in the "New request" form
    const units = staff ? unitRows : unitRows.filter((u) => me.organizationIds.includes(u.id));

    return { mode: 'live', data: { requests, transactions, units } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

// ── Requests ─────────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  unit_id: z.string().min(1, 'Choose the requesting department'),
  title: z.string().trim().min(3, 'Enter a short title for the request'),
  category: z.string().trim().min(1, 'Choose a category'),
  amount: z.coerce.number().positive('Amount must be more than 0').max(100_000_000, 'Amount is too large'),
  needed_by: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
  justification: z.string().trim().min(5, 'Explain what the money is for'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
});

export type RequestInput = z.input<typeof RequestSchema>;

function requestFields(r: z.output<typeof RequestSchema>) {
  return {
    organization_unit_id: r.unit_id,
    title: r.title,
    category: r.category,
    amount: r.amount,
    needed_by: r.needed_by || null,
    justification: r.justification,
    priority: r.priority,
  };
}

export async function submitRequest(
  input: RequestInput
): Promise<{ ok: true; request_no: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_REQUEST', 'FINANCE_CREATE');
    const r = RequestSchema.parse(input);
    if (!isStaff(me) && !me.organizationIds.includes(r.unit_id)) {
      throw new Error('You can only request money for a department you belong to');
    }
    const row = (await db.from('finance_requests')
      .insert({ ...requestFields(r), requested_by: me.systemUser.id, status: 'PENDING' })
      .select('request_no')
      .single()
      .then(check)) as { request_no: string };
    return { ok: true, request_no: row.request_no };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

async function ownRequest(db: Awaited<ReturnType<typeof authorize>>['db'], id: string, me: SessionUser) {
  const row = (await db.from('finance_requests').select('id, status, requested_by').eq('id', id).single().then(check)) as {
    id: string; status: RequestStatus; requested_by: string;
  };
  if (row.requested_by !== me.systemUser.id) throw new Error('Only the person who made this request can change it');
  return row;
}

export async function resubmitRequest(id: string, input: RequestInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_REQUEST', 'FINANCE_CREATE');
    const r = RequestSchema.parse(input);
    const row = await ownRequest(db, id, me);
    if (row.status !== 'RETURNED') throw new Error('Only a request returned for changes can be resubmitted');
    if (!isStaff(me) && !me.organizationIds.includes(r.unit_id)) {
      throw new Error('You can only request money for a department you belong to');
    }
    await db.from('finance_requests')
      .update({ ...requestFields(r), status: 'PENDING', reviewed_by: null, reviewed_at: null })
      .eq('id', id)
      .eq('status', 'RETURNED')
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function cancelRequest(id: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_REQUEST', 'FINANCE_CREATE');
    const row = await ownRequest(db, id, me);
    if (row.status !== 'PENDING' && row.status !== 'RETURNED') {
      throw new Error('This request can no longer be cancelled');
    }
    await db.from('finance_requests').update({ status: 'CANCELLED' }).eq('id', id).in('status', ['PENDING', 'RETURNED']).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function reviewRequest(
  id: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  note: string
): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision)) throw new Error('Invalid decision');
    const cleanNote = note.trim();
    if (decision !== 'APPROVED' && cleanNote.length < 3) {
      throw new Error('Write a note explaining why the request is rejected or returned');
    }
    const row = (await db.from('finance_requests').select('status, requested_by').eq('id', id).single().then(check)) as {
      status: RequestStatus; requested_by: string;
    };
    if (row.requested_by === me.systemUser.id) throw new Error('You cannot review your own request — another approver must do it');
    if (row.status !== 'PENDING') throw new Error('This request has already been reviewed');

    const updated = (await db.from('finance_requests')
      .update({ status: decision, review_note: cleanNote || null, reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('id')
      .then(check)) as { id: string }[];
    if (!updated.length) throw new Error('This request has already been reviewed');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const PaySchema = z.object({
  paid_at: isoDate,
  reference: z.string().trim().min(1, 'Enter the receipt or voucher number'),
  payee: z.string().trim(),
});

/** Pay an approved request: marks it COMPLETED and writes the expense to the ledger. */
export async function markRequestPaid(id: string, input: z.input<typeof PaySchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const p = PaySchema.parse(input);
    const req = (await db.from('finance_requests')
      .select('id, request_no, title, category, amount, organization_unit_id, status')
      .eq('id', id)
      .single()
      .then(check)) as {
      id: string; request_no: string; title: string; category: string; amount: number; organization_unit_id: string; status: RequestStatus;
    };
    if (req.status !== 'APPROVED') throw new Error('Only an approved request can be paid');

    const updated = (await db.from('finance_requests')
      .update({ status: 'COMPLETED', paid_by: me.systemUser.id, paid_at: p.paid_at, payment_reference: p.reference })
      .eq('id', id)
      .eq('status', 'APPROVED')
      .select('id')
      .then(check)) as { id: string }[];
    if (!updated.length) throw new Error('This request was already paid');

    const { error } = await db.from('finance_transactions').insert({
      txn_type: 'EXPENSE',
      category: req.category,
      amount: req.amount,
      txn_date: p.paid_at,
      description: `${req.request_no} — ${req.title}`,
      party: p.payee || null,
      receipt_no: p.reference,
      organization_unit_id: req.organization_unit_id,
      request_id: req.id,
      recorded_by: me.systemUser.id,
    });
    if (error) {
      // Keep the request and the ledger consistent
      await db.from('finance_requests')
        .update({ status: 'APPROVED', paid_by: null, paid_at: null, payment_reference: null })
        .eq('id', id);
      throw new Error(error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Ledger ───────────────────────────────────────────────────────────────────

const TxnSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().trim().min(1, 'Choose a category'),
  amount: z.coerce.number().positive('Amount must be more than 0').max(100_000_000, 'Amount is too large'),
  date: isoDate,
  party: z.string().trim(),
  receipt_no: z.string().trim(),
  unit_id: z.string(),
  description: z.string().trim(),
});

export async function recordTransaction(input: z.input<typeof TxnSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const t = TxnSchema.parse(input);
    await db.from('finance_transactions')
      .insert({
        txn_type: t.type,
        category: t.category,
        amount: t.amount,
        txn_date: t.date,
        party: t.party || null,
        receipt_no: t.receipt_no || null,
        organization_unit_id: t.unit_id || null,
        description: t.description || null,
        recorded_by: me.systemUser.id,
      })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
