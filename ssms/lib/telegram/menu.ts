// ─────────────────────────────────────────────────────────────────────────────
// What the bot can answer — server only. A chat sees only:
//   • the people it is linked to as themselves (SELF): as a MEMBER (their
//     membership and dues) and/or as a STUDENT (their own results…), and
//   • the students it is linked to as a PARENT (GUARDIAN, or through the
//     student_guardians of a SELF person).
// Each role gets its own buttons; someone who is both sees both.
// Nothing is ever looked up by an id someone types: registration numbers run
// in order, so typing one must never show a child.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { studentPortalData, type MyPortal } from '@/lib/portal/student-data';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { currentEthiopianYear, expectedTotal, periodsLabel } from '@/lib/finance/dues';
import { periodsOf } from '@/lib/finance/dues-record';
import { MEMBERSHIP_TYPES, choiceLabel } from '@/lib/members/form';
import { escapeHtml, siteUrl } from '@/lib/telegram/bot';
import { nonMemberIds } from '@/lib/members/membership';
import { openPeriods } from '@/lib/telegram/dues-flow';
import { ABOUT_BUTTON } from '@/lib/telegram/about';

export const BUTTONS = {
  membership: '🪪 አባልነቴ · My membership',
  dues: '🧾 መዋጮ · Dues',
  paid: '💳 ከፍያለሁ · I paid',
  attendance: '📋 ክትትል · Attendance',
  results: '📊 ውጤት · Results',
  exams: '🖊️ ፈተና · Exams',
  events: '📅 መርሐ ግብር · Events',
  about: ABOUT_BUTTON,
  ask: '✉️ ጥያቄ · Ask a department',
  mytasks: '🗂️ ተግባሮቼ · My tasks',
  here: '✅ ተገኝቻለሁ · I’m here',
  help: '❓ እርዳታ · Help',
} as const;

// ── Who is this chat? ────────────────────────────────────────────────────────

export interface ChatScope {
  linked: boolean;
  /** Every student this chat may see: their own record and their children */
  studentIds: string[];
  /** The chat's own student records (a student, or a member who also studies) */
  selfStudentIds: string[];
  /** Children: linked as a parent (by the guardian phone, or as a guardian on the website) */
  childStudentIds: string[];
  /** Members linked as themselves — membership and dues. A member who studies is here and in selfStudentIds. */
  memberPersonIds: string[];
  /** Of those, the ones who pay dues (not honorary members) */
  duesPersonIds: string[];
}

const NOBODY: ChatScope = { linked: false, studentIds: [], selfStudentIds: [], childStudentIds: [], memberPersonIds: [], duesPersonIds: [] };

export async function chatScope(db: SupabaseClient, chatId: number): Promise<ChatScope> {
  // `relation` exists from migration 027; before it every link is the person's own
  let res = await db.from('telegram_links').select('person_id, relation').eq('chat_id', chatId);
  if (res.error) res = (await db.from('telegram_links').select('person_id').eq('chat_id', chatId)) as typeof res;
  const links = (res.data ?? []) as { person_id: string; relation?: string }[];
  if (links.length === 0) return NOBODY;
  const self = links.filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id);
  const guarded = links.filter((l) => l.relation === 'GUARDIAN').map((l) => l.person_id);

  const [{ data: students }, { data: children }, notMembers, { data: types }] = await Promise.all([
    db.from('students').select('id, person_id').in('person_id', [...self, ...guarded]),
    self.length ? db.from('student_guardians').select('student_id').in('guardian_person_id', self) : Promise.resolve({ data: [] }),
    // Student-only records and parents' login records are not members (lib/members/membership)
    nonMemberIds(db, self),
    self.length ? db.from('persons').select('id, membership_type').in('id', self) : Promise.resolve({ data: [] }),
  ]);
  const studentRows = (students ?? []) as { id: string; person_id: string }[];
  const selfSet = new Set(self);
  const selfStudentIds = studentRows.filter((s) => selfSet.has(s.person_id)).map((s) => s.id);
  const childStudentIds = [
    ...new Set([...studentRows.filter((s) => !selfSet.has(s.person_id)).map((s) => s.id), ...((children ?? []) as { student_id: string }[]).map((c) => c.student_id)]),
  ].filter((id) => !selfStudentIds.includes(id));
  const memberPersonIds = self.filter((p) => !notMembers.has(p));
  const honorary = new Set(((types ?? []) as { id: string; membership_type: string | null }[]).filter((t) => t.membership_type === 'HONORARY').map((t) => t.id));
  return {
    linked: true,
    studentIds: [...selfStudentIds, ...childStudentIds],
    selfStudentIds,
    childStudentIds,
    memberPersonIds,
    duesPersonIds: memberPersonIds.filter((p) => !honorary.has(p)),
  };
}

