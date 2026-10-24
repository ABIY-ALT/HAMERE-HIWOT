// ─────────────────────────────────────────────────────────────────────────────
// One message to a Sunday school's Telegram bot (server only). Called by
// POST /api/telegram/<slug> (and /api/telegram for the default Sunday school),
// which Telegram calls for every message to that bot (set up under
// Administration → Telegram bot). Only Telegram knows the secret header. Handles:
//   /start <code>        link this chat to the person who asked for the code on the website
//   /start, /register    welcome; not linked yet → "📱 Share my phone number"
//   shared phone number  link by phone (lib/telegram/links): members and students to
//                        themselves, parents to their children. The number is kept, so
//                        the links are checked again later (every few hours, on /start
//                        and Help, and when the office changes a phone on a record)
//   buttons by role      member: 🪪 membership, 🧾 dues, 💳 I paid, 📋 service & choir attendance
//                        student / parent: 📋 attendance, 📊 results, 🖊️ exams
//                        everyone linked: 📅 coming events — only this chat's own people
//   💳 I paid            report a dues payment (one month or several) for Finance to approve (lib/telegram/dues-flow);
//                        the steps after it, incl. a photo of the receipt, follow telegram_sessions
//   ✅ I'm here          check in at a program / choir rehearsal: code on the leader's screen
//                        + optional location (lib/telegram/checkin-flow)
//   🎵 My service        choir members: published service rosters (on it or not), confirm / can't come,
//                        rehearsal attendance and vestments held (lib/telegram/service-flow)
//   🗂️ My tasks          tasks the member's department gave them; report progress (lib/telegram/tasks-flow)
//   ✉️ Ask a department  a question to a department, answered on the website (lib/telegram/questions)
//   ℹ️ About us          topics about the Sunday school written by the office (lib/telegram/about) — for anyone
//   🔑 Forgot my PIN     a temporary PIN for the website: own login or a child's (lib/telegram/pin-flow)
//   💰 Budget request    department heads only: ask Finance for money, see their requests (lib/telegram/budget-flow)
//   🎶 Hymns             the hymn library: by type, by words, the next rehearsal; lyrics (lib/telegram/hymn-flow)
//   📚 Library           own books and due dates; find a book, see if it is on the shelf, ask for it (lib/telegram/library-flow)
//   📅 Events            coming programs, own tickets, register for one open for sign-up (lib/telegram/events-flow)
//   📲 My QR             a QR picture per own person / child, for the leader to scan (lib/telegram/myqr)
//   /stop                stop all messages to this chat (and forget its number)
// Always answers 200, so Telegram does not resend.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { timingSafeEqual } from 'node:crypto';
import { tenantClient } from '@/lib/tenant/db';
import { loadTenant, loadTenantAccess } from '@/lib/tenant/context';
import { runInTenant } from '@/lib/tenant/scope';
import { botTokenOf, escapeHtml, publicUrl, sendTelegram, webhookSecretFor } from '@/lib/telegram/bot';
import {
  BUTTONS,
  NOT_FOUND,
  PHONE_KEYBOARD,
  REMOVE_KEYBOARD,
  welcomeText,
  type SchoolNames,
  attendanceText,
  chatScope,
  connectedText,
  duesText,
  examsText,
  helpFor,
  membershipText,
  menuFor,
  resultsText,
} from '@/lib/telegram/menu';
import { activeSession, clearSession, continuePaid, startPaid } from '@/lib/telegram/dues-flow';
import { refreshChat, savedChat, syncChat, tellUpdated } from '@/lib/telegram/links';
import { askerOf, continueAsk, startAsk, type AskData } from '@/lib/telegram/questions';
import { continueTasks, startTasks, type TasksData } from '@/lib/telegram/tasks-flow';
import { continueCheckin, startCheckin, type CheckinData } from '@/lib/telegram/checkin-flow';
import { continueService, startService, type ServiceData } from '@/lib/telegram/service-flow';
import { continuePin, startPin, type PinData } from '@/lib/telegram/pin-flow';
import { continueBudget, startBudget, type BudgetData } from '@/lib/telegram/budget-flow';
import { continueHymns, startHymns, type HymnData } from '@/lib/telegram/hymn-flow';
import { continueLibrary, startLibrary, type LibraryChatData } from '@/lib/telegram/library-flow';
import { continueEvents, startEvents, type EventsChatData } from '@/lib/telegram/events-flow';
import { sendMyQr } from '@/lib/telegram/myqr';
import { BACK_BUTTON, aboutMenu, isAboutMessage, loadAbout, topicButton, topicText } from '@/lib/telegram/about';


