// ─────────────────────────────────────────────────────────────────────────────
// "📲 My QR" in the Telegram bot — server only. Sends a QR picture for each
// person the chat is linked to as themselves (member, servant, student), and
// for a parent each of their children. It is a live QR (lib/checkin/live-qr):
// signed and good for BOT_QR_SECONDS, so it is asked for at the door — a
// screenshot sent to someone else, or yesterday's picture, is refused. At a
// program or choir rehearsal the leader scans it (Check-in → Scan attendance)
// and the person is counted at once.
// ─────────────────────────────────────────────────────────────────────────────

import QRCode from 'qrcode';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram, sendTelegramPhoto } from '@/lib/telegram/bot';
import type { ChatScope } from '@/lib/telegram/menu';
import { BOT_QR_SECONDS, liveQr } from '@/lib/checkin/live-qr';

const e = escapeHtml;
const MAX_CODES = 6;

type P = { id: string; full_name_en: string; full_name_am: string | null; membership_code: string; status: string };

export async function sendMyQr(db: SupabaseClient, tenantId: string, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  const { data: kids } = scope.childStudentIds.length
    ? await db.from('students').select('person_id').in('id', scope.childStudentIds).eq('status', 'ACTIVE')
    : { data: [] };
  const childIds = ((kids ?? []) as { person_id: string }[]).map((k) => k.person_id).filter((id) => !scope.ownPersonIds.includes(id));
  const ids = [...scope.ownPersonIds, ...childIds];
  if (ids.length === 0) return sendTelegram(chatId, e('ይህ ቻት ከማንም መዝገብ ጋር አልተገናኘም። · This chat is not linked to anyone’s record.'), menu);

  const { data } = await db.from('persons').select('id, full_name_en, full_name_am, membership_code, status').in('id', ids);
  const people = ((data ?? []) as P[])
    .filter((p) => p.status === 'ACTIVE' && p.membership_code)
    .sort((a, b) => Number(childIds.includes(a.id)) - Number(childIds.includes(b.id)))
    .slice(0, MAX_CODES);
  if (people.length === 0) return sendTelegram(chatId, e('ንቁ መዝገብ አልተገኘም። · No active record was found.'), menu);

  for (const p of people) {
    const qr = liveQr(tenantId, p.membership_code, BOT_QR_SECONDS);
    const png = await QRCode.toBuffer(qr.value, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
    const until = new Date(qr.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' });
    const child = childIds.includes(p.id);
    const caption = [
      `🪪 <b>${e(p.full_name_am || p.full_name_en)}</b>${child ? e(' (ልጅዎ · your child)') : ''}`,
      `<code>${e(p.membership_code)}</code>`,
      '',
      e('በመርሐ ግብርና በመዝሙር ጥናት ይህን ለመሪው ያሳዩ፤ ሲቃኘው ይቆጠራሉ።'),
      e('Show this to the leader at programs and choir rehearsals — they scan it and you are counted.'),
      '',
      e(`⏱ እስከ ${until} ብቻ ይሠራል — በመግቢያው ላይ «📲 የእኔ QR» እንደገና ይጫኑ። ለሌላ ሰው የተላከ ፎቶ አይሠራም።`),
      e(`⏱ Valid until ${until} only — tap “📲 My QR” again at the door. A copy sent to someone else will not work.`),
    ].join('\n');
    await sendTelegramPhoto(chatId, new Uint8Array(png), caption, people.indexOf(p) === people.length - 1 ? menu : {});
  }
}