// ── Keyboards and help ───────────────────────────────────────────────────────

/**
 * The buttons under the message box, by what this chat is:
 *   member   🪪 membership · 🧾 dues · 💳 I paid · 📋 attendance (service, choir)
 *   student / parent   📋 attendance · 📊 results · 🖊️ exams
 *   everyone linked    📅 events · ℹ️ about us · ❓ help
 */
export function menuFor(scope: ChatScope) {
  const rows: string[][] = [];
  // Checking in at a program or rehearsal: anyone linked as themselves
  if (scope.memberPersonIds.length || scope.selfStudentIds.length) rows.push([BUTTONS.here]);
  if (scope.memberPersonIds.length) rows.push([BUTTONS.membership, BUTTONS.dues]);
  const middle: string[] = [];
  if (scope.duesPersonIds.length) middle.push(BUTTONS.paid);
  if (scope.memberPersonIds.length || scope.studentIds.length) middle.push(BUTTONS.attendance);
  if (middle.length) rows.push(middle);
  if (scope.studentIds.length) rows.push([BUTTONS.results, BUTTONS.exams]);
  if (scope.memberPersonIds.length) rows.push([BUTTONS.mytasks, BUTTONS.ask], [BUTTONS.events, BUTTONS.about], [BUTTONS.help]);
  else rows.push([BUTTONS.events, BUTTONS.about], [BUTTONS.ask, BUTTONS.help]);
  return { reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true } };
}

/** One button that sends the account's own phone number (Telegram allows nothing else with it). */
export const PHONE_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: '📱 ስልኬን አጋራ · Share my phone number', request_contact: true }], [{ text: ABOUT_BUTTON }]],
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
  'አባላት፣ ወላጆችና ተማሪዎች — ከታች ያለውን «📱 ስልኬን አጋራ» ይጫኑ፦\n' +
  '• አባል ከሆኑ፦ ስልኩ በአባልነት መዝገብዎ ላይ ያለው ከሆነ አባልነትዎንና መዋጮዎን ያያሉ፤ የከፈሉትንም ያሳውቃሉ።\n' +
  '• ወላጅ ከሆኑ፦ ስልኩ በልጅዎ መዝገብ ላይ ያለው ከሆነ የልጅዎን ውጤት፣ ክትትልና ፈተና ያያሉ።\n\n' +
  'Hello! This is the Hamere Hiwot Sunday School bot.\n' +
  'Members, parents and students — tap “📱 Share my phone number” below:\n' +
  '• Members: if it is the phone on your member record, you see your membership and dues, and can report payments.\n' +
  '• Parents: if it is the phone on your child’s record, you see your child’s results, attendance and exams.\n' +
  'You can also connect from the website: Profile → “Connect Telegram”.';

export const NOT_FOUND =
  'ይህ ስልክ በትምህርት ቤቱ መዝገብ ውስጥ አልተገኘም።\n' +
  '• አባላት፦ ይህን ስልክ በአባልነት መዝገብዎ ላይ እንዲያስገቡ ጽ/ቤቱን ይጠይቁ።\n' +
  '• ወላጆች፦ በልጅዎ መዝገብ ላይ (የወላጅ ስልክ) እንዲያስገቡ ይጠይቁ።\n\n' +
  'This number is not in the school’s records.\n' +
  '• Members: ask the office to put this number on your member record.\n' +
  '• Parents: ask them to put it on your child’s record (guardian phone).';

