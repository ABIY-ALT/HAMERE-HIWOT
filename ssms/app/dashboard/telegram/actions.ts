'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Telegram: connecting one's own chat (any signed-in user — staff, students,
// parents), the bot's setup (SYSTEM_CONFIGURE), messages to a group and the
// list of connected chats with what the bot treats each as (SYSTEM_CONFIGURE,
// MEMBER_UPDATE or STUDENT_UPDATE); disconnecting a chat (SYSTEM_CONFIGURE).
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { createAdminClient } from '@/lib/supabase/server';
import { botUsername, chatsOf, escapeHtml, newLinkCode, sendTelegram, telegramApi, telegramConfigured, telegramToChats, webhookSecret } from '@/lib/telegram/bot';
import { refreshChat, tellUpdated } from '@/lib/telegram/links';
import { nonMemberIds } from '@/lib/members/membership';
import { ABOUT_KEY, MAX_TOPICS, type AboutTopic } from '@/lib/telegram/about-topics';

const MIGRATION_024 = 'Run database migration 024 (Telegram) first';
const missing = (m: string) => (/telegram_/.test(m) && /does not exist|schema cache/.test(m) ? MIGRATION_024 : m);
const BROADCASTERS = ['SYSTEM_CONFIGURE', 'MEMBER_UPDATE', 'STUDENT_UPDATE'] as const;

// ── My own chat ──────────────────────────────────────────────────────────────

export interface MyTelegram {
  configured: boolean;
  links: { id: string; telegram_name: string; linked_at: string }[];
}

export async function loadMyTelegram(): Promise<Loaded<MyTelegram>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    if (!telegramConfigured()) return { mode: 'live', data: { configured: false, links: [] } };
    // Own chats only — a parent's chat linked to a student (relation GUARDIAN, 027) is not the student's
    let res = await db.from('telegram_links').select('id, telegram_name, linked_at, relation').eq('person_id', me.person.id).order('linked_at');
    if (res.error && /relation/.test(res.error.message)) res = (await db.from('telegram_links').select('id, telegram_name, linked_at').eq('person_id', me.person.id).order('linked_at')) as typeof res;
    const { error } = res;
    const data = ((res.data ?? []) as { relation?: string }[]).filter((l) => l.relation !== 'GUARDIAN');
    if (error) throw new Error(missing(error.message));
    return {
      mode: 'live',
      data: {
        configured: true,
        links: ((data ?? []) as { id: string; telegram_name: string | null; linked_at: string }[]).map((l) => ({ ...l, telegram_name: l.telegram_name ?? '' })),
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

/** A t.me link that connects the chat that opens it to me (valid 15 minutes). */
export async function startTelegramLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize();
    if (!telegramConfigured()) throw new Error('The Telegram bot is not set up yet');
    const username = await botUsername();
    if (!username) throw new Error('Could not reach the Telegram bot — check TELEGRAM_BOT_TOKEN');
    const code = newLinkCode();
    await db.from('telegram_link_codes').delete().lt('expires_at', new Date().toISOString());
    const { error } = await db.from('telegram_link_codes').insert({ code, person_id: me.person.id, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (error) throw new Error(missing(error.message));
    return { ok: true, url: `https://t.me/${username}?start=${code}` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function unlinkMyTelegram(linkId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize();
    const { data: link } = await db.from('telegram_links').select('*').eq('id', linkId).eq('person_id', me.person.id).maybeSingle();
    if (!link || (link as { relation?: string }).relation === 'GUARDIAN') throw new Error('Not your Telegram link');
    await db.from('telegram_links').delete().eq('id', linkId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── The bot (administration) ─────────────────────────────────────────────────

export interface BotStatus {
  configured: boolean;
  username: string | null;
  webhook_url: string;
  expected_url: string;
  pending: number;
  last_error: string;
  linked_people: number;
  can_configure: boolean;
  broadcasts: { id: string; audience: string; message: string; recipients: number; delivered: number; created_at: string }[];
  classes: { id: string; name_en: string; name_am: string }[];
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function loadBotStatus(): Promise<Loaded<BotStatus>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize(...BROADCASTERS);
    const expected = `${await siteOrigin()}/api/telegram`;
    const [info, username, links, broadcasts, year] = await Promise.all([
      telegramConfigured() ? telegramApi<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo') : Promise.resolve(null),
      telegramConfigured() ? botUsername() : Promise.resolve(null),
      db.from('telegram_links').select('person_id'),
      db.from('telegram_broadcasts').select('id, audience, message, recipients, delivered, created_at').order('created_at', { ascending: false }).limit(10),
      db.from('academic_years').select('id').order('is_current', { ascending: false }).order('start_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (links.error) throw new Error(missing(links.error.message));
    const classes = year.data
      ? ((await db.from('classes').select('id, name_en, name_am').eq('academic_year_id', (year.data as { id: string }).id).order('grade_level').order('name_en').then(check)) as {
          id: string; name_en: string; name_am: string | null;
        }[])
      : [];
    return {
      mode: 'live',
      data: {
        configured: telegramConfigured(),
        username,
        webhook_url: info?.ok ? info.result.url : '',
        expected_url: expected,
        pending: info?.ok ? info.result.pending_update_count : 0,
        last_error: info?.ok ? info.result.last_error_message ?? '' : info && !info.ok ? info.description ?? '' : '',
        linked_people: new Set(((links.data ?? []) as { person_id: string }[]).map((l) => l.person_id)).size,
        can_configure: me.permissions.includes('SYSTEM_CONFIGURE'),
        broadcasts: (broadcasts.data ?? []) as BotStatus['broadcasts'],
        classes: classes.map((c) => ({ id: c.id, name_en: c.name_en, name_am: c.name_am || c.name_en })),
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

/** Point Telegram at this site and set the bot's command menu. */
export async function connectBot(): Promise<ActionResult> {
  try {
    await authorize('SYSTEM_CONFIGURE');
    if (!telegramConfigured()) throw new Error('Set TELEGRAM_BOT_TOKEN on the server first');
    const origin = await siteOrigin();
    if (!origin.startsWith('https://') || /localhost|127\.0\.0\.1/.test(origin)) {
      throw new Error('Telegram can only reach the live site (https). Open this page on the live site and connect from there.');
    }
    const set = await telegramApi('setWebhook', {
      url: `${origin}/api/telegram`,
      secret_token: webhookSecret(),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    if (!set.ok) throw new Error(set.description ?? 'Telegram refused the address');
    await telegramApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'Connect · ማገናኘት' },
        { command: 'results', description: 'Results · ውጤት' },
        { command: 'attendance', description: 'Attendance · ክትትል' },
        { command: 'exams', description: 'Online exams · ፈተና' },
        { command: 'membership', description: 'My membership · አባልነቴ' },
        { command: 'events', description: 'Coming events · መርሐ ግብር' },
        { command: 'about', description: 'About the Sunday school · ስለ እኛ' },
        { command: 'ask', description: 'Ask a department · ጥያቄ' },
        { command: 'dues', description: 'Monthly dues · መዋጮ' },
        { command: 'paid', description: 'I paid my dues · ከፍያለሁ' },
        { command: 'menu', description: 'Menu · ምናሌ' },
        { command: 'stop', description: 'Stop messages · መልእክት አቁም' },
      ],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Messages to a group ──────────────────────────────────────────────────────

const AudienceSchema = z.union([
  z.literal('EVERYONE'),
  z.literal('STAFF'),
  z.string().regex(/^(STUDENTS|PARENTS):(ALL|[0-9a-f-]{36})$/, 'Choose who gets the message'),
]);

/**
 * The Telegram chats an audience reaches (each once). Students: their own chats.
 * Parents: guardians' own chats plus parents linked to the students by phone.
 */
async function audienceChats(db: SupabaseClient, audience: string): Promise<{ people: number; chats: Set<number> }> {
  if (audience === 'EVERYONE') {
    const { data } = await db.from('telegram_links').select('person_id, chat_id');
    const rows = (data ?? []) as { person_id: string; chat_id: number }[];
    return { people: new Set(rows.map((r) => r.person_id)).size, chats: new Set(rows.map((r) => Number(r.chat_id))) };
  }
  if (audience === 'STAFF') {
    // Accounts with any role other than the student / parent portals
    const rows = await selectAll<Record<string, unknown>>((a, b) =>
      db.from('user_unit_assignments').select('system_user_id, role:roles(code)').eq('is_active', true).order('id').range(a, b)
    );
    const roleOf = (r: Record<string, unknown>) => (r.role as { code: string } | null)?.code;
    const staff = [...new Set(rows.filter((r) => roleOf(r) && !['STUDENT', 'PARENT'].includes(roleOf(r)!)).map((r) => r.system_user_id as string))];
    const { data } = await db.from('system_users').select('person_id').eq('is_active', true).in('id', staff.length ? staff : ['00000000-0000-0000-0000-000000000000']);
    const people = ((data ?? []) as { person_id: string }[]).map((r) => r.person_id);
    return { people: people.length, chats: await chatsOf(db, people, 'SELF') };
  }
  const [kind, scope] = audience.split(':');
  const year = (await db.from('academic_years').select('id').order('is_current', { ascending: false }).order('start_date', { ascending: false }).limit(1).maybeSingle().then(check)) as { id: string } | null;
  if (!year) return { people: 0, chats: new Set() };
  let enrollments = db.from('enrollments').select('student_id').eq('academic_year_id', year.id).eq('status', 'ACTIVE');
  if (scope !== 'ALL') enrollments = enrollments.eq('class_id', scope);
  const studentIds = ((await enrollments.then(check)) as { student_id: string }[]).map((e) => e.student_id);
  if (studentIds.length === 0) return { people: 0, chats: new Set() };
  const { data: students } = await db.from('students').select('person_id').in('id', studentIds);
  const studentPersons = ((students ?? []) as { person_id: string }[]).map((r) => r.person_id);
  if (kind === 'STUDENTS') return { people: studentPersons.length, chats: await chatsOf(db, studentPersons, 'SELF') };
  const { data } = await db.from('student_guardians').select('guardian_person_id').in('student_id', studentIds);
  const guardians = ((data ?? []) as { guardian_person_id: string }[]).map((r) => r.guardian_person_id);
  const chats = new Set([...(await chatsOf(db, guardians, 'SELF')), ...(await chatsOf(db, studentPersons, 'GUARDIAN'))]);
  return { people: studentIds.length, chats };
}

/** How many Telegram chats an audience would reach. */
export async function countAudience(audience: string): Promise<{ ok: true; people: number; connected: number } | { ok: false; error: string }> {
  try {
    const { db } = await authorize(...BROADCASTERS);
    const { people, chats } = await audienceChats(db, AudienceSchema.parse(audience));
    return { ok: true, people, connected: chats.size };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Send a message to a group. It goes out in the background; the history shows how many it reached. */
export async function sendBroadcast(audience: string, message: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize(...BROADCASTERS);
    if (!telegramConfigured()) throw new Error('The Telegram bot is not set up yet');
    const who = AudienceSchema.parse(audience);
    const text = z.string().trim().min(2, 'Write the message').max(3500, 'The message is too long').parse(message);
    const row = (await db.from('telegram_broadcasts').insert({ audience: who, message: text, sent_by: me.systemUser.id }).select('id').single().then(check)) as { id: string };
    const { chats } = await audienceChats(db, who);
    after(async () => {
      const bg = createAdminClient();
      const html = `📢 <b>የሐመረ ሕይወት ሰንበት ት/ቤት · Hamere Hiwot</b>\n\n${escapeHtml(text)}`;
      const sent = await telegramToChats(bg, chats, html);
      await bg.from('telegram_broadcasts').update({ recipients: sent.recipients, delivered: sent.delivered }).eq('id', row.id);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── Who is connected (Administration → Telegram bot) ─────────────────────────

/** One Telegram chat and what the bot treats it as — the same rules as the bot (lib/telegram/menu chatScope). */
export interface TelegramChatRow {
  chat_id: number;
  telegram_name: string;
  /** The number it shared ('' = connected from the website only) */
  phone: string;
  connected_at: string;
  /** "Name (MBR-…)" — members linked as themselves */
  members: string[];
  /** "Name (REG-…)" — their own student records */
  students: string[];
  /** Children, linked as a parent */
  children: string[];
  /** Shared a number that is on no record yet; connects by itself once the office adds it */
  waiting: boolean;
}

/** Bulk `.in()` without very long URLs */
async function inChunks<T>(ids: string[], load: (part: string[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(((await load(ids.slice(i, i + 150))).data ?? []) as T[]));
  return out;
}

export async function loadTelegramChats(): Promise<Loaded<{ chats: TelegramChatRow[]; can_manage: boolean }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize(...BROADCASTERS);
    const [links, saved, students, guardians, notMembers] = await Promise.all([
      selectAll<Record<string, unknown>>((a, b) => db.from('telegram_links').select('chat_id, person_id, relation, telegram_name, linked_at').order('id').range(a, b)),
      // Numbers kept from migration 030 (none before it)
      db.from('telegram_chats').select('chat_id, phone, telegram_name, created_at'),
      selectAll<{ id: string; person_id: string; reg_no: string }>((a, b) => db.from('students').select('id, person_id, reg_no').order('id').range(a, b)),
      selectAll<{ student_id: string; guardian_person_id: string }>((a, b) => db.from('student_guardians').select('student_id, guardian_person_id').order('student_id').range(a, b)),
      nonMemberIds(db),
    ]);
    const studentOf = new Map(students.map((s) => [s.person_id, s]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const selfPeople = new Set(links.filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id as string));
    const guarded = guardians.filter((g) => selfPeople.has(g.guardian_person_id));
    const personIds = [
      ...new Set([...links.map((l) => l.person_id as string), ...guarded.map((g) => studentById.get(g.student_id)?.person_id).filter((id): id is string => Boolean(id))]),
    ];
    const people = await inChunks<{ id: string; full_name_en: string; full_name_am: string | null; membership_code: string }>(personIds, (part) =>
      db.from('persons').select('id, full_name_en, full_name_am, membership_code').in('id', part)
    );
    const personById = new Map(people.map((p) => [p.id, p]));
    const nameOf = (id: string) => personById.get(id)?.full_name_am || personById.get(id)?.full_name_en || '—';

    const rows = new Map<number, TelegramChatRow>();
    const rowFor = (chatId: number, name: string, at: string) => {
      const row = rows.get(chatId) ?? { chat_id: chatId, telegram_name: '', phone: '', connected_at: at, members: [], students: [], children: [], waiting: false };
      if (!row.telegram_name && name) row.telegram_name = name;
      if (at && (!row.connected_at || at < row.connected_at)) row.connected_at = at;
      rows.set(chatId, row);
      return row;
    };
    const add = (list: string[], item: string) => {
      if (!list.includes(item)) list.push(item);
    };
    for (const l of links) {
      const row = rowFor(Number(l.chat_id), (l.telegram_name as string) ?? '', (l.linked_at as string) ?? '');
      const personId = l.person_id as string;
      if (l.relation === 'GUARDIAN') {
        add(row.children, nameOf(personId));
        continue;
      }
      if (!notMembers.has(personId)) add(row.members, `${nameOf(personId)} (${personById.get(personId)?.membership_code ?? ''})`);
      const own = studentOf.get(personId);
      if (own) add(row.students, `${nameOf(personId)} (${own.reg_no})`);
      // A parent's own account (parent portal): their children through the guardian list
      for (const g of guarded.filter((x) => x.guardian_person_id === personId)) {
        const child = studentById.get(g.student_id);
        if (child) add(row.children, nameOf(child.person_id));
      }
    }
    for (const c of (saved.data ?? []) as { chat_id: number; phone: string; telegram_name: string | null; created_at: string }[]) {
      const row = rowFor(Number(c.chat_id), c.telegram_name ?? '', c.created_at);
      row.phone = c.phone;
      row.waiting = !row.members.length && !row.students.length && !row.children.length;
    }
    const chats = [...rows.values()].sort((a, b) => b.connected_at.localeCompare(a.connected_at));
    return { mode: 'live', data: { chats, can_manage: me.permissions.includes('SYSTEM_CONFIGURE') } };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

/** Check a chat's links again by the number it shared (e.g. after fixing a record). */
export async function refreshTelegramChat(chatId: number): Promise<{ ok: true; added: number; removed: number } | { ok: false; error: string }> {
  try {
    const { db } = await authorize(...BROADCASTERS);
    const id = z.number().int().parse(chatId);
    const result = await refreshChat(db, id, true);
    if (!result) throw new Error('This chat connected from the website — it has no shared number to check');
    if (result.added) await tellUpdated(db, id);
    return { ok: true, added: result.added, removed: result.removed };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Disconnect a chat (e.g. a wrong person): its links and kept number are removed, and it is told. */
export async function disconnectTelegramChat(chatId: number): Promise<ActionResult> {
  try {
    const { db } = await authorize('SYSTEM_CONFIGURE');
    const id = z.number().int().parse(chatId);
    await db.from('telegram_links').delete().eq('chat_id', id).then(check);
    await db.from('telegram_chats').delete().eq('chat_id', id);
    await db.from('telegram_sessions').delete().eq('chat_id', id);
    if (telegramConfigured()) {
      await sendTelegram(
        id,
        escapeHtml('የትምህርት ቤቱ ጽ/ቤት ይህን ቻት አቋርጧል። እንደገና ለመገናኘት /start ይላኩ።\nThe school office disconnected this chat. Send /start to connect again.'),
        { reply_markup: { remove_keyboard: true } }
      );
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── ℹ️ About us (what the bot tells anyone about the Sunday school) ──────────

const TopicSchema = z
  .object({
    id: z.string().min(1).max(40),
    title_am: z.string().trim().max(60),
    title_en: z.string().trim().max(60),
    body_am: z.string().trim().max(3000),
    body_en: z.string().trim().max(3000),
  })
  .refine((t) => t.title_am || t.title_en, 'Every topic needs a title');

export async function loadBotAbout(): Promise<Loaded<{ topics: AboutTopic[]; can_edit: boolean }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize(...BROADCASTERS);
    const { data, error } = await db.from('system_settings').select('value').eq('key', ABOUT_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    const topics = ((data as { value?: { topics?: AboutTopic[] } } | null)?.value?.topics ?? []) as AboutTopic[];
    return { mode: 'live', data: { topics, can_edit: true } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

/** Save the topics (in this order). A topic without text is kept here but not shown in the bot. */
export async function saveBotAbout(topics: z.input<typeof TopicSchema>[]): Promise<ActionResult> {
  try {
    const { me, db } = await authorize(...BROADCASTERS);
    const clean = z.array(TopicSchema).max(MAX_TOPICS, `At most ${MAX_TOPICS} topics`).parse(topics);
    await db.from('system_settings')
      .upsert({ key: ABOUT_KEY, value: { topics: clean }, updated_by: me.systemUser.id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
