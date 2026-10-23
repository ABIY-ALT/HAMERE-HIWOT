// ─────────────────────────────────────────────────────────────────────────────
// "🔑 Forgot my PIN" in the Telegram bot — server only. There is no SMS or
// e-mail yet, so this is how people get back into the website. A chat may
// reset only the logins of its own people: its own (linked as themselves by
// their verified phone or "Connect Telegram") and its children's student
// logins. Steps, kept in telegram_sessions:
//   PIN_PICK   which login (one button each)
// The new PIN is temporary and goes to every chat of that login's people
// (lib/auth/temp-password): a student's own and their parents'. At most
// RESETS_PER_DAY a day per login. A login with administrator rights (in any
// Sunday school, or a platform admin) is not reset here: this Sunday
// school's user managers are told, and one of them sends it from
// Administration → System users ("Send by Telegram").
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { chatsOf, escapeHtml, sendTelegram, telegramToChats } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { isStudentLogin } from '@/lib/auth/student-login';
import { createOwnLogin, ownLoginCandidates, selfLoginAllowed } from '@/lib/auth/self-login';
import { rateLimit } from '@/lib/security/rate-limit';
import {
  RESETS_PER_DAY,
  chatsForLogin,
  isPrivileged,
  loginPowers,
  logReset,
  newTemporary,
  pinOnly,
  sendTemporary,
  setTemporaryPassword,
} from '@/lib/auth/temp-password';

const e = escapeHtml;
const DAY = 24 * 60 * 60;

export interface PinData {
  logins?: { id: string; button: string }[];
  /** People of this chat without a login who may make their own (lib/auth/self-login) */
  create?: { person_id: string; button: string }[];
}

const createButton = (name: string) => `🆕 መግቢያ ፍጠርልኝ · Create my login — ${name}`.slice(0, 60);

interface Login {
  id: string;
  auth_user_id: string;
  person_id: string;
  username: string;
  name: string;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, data: PinData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step: 'PIN_PICK', data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** The website logins this chat may reset: its own people's, and its children's student logins. */
async function loginsOfChat(db: SupabaseClient, chatId: number, scope: ChatScope): Promise<Login[]> {
  // `relation` exists from migration 027; before it every link is the person's own
  let res = await db.from('telegram_links').select('person_id, relation').eq('chat_id', chatId);
  if (res.error) res = (await db.from('telegram_links').select('person_id').eq('chat_id', chatId)) as typeof res;
  const self = ((res.data ?? []) as { person_id: string; relation?: string }[]).filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id);
  const { data: kids } = scope.childStudentIds.length ? await db.from('students').select('person_id').in('id', scope.childStudentIds) : { data: [] };
  const children = ((kids ?? []) as { person_id: string }[]).map((k) => k.person_id);
  const people = [...new Set([...self, ...children])];
  if (people.length === 0) return [];
  const { data } = await db.from('system_users')
    .select('id, auth_user_id, person_id, username, is_active, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)')
    .in('person_id', people)
    .eq('is_active', true);
  type Row = Omit<Login, 'name'> & { person: { full_name_en: string; full_name_am: string | null } | null };
  const selfSet = new Set(self);
  return ((data ?? []) as unknown as Row[])
    // A child's own staff or member login is theirs to manage; only their student login is the parent's
    .filter((u) => selfSet.has(u.person_id) || isStudentLogin(u.username))
    .map((u) => ({ id: u.id, auth_user_id: u.auth_user_id, person_id: u.person_id, username: u.username, name: u.person?.full_name_am || u.person?.full_name_en || u.username }));
}

/** "🔑 Forgot my PIN": which login? */
export async function startPin(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  const logins = await loginsOfChat(db, chatId, scope);
  // Own records without a login: they may make their own (when the office allows it)
  const create = (await selfLoginAllowed(db))
    ? (await ownLoginCandidates(db, await ownPeople(db, chatId))).slice(0, 3).map((c) => ({ person_id: c.person_id, button: createButton(c.name) }))
    : [];
  if (logins.length === 0 && create.length === 0) {
    return sendTelegram(
      chatId,
      e('እርስዎም ሆኑ ልጆችዎ በድረ-ገጹ ላይ መግቢያ የላችሁም። ጽ/ቤቱ እንዲሠራላችሁ ይጠይቁ።\nNeither you nor your children have a login on the website yet. Ask the office to make one.'),
      menu
    );
  }
  const list = logins.slice(0, 8).map((l) => ({ id: l.id, button: `🔑 ${l.username} · ${l.name}`.slice(0, 60) }));
  await save(db, chatId, { logins: list, create });
  const lines = [];
  if (list.length) lines.push('የትኛው መግቢያ አዲስ ሚስጥር ቁጥር ይፈልጋል?\nWhich login needs a new PIN?\n\nአዲሱ ጊዜያዊ ነው፤ ሲገቡ የራስዎን ይመርጣሉ። · The new one is temporary: you choose your own when you sign in.');
  if (create.length) lines.push('በድረ-ገጹ ላይ መግቢያ የለዎትም? «🆕 መግቢያ ፍጠርልኝ» ይጫኑ — ጊዜያዊ የይለፍ ቃል እዚህ ይደርስዎታል፤ ሲገቡ የራስዎን ይመርጣሉ።\nNo website login yet? Tap “🆕 Create my login” — a temporary password comes here; you choose your own when you sign in.');
  return sendTelegram(chatId, e(lines.join('\n\n')), keyboard([...list.map((l) => [l.button]), ...create.map((c) => [c.button]), [CANCEL]]));
}