/** What the buttons do, for what this chat is. */
export function helpFor(scope: ChatScope): string {
  const am = ['ከታች ያሉትን አዝራሮች ይጫኑ፦'];
  const en = ['Use the buttons below:'];
  if (scope.memberPersonIds.length) {
    am.push(
      '🪪 አባልነቴ — የአባልነት መረጃ፣ ክፍል፣ አገልግሎት፣ መዘምራንና ኮሚቴ',
      '🧾 መዋጮ — የተከፈሉ፣ ያልተከፈሉና ማጽደቅ የሚጠብቁ ወራት',
      '📋 ክትትል — የአገልግሎትና የመዘምራን ክትትልዎ ታሪክ',
      '🗂️ ተግባሮቼ — ክፍልዎ የሰጠዎት ተግባራት፤ ሂደቱን ያሳውቁ'
    );
    en.push(
      '🪪 My membership — member details, department, service, choir and committees',
      '🧾 Dues — paid, unpaid and waiting months',
      '📋 Attendance — your service and choir attendance history',
      '🗂️ My tasks — tasks your department gave you; report progress'
    );
    if (scope.duesPersonIds.length) {
      am.push('💳 ከፍያለሁ — የከፈሉትን (አንድ ወይም ብዙ ወር) ለፋይናንስ ያሳውቁ');
      en.push('💳 I paid — tell Finance you paid (one month or several)');
    }
  }
  if (scope.selfStudentIds.length) {
    am.push('📊 📋 🖊️ — የእርስዎ ውጤት፣ የክፍል ክትትልና ፈተና');
    en.push('📊 📋 🖊️ — your own results, class attendance and exams');
  }
  if (scope.childStudentIds.length) {
    am.push('📊 📋 🖊️ — የልጆችዎ ውጤት፣ ክትትልና ፈተና');
    en.push('📊 📋 🖊️ — your children’s results, attendance and exams');
  }
  if (!scope.memberPersonIds.length && !scope.studentIds.length) {
    am.push('ይህ ቻት ገና ከአባል ወይም ከተማሪ ጋር አልተያያዘም — ጽ/ቤቱን ይጠይቁ።');
    en.push('This chat is not linked to a member or a student yet — ask the office.');
  }
  if (scope.memberPersonIds.length || scope.selfStudentIds.length) {
    am.push('✅ ተገኝቻለሁ — በመርሐ ግብር ወይም በመዝሙር ጥናት ላይ መገኘትዎን በመሪው ስክሪን ባለው ኮድ ያስመዝግቡ');
    en.push('✅ I’m here — check in at a program or choir rehearsal with the code on the leader’s screen');
  }
  am.push('📅 መርሐ ግብር — የሚመጡ የትምህርት ቤቱ መርሐ ግብሮች', 'ℹ️ ስለ እኛ — ስለ ሰንበት ትምህርት ቤቱ ማወቅ የሚፈልጉት', '✉️ ጥያቄ — ለአንድ ክፍል ጥያቄ ይላኩ፤ መልሱ እዚህ ይደርስዎታል');
  en.push('📅 Events — the school’s coming programs', 'ℹ️ About us — what you want to know about the Sunday school', '✉️ Ask a department — send a question; the answer comes here');
  am.push('መልእክት ለማቆም /stop');
  en.push('To stop messages: /stop');
  return `${am.join('\n')}\n\n${en.join('\n')}`;
}

