// ─────────────────────────────────────────────────────────────────────────────
// The public website's data is cached for a few minutes (lib/site/public-data).
// Saving something it shows (About topics, the parish profile, a program)
// calls refreshPublicSite(), so the change shows on the next visit.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidateTag } from 'next/cache';

export const SITE_TAG = 'public-site';

export function refreshPublicSite(): void {
  try {
    revalidateTag(SITE_TAG, 'max');
  } catch (e) {
    // Never fails a save: the cache runs out by itself within minutes
    console.error('public site refresh failed', e);
  }
}
