// ─────────────────────────────────────────────────────────────────────────────
// "💳 I paid" in the Telegram bot — server only. A member reports a dues
// payment in a few steps; it waits in dues_claims until Finance approves it
// (Finance → Member dues → Payment reports). Steps, kept in telegram_sessions:
//   PERSON  (only when the chat is linked to several members) which member
//   COUNT   how many months — the oldest unpaid ones first, from the month
//           they joined; last year's unpaid months too when Finance keeps
//           last year here (a monthly amount is set for it); "all I owe"
//   METHOD  cash / bank / Telebirr / other
//   AMOUNT  the total, only when a year has no monthly amount set
//   PROOF   transaction number or a photo of the receipt (not for cash; can skip)
//   CONFIRM send to Finance
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater } from '@/lib/push/send';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  DUES_MONTHS,
  currentEthiopianYear,
  expectedTotal,
  firstOwedMonth,
  monthsDue,
  periodMonth,
  periodYear,
  periodsLabel,
  toPeriod,
} from '@/lib/finance/dues';
import { periodsOf } from '@/lib/finance/dues-record';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import type { ChatScope } from '@/lib/telegram/menu';

const e = escapeHtml;
const SESSION_MINUTES = 30;

export const CANCEL = '❌ ሰርዝ · Cancel';
const SKIP = '⏭ ዝለል · Skip';
const SEND = '✅ ላክ · Send';
const METHODS: [string, 'CASH' | 'BANK' | 'TELEBIRR' | 'OTHER', string][] = [
  ['💵 ጥሬ ገንዘብ · Cash', 'CASH', 'ጥሬ ገንዘብ'],
  ['🏦 ባንክ · Bank', 'BANK', 'ባንክ'],
  ['📱 ቴሌብር · Telebirr', 'TELEBIRR', 'ቴሌብር'],
  ['ሌላ · Other', 'OTHER', 'ሌላ'],
];
export const methodLabel = (m: string) => METHODS.find(([, code]) => code === m)?.[2] ?? m;

type Step = 'PERSON' | 'COUNT' | 'METHOD' | 'AMOUNT' | 'PROOF' | 'CONFIRM';
interface Data {
  options?: { id: string; name: string }[];
  person_id?: string;
  name?: string;
  /** Open months, oldest first (year × 100 + month) */
  available?: number[];
  /** How many of them are already due (the rest would be paid ahead) */
  due_now?: number;
  /** Monthly amount per year (JSON keys are strings) */
  rates?: Record<string, number>;
  periods?: number[];
  method?: 'CASH' | 'BANK' | 'TELEBIRR' | 'OTHER';
  amount?: number;
  reference?: string;
  proof_file_id?: string;
}
export interface PaidMessage {
  text: string;
  photoFileId?: string;
  caption?: string;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });
const birr = (n: number) => `${n.toLocaleString('en-US')} ብር`;

async function save(db: SupabaseClient, chatId: number, step: Step, data: Data) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

export async function clearSession(db: SupabaseClient, chatId: number) {
  await db.from('telegram_sessions').delete().eq('chat_id', chatId);
}

export async function activeSession(db: SupabaseClient, chatId: number): Promise<{ step: Step; data: Data } | null> {
  const { data } = await db.from('telegram_sessions').select('step, data, updated_at').eq('chat_id', chatId).maybeSingle();
  const row = data as { step: Step; data: Data; updated_at: string } | null;
  if (!row || Date.now() - Date.parse(row.updated_at) > SESSION_MINUTES * 60_000) return null;
  return { step: row.step, data: row.data ?? {} };
}

/** Members (not honorary) this chat may report for. */
async function payers(db: SupabaseClient, scope: ChatScope) {
  if (scope.duesPersonIds.length === 0) return [];
  const { data } = await db.from('persons').select('id, full_name_en, full_name_am').in('id', scope.duesPersonIds);
  return ((data ?? []) as { id: string; full_name_en: string; full_name_am: string | null }[]).map((p) => ({ id: p.id, name: p.full_name_am || p.full_name_en }));
}

/**
 * The months this member can report, oldest first: not paid, not waiting in
 * another report, not before they joined. Last year's too when Finance keeps
 * last year here (it has a monthly amount); this year's all 12 (paying ahead).
 */