/** "Connected as…": member, student and/or parent of whom. */
export async function connectedText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  const [{ data: members }, { data: students }] = await Promise.all([
    scope.memberPersonIds.length ? db.from('persons').select('id, full_name_en, full_name_am, membership_code').in('id', scope.memberPersonIds) : Promise.resolve({ data: [] }),
    scope.studentIds.length
      ? db.from('students').select('id, reg_no, person:persons!students_person_id_fkey(full_name_en, full_name_am)').in('id', scope.studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  type S = { id: string; reg_no: string; person: { full_name_en: string; full_name_am: string | null } | null };
  const name = (p: { full_name_en: string; full_name_am: string | null } | null) => p?.full_name_am || p?.full_name_en || '';
  const studentRows = (students ?? []) as unknown as S[];
  const lines = ['✅ <b>ተገናኝቷል · Connected</b>'];
  for (const m of (members ?? []) as { full_name_en: string; full_name_am: string | null; membership_code: string }[]) {
    lines.push(e(`🪪 አባል · Member: ${name(m)} (${m.membership_code})`));
  }
  for (const s of studentRows.filter((x) => scope.selfStudentIds.includes(x.id))) lines.push(e(`🎓 ተማሪ · Student: ${name(s.person)} (${s.reg_no})`));
  const kids = studentRows.filter((x) => scope.childStudentIds.includes(x.id)).map((x) => name(x.person));
  if (kids.length) lines.push(e(`👨‍👩‍👧 ወላጅ · Parent of: ${kids.join('፣ ')}`));
  lines.push('', e(helpFor(scope)));
  return lines.join('\n');
}

// Signing in by phone (and keeping those links right): lib/telegram/links

// ── Member answers ───────────────────────────────────────────────────────────

const STATUS: Record<string, string> = {
  ACTIVE: 'ንቁ · Active',
  INACTIVE: 'የቦዘነ · Inactive',
  SUSPENDED: 'የታገደ · Suspended',
  TRANSFERRED: 'የተዛወረ · Transferred',
  DECEASED: 'ያረፈ · Deceased',
};
const ROLE: Record<string, string> = { HEAD: 'ኃላፊ · Head', DEPUTY: 'ምክትል · Deputy', SECRETARY: 'ጸሐፊ · Secretary', TEACHER: 'መምህር · Teacher', SERVANT: 'አገልጋይ · Servant' };
const birr = (n: number) => `${n.toLocaleString('en-US')} ብር`;

interface DuesState {
  honorary: boolean;
  paidThisYear: number;
  /** Owed by now (last year's unpaid when kept here, and this year's up to this month) */
  owed: number[];
  owedAmount: number | null;
  waiting: number[];
}

/** One member's dues, counted the same way as "💳 I paid" (from the month they joined, oldest first). */
async function duesState(db: SupabaseClient, personId: string, membershipType: string | null): Promise<DuesState | null> {
  const year = currentEthiopianYear();
  if (membershipType === 'HONORARY') return { honorary: true, paidThisYear: 0, owed: [], owedAmount: null, waiting: [] };
  const [{ data: paid, error }, { data: pending }, open] = await Promise.all([
    db.from('member_dues').select('month').eq('person_id', personId).eq('year', year),
    // Reported in the bot, not approved yet (none before migration 028)
    db.from('dues_claims').select('*').eq('person_id', personId).eq('status', 'PENDING'),
    openPeriods(db, personId),
  ]);
  if (error) return null;
  const owed = open.available.slice(0, open.due_now);
  const rates = Object.fromEntries(Object.entries(open.rates).map(([y, r]) => [Number(y), r]));
  return {
    honorary: false,
    paidThisYear: (paid ?? []).length,
    owed,
    owedAmount: owed.length ? expectedTotal(owed, rates) : 0,
    waiting: ((pending ?? []) as { year: number; months: number[] | null; periods?: number[] | null }[]).flatMap(periodsOf).sort((a, b) => a - b),
  };
}

function duesLines(d: DuesState): string[] {
  if (d.honorary) return [e('የክብር አባል — ወርሃዊ መዋጮ የለም · Honorary member — no monthly dues')];
  const year = currentEthiopianYear();
  const lines = [e(`የተከፈሉ (${year}) · Paid this year: ${d.paidThisYear} ወር · months`)];
  if (d.waiting.length) lines.push(e(`⏳ ማጽደቅ ይጠብቃል · Waiting for approval: ${periodsLabel(d.waiting)}`));
  lines.push(
    d.owed.length
      ? e(`ያልተከፈሉ · Unpaid: ${periodsLabel(d.owed)}${d.owedAmount ? ` (${birr(d.owedAmount)})` : ''}`)
      : e('✅ እስካሁን ያለው ሁሉ ተከፍሏል · All paid so far')
  );
  return lines;
}

type MemberRow = {
  id: string;
  full_name_en: string;
  full_name_am: string | null;
  membership_code: string;
  membership_type: string | null;
  status: string;
  registered_on: string | null;
  created_at: string;
  assigned_unit_id: string | null;
};

async function memberRows(db: SupabaseClient, ids: string[]): Promise<MemberRow[]> {
  const { data } = await db.from('persons')
    .select('id, full_name_en, full_name_am, membership_code, membership_type, status, registered_on, created_at, assigned_unit_id')
    .in('id', ids);
  return (data ?? []) as MemberRow[];
}

const NOT_MEMBER = 'ይህ ቻት ከአባል ጋር አልተያያዘም · This chat is not linked to a member.';

/** 🪪 My membership: member ID, type, status, department, service, student record, dues in short. */
export async function membershipText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.memberPersonIds.length === 0) return e(NOT_MEMBER);
  const people = await memberRows(db, scope.memberPersonIds);
  const [{ data: units }, { data: service }, { data: studies }, { data: choir }, { data: committees }] = await Promise.all([
    db.from('organization_units').select('id, name_en, name_am'),
    db.from('service_assignments').select('person_id, unit_id, role_kind, title, status').in('person_id', scope.memberPersonIds).eq('status', 'ACTIVE'),
    db.from('students').select('person_id, reg_no, status').in('person_id', scope.memberPersonIds),
    db.from('choir_members').select('person_id, voice_part, status').in('person_id', scope.memberPersonIds).eq('status', 'ACTIVE'),
    db.from('governance_memberships')
      .select('person_id, body:governance_bodies(name_en, name_am), position:governance_positions(name_en, name_am)')
      .in('person_id', scope.memberPersonIds)
      .eq('status', 'ACTIVE'),
  ]);
  type Named = { name_en: string; name_am: string | null } | null;
  const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Named;
  const unitName = new Map(((units ?? []) as { id: string; name_en: string; name_am: string | null }[]).map((u) => [u.id, u.name_am || u.name_en]));
  const parts: string[] = [];
  for (const p of people) {
    const lines = [`👤 <b>${e(p.full_name_am || p.full_name_en)}</b>`];
    lines.push(e(`መለያ ቁጥር · Member ID: ${p.membership_code}`));
    if (p.membership_type) lines.push(e(`ዓይነት · Type: ${choiceLabel(MEMBERSHIP_TYPES, p.membership_type, 'am')} · ${choiceLabel(MEMBERSHIP_TYPES, p.membership_type, 'en')}`));
    lines.push(e(`ሁኔታ · Status: ${STATUS[p.status] ?? p.status}`));
    lines.push(e(`የተመዘገበበት · Registered: ${formatEthiopianDate(p.registered_on ?? p.created_at.slice(0, 10), 'am')} ዓ.ም`));
    if (p.assigned_unit_id && unitName.get(p.assigned_unit_id)) lines.push(e(`ክፍል · Department: ${unitName.get(p.assigned_unit_id)}`));
    for (const s of ((service ?? []) as { person_id: string; unit_id: string; role_kind: string; title: string | null }[]).filter((x) => x.person_id === p.id)) {
      lines.push(e(`🙏 አገልግሎት · Serving: ${unitName.get(s.unit_id) ?? ''} — ${s.title || ROLE[s.role_kind] || s.role_kind}`));
    }
    const sings = ((choir ?? []) as { person_id: string; voice_part: string }[]).find((x) => x.person_id === p.id);
    if (sings) lines.push(e(`🎵 መዘምራን · Choir${sings.voice_part && sings.voice_part !== 'NOT_SET' ? ` (${sings.voice_part.toLowerCase()})` : ''}`));
    for (const c of ((committees ?? []) as { person_id: string; body: unknown; position: unknown }[]).filter((x) => x.person_id === p.id)) {
      const body = one(c.body);
      const position = one(c.position);
      lines.push(e(`🏛️ ኮሚቴ · Committee: ${body?.name_am || body?.name_en || ''} — ${position?.name_am || position?.name_en || ''}`));
    }
    const study = ((studies ?? []) as { person_id: string; reg_no: string; status: string }[]).find((x) => x.person_id === p.id);
    if (study) lines.push(e(`🎓 ተማሪም · Also a student: ${study.reg_no}`));
    const d = await duesState(db, p.id, p.membership_type);
    if (d) lines.push(e('🧾 መዋጮ · Dues:'), ...duesLines(d));
    parts.push(lines.join('\n'));
  }
  return cut(`🪪 <b>አባልነት · Membership</b>\n\n${parts.join('\n\n')}`);
}

