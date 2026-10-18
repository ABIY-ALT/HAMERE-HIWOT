'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Member dues (migration 026). A payment covers one or more months of an
// Ethiopian year, gets a receipt number, and is also recorded as income in
// Finance ("Member Contributions"), so the ledger and the dues always agree.
//   FINANCE_VIEW     see
//   FINANCE_CREATE   record payments, set the monthly amount, Telegram reminders
//   FINANCE_APPROVE  cancel a receipt (removes its months and its income entry)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { ETHIOPIAN_MONTHS_AM, ETHIOPIAN_MONTHS_EN, todayIso } from '@/lib/utils/ethiopian-calendar';
import { DUES_MONTHS, currentEthiopianYear, monthsDue, unpaidMonths } from '@/lib/finance/dues';
import { escapeHtml, siteUrl, telegramConfigured, telegramToPersons } from '@/lib/telegram/bot';

type Row = Record<string, unknown>;

export interface DuesPayment {
  amount: number;
  paid_on: string;
  receipt_no: string;
}

export interface DuesMember {
  person_id: string;
  name_en: string;
  name_am: string;
  code: string;
  phone: string;
  /** month (1–12) → payment */
  paid: Record<number, DuesPayment>;
}

export interface DuesData {
  year: number;
  current_year: number;
  /** Months of this year due by today (12 for a past year) */
  due_months: number;
  rate: number | null;
  members: DuesMember[];
  can_record: boolean;
  can_cancel: boolean;
}

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

const MIGRATION_026 = 'Run database migrations 025 and 026 (parent portal, member dues) first';
const missing = (m: string) => (/member_dues|dues_rates|next_dues_receipt|is_guardian_only/.test(m) ? MIGRATION_026 : m);

/** Who pays dues: active members — not students, not parent-only records, not honorary members. */
async function duesMembers(db: Awaited<ReturnType<typeof authorize>>['db']) {
  const [persons, students] = await Promise.all([
    selectAll<Row>((a, b) =>
      db.from('persons')
        .select('id, full_name_en, full_name_am, membership_code, phone_primary, membership_type, is_guardian_only')
        .eq('status', 'ACTIVE')
        .order('full_name_en')
        .order('id')
        .range(a, b)
    ),
    selectAll<Row>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
  ]);
  const studentPersons = new Set(students.map((s) => s.person_id as string));
  return persons.filter((p) => !studentPersons.has(p.id as string) && !p.is_guardian_only && p.membership_type !== 'HONORARY');
}