export async function openPeriods(db: SupabaseClient, personId: string, today = todayIso()) {
  const year = currentEthiopianYear(today);
  const [{ data: person }, { data: rateRows }, { data: paid }, { data: pending }] = await Promise.all([
    db.from('persons').select('registered_on, created_at').eq('id', personId).maybeSingle(),
    db.from('dues_rates').select('year, monthly_amount').in('year', [year - 1, year]),
    db.from('member_dues').select('year, month').eq('person_id', personId).in('year', [year - 1, year]),
    db.from('dues_claims').select('*').eq('person_id', personId).eq('status', 'PENDING'),
  ]);
  const p = person as { registered_on: string | null; created_at: string | null } | null;
  const joined = p?.registered_on ?? p?.created_at?.slice(0, 10) ?? null;
  const rates: Record<string, number> = {};
  for (const r of (rateRows ?? []) as { year: number; monthly_amount: number }[]) rates[String(r.year)] = Number(r.monthly_amount);
  const taken = new Set([
    ...((paid ?? []) as { year: number; month: number }[]).map((r) => toPeriod(Number(r.year), Number(r.month))),
    ...((pending ?? []) as { year: number; months: number[] | null; periods?: number[] | null }[]).flatMap(periodsOf),
  ]);
  const years = rates[String(year - 1)] !== undefined ? [year - 1, year] : [year];
  const available: number[] = [];
  for (const y of years) {
    for (let m = firstOwedMonth(joined, y); m <= DUES_MONTHS; m++) if (!taken.has(toPeriod(y, m))) available.push(toPeriod(y, m));
  }
  const dueThisYear = monthsDue(year, today);
  const due_now = available.filter((x) => periodYear(x) < year || periodMonth(x) <= dueThisYear).length;
  return { available, due_now, rates };
}

const ratesOf = (data: Data): Record<number, number | undefined> =>
  Object.fromEntries(Object.entries(data.rates ?? {}).map(([y, r]) => [Number(y), r]));

async function askCount(db: SupabaseClient, chatId: number, data: Data) {
  const { available, due_now, rates } = await openPeriods(db, data.person_id!);
  if (available.length === 0) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('✅ ሁሉም ወራት ተከፍለዋል ወይም ማጽደቅ እየጠበቁ ናቸው። · All months are paid or waiting for approval.'));
  }
  await save(db, chatId, 'COUNT', { ...data, available, due_now, rates });
  const counts = [1, 2, 3, 4, 6, 12].filter((n) => n <= available.length && n !== due_now);
  const buttons = counts.map(String);
  const rows: string[][] = [];
  if (due_now > 0) rows.push([`${due_now} · ያለብኝ ሁሉ · all I owe`]);
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([CANCEL]);
  const owed = due_now ? expectedTotal(available.slice(0, due_now), ratesOf({ rates })) : null;
  return sendTelegram(
    chatId,
    `💳 <b>${e(data.name ?? '')}</b>\n` +
      e(`ያልተከፈሉ ወራት (ከቀደመው)፦ ${periodsLabel(available.slice(0, 8))}${available.length > 8 ? '…' : ''}\n`) +
      (due_now
        ? e(`እስካሁን ያለብዎ፦ ${due_now} ወር${owed !== null ? ` (${birr(owed)})` : ''} · You owe ${due_now} month(s) so far.\n`)
        : e('እስካሁን ያለብዎ የለም — የሚከፍሉት ቀድመው ነው። · Nothing owed yet — this would be paying ahead.\n')) +
      e('ስንት ወር ከፈሉ? ከቀደመው ያልተከፈለ ወር ጀምሮ ይቆጠራል።\nHow many months did you pay? They are counted from the oldest unpaid month.'),
    keyboard(rows)
  );
}

async function askMethod(db: SupabaseClient, chatId: number, data: Data) {
  await save(db, chatId, 'METHOD', data);
  return sendTelegram(chatId, e(`ወራት፦ ${periodsLabel(data.periods!)}\nእንዴት ከፈሉ? · How did you pay?`), keyboard([[METHODS[0][0], METHODS[1][0]], [METHODS[2][0], METHODS[3][0]], [CANCEL]]));
}

async function askProofOrConfirm(db: SupabaseClient, chatId: number, data: Data) {
  if (data.method === 'CASH') return confirm(db, chatId, data);
  await save(db, chatId, 'PROOF', data);
  return sendTelegram(
    chatId,
    e('የግብይት ቁጥሩን (transaction number) ይጻፉ ወይም የደረሰኙን ፎቶ / screenshot ይላኩ።\nType the transaction number, or send a photo / screenshot of the receipt.'),
    keyboard([[SKIP], [CANCEL]])
  );
}

async function confirm(db: SupabaseClient, chatId: number, data: Data) {
  await save(db, chatId, 'CONFIRM', data);
  const lines = [
    '🧾 <b>ማረጋገጫ · Please check</b>',
    e(`👤 ${data.name}`),
    e(`📅 ${periodsLabel(data.periods!)} (${data.periods!.length} ወር · months)`),
    e(`💰 ${birr(data.amount!)} · birr`),
    e(`💳 ${methodLabel(data.method!)}`),
  ];
  if (data.reference) lines.push(e(`🔢 ${data.reference}`));
  if (data.proof_file_id) lines.push(e('🖼️ የደረሰኝ ፎቶ ተያይዟል · receipt photo attached'));
  lines.push('', e('ለፋይናንስ ይላክ? · Send to Finance?'));
  return sendTelegram(chatId, lines.join('\n'), keyboard([[SEND], [CANCEL]]));
}