/** 🧾 Dues: paid, waiting for approval and unpaid months of each member of this chat. */
export async function duesText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.memberPersonIds.length === 0) return e('ለዚህ ቻት የአባልነት መዋጮ የለም · There are no member dues for this chat.');
  const people = await memberRows(db, scope.memberPersonIds);
  const lines = [`🧾 <b>ወርሃዊ መዋጮ · Monthly dues</b>`];
  for (const p of people) {
    const d = await duesState(db, p.id, p.membership_type);
    if (!d) return e('መዋጮ ገና አልተዘጋጀም · Dues are not set up yet.');
    lines.push(`\n👤 <b>${e(p.full_name_am || p.full_name_en)}</b>`, ...duesLines(d));
  }
  if (scope.duesPersonIds.length) {
    lines.push('', e('ከፍለዋል? «💳 ከፍያለሁ» ይጫኑ — አንድ ወይም ብዙ ወር። ፋይናንስ ሲያጸድቅ ይመዘገባል።\nPaid? Tap “💳 I paid” — one month or several. It is recorded once Finance approves it.'));
  }
  return cut(lines.join('\n'));
}

// ── Student answers (own results, or children's) ─────────────────────────────

async function portals(db: SupabaseClient, scope: ChatScope): Promise<{ p: MyPortal; self: boolean }[]> {
  const out: { p: MyPortal; self: boolean }[] = [];
  for (const id of scope.studentIds) out.push({ p: await studentPortalData(db, id, { tickets: false }), self: scope.selfStudentIds.includes(id) });
  return out;
}

