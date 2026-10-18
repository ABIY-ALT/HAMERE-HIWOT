// ─────────────────────────────────────────────────────────────────────────────
// "💳 I paid" in the Telegram bot — server only. A member reports a dues
// payment in a few steps; it waits in dues_claims until Finance approves it
// (Finance → Member dues → Payment reports). Steps, kept in telegram_sessions:
//   PERSON  (only when the chat is linked to several members) which member
//   COUNT   how many months — the oldest unpaid ones first
//   METHOD  cash / bank / Telebirr / other
//   AMOUNT  the total, only when no monthly amount is set for the year
//   PROOF   transaction number or a photo of the receipt (not for cash; can skip)
//   CONFIRM send to Finance
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater } from '@/lib/push/send';
import { ETHIOPIAN_MONTHS_AM, todayIso } from '@/lib/utils/ethiopian-calendar';
import { DUES_MONTHS, currentEthiopianYear } from '@/lib/finance/dues';
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
  year?: number;
  available?: number[];
  months?: number[];
  rate?: number | null;
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
const monthNames = (months: number[]) => months.map((m) => ETHIOPIAN_MONTHS_AM[m - 1]).join('፣ ');

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
  if (scope.memberPersonIds.length === 0) return [];
  const { data } = await db.from('persons').select('id, full_name_en, full_name_am, membership_type').in('id', scope.memberPersonIds);
  return ((data ?? []) as { id: string; full_name_en: string; full_name_am: string | null; membership_type: string | null }[])
    .filter((p) => p.membership_type !== 'HONORARY')
    .map((p) => ({ id: p.id, name: p.full_name_am || p.full_name_en }));
}

/** Months of this year still open for this member: not paid, not waiting in another report (oldest first). */
async function openMonths(db: SupabaseClient, personId: string, year: number): Promise<number[]> {
  const [{ data: paid }, { data: pending }] = await Promise.all([
    db.from('member_dues').select('month').eq('person_id', personId).eq('year', year),
    db.from('dues_claims').select('months').eq('person_id', personId).eq('year', year).eq('status', 'PENDING'),
  ]);
  const taken = new Set([
    ...((paid ?? []) as { month: number }[]).map((r) => Number(r.month)),
    ...((pending ?? []) as { months: number[] }[]).flatMap((r) => r.months.map(Number)),
  ]);
  return Array.from({ length: DUES_MONTHS }, (_, i) => i + 1).filter((m) => !taken.has(m));
}

async function askCount(db: SupabaseClient, chatId: number, data: Data) {
  const year = currentEthiopianYear();
  const available = await openMonths(db, data.person_id!, year);
  if (available.length === 0) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e(`✅ የ${year} ዓ.ም ወራት በሙሉ ተከፍለዋል ወይም ማጽደቅ እየጠበቁ ናቸው። · All months of ${year} are paid or waiting for approval.`));
  }
  const { data: rate } = await db.from('dues_rates').select('monthly_amount').eq('year', year).maybeSingle();
  const counts = [1, 2, 3, 4, 5, 6, 12].filter((n) => n <= available.length);
  if (!counts.includes(available.length) && available.length > 6) counts.push(available.length);
  await save(db, chatId, 'COUNT', { ...data, year, available, rate: rate ? Number((rate as { monthly_amount: number }).monthly_amount) : null });
  const rows: string[][] = [];
  for (let i = 0; i < counts.length; i += 4) rows.push(counts.slice(i, i + 4).map(String));
  rows.push([CANCEL]);
  return sendTelegram(
    chatId,
    `💳 <b>${e(data.name ?? '')}</b>\n` +
      e(`ያልተከፈሉ ወራት (${year} ዓ.ም)፦ ${monthNames(available.slice(0, 6))}${available.length > 6 ? '…' : ''}\n`) +
      e('ስንት ወር ከፈሉ? ከቀደመው ወር ጀምሮ ይቆጠራል።\nHow many months did you pay? They are counted from the oldest unpaid month.'),
    keyboard(rows)
  );
}

async function askMethod(db: SupabaseClient, chatId: number, data: Data) {
  await save(db, chatId, 'METHOD', data);
  return sendTelegram(chatId, e(`ወራት፦ ${monthNames(data.months!)}\nእንዴት ከፈሉ? · How did you pay?`), keyboard([[METHODS[0][0], METHODS[1][0]], [METHODS[2][0], METHODS[3][0]], [CANCEL]]));
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
    e(`📅 ${monthNames(data.months!)} ${data.year} ዓ.ም`),
    e(`💰 ${data.amount!.toLocaleString('en-US')} ብር · birr`),
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
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > (data.available?.length ?? 0)) return sendTelegram(chatId, e('ከአዝራሮቹ ቁጥር ይምረጡ። · Choose a number from the buttons.'));
    const months = data.available!.slice(0, n);
    return askMethod(db, chatId, { ...data, months, amount: data.rate ? data.rate * months.length : undefined });
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
    const { error } = await db.from('dues_claims').insert({
      person_id: data.person_id,
      year: data.year,
      months: data.months,
      amount: data.amount,
      method: data.method,
      reference: data.reference || null,
      proof_file_id: data.proof_file_id || null,
      paid_on: todayIso(),
      chat_id: chatId,
    });
    await clearSession(db, chatId);
    if (error) throw new Error(error.message);
    notifyLater(
      { permissions: ['FINANCE_CREATE'] },
      {
        title: 'የመዋጮ ክፍያ ሪፖርት · Dues payment reported',
        body: `${data.name}: ${monthNames(data.months!)} ${data.year} — ${data.amount} birr (${methodLabel(data.method!)})`,
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
