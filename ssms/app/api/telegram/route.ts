// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram — Telegram calls this for every message to the bot
// (set up under Administration → Telegram bot). Only Telegram knows the secret
// header. Handles:
//   /start <code>   link this chat to the person who asked for the code in the app
//   /start          how to connect
//   /stop           stop all messages to this chat
//   anything else   short help
// Always answers 200, so Telegram does not resend.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { escapeHtml, sendTelegram, siteUrl, telegramConfigured, webhookSecret } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

const HELP =
  'ሰላም! ይህ የሐመረ ሕይወት ሰንበት ትምህርት ቤት ቦት ነው።\n' +
  'ለማገናኘት፦ ወደ ድረ-ገጹ ገብተው «መገለጫ» ላይ «ቴሌግራም አገናኝ» ይጫኑ።\n' +
  'መልእክት ለማቆም፦ /stop\n\n' +
  'Hello! This is the Hamere Hiwot Sunday School bot.\n' +
  'To connect: sign in to the website and tap “Connect Telegram” on your profile.\n' +
  'To stop messages: /stop';

type Update = {
  message?: { text?: string; chat?: { id: number; type?: string }; from?: { first_name?: string; last_name?: string; username?: string } };
};

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
  try {
    if (/^\/start(\s|$)/.test(text)) {
      const code = text.split(/\s+/)[1];
      if (!code) {
        await sendTelegram(chatId, escapeHtml(HELP));
        return NextResponse.json({ ok: true });
      }
      const { data: link } = await db.from('telegram_link_codes')
        .select('person_id, expires_at, person:persons(full_name_en, full_name_am)')
        .eq('code', code)
        .maybeSingle();
      const row = link as { person_id: string; expires_at: string; person: { full_name_en: string; full_name_am: string | null } | null } | null;
      if (!row || Date.parse(row.expires_at) < Date.now()) {
        await sendTelegram(
          chatId,
          escapeHtml('ይህ የማገናኛ መልእክት ጊዜው አልፏል። ከድረ-ገጹ እንደገና «ቴሌግራም አገናኝ» ይጫኑ።\nThis link has expired. Tap “Connect Telegram” on the website again.')
        );
        return NextResponse.json({ ok: true });
      }
      const from = message?.from;
      const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') + (from?.username ? ` (@${from.username})` : '');
      await db.from('telegram_links').upsert({ person_id: row.person_id, chat_id: chatId, telegram_name: telegramName || null }, { onConflict: 'person_id,chat_id' });
      await db.from('telegram_link_codes').delete().eq('code', code);
      const name = row.person?.full_name_am || row.person?.full_name_en || '';
      await sendTelegram(
        chatId,
        `✅ <b>${escapeHtml(name)}</b>\n` +
          escapeHtml('ተገናኝቷል። የትምህርት ቤቱ መልእክቶች እዚህ ይደርሱዎታል። ለማቆም /stop ይላኩ።\n') +
          escapeHtml('Connected. Messages from the school will come here. Send /stop to stop them.\n') +
          siteUrl()
      );
      return NextResponse.json({ ok: true });
    }

    if (/^\/stop(\s|$)/.test(text)) {
      await db.from('telegram_links').delete().eq('chat_id', chatId);
      await sendTelegram(chatId, escapeHtml('መልእክቶች ቆመዋል። እንደገና ለማገናኘት ከድረ-ገጹ «ቴሌግራም አገናኝ» ይጫኑ።\nMessages stopped. To connect again, tap “Connect Telegram” on the website.'));
      return NextResponse.json({ ok: true });
    }

    await sendTelegram(chatId, escapeHtml(HELP));
  } catch (e) {
    console.error('telegram webhook failed', e);
  }
  return NextResponse.json({ ok: true });
}