/** 🎓 for the chat's own record, 👨‍👩‍👧 for a child */
const header = ({ p, self }: { p: MyPortal; self: boolean }) =>
  `${self ? '🎓' : '👨‍👩‍👧'} <b>${e(p.student.name_am)}</b> · ${e(p.student.class_name_am || p.student.class_name || '')}`;
const NONE = 'ለዚህ ቻት የተያያዘ ተማሪ የለም። · No student is linked to this chat.';
const NO_CLASS =
  'ፈተናና የክፍል ውጤት ለክፍል ተማሪዎች ነው። ትምህርት የሚከታተሉ ከሆነ ጽ/ቤቱ በክፍል እንዲመዘግብዎ ይጠይቁ — ከዚያ ፈተናዎችና ውጤትዎ እዚህ ይታያሉ።\n' +
  'Exams and class results are for people enrolled in a class. If you attend classes, ask the office to enroll you — then your exams and results show here.';
/** No student here: a member is told how to get exams and results; anyone else that no student is linked */
const noStudent = (scope: ChatScope) => e(scope.memberPersonIds.length ? NO_CLASS : NONE);
/** "Results" for a student, "Your children's results" for a parent */
const title = (scope: ChatScope, icon: string, am: string, en: string) =>
  scope.selfStudentIds.length ? `${icon} <b>${am} · ${en}</b>` : `${icon} <b>የልጆች ${am} · Your children’s ${en.toLowerCase()}</b>`;

export async function resultsText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0) return noStudent(scope);
  const parts = (await portals(db, scope)).map((x) => {
    const { p } = x;
    const lines = [header(x)];
    if (p.grades.length === 0) lines.push(e('እስካሁን የጸደቀ ውጤት የለም · No approved results yet'));
    for (const g of p.grades.slice(-15)) lines.push(`• ${e(g.subject_am || g.subject)} (${g.term}ኛ ሩብ): <b>${g.total}</b> (${e(g.grade)})`);
    if (p.average !== null) {
      lines.push(e(`አማካይ ${p.average}%${p.rank ? ` · ደረጃ ${p.rank}/${p.class_size}` : ''} · Average ${p.average}%${p.rank ? `, rank ${p.rank} of ${p.class_size}` : ''}`));
    }
    if (p.pending) lines.push(e(`(${p.pending} ውጤት ማጽደቅ ይጠብቃል · ${p.pending} waiting for approval)`));
    return lines.join('\n');
  });
  return cut(`${title(scope, '📊', 'ውጤት', 'Results')}\n\n${parts.join('\n\n')}\n\n${siteUrl()}`);
}

const MARK: Record<string, string> = { PRESENT: '✅', LATE: '⏰', ABSENT: '❌', EXCUSED: '📝' };

/** "ተገኝነት 90% · ✅ 9 ⏰ 0 ❌ 1 📝 0" — present + late over present + late + absent */
function tally(marks: { status: string }[]): string {
  const c = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<string, number>;
  for (const r of marks) c[r.status] = (c[r.status] ?? 0) + 1;
  const considered = c.PRESENT + c.LATE + c.ABSENT;
  return `ተገኝነት ${considered ? Math.round(((c.PRESENT + c.LATE) / considered) * 100) : 0}% · ✅ ${c.PRESENT} ⏰ ${c.LATE} ❌ ${c.ABSENT} 📝 ${c.EXCUSED}`;
}

const CHOIR_KIND: Record<string, string> = { REHEARSAL: 'ልምምድ · rehearsal', SERVICE: 'አገልግሎት · service', PERFORMANCE: 'ዝግጅት · performance' };
const RECENT = 6;

