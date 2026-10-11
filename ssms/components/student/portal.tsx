'use client';

// Shared pieces of the student portal (/dashboard/my).

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { EXAM_TICKET_KEY } from '@/lib/exams/types';
import { loadMyPortal, type MyAttendance, type MyExam, type MyPortal } from '@/app/dashboard/my/actions';

/** The signed-in student's own data, loaded once per page. */
export function useMyPortal(): { mode: LoadMode; data: MyPortal | null; error: string } {
  const [state, setState] = useState<{ mode: LoadMode; data: MyPortal | null; error: string }>({ mode: 'loading', data: null, error: '' });
  useEffect(() => {
    loadMyPortal().then((res) =>
      setState(
        res.mode === 'live'
          ? { mode: 'live', data: res.data, error: '' }
          : res.mode === 'error'
            ? { mode: 'error', data: null, error: res.error }
            : { mode: 'demo', data: null, error: '' }
      )
    );
  }, []);
  return state;
}

/** Loading / demo / error banner for portal pages. */
export function PortalNotice({ mode, error }: { mode: LoadMode; error: string }) {
  const { t } = useLang();
  if (mode === 'demo') {
    return (
      <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
        {t('The student pages need the database — they are not available in demo mode.', 'የተማሪ ገጾች ዳታቤዝ ያስፈልጋቸዋል — በሙከራ ሁኔታ አይሰሩም።')}
      </p>
    );
  }
  return <AdminModeNotice mode={mode} error={error} />;
}

/** Opens the exam on /exam with the student's own ticket — no slip needed (the room key still is). */
export function StartExamButton({ exam }: { exam: MyExam }) {
  const { t } = useLang();
  const router = useRouter();
  if (!exam.ticket) return null;
  return (
    <button
      onClick={() => {
        try {
          sessionStorage.setItem(EXAM_TICKET_KEY, exam.ticket!);
        } catch {
          // Storage blocked: the student can still type the code from their slip
        }
        router.push('/exam');
      }}
      className="btn btn-primary text-xs inline-flex items-center gap-1.5"
    >
      <Play size={14} /> {exam.started ? t('Continue', 'ቀጥል') : t('Start', 'ጀምር')}
    </button>
  );
}

export function attendanceCounts(records: MyAttendance[]) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) counts[r.status.toLowerCase() as keyof typeof counts] += 1;
  const considered = counts.present + counts.absent + counts.late;
  return { ...counts, rate: considered ? Math.round(((counts.present + counts.late) / considered) * 100) : null };
}

export const ATTENDANCE_STYLE: Record<MyAttendance['status'], string> = {
  PRESENT: 'badge badge-success',
  LATE: 'badge badge-warning',
  ABSENT: 'badge badge-danger',
  EXCUSED: 'badge badge-info',
};

export function useAttendanceLabel() {
  const { t } = useLang();
  return (s: MyAttendance['status']) =>
    s === 'PRESENT' ? t('Present', 'ተገኝቷል') : s === 'LATE' ? t('Late', 'ዘግይቷል') : s === 'ABSENT' ? t('Absent', 'ቀርቷል') : t('Excused', 'በፈቃድ');
}
