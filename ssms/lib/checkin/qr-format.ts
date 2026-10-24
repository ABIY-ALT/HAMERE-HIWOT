// ─────────────────────────────────────────────────────────────────────────────
// What a person's QR holds — no server code, so pages can read it too.
//   Printed card (and typed):  the member code, e.g. MBR-2026-0042
//   Live QR (bot, website):    L1.<member code>.<expiry>.<signature>
// The live QR is signed by the server and expires within minutes, so a
// screenshot or a forwarded picture stops working (lib/checkin/live-qr).
// ─────────────────────────────────────────────────────────────────────────────

export const LIVE_PREFIX = 'L1.';

export const isLiveQr = (value: string) => value.startsWith(LIVE_PREFIX);

/**
 * The member code inside a scanned value (for finding the person, e.g. in a
 * search box). It does not check that a live QR is genuine or still valid —
 * the server does that where it counts (attendance).
 */
export function codeFromScan(value: string): string {
  const v = value.trim();
  if (!isLiveQr(v)) return v;
  const parts = v.slice(LIVE_PREFIX.length).split('.');
  return parts.length >= 3 ? parts.slice(0, -2).join('.') : v;
}