/** A member's own attendance: as a servant (HR → service attendance) and in the choir. */
async function memberAttendance(db: SupabaseClient, personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) return [];
  const [people, { data: service }, { data: choirRows }] = await Promise.all([
    memberRows(db, personIds),
    db.from('servant_attendance').select('person_id, service_date, status').in('person_id', personIds).order('service_date', { ascending: false }).limit(500),
    db.from('choir_members').select('id, person_id').in('person_id', personIds),
  ]);
  const choir = (choirRows ?? []) as { id: string; person_id: string }[];
  const { data: choirMarks } = choir.length
    ? await db.from('choir_attendance').select('member_id, status, session:choir_sessions(session_date, kind, status)').in('member_id', choir.map((c) => c.id))
    : { data: [] };
  type ChoirMark = { member_id: string; status: string; session: unknown };
  const sessionOf = (m: ChoirMark) => (Array.isArray(m.session) ? m.session[0] : m.session) as { session_date: string; kind: string } | null;

  return people.map((p) => {
    const lines = [`🙏 <b>${e(p.full_name_am || p.full_name_en)}</b>`];
    const served = ((service ?? []) as { person_id: string; service_date: string; status: string }[])
      .filter((r) => r.person_id === p.id)
      .sort((a, b) => b.service_date.localeCompare(a.service_date));
    if (served.length) {
      lines.push(e(`አገልግሎት · Service: ${tally(served)}`));
      for (const r of served.slice(0, RECENT)) lines.push(`${MARK[r.status] ?? '•'} ${e(formatEthiopianDate(r.service_date, 'am'))}`);
    }
    const mine = choir.find((c) => c.person_id === p.id);
    const sung = ((choirMarks ?? []) as ChoirMark[])
      .filter((m) => m.member_id === mine?.id && sessionOf(m))
      .sort((a, b) => sessionOf(b)!.session_date.localeCompare(sessionOf(a)!.session_date));
    if (mine) {
      lines.push(e(`🎵 መዘምራን · Choir: ${sung.length ? tally(sung) : 'እስካሁን አልተመዘገበም · nothing recorded yet'}`));
      for (const m of sung.slice(0, RECENT)) {
        const s = sessionOf(m)!;
        lines.push(`${MARK[m.status] ?? '•'} ${e(`${formatEthiopianDate(s.session_date, 'am')} — ${CHOIR_KIND[s.kind] ?? s.kind}`)}`);
      }
    }
    if (!served.length && !mine) lines.push(e('እስካሁን የአገልግሎት ክትትል አልተመዘገበም · No service attendance recorded yet'));
    return lines.join('\n');
  });
}

/** Programs and gatherings the chat's own people checked in at (migration 036; nothing before it). */
async function eventAttendance(db: SupabaseClient, scope: ChatScope): Promise<string[]> {
  const ids = new Set(scope.memberPersonIds);
  if (scope.selfStudentIds.length) {
    const { data } = await db.from('students').select('person_id').in('id', scope.selfStudentIds);
    for (const s of (data ?? []) as { person_id: string }[]) ids.add(s.person_id);
  }
  if (!ids.size) return [];
  const { data: marks } = await db.from('checkins').select('person_id, event_id, status, checked_at').in('person_id', [...ids]).neq('status', 'REMOVED');
  const rows = ((marks ?? []) as { person_id: string; event_id: string; status: string; checked_at: string }[]).sort((a, b) => b.checked_at.localeCompare(a.checked_at));
  if (!rows.length) return [];
  const { data: events } = await db.from('checkin_events').select('id, title, kind').in('id', [...new Set(rows.map((r) => r.event_id))]);
  const eventOf = new Map(((events ?? []) as { id: string; title: string; kind: string }[]).map((x) => [x.id, x]));
  const lines = [`📅 <b>መርሐ ግብራትና ጥናቶች · Programs &amp; rehearsals</b>`, e(`የተገኙባቸው · Attended: ${rows.filter((r) => r.status === 'PRESENT').length}`)];
  for (const r of rows.slice(0, RECENT)) {
    lines.push(`${r.status === 'PRESENT' ? '✅' : '⚠️'} ${e(`${formatEthiopianDate(r.checked_at.slice(0, 10), 'am')} — ${eventOf.get(r.event_id)?.title ?? ''}${r.status === 'FLAGGED' ? ' (መሪው ያረጋግጣሉ · to be confirmed)' : ''}`)}`);
  }
  return [lines.join('\n')];
}

