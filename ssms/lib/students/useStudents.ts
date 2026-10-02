'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  mergeStudents,
  parseStudents,
  readRawStudents,
  subscribeStudents,
  type Student,
} from './store';

const getServerSnapshot = () => '';

/** All students (demo + saved). Saved ones appear after hydration. */
export function useStudents(): Student[] {
  const raw = useSyncExternalStore(subscribeStudents, readRawStudents, getServerSnapshot);
  return useMemo(() => mergeStudents(parseStudents(raw)), [raw]);
}
