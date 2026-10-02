'use client';

import { useEducation } from '@/lib/education/client';
import type { Student } from './store';

/** All students — from the database, or demo + browser-saved ones in demo mode. */
export function useStudents(): Student[] {
  return useEducation().students;
}