/** 📋 Attendance: a member's service and choir attendance, a student's own class attendance, and children's. */
export async function attendanceText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0 && scope.memberPersonIds.length === 0) return e(NONE);
  const parts = [...(await memberAttendance(db, scope.memberPersonIds)), ...(await eventAttendance(db, scope))];
  if (scope.studentIds.length) {
    for (const x of await portals(db, scope)) {
      const lines = [header(x)];
      if (x.p.attendance.length === 0) lines.push(e('እስካሁን የክፍል ክትትል አልተመዘገበም · No roll calls yet'));
      else {
        lines.push(e(`ክፍል · Class: ${tally(x.p.attendance)}`));
        for (const r of x.p.attendance.slice(0, RECENT)) lines.push(`${MARK[r.status]} ${e(formatEthiopianDate(r.date, 'am'))}`);
      }
      parts.push(lines.join('\n'));
    }
  }
  // Only a parent's chat gets "Your children's attendance"
  const heading = scope.memberPersonIds.length || scope.selfStudentIds.length ? '📋 <b>ክትትል · Attendance</b>' : title(scope, '📋', 'ክትትል', 'Attendance');
  return cut(`${heading}\n\n${parts.join('\n\n')}`);
}

/** 📅 Events: the school's coming programs, and coming choir sessions for choir members. */
export async function eventsText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  const today = todayIso();
  const [{ data: programs }, { data: choir }] = await Promise.all([
    db.from('programs')
      .select('title_en, title_am, start_date, start_time, end_date, location, status')
      .in('status', ['PLANNED', 'CONFIRMED'])
      .gte('start_date', today)
      .order('start_date')
      .limit(10),
    scope.memberPersonIds.length ? db.from('choir_members').select('id').in('person_id', scope.memberPersonIds).eq('status', 'ACTIVE') : Promise.resolve({ data: [] }),
  ]);
  const { data: rehearsals } = (choir ?? []).length
    ? await db.from('choir_sessions').select('session_date, start_time, kind, title, location').eq('status', 'PLANNED').gte('session_date', today).order('session_date').limit(6)
    : { data: [] };
  const when = (date: string, time: string | null) => `${formatEthiopianDate(date, 'am')}${time ? ` · ${time.slice(0, 5)}` : ''}`;
  const lines = ['📅 <b>የሚመጡ መርሐ ግብሮች · Coming events</b>'];
  const list = (programs ?? []) as { title_en: string; title_am: string | null; start_date: string; start_time: string | null; location: string | null }[];
  if (list.length === 0) lines.push(e('ለጊዜው የተያዘ መርሐ ግብር የለም · No events planned yet'));
  for (const p of list) lines.push(e(`• ${when(p.start_date, p.start_time)} — ${p.title_am || p.title_en}${p.location ? ` (${p.location})` : ''}`));
  const sessions = (rehearsals ?? []) as { session_date: string; start_time: string | null; kind: string; title: string | null; location: string | null }[];
  if (sessions.length) {
    lines.push('', '🎵 <b>መዘምራን · Choir</b>');
    for (const s of sessions) lines.push(e(`• ${when(s.session_date, s.start_time)} — ${s.title || CHOIR_KIND[s.kind] || s.kind}${s.location ? ` (${s.location})` : ''}`));
  }
  return cut(lines.join('\n'));
}

export async function examsText(db: SupabaseClient, scope: ChatScope): Promise<string> {
  if (scope.studentIds.length === 0) return noStudent(scope);
  const parts = (await portals(db, scope)).map((x) => {
    const { p } = x;
    const lines = [header(x)];
    const open = p.exams.filter((ex) => ex.exam_status === 'OPEN' && !ex.submitted);
    const done = p.exams.filter((ex) => ex.submitted).slice(0, 8);
    for (const ex of open) lines.push(e(`🟢 ክፍት፦ ${ex.title} (${ex.subject_am || ex.subject}) — ${ex.duration_minutes} ደቂቃ · open now`));
    for (const ex of done) {
      const result = ex.score !== null ? `${ex.score}/${ex.total_marks}` : ex.needs_marking ? 'እየታረመ · being marked' : 'ገብቷል · handed in';
      lines.push(e(`• ${ex.title} (${ex.subject_am || ex.subject}): ${result}`));
    }
    if (open.length === 0 && done.length === 0) lines.push(e('እስካሁን የኦንላይን ፈተና የለም · No online exams yet'));
    return lines.join('\n');
  });
  return cut(`${title(scope, '🖊️', 'ፈተና', 'Exams')}\n\n${parts.join('\n\n')}`);
}
