'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Member dues (migration 026). A payment covers one or more months of an
// Ethiopian year, gets a receipt number, and is also recorded as income in
// Finance ("Member Contributions"), so the ledger and the dues always agree.
//   FINANCE_VIEW     see
//   FINANCE_CREATE   record payments, set the monthly amount, Telegram reminders
//   FINANCE_APPROVE  cancel a receipt (removes its months and its income entry)
// Members can also report a payment in the Telegram bot ("💳 I paid",
// migration 028); it waits under "Payment reports" until someone with
// FINANCE_CREATE approves it (recorded like any payment) or rejects it.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { ETHIOPIAN_MONTHS_AM, ETHIOPIAN_MONTHS_EN } from '@/lib/utils/ethiopian-calendar';
import { DUES_MONTHS, currentEthiopianYear, monthsDue, unpaidMonths } from '@/lib/finance/dues';
import { escapeHtml, sendTelegram, siteUrl, telegramConfigured, telegramToPersons } from '@/lib/telegram/bot';
import { recordPayment, type DuesReceipt } from '@/lib/finance/dues-record';
import { nonMemberIds } from '@/lib/members/membership';

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
  /** Months reported in the bot, waiting for approval */
  pending: number[];
}

/** A payment a member reported in the Telegram bot, waiting for approval. */
export interface DuesClaim {
  id: string;
  person_id: string;
  name_en: string;
  name_am: string;
  code: string;
  year: number;
  months: number[];
  /** The total the member says they paid */
  amount: number;
  /** Monthly amount × months for that year, when a monthly amount is set */
  expected: number | null;
  method: 'CASH' | 'BANK' | 'TELEBIRR' | 'OTHER';
  reference: string;
  has_proof: boolean;
  paid_on: string;
  created_at: string;
}

export interface DuesData {
  year: number;
  current_year: number;
  /** Months of this year due by today (12 for a past year) */
  due_months: number;
  rate: number | null;
  members: DuesMember[];
  /** Payment reports from the bot, all years, oldest first */
  claims: DuesClaim[];
  /** false until migration 028 is applied */
  claims_ready: boolean;
  can_record: boolean;
  can_cancel: boolean;
}

export type { DuesReceipt } from '@/lib/finance/dues-record';

const MIGRATION_026 = 'Run database migrations 025 and 026 (parent portal, member dues) first';
const MIGRATION_028 = 'Run database migration 028 (dues reported in Telegram) first';
const missing = (m: string) =>
  /dues_claims|telegram_sessions/.test(m) ? MIGRATION_028 : /member_dues|dues_rates|next_dues_receipt|is_guardian_only/.test(m) ? MIGRATION_026 : m;

const METHOD_EN: Record<string, string> = { CASH: 'cash', BANK: 'bank', TELEBIRR: 'Telebirr', OTHER: 'other' };

/** Who pays dues: active members (students too when they are also members), not parent-only records, not honorary members. */
async function duesMembers(db: Awaited<ReturnType<typeof authorize>>['db']) {
  const [persons, notMembers] = await Promise.all([
    selectAll<Row>((a, b) =>
      db.from('persons')
        .select('id, full_name_en, full_name_am, membership_code, phone_primary, membership_type, is_guardian_only')
        .eq('status', 'ACTIVE')
        .order('full_name_en')
        .order('id')
        .range(a, b)
    ),
    nonMemberIds(db),
  ]);
  return persons.filter((p) => !notMembers.has(p.id as string) && !p.is_guardian_only && p.membership_type !== 'HONORARY');
}

