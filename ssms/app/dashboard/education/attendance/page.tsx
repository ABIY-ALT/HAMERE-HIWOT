'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ATTENDANCE_SESSIONS, MOCK_STUDENTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';
import { attendanceRate, totalsOf, type AttendanceSession, type AttendanceStatus } from '@/lib/attendance/store';
import { useSavedSessions } from '@/lib/attendance/useSavedSessions';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

// Sessions that ship with the demo data only kept totals, not per-student marks.
const DEMO_SESSIONS: AttendanceSession[] = MOCK_ATTENDANCE_SESSIONS.map((s) => ({
  id: s.id,
  class_id: s.class_id,
  class: s.class,
  date: s.date,
  topic: s.topic,
  topic_am: s.topic_am,
  teacher: s.teacher,
  records: {},
  totals: { present: s.present, absent: s.absent, late: s.late, excused: s.excused },
}));

const STATUS_BADGE: Record<AttendanceStatus, { cls: string; label: [string, string] }> = {
  PRESENT: { cls: 'text-emerald-700 bg-emerald-50', label: ['Present', 'የተገኘ'] },
  ABSENT: { cls: 'text-red-700 bg-red-50', label: ['Absent', 'የቀረ'] },
  LATE: { cls: 'text-amber-700 bg-amber-50', label: ['Late', 'የዘገየ'] },
  EXCUSED: { cls: 'text-blue-700 bg-blue-50', label: ['Excused', 'በፈቃድ'] },
};

export default function AttendancePage() {
  const { t, locale } = useLang();
  const savedSessions = useSavedSessions();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A roll call saved for the same class and date replaces the demo entry.
  const sessions = useMemo(() => {
    const savedKeys = new Set(savedSessions.map((s) => `${s.class_id}|${s.date}`));
    const demo = DEMO_SESSIONS.filter((s) => !savedKeys.has(`${s.class_id}|${s.date}`));
    return [...savedSessions, ...demo].sort((a, b) => b.date.localeCompare(a.date));
  }, [savedSessions]);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  const needle = search.toLowerCase();
  const filtered = sessions.filter(
    (att) =>
      att.class.toLowerCase().includes(needle) ||
      (locale === 'am' ? att.topic_am : att.topic).toLowerCase().includes(needle) ||
      att.teacher.toLowerCase().includes(needle)
  );

  const grand = sessions.reduce(
    (sum, s) => {
      const tt = totalsOf(s);
      return {
        present: sum.present + tt.present,
        absent: sum.absent + tt.absent,
        late: sum.late + tt.late,
        excused: sum.excused + tt.excused,
      };
    },
    { present: 0, absent: 0, late: 0, excused: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Class Attendance Tracking', 'የክፍል ተማሪዎች ክትትል')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Session-by-session student presence, absenteeism tracking, and lesson topics',
              'የተማሪዎች ክፍለ-ጊዜያዊ ተገኝነት፣ መቅረት እና የተማሩት ርዕስ'
            )}
          </p>
        </div>
        <Link
          href="/dashboard/education/attendance/roll-call"
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <ClipboardCheck size={16} />
          {t('Take Roll Call', 'የስም ጥሪ ይጀምሩ')}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{attendanceRate(grand)}%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Average Attendance', 'አማካይ ተገኝነት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{grand.present}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Present', 'የተገኙ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-red-500">{grand.absent}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Absent', 'የቀሩ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-500">{grand.late}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Late Arrivals', 'የዘገዩ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search sessions...', 'ክፍለ-ጊዜያትን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('sessions', 'ክፍለ-ጊዜያት')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Lesson Topic', 'የትምህርት ርዕስ')}</th>
                <th>{t('Teacher', 'አስተማሪ')}</th>
                <th>{t('Present', 'የተገኙ')}</th>
                <th>{t('Absent', 'የቀሩ')}</th>
                <th>{t('Late', 'የዘገዩ')}</th>
                <th>{t('Rate', 'ምጣኔ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((att) => {
                const tt = totalsOf(att);
                return (
                  <tr key={att.id}>
                    <td>
                      <div className="text-xs font-medium text-slate-800">
                        {formatEthiopianDate(att.date, locale)}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">{att.date}</div>
                    </td>
                    <td className="font-semibold text-slate-900">{att.class}</td>
                    <td className="text-slate-700">{(locale === 'am' ? att.topic_am : att.topic) || '—'}</td>
                    <td className="text-slate-600 text-xs">{att.teacher}</td>
                    <td>
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {tt.present}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                        {tt.absent}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        {tt.late}
                      </span>
                    </td>
                    <td>
                      <span className="font-bold text-xs text-slate-800">{attendanceRate(tt)}%</span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setSelectedId(att.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {t('Details', 'ዝርዝር')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session details */}
      {selectedSession && (
        <SessionDetails session={selectedSession} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SessionDetails({ session, onClose }: { session: AttendanceSession; onClose: () => void }) {
  const { t, locale } = useLang();
  const tt = totalsOf(session);
  const studentIds = Object.keys(session.records);

  const rows = studentIds
    .map((id) => {
      const stu = MOCK_STUDENTS.find((s) => s.id === id);
      return {
        id,
        name: stu ? (locale === 'am' ? stu.name_am : stu.name_en) : id,
        status: session.records[id],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${session.class} — ${formatEthiopianDate(session.date, locale)}`}
      subtitle={(locale === 'am' ? session.topic_am : session.topic) || undefined}
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat value={tt.present} label={t('Present', 'የተገኙ')} tone="emerald" />
          <Stat value={tt.absent} label={t('Absent', 'የቀሩ')} tone="red" />
          <Stat value={tt.late} label={t('Late', 'የዘገዩ')} tone="amber" />
          <Stat value={tt.excused} label={t('Excused', 'በፈቃድ')} tone="blue" />
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">{t('Lead Teacher', 'አስተማሪ')}:</span>
            <span className="font-semibold text-slate-900">{session.teacher}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">{t('Gregorian date', 'የግሪጎሪያን ቀን')}:</span>
            <span className="font-mono text-slate-900">{session.date}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">{t('Attendance Rate', 'የተገኝነት ምጣኔ')}:</span>
            <span className="font-bold text-blue-600 font-mono">{attendanceRate(tt)}%</span>
          </div>
        </div>

        {rows.length > 0 ? (
          <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {rows.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-800">{r.name}</span>
                <span className={`px-2 py-0.5 rounded font-semibold ${STATUS_BADGE[r.status].cls}`}>
                  {t(...STATUS_BADGE[r.status].label)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            {t(
              'This session only has totals. Per-student marks are recorded for roll calls taken from now on.',
              'ይህ ክፍለ-ጊዜ ድምር ብቻ አለው። የእያንዳንዱ ተማሪ ምልክት ከአሁን በኋላ በሚደረጉ የስም ጥሪዎች ይመዘገባል።'
            )}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn btn-secondary text-xs">
            {t('Close', 'ዝጋ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: 'emerald' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    red: 'bg-red-50 border-red-100 text-red-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
  };
  return (
    <div className={`p-3 border rounded-xl ${tones[tone]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] font-medium mt-0.5">{label}</div>
    </div>
  );
}