type Update = {
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    contact?: { phone_number?: string; user_id?: number };
    /** Shared with “📍 Share my location” (check-in) */
    location?: { latitude: number; longitude: number };
    caption?: string;
    /** The same picture in several sizes, smallest first */
    photo?: { file_id: string }[];
    /** A picture or PDF sent as a file */
    document?: { file_id: string; mime_type?: string };
  };
};

const WAITING =
  '\n\nቁጥርዎ ተቀምጧል፦ ጽ/ቤቱ በመዝገብ ላይ ሲያስገባው ወዲያው ይገናኛሉ፤ እዚህ መልእክት ይደርስዎታል።\n' +
  'Your number is kept: once the office puts it on a record, you are connected by yourself and get a message here.';

/** "/results", "/results@HamereHiwotBot" or the 📊 button */
const asked = (text: string, command: string, button: string) => text === button || new RegExp(`^/${command}(@\\w+)?$`, 'i').test(text);

/** A menu button or a command (other than /cancel) leaves a conversation that is in progress. */
const leavesSession = (text: string) => (Object.values(BUTTONS) as string[]).includes(text) || (text.startsWith('/') && !/^\/cancel/i.test(text));

/** The receipt picture of a message, if it has one */
function pictureOf(message: NonNullable<Update['message']>): string | undefined {
  if (message.photo?.length) return message.photo[message.photo.length - 1].file_id;
  const doc = message.document;
  if (doc && (/^image\//.test(doc.mime_type ?? '') || doc.mime_type === 'application/pdf')) return doc.file_id;
  return undefined;
}

function sameSecret(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checks the request came from this tenant's bot, then answers it as that tenant. */
/** The Sunday school's names for the bot's messages (Hamere Hiwot keeps its usual wording) */
async function schoolNames(tenantId: string): Promise<SchoolNames> {
  const t = await loadTenant(tenantId);
  if (!t || t.is_default) return ['Hamere Hiwot Sunday School', 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት'];
  return [t.name_en, t.name_am || t.name_en];
}

export async function handleTelegramWebhook(request: Request, tenantId: string): Promise<NextResponse> {
  if (!isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  const token = await botTokenOf(tenantId);
  if (!token) return new NextResponse('Not set up', { status: 404 });
  if (!sameSecret(request.headers.get('x-telegram-bot-api-secret-token'), webhookSecretFor(token))) {
    return new NextResponse('Forbidden', { status: 401 });
  }
  const access = await loadTenantAccess(tenantId);
  // Not in the plan, or the Sunday school is suspended: accept and ignore, so Telegram does not resend
  if (access.mode === 'blocked' || !access.modules.includes('telegram')) return NextResponse.json({ ok: true });
  // Budget requests need the finance module and a Sunday school that may write
  const budget = access.mode === 'full' && access.modules.includes('finance');
  const features = { budget, hymns: access.modules.includes('sacred_arts'), library: access.modules.includes('library') };
  return runInTenant(tenantId, () => answer(request, tenantId, access.mode !== 'full', features));
}

async function answer(
  request: Request,
  tenantId: string,
  readOnly: boolean,
  features: { budget: boolean; hymns: boolean; library: boolean }
): Promise<NextResponse> {
  const update = (await request.json().catch(() => null)) as Update | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text ?? '').trim();
  // Private chats only: links are personal
  if (!chatId || message?.chat?.type !== 'private') return NextResponse.json({ ok: true });

  const db = tenantClient(tenantId, { readOnly });
  const from = message?.from;
  const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') + (from?.username ? ` (@${from.username})` : '');
  try {
    // ── A shared phone number ──
    if (message?.contact) {
      // Only the person's own number (the button), never a contact they forward
      if (!message.contact.user_id || message.contact.user_id !== from?.id) {
        await sendTelegram(chatId, escapeHtml('እባክዎ «📱 ስልኬን አጋራ» የሚለውን አዝራር ይጫኑ። · Please use the “Share my phone number” button.'), PHONE_KEYBOARD);
        return NextResponse.json({ ok: true });
      }
      // Links by this number now — and the number is kept, so the links follow later changes to the records
      const found = await syncChat(db, chatId, message.contact.phone_number ?? '', telegramName);
      if (found.self.length === 0 && found.children.length === 0) {
        // (the number is kept from migration 030)
        await sendTelegram(chatId, escapeHtml(NOT_FOUND + ((await savedChat(db, chatId)) ? WAITING : '')), REMOVE_KEYBOARD);
        return NextResponse.json({ ok: true });
      }
      // "Connected as": member, student and/or parent of whom — and the buttons for that
      const scope = await chatScope(db, chatId, features);
      await sendTelegram(chatId, await connectedText(db, scope), menuFor(scope));
      return NextResponse.json({ ok: true });
    }

    // ── /start <code> from the website ──
    const startCode = /^\/start\s+(\S+)/.exec(text)?.[1];
    if (startCode) {
      const { data: link } = await db.from('telegram_link_codes')
        .select('person_id, expires_at, person:persons(full_name_en, full_name_am)')
        .eq('code', startCode)
        .maybeSingle();
      const row = link as { person_id: string; expires_at: string; person: { full_name_en: string; full_name_am: string | null } | null } | null;
      if (!row || Date.parse(row.expires_at) < Date.now()) {
        await sendTelegram(
          chatId,
          escapeHtml('ይህ የማገናኛ መልእክት ጊዜው አልፏል። ከድረ-ገጹ እንደገና «ቴሌግራም አገናኝ» ይጫኑ።\nThis link has expired. Tap “Connect Telegram” on the website again.')
        );
        return NextResponse.json({ ok: true });
      }
      await db.from('telegram_links').upsert({ person_id: row.person_id, chat_id: chatId, telegram_name: telegramName || null }, { onConflict: 'person_id,chat_id' });
      await db.from('telegram_link_codes').delete().eq('code', startCode);
      const scope = await chatScope(db, chatId, features);
      await sendTelegram(
        chatId,
        `${await connectedText(db, scope)}\n\n` +
          escapeHtml('የትምህርት ቤቱ መልእክቶች እዚህ ይደርሱዎታል። · Messages from the school will come here.\n') +
          (await publicUrl()),
        menuFor(scope)
      );
      return NextResponse.json({ ok: true });
    }

    if (/^\/stop(@\w+)?$/i.test(text)) {
      await db.from('telegram_links').delete().eq('chat_id', chatId);
      // Forget the number too, so changes to the records do not connect the chat again
      await db.from('telegram_chats').delete().eq('chat_id', chatId);
      await clearSession(db, chatId);
      await sendTelegram(
        chatId,
        escapeHtml('መልእክቶች ቆመዋል። እንደገና ለመገናኘት /start ይላኩ።\nMessages stopped. Send /start to connect again.'),
        REMOVE_KEYBOARD
      );
      return NextResponse.json({ ok: true });
    }

    // ── ℹ️ About us: for anyone, connected or not ──
    if (isAboutMessage(text)) {
      if (text === BACK_BUTTON) {
        const scope = await chatScope(db, chatId, features);
        await sendTelegram(chatId, escapeHtml(scope.linked ? helpFor(scope) : welcomeText(await schoolNames(tenantId))), scope.linked ? menuFor(scope) : PHONE_KEYBOARD);
        return NextResponse.json({ ok: true });
      }
      const topics = await loadAbout(db);
      const topic = topics.find((t) => topicButton(t) === text);
      const list = aboutMenu(topics, await schoolNames(tenantId));
      await sendTelegram(chatId, topic ? topicText(topic) : list.text, list.keyboard);
      return NextResponse.json({ ok: true });
    }

    // ── Links still right? Checked by the saved number every few hours, at once on /start and Help ──
    const force = /^\/(start|menu|help)(@\w+)?$/i.test(text) || text === BUTTONS.help;
    const refreshed = await refreshChat(db, chatId, force);
    if (refreshed?.added) await tellUpdated(db, chatId);

    // ── Everything else needs a linked chat ──
    const scope = await chatScope(db, chatId, features);
    if (!scope.linked) {
      // Shared a number that is on no record yet: it connects by itself once the office adds it
      const waiting = await savedChat(db, chatId);
      await sendTelegram(chatId, escapeHtml(waiting ? `${NOT_FOUND}${WAITING}` : welcomeText(await schoolNames(tenantId))), PHONE_KEYBOARD);
      return NextResponse.json({ ok: true });
    }
    const menu = menuFor(scope);

    // ── In the middle of "💳 I paid"? ──
    const session = await activeSession(db, chatId);
    if (session && !leavesSession(text)) {
      if (session.step.startsWith('CHECK_')) {
        const loc = message?.location ? { lat: message.location.latitude, lng: message.location.longitude } : null;
        await continueCheckin(db, chatId, session as unknown as { step: string; data: CheckinData }, { text, location: loc }, menu);
      } else if (session.step.startsWith('SERVE_')) {
        await continueService(db, chatId, session as unknown as { step: string; data: ServiceData }, text, scope, menu);
      } else if (session.step.startsWith('TASK_')) {
        await continueTasks(db, chatId, session as unknown as { step: string; data: TasksData }, text, scope, menu);
      } else if (session.step.startsWith('PIN_')) {
        await continuePin(db, chatId, session as unknown as { step: string; data: PinData }, text, scope, menu);
      } else if (session.step.startsWith('HYMN_')) {
        await continueHymns(db, chatId, session as unknown as { step: string; data: HymnData }, text, scope, menu);
      } else if (session.step.startsWith('LIB_')) {
        await continueLibrary(db, chatId, session as unknown as { step: string; data: LibraryChatData }, text, scope, menu, readOnly);
      } else if (session.step.startsWith('EVT_')) {
        await continueEvents(db, chatId, session as unknown as { step: string; data: EventsChatData }, text, scope, menu);
      } else if (session.step.startsWith('BUDGET_')) {
        await continueBudget(db, chatId, session as unknown as { step: string; data: BudgetData }, text, scope, menu);
      } else if (session.step.startsWith('ASK_')) {
        await continueAsk(db, chatId, session as unknown as { step: string; data: AskData }, text, await askerOf(db, scope, telegramName), menu);
      } else {
        await continuePaid(db, chatId, session, { text, photoFileId: pictureOf(message!), caption: message?.caption }, menu);
      }
      return NextResponse.json({ ok: true });
    }
    if (session) await clearSession(db, chatId);

    if (asked(text, 'membership', BUTTONS.membership)) await sendTelegram(chatId, await membershipText(db, scope), menu);
    else if (asked(text, 'results', BUTTONS.results)) await sendTelegram(chatId, await resultsText(db, scope), menu);
    else if (asked(text, 'attendance', BUTTONS.attendance)) await sendTelegram(chatId, await attendanceText(db, scope), menu);
    else if (asked(text, 'exams', BUTTONS.exams)) await sendTelegram(chatId, await examsText(db, scope), menu);
    else if (asked(text, 'dues', BUTTONS.dues)) await sendTelegram(chatId, await duesText(db, scope), menu);
    else if (asked(text, 'paid', BUTTONS.paid)) await startPaid(db, chatId, scope);
    else if (asked(text, 'ask', BUTTONS.ask)) await startAsk(db, chatId, scope);
    else if (asked(text, 'tasks', BUTTONS.mytasks)) await startTasks(db, chatId, scope, menu);
    else if (asked(text, 'here', BUTTONS.here)) await startCheckin(db, chatId, scope, menu);
    else if (asked(text, 'qr', BUTTONS.myqr)) await sendMyQr(db, chatId, scope, menu);
    else if (asked(text, 'service', BUTTONS.service)) await startService(db, chatId, scope, menu);
    else if (asked(text, 'events', BUTTONS.events)) await startEvents(db, chatId, scope, menu);
    else if (asked(text, 'pin', BUTTONS.pin)) await startPin(db, chatId, scope, menu);
    else if (asked(text, 'budget', BUTTONS.budget)) await startBudget(db, chatId, scope, menu, features.budget);
    else if (asked(text, 'hymns', BUTTONS.hymns)) await startHymns(db, chatId, scope, menu, features.hymns);
    else if (asked(text, 'library', BUTTONS.library)) await startLibrary(db, chatId, scope, menu, features.library);
    else await sendTelegram(chatId, escapeHtml(helpFor(scope)), menu);
  } catch (e) {
    console.error('telegram webhook failed', e);
    await sendTelegram(chatId, escapeHtml('ይቅርታ፣ አሁን አልተሳካም። ትንሽ ቆይተው እንደገና ይሞክሩ። · Sorry, that did not work. Please try again a little later.')).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