/** "💳 I paid" — start reporting a payment. */
export async function startPaid(db: SupabaseClient, chatId: number, scope: ChatScope) {
  const people = await payers(db, scope);
  if (people.length === 0) {
    return sendTelegram(chatId, e('ይህ ቻት ከአባልነት መዋጮ ጋር አልተያያዘም። · This chat is not linked to a member who pays dues.'));
  }
  if (people.length > 1) {
    await save(db, chatId, 'PERSON', { options: people });
    return sendTelegram(chatId, e('ለማን ነው? · For whom?'), keyboard([...people.map((p) => [p.name]), [CANCEL]]));
  }
  return askCount(db, chatId, { person_id: people[0].id, name: people[0].name });
}

/** Insert the report; before migration 029 (no `periods`) a report of one year still works. */
async function insertClaim(db: SupabaseClient, chatId: number, data: Data) {
  const periods = data.periods!;
  const first = periodYear(periods[0]);
  const older = {
    person_id: data.person_id,
    year: first,
    months: periods.filter((p) => periodYear(p) === first).map(periodMonth),
    amount: data.amount,
    method: data.method,
    reference: data.reference || null,
    proof_file_id: data.proof_file_id || null,
    paid_on: todayIso(),
    chat_id: chatId,
  };
  let { error } = await db.from('dues_claims').insert({ ...older, periods });
  if (error && /periods/.test(error.message)) {
    if (periods.some((p) => periodYear(p) !== first)) throw new Error('Run database migration 029 (dues of two years) first');
    ({ error } = await db.from('dues_claims').insert(older));
  }
  if (error) throw new Error(error.message);
}

/** The next step of a report in progress. */
export async function continuePaid(
  db: SupabaseClient,
  chatId: number,
  session: { step: Step; data: Data },
  message: PaidMessage,
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  const text = message.text.trim();
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }

  if (step === 'PERSON') {
    const person = data.options?.find((o) => o.name === text);
    if (!person) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    return askCount(db, chatId, { person_id: person.id, name: person.name });
  }

  if (step === 'COUNT') {
    // "3", or "5 · ያለብኝ ሁሉ · all I owe"
    const n = /^\d+/.test(text) ? parseInt(text, 10) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > (data.available?.length ?? 0)) return sendTelegram(chatId, e('ከአዝራሮቹ ቁጥር ይምረጡ። · Choose a number from the buttons.'));
    const periods = data.available!.slice(0, n);
    return askMethod(db, chatId, { ...data, periods, amount: expectedTotal(periods, ratesOf(data)) ?? undefined });
  }

  if (step === 'METHOD') {
    const method = METHODS.find(([label]) => label === text)?.[1];
    if (!method) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    const next = { ...data, method };
    if (!next.amount) {
      await save(db, chatId, 'AMOUNT', next);
      return sendTelegram(chatId, e('በጠቅላላ ስንት ብር ከፈሉ? (ቁጥር ብቻ) · How much did you pay in total, in birr? (numbers only)'), keyboard([[CANCEL]]));
    }
    return askProofOrConfirm(db, chatId, next);
  }

  if (step === 'AMOUNT') {
    const amount = Number(text.replace(/[,\s]|ብር|birr/gi, ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return sendTelegram(chatId, e('ቁጥር ይጻፉ፣ ለምሳሌ 150 · Type a number, e.g. 150'));
    return askProofOrConfirm(db, chatId, { ...data, amount });
  }

  if (step === 'PROOF') {
    if (message.photoFileId) return confirm(db, chatId, { ...data, proof_file_id: message.photoFileId, reference: (message.caption ?? '').trim().slice(0, 100) || data.reference });
    if (text === SKIP) return confirm(db, chatId, data);
    if (!text) return sendTelegram(chatId, e('ቁጥሩን ይጻፉ ወይም ፎቶ ይላኩ። · Type the number or send a photo.'));
    return confirm(db, chatId, { ...data, reference: text.slice(0, 100) });
  }

  if (step === 'CONFIRM') {
    if (text !== SEND) return sendTelegram(chatId, e('«ላክ» ወይም «ሰርዝ» ይጫኑ። · Tap Send or Cancel.'));
    try {
      await insertClaim(db, chatId, data);
    } finally {
      await clearSession(db, chatId);
    }
    notifyLater(
      { permissions: ['FINANCE_CREATE'] },
      {
        title: 'የመዋጮ ክፍያ ሪፖርት · Dues payment reported',
        body: `${data.name}: ${periodsLabel(data.periods!, 'en')} — ${data.amount} birr (${methodLabel(data.method!)})`,
        url: '/dashboard/finance/dues',
        tag: 'dues-claims',
      }
    );
    return sendTelegram(
      chatId,
      e('⏳ ለፋይናንስ ተልኳል። ሲጸድቅ እዚህ መልእክት ይደርስዎታል።\nSent to Finance. You will get a message here when it is approved.'),
      menu
    );
  }
  await clearSession(db, chatId);
  return sendTelegram(chatId, e('እንደገና ይጀምሩ። · Please start again.'), menu);
}
