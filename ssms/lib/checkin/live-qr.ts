// ─────────────────────────────────────────────────────────────────────────────
// Live QR codes — server only. "📲 My QR" in the bot and "My QR" on the
// website show L1.<member code>.<expiry>.<signature> instead of the bare
// member code: signed with a key only the server has (made from the service
// key, different for each Sunday school), and good for a few minutes. A
// screenshot sent to a friend, or an old picture, is refused once it expires;
// a made-up one is refused at once.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { LIVE_PREFIX, isLiveQr } from './qr-format';

/** The website's QR is asked again well before this (it refreshes itself) */
export const WEB_QR_SECONDS = 60;
/** The bot's QR is a picture: it has to last while the person walks to the door */
export const BOT_QR_SECONDS = 5 * 60;

function key(tenantId: string): Buffer {
  const base = env.supabaseServiceKey();
  if (!base) throw new Error('The server is not set up for live QR codes');
  return createHmac('sha256', base).update(`live-qr:${tenantId}`).digest();
}

const sign = (tenantId: string, code: string, exp: string) =>
  createHmac('sha256', key(tenantId)).update(`${code}.${exp}`).digest('base64url').slice(0, 16);

/** A live QR for this member code, good for `seconds`. */
export function liveQr(tenantId: string, code: string, seconds: number): { value: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + seconds;
  const exp = expiresAt.toString(36);
  return { value: `${LIVE_PREFIX}${code}.${exp}.${sign(tenantId, code, exp)}`, expiresAt: expiresAt * 1000 };
}

export type ScannedQr =
  | { kind: 'LIVE'; code: string }
  /** A printed card, or a code typed in */
  | { kind: 'PLAIN'; code: string }
  | { kind: 'EXPIRED'; code: string }
  | { kind: 'FORGED' };

/** What a scanned value is, and whether a live QR is genuine and still valid. */
export function readScanned(tenantId: string, raw: string): ScannedQr {
  const value = raw.trim();
  if (!isLiveQr(value)) return { kind: 'PLAIN', code: value };
  const parts = value.slice(LIVE_PREFIX.length).split('.');
  if (parts.length < 3) return { kind: 'FORGED' };
  const sig = parts.pop()!;
  const exp = parts.pop()!;
  const code = parts.join('.');
  const expected = Buffer.from(sign(tenantId, code, exp));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { kind: 'FORGED' };
  const expiresAt = parseInt(exp, 36) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { kind: 'EXPIRED', code };
  return { kind: 'LIVE', code };
}