export async function loadDues(year?: number): Promise<Loaded<DuesData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'AUDIT_VIEW_ALL');
    const current = currentEthiopianYear();
    const y = year && year > 1900 && year < 2200 ? Math.trunc(year) : current;
    const [members, rateRow, paid] = await Promise.all([
      duesMembers(db),
      db.from('dues_rates').select('monthly_amount').eq('year', y).maybeSingle(),
      selectAll<Row>((a, b) => db.from('member_dues').select('person_id, month, amount, paid_on, receipt_no').eq('year', y).order('id').range(a, b)),
    ]);
    if (rateRow.error) throw new Error(missing(rateRow.error.message));
    const byPerson = new Map<string, Record<number, DuesPayment>>();
    for (const p of paid) {
      const map = byPerson.get(p.person_id as string) ?? {};
      map[Number(p.month)] = { amount: Number(p.amount), paid_on: p.paid_on as string, receipt_no: p.receipt_no as string };
      byPerson.set(p.person_id as string, map);
    }
    return {
      mode: 'live',
      data: {
        year: y,
        current_year: current,
        due_months: monthsDue(y),
        rate: rateRow.data ? Number((rateRow.data as { monthly_amount: number }).monthly_amount) : null,
        members: members.map((m) => ({
          person_id: m.id as string,
          name_en: m.full_name_en as string,
          name_am: (m.full_name_am as string) || (m.full_name_en as string),
          code: (m.membership_code as string) ?? '',
          phone: (m.phone_primary as string) ?? '',
          paid: byPerson.get(m.id as string) ?? {},
        })),
        can_record: me.permissions.includes('FINANCE_CREATE'),
        can_cancel: me.permissions.includes('FINANCE_APPROVE'),
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

export async function setDuesRate(year: number, amount: number): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const y = z.number().int().min(1900).max(2200).parse(year);
    const a = z.coerce.number().min(0, 'The amount cannot be negative').max(1_000_000).parse(amount);
    const { error } = await db.from('dues_rates').upsert({ year: y, monthly_amount: a, updated_by: me.systemUser.id, updated_at: new Date().toISOString() }, { onConflict: 'year' });
    if (error) throw new Error(missing(error.message));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const PaymentSchema = z.object({
  person_id: z.string().min(1, 'Choose the member'),
  year: z.number().int().min(1900).max(2200),
  months: z.array(z.number().int().min(1).max(DUES_MONTHS)).min(1, 'Choose at least one month').max(DUES_MONTHS),
  amount_per_month: z.coerce.number().min(0).max(1_000_000),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
});

/** Record a payment for one member: the months, one receipt number, and one income entry in Finance. */
export async function recordDuesPayment(input: z.input<typeof PaymentSchema>): Promise<{ ok: true; receipt: DuesReceipt } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const p = PaymentSchema.parse(input);
    const months = [...new Set(p.months)].sort((a, b) => a - b);
    if (p.paid_on > todayIso()) throw new Error('The payment date cannot be in the future');
    const person = (await db.from('persons').select('full_name_en, full_name_am, membership_code').eq('id', p.person_id).single().then(check)) as {
      full_name_en: string; full_name_am: string | null; membership_code: string;
    };
    const { data: already, error: paidError } = await db.from('member_dues').select('month').eq('person_id', p.person_id).eq('year', p.year).in('month', months);
    if (paidError) throw new Error(missing(paidError.message));
    if ((already ?? []).length) {
      throw new Error(`Already paid: ${((already ?? []) as { month: number }[]).map((r) => ETHIOPIAN_MONTHS_EN[r.month - 1]).join(', ')}`);
    }

    const { data: receiptNo, error: seqError } = await db.rpc('next_dues_receipt', { p_year: p.year });
    if (seqError || !receiptNo) throw new Error(missing(seqError?.message ?? 'Could not number the receipt'));
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
          description: `Monthly dues ${p.year} E.C.: ${monthNames}`,
          party: person.full_name_en,
          receipt_no: receiptNo as string,
          recorded_by: me.systemUser.id,
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
        recorded_by: me.systemUser.id,
      }))
    );
    if (error) {
      // Keep the ledger and the dues in step
      if (transactionId) await db.from('finance_transactions').delete().eq('id', transactionId);
      throw new Error(/duplicate|unique/i.test(error.message) ? 'One of these months was just paid by someone else — reload the page' : error.message);
    }
    return {
      ok: true,
      receipt: {
        receipt_no: receiptNo as string,
        name_en: person.full_name_en,
        name_am: person.full_name_am || person.full_name_en,
        code: person.membership_code,
        year: p.year,
        months,
        amount_per_month: p.amount_per_month,
        total,
        paid_on: p.paid_on,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Undo a receipt recorded by mistake: its months become unpaid and its income entry is removed. */
export async function cancelDuesReceipt(receiptNo: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_APPROVE');
    const rows = (await db.from('member_dues').select('id, transaction_id').eq('receipt_no', receiptNo).then(check)) as { id: string; transaction_id: string | null }[];
    if (rows.length === 0) throw new Error('Receipt not found');
    await db.from('member_dues').delete().eq('receipt_no', receiptNo).then(check);
    const txn = rows.find((r) => r.transaction_id)?.transaction_id;
    if (txn) await db.from('finance_transactions').delete().eq('id', txn).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Telegram reminder to members who are behind by at least `minBehind` months (only those who connected Telegram). */
export async function sendDuesReminders(year: number, minBehind: number): Promise<{ ok: true; members: number; delivered: number } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    if (!telegramConfigured()) throw new Error('The Telegram bot is not set up yet');
    const y = z.number().int().min(1900).max(2200).parse(year);
    const min = z.number().int().min(1).max(DUES_MONTHS).parse(minBehind);
    const due = monthsDue(y);
    const [members, paid, rateRow] = await Promise.all([
      duesMembers(db),
      selectAll<Row>((a, b) => db.from('member_dues').select('person_id, month').eq('year', y).order('id').range(a, b)),
      db.from('dues_rates').select('monthly_amount').eq('year', y).maybeSingle(),
    ]);
    const rate = rateRow.data ? Number((rateRow.data as { monthly_amount: number }).monthly_amount) : null;
    const paidBy = new Map<string, number[]>();
    for (const p of paid) paidBy.set(p.person_id as string, [...(paidBy.get(p.person_id as string) ?? []), Number(p.month)]);

    let count = 0;
    let delivered = 0;
    for (const m of members) {
      const unpaid = unpaidMonths(paidBy.get(m.id as string) ?? [], due);
      if (unpaid.length < min) continue;
      count += 1;
      const owed = rate ? ` (${(rate * unpaid.length).toLocaleString('en-US')} ብር / birr)` : '';
      const text =
        `🧾 <b>የወርሃዊ መዋጮ ማስታወሻ · Monthly dues</b>\n` +
        escapeHtml(`${(m.full_name_am as string) || (m.full_name_en as string)}፣ የ${y} ዓ.ም ያልተከፈሉ ወራት፦ ${unpaid.map((x) => ETHIOPIAN_MONTHS_AM[x - 1]).join('፣ ')}${owed}\n`) +
        escapeHtml(`${m.full_name_en}, unpaid months of ${y} E.C.: ${unpaid.map((x) => ETHIOPIAN_MONTHS_EN[x - 1]).join(', ')}${owed}\n`) +
        siteUrl();
      delivered += (await telegramToPersons(db, [m.id as string], text)).delivered;
    }
    return { ok: true, members: count, delivered };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
