'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Phone, ClipboardCheck, Printer, Pencil } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EditStudentModal } from '@/components/education/EditStudentModal';
import { useEducation } from '@/lib/education/client';
import { useStudents } from '@/lib/students/useStudents';
import { attendanceRate, totalsOf, type AttendanceStatus } from '@/lib/attendance/store';
import { useSavedSessions } from '@/lib/attendance/useSavedSessions';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { genderLabel } from '@/lib/utils';

const STATUS_BADGE: Record<AttendanceStatus, { cls: string; label: [string, string] }> = {
  PRESENT: { cls: 'text-emerald-700 bg-emerald-50', label: ['Present', 'የተገኘ'] },
  ABSENT: { cls: 'text-red-700 bg-red-50', label: ['Absent', 'የቀረ'] },
  LATE: { cls: 'text-amber-700 bg-amber-50', label: ['Late', 'የዘገየ'] },
  EXCUSED: { cls: 'text-blue-700 bg-blue-50', label: ['Excused', 'በፈቃድ'] },
};

const noopSubscribe = () => () => {};

export default function StudentProfilePage() {
  const { t, locale } = useLang();
  const params = useParams<{ id: string }>();
  const savedSessions = useSavedSessions();
  const students = useStudents();
  const { grades: allGrades, mode } = useEducation();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Students added in this browser are only known after hydration; don't flash "not found" before that.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const student = students.find((s) => s.id === params.id);

  const backLink = (
    <Link
      href="/dashboard/people/students"
      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft size={14} />
      {t('Back to students', 'ወደ ተማሪዎች ተመለስ')}
    </Link>
  );

  if (!student && (!hydrated || mode === 'loading')) {
    return <div className="card p-8 text-sm text-slate-400">…</div>;
  }

  if (!student) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="card p-8 text-center">
          <h1 className="text-lg font-bold text-slate-900">{t('Student not found', 'ተማሪው አልተገኘም')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'No student with this ID was found.',
              'ይህ መለያ ያለው ተማሪ አልተገኘም።'
            )}
          </p>
        </div>
      </div>
    );
  }

  // Attendance history: only sessions that have a per-student mark for this student
  const history = savedSessions
    .filter((s) => s.records[student.id])
    .sort((a, b) => b.date.localeCompare(a.date));

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const s of history) counts[s.records[student.id].toLowerCase() as keyof typeof counts] += 1;
  const rate = attendanceRate(counts);

  const grades = allGrades.filter((g) => g.student_id === student.id);
  const approved = grades.filter((g) => g.status === 'APPROVED');
  const average = approved.length
    ? Math.round((approved.reduce((sum, g) => sum + g.total, 0) / approved.length) * 10) / 10
    : null;

  const displayName = locale === 'am' ? student.name_am : student.name_en;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>{backLink}</div>

      {/* Header */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{displayName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {locale === 'am' ? student.name_en : student.name_am}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-semibold text-blue-600">{student.reg_no}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-700">{student.class}</span>
            <span className={student.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-warning'}>
              {student.status === 'ACTIVE' ? t('Active', 'ንቁ') : t('Inactive', 'የቦዘነ')}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          {can('STUDENT_UPDATE') && (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-primary text-xs inline-flex items-center gap-2"
            >
              <Pencil size={14} />
              {t('Edit', 'አርትዕ')}
            </button>
          )}
          <Link
            href={`/dashboard/people/students/${student.id}/report-card`}
            className="btn btn-secondary text-xs inline-flex items-center gap-2"
          >
            <Printer size={14} />
            {t('Report card', 'የውጤት ካርድ')}
          </Link>
          <Link
            href="/dashboard/education/attendance/roll-call"
            className="btn btn-secondary text-xs inline-flex items-center gap-2"
          >
            <ClipboardCheck size={14} />
            {t('Take roll call', 'የስም ጥሪ')}
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{history.length ? `${rate}%` : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Attendance rate', 'የተገኝነት ምጣኔ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{history.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Sessions recorded', 'የተመዘገቡ ክፍለ-ጊዜዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{average !== null ? average : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">
            {t('Average score (approved grades)', 'አማካይ ውጤት (የጸደቁ)')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal & guardian */}
        <div className="card p-5 space-y-4 text-sm lg:col-span-1 self-start">
          <h2 className="font-bold text-slate-800 text-sm">{t('Details', 'ዝርዝር')}</h2>
          <dl className="divide-y divide-slate-100 text-xs">
            <Row label={t('Baptismal name', 'የክርስትና ስም')} value={student.baptismal} />
            <Row
              label={t('Gender', 'ፆታ')}
              value={genderLabel(student.gender as 'MALE' | 'FEMALE', locale)}
            />
            <Row
              label={t('Enrolled', 'የተመዘገበበት')}
              value={`${formatEthiopianDate(student.enrollment_date, locale)} (${student.enrollment_date})`}
            />
            <Row label={t('Parent / guardian', 'ወላጅ / አሳዳጊ')} value={student.parent} />
            <div className="py-2.5 flex justify-between gap-3">
              <dt className="text-slate-500">{t('Phone', 'ስልክ')}</dt>
              <dd className="font-mono text-slate-900">
                <a href={`tel:${student.phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  <Phone size={12} />
                  {student.phone}
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Attendance history */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-800 text-sm">{t('Attendance history', 'የተገኝነት ታሪክ')}</h2>
              {history.length > 0 && (
                <span className="text-[11px] text-slate-500">
                  {counts.present} {t('present', 'የተገኘ')} · {counts.absent} {t('absent', 'የቀረ')} ·{' '}
                  {counts.late} {t('late', 'የዘገየ')} · {counts.excused} {t('excused', 'በፈቃድ')}
                </span>
              )}
            </div>
            {history.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">
                {t(
                  'No per-student attendance has been recorded yet. Take a roll call for this class to start the history.',
                  'ለዚህ ተማሪ የተመዘገበ ክትትል የለም። ታሪኩን ለመጀመር ለክፍሉ የስም ጥሪ ያድርጉ።'
                )}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {history.map((s) => {
                  const status = s.records[student.id];
                  const tt = totalsOf(s);
                  return (
                    <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{formatEthiopianDate(s.date, locale)}</div>
                        <div className="text-slate-400 truncate">
                          {(locale === 'am' ? s.topic_am : s.topic) || s.class} · {tt.present + tt.late}/
                          {tt.present + tt.absent + tt.late + tt.excused} {t('in class', 'በክፍል')}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-semibold shrink-0 ${STATUS_BADGE[status].cls}`}>
                        {t(...STATUS_BADGE[status].label)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Grades */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-sm">{t('Grades', 'ውጤቶች')}</h2>
            </div>
            {grades.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">{t('No grades recorded.', 'ምንም ውጤት አልተመዘገበም።')}</p>
            ) : (
              <div className="table-container rounded-none border-0">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Subject', 'ትምህርት')}</th>
                      <th>{t('Continuous', 'ቀጣይ')}</th>
                      <th>{t('Final', 'የመጨረሻ')}</th>
                      <th>{t('Total', 'ድምር')}</th>
                      <th>{t('Grade', 'ደረጃ')}</th>
                      <th>{t('Status', 'ሁኔታ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.map((g) => (
                      <tr key={g.id}>
                        <td className="font-medium text-slate-900">{g.subject}</td>
                        <td>{g.continuous}</td>
                        <td>{g.final}</td>
                        <td className="font-semibold">{g.total}</td>
                        <td className="font-bold text-blue-600">{g.grade}</td>
                        <td>
                          <span
                            className={
                              g.status === 'APPROVED' ? 'badge badge-success' : 'badge badge-warning'
                            }
                          >
                            {g.status === 'APPROVED' ? t('Approved', 'ጸድቋል') : t('Pending', 'በመጠባበቅ ላይ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <EditStudentModal
          student={student}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setToast({ kind: 'success', text: t('Student updated', 'የተማሪው መረጃ ተቀይሯል') });
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900 text-right">{value}</dd>
    </div>
  );
}
