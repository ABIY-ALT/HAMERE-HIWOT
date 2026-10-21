// ─────────────────────────────────────────────────────────────────────────────
// The tenant code is running for, when there is no signed-in user to ask:
// the Telegram webhook, the daily job, the public website and work done
// after the response (telegramLater). Those wrap their work in
// runInTenant(id, …); otherwise the signed-in user's tenant is used.
// ─────────────────────────────────────────────────────────────────────────────

import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<{ tenantId: string }>();

export function runInTenant<T>(tenantId: string, work: () => T): T {
  return store.run({ tenantId }, work);
}

/** The tenant in scope, or the signed-in user's; null when neither. */
export async function currentTenantId(): Promise<string | null> {
  const scoped = store.getStore();
  if (scoped) return scoped.tenantId;
  try {
    const { getCurrentUser } = await import('@/lib/auth/session');
    return (await getCurrentUser())?.tenant.id ?? null;
  } catch {
    return null; // outside a request
  }
}
