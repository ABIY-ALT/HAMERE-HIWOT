// ─────────────────────────────────────────────────────────────────────────────
// Recording a dues payment — server only, never a server action itself (the
// callers check permissions). Used by Finance → Member dues → Record payment
// and by approving a payment a member reported in the Telegram bot, so both
// give a receipt number, the paid months and one income entry in Finance.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { check } from '@/lib/auth/authorize';
import { ETHIOPIAN_MONTHS_EN, todayIso } from '@/lib/utils/ethiopian-calendar';

export interface DuesReceipt {
  receipt_no: string;
  name_en: string;
  name_am: string;
  code: string;
  year: number;
  months: number[];
  amount_per_month: number;
  total: number;
  paid_on: string;
}

export const DUES_MIGRATION = 'Run database migrations 025 and 026 (parent portal, member dues) first';
export const duesMissing = (m: string) => (/member_dues|dues_rates|next_dues_receipt|is_guardian_only/.test(m) ? DUES_MIGRATION : m);

export async function recordPayment(
  db: SupabaseClient,
  recordedBy: string,
  p: { person_id: string; year: number; months: number[]; amount_per_month: number; paid_on: string; note?: string }
): Promise<DuesReceipt> {
  const months = [...new Set(p.months)].sort((a, b) => a - b);
  if (months.length === 0) throw new Error('Choose at least one month');
  if (p.paid_on > todayIso()) throw new Error('The payment date cannot be in the future');
  const person = (await db.from('persons').select('full_name_en, full_name_am, membership_code').eq('id', p.person_id).single().then(check)) as {
    full_name_en: string; full_name_am: string | null; membership_code: string;
  };
  const { data: already, error: paidError } = await db.from('member_dues').select('month').eq('person_id', p.person_id).eq('year', p.year).in('month', months);
  if (paidError) throw new Error(duesMissing(paidError.message));
  if ((already ?? []).length) {
    throw new Error(`Already paid: ${((already ?? []) as { month: number }[]).map((r) => ETHIOPIAN_MONTHS_EN[r.month - 1]).join(', ')}`);
  }

  const { data: receiptNo, error: seqError } = await db.rpc('next_dues_receipt', { p_year: p.year });
  if (seqError || !receiptNo) throw new Error(duesMissing(seqError?.message ?? 'Could not number the receipt'));
  const total = Math.round(p.amount_per_month * months.length * 100) / 100;
  const monthNames = months.map((m) => ETHIOPIAN_MONTHS_EN[m - 1]).join(', ');

  let transactionId: string | null = null;
  if (total > 0) {
    const txn = (await db.from('finance_transactions')
      .insert({
        txn_type: 'INCOME',
        category: 'Member Contributions',
        amount: total,
        txn_date: p.paid_on,
        description: `Monthly dues ${p.year} E.C.: ${monthNames}${p.note ? ` — ${p.note}` : ''}`,
        party: person.full_name_en,
        receipt_no: receiptNo as string,
        recorded_by: recordedBy,
      })
      .select('id')
      .single()
      .then(check)) as { id: string };
    transactionId = txn.id;
  }
  const { error } = await db.from('member_dues').insert(
    months.map((m) => ({
      person_id: p.person_id,
      year: p.year,
      month: m,
      amount: p.amount_per_month,
      paid_on: p.paid_on,
      receipt_no: receiptNo as string,
      transaction_id: transactionId,
      recorded_by: recordedBy,
    }))
  );
  if (error) {
    // Keep the ledger and the dues in step
    if (transactionId) await db.from('finance_transactions').delete().eq('id', transactionId);
    throw new Error(/duplicate|unique/i.test(error.message) ? 'One of these months was just paid by someone else — reload the page' : error.message);
  }
  return {
    receipt_no: receiptNo as string,
    name_en: person.full_name_en,
    name_am: person.full_name_am || person.full_name_en,
    code: person.membership_code,
    year: p.year,
    months,
    amount_per_month: p.amount_per_month,
    total,
    paid_on: p.paid_on,
  };
}

/** Undo a receipt: its months become unpaid and its income entry is removed. */
export async function removeReceipt(db: SupabaseClient, receiptNo: string): Promise<void> {
  const rows = (await db.from('member_dues').select('id, transaction_id').eq('receipt_no', receiptNo).then(check)) as { id: string; transaction_id: string | null }[];
  if (rows.length === 0) throw new Error('Receipt not found');
  await db.from('member_dues').delete().eq('receipt_no', receiptNo).then(check);
  const txn = rows.find((r) => r.transaction_id)?.transaction_id;
  if (txn) await db.from('finance_transactions').delete().eq('id', txn).then(check);
}

/** All the months of a payment report: `periods` (migration 029), else its one year's months. */
export function periodsOf(claim: { year: number; months: number[] | null; periods?: number[] | null }): number[] {
  if (claim.periods?.length) return [...claim.periods].map(Number).sort((a, b) => a - b);
  return (claim.months ?? []).map((m) => Number(claim.year) * 100 + Number(m)).sort((a, b) => a - b);
}
