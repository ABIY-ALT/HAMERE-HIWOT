// ─────────────────────────────────────────────────────────────────────────────
// Throttle for sign-in, sign-up and other actions worth guessing at (server
// only). Counts in the database (rate_limits, migration 041), so it holds
// across server instances and restarts. If the count cannot be made (e.g. a
// database hiccup) the action is allowed rather than locking everyone out.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { platformClient } from '@/lib/tenant/db';
import { clientIp } from '@/lib/audit/log';

/** true = allowed. One more hit on `key`; at most `max` per `windowSeconds`. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await platformClient().rpc('hit_rate_limit', {
      p_key: key.slice(0, 200),
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/** The caller's IP address (from the proxy headers), or 'unknown'. */
export async function requestIp(): Promise<string> {
  return clientIp(await headers()) ?? 'unknown';
}
