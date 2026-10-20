// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram — Telegram calls this for every message to the bot
// (set up under Administration → Telegram bot). Only Telegram knows the secret
// header. Handles:
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
//   ✉️ Ask a department  a question to a department, answered on the website (lib/telegram/questions)
//   ℹ️ About us          topics about the Sunday school written by the office (lib/telegram/about) — for anyone
//   /stop                stop all messages to this chat (and forget its number)
// Always answers 200, so Telegram does not resend.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { escapeHtml, sendTelegram, siteUrl, telegramConfigured, webhookSecret } from '@/lib/telegram/bot';
import {
  BUTTONS,
  NOT_FOUND,
  PHONE_KEYBOARD,
  REMOVE_KEYBOARD,
  WELCOME,
  attendanceText,
  chatScope,
  connectedText,
  duesText,
  eventsText,
  examsText,
  helpFor,
  membershipText,
  menuFor,
  resultsText,
} from '@/lib/telegram/menu';
import { activeSession, clearSession, continuePaid, startPaid } from '@/lib/telegram/dues-flow';
import { refreshChat, savedChat, syncChat, tellUpdated } from '@/lib/telegram/links';
import { askerOf, continueAsk, startAsk, type AskData } from '@/lib/telegram/questions';
import { BACK_BUTTON, aboutMenu, isAboutMessage, loadAbout, topicButton, topicText } from '@/lib/telegram/about';

export const dynamic = 'force-dynamic';

type Update = {
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    contact?: { phone_number?: string; user_id?: number };
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

export async function POST(request: Request) {
  if (!telegramConfigured() || !isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) return new NextResponse('Forbidden', { status: 401 });

  const update = (await request.json().catch(() => null)) as Update | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text ?? '').trim();
  // Private chats only: links are personal
  if (!chatId || message?.chat?.type !== 'private') return NextResponse.json({ ok: true });

  const db = createAdminClient();
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
      const scope = await chatScope(db, chatId);
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
      const scope = await chatScope(db, chatId);
      await sendTelegram(
        chatId,
        `${await connectedText(db, scope)}\n\n` +
          escapeHtml('የትምህርት ቤቱ መልእክቶች እዚህ ይደርሱዎታል። · Messages from the school will come here.\n') +
          siteUrl(),
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
        const scope = await chatScope(db, chatId);
        await sendTelegram(chatId, escapeHtml(scope.linked ? helpFor(scope) : WELCOME), scope.linked ? menuFor(scope) : PHONE_KEYBOARD);
        return NextResponse.json({ ok: true });
      }
      const topics = await loadAbout(db);
      const topic = topics.find((t) => topicButton(t) === text);
      const list = aboutMenu(topics);
      await sendTelegram(chatId, topic ? topicText(topic) : list.text, list.keyboard);
      return NextResponse.json({ ok: true });
    }

    // ── Links still right? Checked by the saved number every few hours, at once on /start and Help ──
    const force = /^\/(start|menu|help)(@\w+)?$/i.test(text) || text === BUTTONS.help;
    const refreshed = await refreshChat(db, chatId, force);
    if (refreshed?.added) await tellUpdated(db, chatId);

    // ── Everything else needs a linked chat ──
    const scope = await chatScope(db, chatId);
    if (!scope.linked) {
      // Shared a number that is on no record yet: it connects by itself once the office adds it
      const waiting = await savedChat(db, chatId);
      await sendTelegram(chatId, escapeHtml(waiting ? `${NOT_FOUND}${WAITING}` : WELCOME), PHONE_KEYBOARD);
      return NextResponse.json({ ok: true });
    }
    const menu = menuFor(scope);

    // ── In the middle of "💳 I paid"? ──
    const session = await activeSession(db, chatId);
    if (session && !leavesSession(text)) {
      if (session.step.startsWith('ASK_')) {
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
    else if (asked(text, 'events', BUTTONS.events)) await sendTelegram(chatId, await eventsText(db, scope), menu);
    else await sendTelegram(chatId, escapeHtml(helpFor(scope)), menu);
  } catch (e) {
    console.error('telegram webhook failed', e);
    await sendTelegram(chatId, escapeHtml('ይቅርታ፣ አሁን አልተሳካም። ትንሽ ቆይተው እንደገና ይሞክሩ። · Sorry, that did not work. Please try again a little later.')).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
