'use client';

import { useEducation } from '@/lib/education/client';
import type { AttendanceSession } from './store';

/**
 * Roll-call sessions with per-student marks — from the database, or the ones
 * saved in this browser in demo mode. Empty while loading.
 */
export function useSavedSessions(): AttendanceSession[] {
  return useEducation().sessions;
}
