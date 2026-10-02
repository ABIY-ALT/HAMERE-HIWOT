'use client';

import { useSyncExternalStore } from 'react';
import { todayIso } from './ethiopian-calendar';

const noopSubscribe = () => () => {};
const serverSnapshot = () => '';

/**
 * Today's date (Gregorian ISO) from the viewer's device.
 * Returns '' while rendering on the server and during hydration, so pages that
 * are prerendered at build time never bake the build day into their HTML.
 */
export function useToday(): string {
  return useSyncExternalStore(noopSubscribe, todayIso, serverSnapshot);
}