/** The people this chat is linked to as themselves */
async function ownPeople(db: SupabaseClient, chatId: number): Promise<string[]> {
  let res = await db.from('telegram_links').select('person_id, relation').eq('chat_id', chatId);
  if (res.error) res = (await db.from('telegram_links').select('person_id').eq('chat_id', chatId)) as typeof res;
  return ((res.data ?? []) as { person_id: string; relation?: string }[]).filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id);
}

/** "🆕 Create my login": a login with a temporary password, sent to the person's own chats. */
async function createLogin(db: SupabaseClient, chatId: number, personId: string, menu: Record<string, unknown>) {
  if (!(await ownPeople(db, chatId)).includes(personId)) return sendTelegram(chatId, e('ይህ መዝገብ የእርስዎ አይደለም። · This record is not yours.'), menu);
  if (!(await rateLimit(`self-login:${personId}`, RESETS_PER_DAY, DAY))) {
    return sendTelegram(chatId, e('ዛሬ ብዙ ጊዜ ተሞክሯል። ነገ እንደገና ይሞክሩ። · Tried too many times today. Try again tomorrow.'), menu);
  }
  const res = await createOwnLogin(db, personId);
  if (res.status === 'not_allowed') {
    return sendTelegram(chatId, e('ለዚህ መዝገብ መግቢያ መፍጠር አልተቻለም — ጽ/ቤቱን ይጠይቁ። · A login cannot be made for this record — ask the office.'), menu);
  }
  if (res.status === 'linked') {
    return sendTelegram(
      chatId,
      e(`✅ ${res.name}: በዚህ ስልክ (${res.username}) ቀድሞ የሚገቡበት መግቢያ ከዚህ ሰንበት ትምህርት ቤት ጋርም ተገናኝቷል። በነበረው የይለፍ ቃልዎ ይግቡ።\n✅ ${res.name}: the login you already use with this phone (${res.username}) now opens this Sunday school too. Sign in with your existing password.`),
      menu
    );
  }
  const chats = await chatsOf(db, [personId], 'SELF');
  chats.add(chatId);
  const delivered = await sendTemporary(chats, { name: res.name, login: res.username, secret: res.secret, pin: false });
  await logReset(db, { systemUserId: res.systemUserId, actorId: null, via: 'bot', delivered });
  return sendTelegram(chatId, e('✅ መግቢያዎ ተፈጥሯል — ጊዜያዊ የይለፍ ቃሉ ከላይ ባለው መልእክት ውስጥ ነው። · Your login is ready — the temporary password is in the message above.'), menu);
}

export async function continuePin(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: PinData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }
  const making = session.data.create?.find((c) => c.button === text);
  if (making) {
    await clearSession(db, chatId);
    return createLogin(db, chatId, making.person_id, menu);
  }
  const picked = session.data.logins?.find((l) => l.button === text);
  if (!picked) {
    return sendTelegram(
      chatId,
      e('እባክዎ ከታች ካሉት አዝራሮች አንዱን ይጫኑ። · Please tap one of the buttons below.'),
      keyboard([...(session.data.logins ?? []).map((l) => [l.button]), ...(session.data.create ?? []).map((c) => [c.button]), [CANCEL]])
    );
  }
  await clearSession(db, chatId);

  // Still one of this chat's own people?
  const login = (await loginsOfChat(db, chatId, scope)).find((l) => l.id === picked.id);
  if (!login) return sendTelegram(chatId, e('ይህ መግቢያ አልተገኘም። · This login was not found.'), menu);

  const powers = await loginPowers(login.auth_user_id);
  if (isPrivileged(powers)) return askAdmins(db, chatId, login, menu);

  if (!(await rateLimit(`pin-reset:${login.auth_user_id}`, RESETS_PER_DAY, DAY))) {
    return sendTelegram(
      chatId,
      e(`ዛሬ ${RESETS_PER_DAY} ጊዜ ተጠይቋል። ነገ እንደገና ይሞክሩ ወይም ጽ/ቤቱን ይጠይቁ።\nA new PIN was asked for ${RESETS_PER_DAY} times today. Try again tomorrow, or ask the office.`),
      menu
    );
  }
  const pin = pinOnly(login.username, [...powers.codes]);
  const secret = newTemporary(pin);
  await setTemporaryPassword(login.auth_user_id, secret);
  // Everyone who should know: the person's own chats (and a student's parents), and this chat
  const chats = await chatsForLogin(db, login);
  chats.add(chatId);
  const delivered = await sendTemporary(chats, { name: login.name, login: login.username, secret, pin });
  await logReset(db, { systemUserId: login.id, actorId: null, via: 'bot', delivered });
  return sendTelegram(chatId, e('✅ አዲሱ ከላይ ባለው መልእክት ውስጥ ነው። · The new one is in the message above.'), menu);
}