export async function loadDues(year?: number): Promise<Loaded<DuesData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'AUDIT_VIEW_ALL');
    const current = currentEthiopianYear();
    const y = year && year > 1900 && year < 2200 ? Math.trunc(year) : current;
    const [members, rateRow, paid, claimRes] = await Promise.all([
      duesMembers(db),
      db.from('dues_rates').select('monthly_amount').eq('year', y).maybeSingle(),
      selectAll<Row>((a, b) => db.from('member_dues').select('person_id, month, amount, paid_on, receipt_no').eq('year', y).order('id').range(a, b)),
      db.from('dues_claims')
        .select('id, person_id, year, months, amount, method, reference, proof_file_id, paid_on, created_at')
        .eq('status', 'PENDING')
        .order('created_at')
        .limit(500),
    ]);
    if (rateRow.error) throw new Error(missing(rateRow.error.message));
    const byPerson = new Map<string, Record<number, DuesPayment>>();
    for (const p of paid) {
      const map = byPerson.get(p.person_id as string) ?? {};
      map[Number(p.month)] = { amount: Number(p.amount), paid_on: p.paid_on as string, receipt_no: p.receipt_no as string };
      byPerson.set(p.person_id as string, map);
    }

    // Payment reports from the bot (none before migration 028)
    const claimRows = claimRes.error ? [] : ((claimRes.data ?? []) as Row[]);
    const names = new Map(members.map((m) => [m.id as string, m]));
    const others = [...new Set(claimRows.map((c) => c.person_id as string))].filter((id) => !names.has(id));
    const claimYears = [...new Set(claimRows.map((c) => Number(c.year)))];
    const [otherPeople, rates] = await Promise.all([
      others.length ? db.from('persons').select('id, full_name_en, full_name_am, membership_code').in('id', others) : Promise.resolve({ data: [] }),
      claimYears.length ? db.from('dues_rates').select('year, monthly_amount').in('year', claimYears) : Promise.resolve({ data: [] }),
    ]);
    for (const p of (otherPeople.data ?? []) as Row[]) names.set(p.id as string, p);
    const rateOf = new Map(((rates.data ?? []) as Row[]).map((r) => [Number(r.year), Number(r.monthly_amount)]));
    const claims: DuesClaim[] = claimRows.map((c) => {
      const p = names.get(c.person_id as string);
      const months = (c.months as number[]).map(Number).sort((a, b) => a - b);
      const rate = rateOf.get(Number(c.year));
      return {
        id: c.id as string,
        person_id: c.person_id as string,
        name_en: (p?.full_name_en as string) ?? '—',
        name_am: (p?.full_name_am as string) || ((p?.full_name_en as string) ?? '—'),
        code: (p?.membership_code as string) ?? '',
        year: Number(c.year),
        months,
        amount: Number(c.amount),
        expected: rate === undefined ? null : rate * months.length,
        method: c.method as DuesClaim['method'],
        reference: (c.reference as string) ?? '',
        has_proof: Boolean(c.proof_file_id),
        paid_on: c.paid_on as string,
        created_at: c.created_at as string,
      };
    });
    const pendingBy = new Map<string, number[]>();
    for (const c of claims) if (c.year === y) pendingBy.set(c.person_id, [...(pendingBy.get(c.person_id) ?? []), ...c.months]);

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
          pending: pendingBy.get(m.id as string) ?? [],
        })),
        claims,
        claims_ready: !claimRes.error,
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
    return { ok: true, receipt: await recordPayment(db, me.systemUser.id, PaymentSchema.parse(input)) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

interface ClaimRow {
  person_id: string;
  year: number;
  months: number[];
  amount: number;
  method: string;
  reference: string | null;
  paid_on: string;
  chat_id: number | null;
}

/** Tell the member in the bot — in the chat they reported from, else their own linked chats. Never fails the action. */
async function tellMember(db: Awaited<ReturnType<typeof authorize>>['db'], claim: ClaimRow, html: string) {
  if (!telegramConfigured()) return;
  try {
    if (claim.chat_id) await sendTelegram(Number(claim.chat_id), html);
    else await telegramToPersons(db, [claim.person_id], html, 'SELF');
  } catch (e) {
    console.error('dues claim: telegram notice failed', e);
  }
}

const monthsAm = (claim: ClaimRow) => `${claim.months.map((m) => ETHIOPIAN_MONTHS_AM[Number(m) - 1]).join('፣ ')} ${claim.year} ዓ.ም`;

/**
 * Approve a payment reported in the bot: it is recorded like Record payment
 * (receipt number, the months, an income entry) and the member is told.
 * `amountPerMonth` — what Finance confirms; by default the reported total ÷ months.
 */
export async function approveDuesClaim(claimId: string, amountPerMonth?: number): Promise<{ ok: true; receipt: DuesReceipt } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const id = z.string().min(1).parse(claimId);
    const perMonth = amountPerMonth === undefined ? undefined : z.coerce.number().min(0, 'The amount cannot be negative').max(1_000_000).parse(amountPerMonth);
    // Take the report first, so two people approving at once cannot record it twice
    const { data: taken, error } = await db.from('dues_claims')
      .update({ status: 'APPROVED', reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('person_id, year, months, amount, method, reference, paid_on, chat_id');
    if (error) throw new Error(missing(error.message));
    const claim = ((taken ?? []) as ClaimRow[])[0];
    if (!claim) throw new Error('This report was already approved or rejected — reload the page');

    const months = claim.months.map(Number);
    let receipt: DuesReceipt;
    try {
      receipt = await recordPayment(db, me.systemUser.id, {
        person_id: claim.person_id,
        year: Number(claim.year),
        months,
        amount_per_month: perMonth ?? Math.round((Number(claim.amount) / months.length) * 100) / 100,
        paid_on: claim.paid_on,
        note: `reported on Telegram, ${METHOD_EN[claim.method] ?? claim.method}${claim.reference ? ` ${claim.reference}` : ''}`,
      });
    } catch (e) {
      // Back to the list, so it can be fixed and approved again, or rejected
      await db.from('dues_claims').update({ status: 'PENDING', reviewed_by: null, reviewed_at: null }).eq('id', id);
      throw e;
    }
    await db.from('dues_claims').update({ receipt_no: receipt.receipt_no }).eq('id', id);

    await tellMember(
      db,
      claim,
      `✅ <b>ክፍያዎ ጸድቋል · Payment approved</b>\n` +
        escapeHtml(`👤 ${receipt.name_am}\n📅 ${monthsAm(claim)}\n💰 ${receipt.total.toLocaleString('en-US')} ብር · birr\n🧾 ደረሰኝ · Receipt: ${receipt.receipt_no}\n`) +
        escapeHtml('እናመሰግናለን! · Thank you!')
    );
    return { ok: true, receipt };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Reject a payment reported in the bot (e.g. the money never arrived); the member is told why. */
export async function rejectDuesClaim(claimId: string, reason: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const id = z.string().min(1).parse(claimId);
    const note = z.string().trim().min(3, 'Write the reason, so the member knows what to do').max(300).parse(reason);
    const { data: taken, error } = await db.from('dues_claims')
      .update({ status: 'REJECTED', review_note: note, reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('person_id, year, months, amount, method, reference, paid_on, chat_id');
    if (error) throw new Error(missing(error.message));
    const claim = ((taken ?? []) as ClaimRow[])[0];
    if (!claim) throw new Error('This report was already approved or rejected — reload the page');

    await tellMember(
      db,
      claim,
      `❌ <b>የክፍያ ሪፖርትዎ አልጸደቀም · Payment report not approved</b>\n` +
        escapeHtml(`📅 ${monthsAm(claim)} — ${Number(claim.amount).toLocaleString('en-US')} ብር · birr\n📝 ምክንያት · Reason: ${note}\n`) +
        escapeHtml('ጥያቄ ካለዎት የፋይናንስ ክፍሉን ያነጋግሩ። · If you have questions, please contact the finance office.')
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
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
