// ─────────────────────────────────────────────────────────────────────────────
// What the bot can answer — server only. A chat sees only:
//   • the people it is linked to as themselves (SELF), and
//   • the students it is linked to as a parent (GUARDIAN, or through the
//     student_guardians of a SELF person).
// Nothing is ever looked up by an id someone types: registration numbers run
// in order, so typing one must never show a child.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { studentPortalData, type MyPortal } from '@/lib/portal/student-data';
import { ETHIOPIAN_MONTHS_AM, formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { currentEthiopianYear, monthsDue, unpaidMonths } from '@/lib/finance/dues';
import { escapeHtml, siteUrl } from '@/lib/telegram/bot';
import { nonMemberIds } from '@/lib/members/membership';

export const BUTTONS = {
  results: '📊 ውጤት · Results',
  attendance: '📋 ክትትል · Attendance',
  exams: '🖊️ ፈተና · Exams',
  dues: '🧾 መዋጮ · Dues',
  paid: '💳 ከፍያለሁ · I paid',
  help: 'ℹ️ እርዳታ · Help',
} as const;

const menu = (withPaid: boolean) => ({
  reply_markup: {
    keyboard: [
      [{ text: BUTTONS.results }, { text: BUTTONS.attendance }],
      [{ text: BUTTONS.exams }, { text: BUTTONS.dues }],
      withPaid ? [{ text: BUTTONS.paid }, { text: BUTTONS.help }] : [{ text: BUTTONS.help }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  },
});

/** The menu that stays under the message box once a chat is linked. */
export const MENU_KEYBOARD = menu(false);

/** The menu for this chat: "💳 I paid" only when it is linked to a member who pays dues. */
export const menuFor = (scope: ChatScope) => menu(scope.memberPersonIds.length > 0);

/** One button that sends the account's own phone number (Telegram allows nothing else with it). */
export const PHONE_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: '📱 ስልኬን አጋራ · Share my phone number', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

export const REMOVE_KEYBOARD = { reply_markup: { remove_keyboard: true } };

const MAX_TEXT = 3900;
const cut = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n…` : s);
const e = escapeHtml;

export const WELCOME =
  'ሰላም! ይህ የሐመረ ሕይወት ሰንበት ትምህርት ቤት ቦት ነው።\n' +
  'ወላጆች፦ ከታች ያለውን «📱 ስልኬን አጋራ» ይጫኑ — ስልክዎ በልጅዎ መዝገብ ላይ ካለ ወዲያው ይገናኛሉ።\n\n' +
  'Hello! This is the Hamere Hiwot Sunday School bot.\n' +
  'Parents: tap “📱 Share my phone number” below — if it is the phone on your child’s record, you are connected at once.\n' +
  'Staff and students can also connect from the website: Profile → “Connect Telegram”.';

export const LINKED_HELP =
  'ከታች ያሉትን አዝራሮች ይጫኑ፦\n📊 ውጤት · 📋 ክትትል · 🖊️ ፈተና · 🧾 መዋጮ\nአባላት መዋጮ ከከፈሉ «💳 ከፍያለሁ» ይጫኑ።\nመልእክት ለማቆም /stop\n\n' +
  'Use the buttons below: results, attendance, exams and dues — only for you and your own children.\n' +
  'Members who paid their dues: tap “💳 I paid”.\nTo stop messages: /stop';

// ── Who is this chat? ────────────────────────────────────────────────────────

export interface ChatScope {
  linked: boolean;
  /** Students this chat may see (themselves or their children) */
  studentIds: string[];
  /** Members linked as themselves — for dues. A student who is also a member is in both lists. */
  memberPersonIds: string[];
}

export async function chatScope(db: SupabaseClient, chatId: number): Promise<ChatScope> {
  // `relation` exists from migration 027; before it every link is the person's own
  let res = await db.from('telegram_links').select('person_id, relation').eq('chat_id', chatId);
  if (res.error) res = (await db.from('telegram_links').select('person_id').eq('chat_id', chatId)) as typeof res;
  const links = (res.data ?? []) as { person_id: string; relation?: string }[];
  if (links.length === 0) return { linked: false, studentIds: [], memberPersonIds: [] };
  const self = links.filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id);
  const guarded = links.filter((l) => l.relation === 'GUARDIAN').map((l) => l.person_id);

  const [{ data: students }, { data: children }, notMembers] = await Promise.all([
    db.from('students').select('id, person_id').in('person_id', [...self, ...guarded]),
    self.length ? db.from('student_guardians').select('student_id').in('guardian_person_id', self) : Promise.resolve({ data: [] }),
    // Student-only records and parents' login records are not members (lib/members/membership)
    nonMemberIds(db, self),
  ]);
  const studentRows = (students ?? []) as { id: string; person_id: string }[];
  const studentIds = [...new Set([...studentRows.map((s) => s.id), ...((children ?? []) as { student_id: string }[]).map((c) => c.student_id)])];
  return { linked: true, studentIds, memberPersonIds: self.filter((p) => !notMembers.has(p)) };
}

// ── Sign in by phone ─────────────────────────────────────────────────────────

/**
 * Link the chat by the number Telegram shared: as themselves to the people with
 * that phone, and as a parent to the students whose guardian phone it is.
 */
export async function linkByPhone(
  db: SupabaseClient,
  chatId: number,
  sharedPhone: string,
  telegramName: string
): Promise<{ self: string[]; children: string[] }> {
  const phone = normalizePhone(sharedPhone);
  if (!isValidPhone(phone)) return { self: [], children: [] };
  // Stored numbers vary (09…, +2519…, "0911 22 33 44"): find candidates by the last 9 digits in order, then compare exactly
  const tail = `%${phone.slice(1).split('').join('%')}`;
  const [{ data: own }, { data: guardianOf }] = await Promise.all([
    db.from('persons').select('id, full_name_en, full_name_am, phone_primary, status').ilike('phone_primary', tail),
    db.from('persons').select('id, full_name_en, full_name_am, emergency_contact_phone').ilike('emergency_contact_phone', tail),
  ]);
  type P = { id: string; full_name_en: string; full_name_am: string | null; phone_primary?: string | null; emergency_contact_phone?: string | null; status?: string };
  const selfPeople = ((own ?? []) as P[]).filter((p) => p.status === 'ACTIVE' && normalizePhone(p.phone_primary ?? '') === phone);
  const childPeople = ((guardianOf ?? []) as P[]).filter((p) => normalizePhone(p.emergency_contact_phone ?? '') === phone);
  // Only children who are current students
  const { data: activeStudents } = childPeople.length
    ? await db.from('students').select('person_id').eq('status', 'ACTIVE').in('person_id', childPeople.map((c) => c.id))
    : { data: [] };
  const activeChild = new Set(((activeStudents ?? []) as { person_id: string }[]).map((s) => s.person_id));
  const selfIds = new Set(selfPeople.map((p) => p.id));
  const children = childPeople.filter((c) => activeChild.has(c.id) && !selfIds.has(c.id));

  const rows = [
    ...selfPeople.map((p) => ({ person_id: p.id, chat_id: chatId, telegram_name: telegramName || null, relation: 'SELF' })),
    ...children.map((c) => ({ person_id: c.id, chat_id: chatId, telegram_name: telegramName || null, relation: 'GUARDIAN' })),
  ];
  if (rows.length) {
    const { error } = await db.from('telegram_links').upsert(rows, { onConflict: 'person_id,chat_id' });
    if (error) throw new Error(error.message);
  }
  const name = (p: P) => p.full_name_am || p.full_name_en;
  return { self: selfPeople.map(name), children: children.map(name) };
}

// ── Answers ──────────────────────────────────────────────────────────────────

async function portals(db: SupabaseClient, studentIds: string[]): Promise<MyPortal[]> {
  const out: MyPortal[] = [];
  for (const id of studentIds) out.push(await studentPortalData(db, id, { tickets: false }));
  return out;
}

const header = (p: MyPortal) => `👤 <b>${e(p.student.name_am)}</b> · ${e(p.student.class_name_am || p.student.class_name || '')}`;
const NONE = 'ለዚህ ቻት የተያያዘ ተማሪ የለም። · No student is linked to this chat.';

export async function resultsText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0) return e(NONE);
  const parts = (await portals(db, scope.studentIds)).map((p) => {
    const lines = [header(p)];
    if (p.grades.length === 0) lines.push(e('እስካሁን የጸደቀ ውጤት የለም · No approved results yet'));
    for (const g of p.grades.slice(-15)) lines.push(`• ${e(g.subject_am || g.subject)} (${g.term}ኛ ሩብ): <b>${g.total}</b> (${e(g.grade)})`);
    if (p.average !== null) {
      lines.push(e(`አማካይ ${p.average}%${p.rank ? ` · ደረጃ ${p.rank}/${p.class_size}` : ''} · Average ${p.average}%${p.rank ? `, rank ${p.rank} of ${p.class_size}` : ''}`));
    }
    if (p.pending) lines.push(e(`(${p.pending} ውጤት ማጽደቅ ይጠብቃል · ${p.pending} waiting for approval)`));
    return lines.join('\n');
  });
  return cut(`📊 <b>ውጤት · Results</b>\n\n${parts.join('\n\n')}\n\n${siteUrl()}`);
}

const MARK: Record<string, string> = { PRESENT: '✅', LATE: '⏰', ABSENT: '❌', EXCUSED: '📝' };

export async function attendanceText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0) return e(NONE);
  const parts = (await portals(db, scope.studentIds)).map((p) => {
    const c = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<string, number>;
    for (const r of p.attendance) c[r.status] += 1;
    const considered = c.PRESENT + c.LATE + c.ABSENT;
    const lines = [header(p)];
    if (p.attendance.length === 0) lines.push(e('እስካሁን ክትትል አልተመዘገበም · No roll calls yet'));
    else {
      lines.push(e(`ተገኝነት ${considered ? Math.round(((c.PRESENT + c.LATE) / considered) * 100) : 0}% · ✅ ${c.PRESENT} ⏰ ${c.LATE} ❌ ${c.ABSENT} 📝 ${c.EXCUSED}`));
      for (const r of p.attendance.slice(0, 5)) lines.push(`${MARK[r.status]} ${e(formatEthiopianDate(r.date, 'am'))}`);
    }
    return lines.join('\n');
  });
  return cut(`📋 <b>ክትትል · Attendance</b>\n\n${parts.join('\n\n')}`);
}

export async function examsText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0) return e(NONE);
  const parts = (await portals(db, scope.studentIds)).map((p) => {
    const lines = [header(p)];
    const open = p.exams.filter((x) => x.exam_status === 'OPEN' && !x.submitted);
    const done = p.exams.filter((x) => x.submitted).slice(0, 8);
    for (const x of open) lines.push(e(`🟢 ክፍት፦ ${x.title} (${x.subject_am || x.subject}) — ${x.duration_minutes} ደቂቃ · open now`));
    for (const x of done) {
      const result = x.score !== null ? `${x.score}/${x.total_marks}` : x.needs_marking ? 'እየታረመ · being marked' : 'ገብቷል · handed in';
      lines.push(e(`• ${x.title} (${x.subject_am || x.subject}): ${result}`));
    }
    if (open.length === 0 && done.length === 0) lines.push(e('እስካሁን የኦንላይን ፈተና የለም · No online exams yet'));
    return lines.join('\n');
  });
  return cut(`🖊️ <b>ፈተናዎች · Exams</b>\n\n${parts.join('\n\n')}`);
}

export async function duesText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.memberPersonIds.length === 0) return e('ለዚህ መለያ የአባልነት መዋጮ የለም · There are no member dues for this chat.');
  const year = currentEthiopianYear();
  const due = monthsDue(year);
  const [{ data: people }, { data: paid, error }, { data: rate }, { data: claims }] = await Promise.all([
    db.from('persons').select('id, full_name_en, full_name_am, membership_type').in('id', scope.memberPersonIds),
    db.from('member_dues').select('person_id, month').eq('year', year).in('person_id', scope.memberPersonIds),
    db.from('dues_rates').select('monthly_amount').eq('year', year).maybeSingle(),
    // Reported in the bot, not approved yet (migration 028; nothing before it)
    db.from('dues_claims').select('person_id, months').eq('year', year).eq('status', 'PENDING').in('person_id', scope.memberPersonIds),
  ]);
  if (error) return e('መዋጮ ገና አልተዘጋጀም · Dues are not set up yet.');
  const amount = rate ? Number((rate as { monthly_amount: number }).monthly_amount) : null;
  const lines = [`🧾 <b>ወርሃዊ መዋጮ ${year} ዓ.ም · Monthly dues</b>`];
  let payers = 0;
  for (const p of (people ?? []) as { id: string; full_name_en: string; full_name_am: string | null; membership_type: string | null }[]) {
    if (p.membership_type === 'HONORARY') continue;
    payers += 1;
    const months = ((paid ?? []) as { person_id: string; month: number }[]).filter((x) => x.person_id === p.id).map((x) => x.month);
    const waiting = new Set(((claims ?? []) as { person_id: string; months: number[] }[]).filter((c) => c.person_id === p.id).flatMap((c) => c.months.map(Number)));
    const unpaid = unpaidMonths(months, due).filter((m) => !waiting.has(m));
    lines.push(`\n👤 <b>${e(p.full_name_am || p.full_name_en)}</b>`);
    lines.push(e(`የተከፈሉ ወራት · Paid: ${months.length}`));
    if (waiting.size) lines.push(e(`⏳ ማጽደቅ ይጠብቃል · Waiting for approval: ${[...waiting].sort((a, b) => a - b).map((m) => ETHIOPIAN_MONTHS_AM[m - 1]).join('፣ ')}`));
    lines.push(
      unpaid.length
        ? e(`ያልተከፈሉ · Unpaid: ${unpaid.map((m) => ETHIOPIAN_MONTHS_AM[m - 1]).join('፣ ')}${amount ? ` (${(amount * unpaid.length).toLocaleString('en-US')} ብር)` : ''}`)
        : e('✅ እስካሁን ያለው ሁሉ ተከፍሏል · All paid so far')
    );
  }
  if (payers) lines.push('', e('ከፍለዋል? «💳 ከፍያለሁ» ይጫኑ — ፋይናንስ ሲያጸድቅ ይመዘገባል።\nPaid already? Tap “💳 I paid” — it is recorded once Finance approves it.'));
  return cut(lines.join('\n'));
}
