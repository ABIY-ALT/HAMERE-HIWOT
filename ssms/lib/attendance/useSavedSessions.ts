'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  parseSessions,
  readRawSessions,
  subscribeSessions,
  type AttendanceSession,
} from './store';

const getServerSnapshot = () => '';

/**
 * Sessions saved in this browser. Returns [] on the server and during
 * hydration, then the stored sessions, and updates when they change.
 */
export function useSavedSessions(): AttendanceSession[] {
  const raw = useSyncExternalStore(subscribeSessions, readRawSessions, getServerSnapshot);
  return useMemo(() => parseSessions(raw), [raw]);
}