/** Administrator accounts: the user managers decide, and send it from the website. */
async function askAdmins(db: SupabaseClient, chatId: number, login: Login, menu: Record<string, unknown>) {
  if (!(await rateLimit(`pin-ask:${login.auth_user_id}`, RESETS_PER_DAY, DAY))) {
    return sendTelegram(chatId, e('አስተዳዳሪዎቹ ቀደም ብለው ተነግሯቸዋል። · The administrators have already been told.'), menu);
  }
  const managers = (await userManagers(db)).filter((p) => p !== login.person_id);
  const chats = await chatsOf(db, managers, 'SELF');
  chats.delete(chatId);
  const { delivered } = await telegramToChats(
    db,
    chats,
    `🔑 <b>${e('የይለፍ ቃል ጥያቄ · Password request')}</b>\n\n` +
      e(
        `${login.name} (${login.username}) በቴሌግራም ቦቱ አዲስ የይለፍ ቃል ጠይቀዋል። መለያው የአስተዳዳሪ ፈቃድ ስላለው ቦቱ በራሱ አይቀይረውም። ጥያቄው ትክክል ከሆነ በ«ስርዓት አስተዳደር → የስርዓት ተጠቃሚዎች» ስር «በቴሌግራም ላክ» ይጫኑ፤ ካልሆነ ይተዉት።\n\n` +
          `${login.name} (${login.username}) asked the Telegram bot for a new password. This account has administrator rights, so the bot does not reset it by itself. If the request is genuine, open Administration → System users and press “Send by Telegram”. If not, ignore this.`
      )
  );
  return sendTelegram(
    chatId,
    e(
      delivered > 0
        ? 'መለያዎ የአስተዳዳሪ ፈቃድ ስላለው ቦቱ በራሱ አዲስ አይሰጥም። አስተዳዳሪዎቹ ተነግሯቸዋል፤ አንዳቸው አዲሱን እዚህ ይልኩልዎታል።\nYour account has administrator rights, so the bot cannot give a new password by itself. The administrators have been told; one of them will send it to you here.'
        : 'መለያዎ የአስተዳዳሪ ፈቃድ ስላለው ቦቱ በራሱ አዲስ አይሰጥም። ሌላ አስተዳዳሪ በ«የስርዓት ተጠቃሚዎች» ስር እንዲልክልዎ ይጠይቁ።\nYour account has administrator rights, so the bot cannot give a new password by itself. Ask another administrator to send one from System users.'
    ),
    menu
  );
}

/** People who may manage users in this Sunday school (USER_MANAGE). */
async function userManagers(db: SupabaseClient): Promise<string[]> {
  const { data: perm } = await db.from('permissions').select('id').eq('code', 'USER_MANAGE').maybeSingle();
  if (!perm) return [];
  const { data: roles } = await db.from('role_permissions').select('role_id').eq('permission_id', (perm as { id: string }).id);
  const roleIds = ((roles ?? []) as { role_id: string }[]).map((r) => r.role_id);
  if (roleIds.length === 0) return [];
  const { data: assigned } = await db.from('user_unit_assignments').select('system_user_id').in('role_id', roleIds).eq('is_active', true);
  const userIds = [...new Set(((assigned ?? []) as { system_user_id: string }[]).map((a) => a.system_user_id))];
  if (userIds.length === 0) return [];
  const { data: users } = await db.from('system_users').select('person_id').in('id', userIds).eq('is_active', true);
  return ((users ?? []) as { person_id: string }[]).map((u) => u.person_id);
}
