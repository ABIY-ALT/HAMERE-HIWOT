'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { MOCK_CLASSES } from '@/lib/mock/modules';
import { useStudents } from '@/lib/students/useStudents';
import {
  ATTENDANCE_STATUSES,
  attendanceRate,
  findSavedSession,
  saveSession,
  totalsOf,
  type AttendanceStatus,
} from '@/lib/attendance/store';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

const STATUS_STYLE: Record<AttendanceStatus, { on: string; label: [string, string] }> = {
  PRESENT: { on: 'bg-emerald-600 text-white border-emerald-600', label: ['Present', 'የተገኘ'] },
  ABSENT: { on: 'bg-red-600 text-white border-red-600', label: ['Absent', 'የቀረ'] },
  LATE: { on: 'bg-amber-500 text-white border-amber-500', label: ['Late', 'የዘገየ'] },
  EXCUSED: { on: 'bg-blue-600 text-white border-blue-600', label: ['Excused', 'በፈቃድ'] },
};

const noopSubscribe = () => () => {};

export default function RollCallPage() {
  const { t } = useLang();
  // false while server-rendering / hydrating, true afterwards. The sheet reads
  // the clock and localStorage, which must not run during hydration.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/education/attendance"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mb-2"
        >
          <ArrowLeft size={14} />
          {t('Back to attendance', 'ወደ ክትትል ተመለስ')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Roll Call', 'የተማሪዎች ስም ጥሪ')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Mark each student present, absent, late or excused for one class session.',
            'ለአንድ የክፍል ክፍለ-ጊዜ እያንዳንዱን ተማሪ የተገኘ፣ የቀረ፣ የዘገየ ወይም በፈቃድ ብለው ይመዝግቡ።'
          )}
        </p>
      </div>
      {mounted ? <RollCallSheet /> : <div className="card p-8 text-sm text-slate-400">…</div>}
    </div>
  );
}

function RollCallSheet() {
  const { t, locale } = useLang();
  const allStudents = useStudents();

  const [classId, setClassId] = useState(MOCK_CLASSES[0].id);
  const [date, setDate] = useState(todayIso());
  const [saved, setSaved] = useState(() => findSavedSession(MOCK_CLASSES[0].id, todayIso()));
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>(saved?.records ?? {});
  const [topicEn, setTopicEn] = useState(saved?.topic ?? '');
  const [topicAm, setTopicAm] = useState(saved?.topic_am ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const cls = MOCK_CLASSES.find((c) => c.id === classId) ?? MOCK_CLASSES[0];
  const students = allStudents
    .filter((s) => s.class_id === classId && s.status === 'ACTIVE')
    .sort((a, b) => a.name_en.localeCompare(b.name_en));

  // Switching class or date loads whatever was already saved for that session,
  // so the teacher edits the existing roll instead of starting a duplicate.
  const switchSession = (nextClassId: string, nextDate: string) => {
    const existing = findSavedSession(nextClassId, nextDate);
    setClassId(nextClassId);
    setDate(nextDate);
    setSaved(existing);
    setRecords(existing?.records ?? {});
    setTopicEn(existing?.topic ?? '');
    setTopicAm(existing?.topic_am ?? '');
    setMessage(null);
  };

  const mark = (studentId: string, status: AttendanceStatus) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
    setMessage(null);
  };

  const markAll = (status: AttendanceStatus) => {
    setRecords(Object.fromEntries(students.map((s) => [s.id, status])));
    setMessage(null);
  };

  const marked = students.filter((s) => records[s.id]).length;
  const unmarked = students.length - marked;
  const totals = totalsOf({ records: Object.fromEntries(students.filter((s) => records[s.id]).map((s) => [s.id, records[s.id]])) });
  const canSave = students.length > 0 && unmarked === 0;

  const handleSave = () => {
    if (!canSave) return;
    // Keep only students currently on this class roll
    const clean = Object.fromEntries(students.map((s) => [s.id, records[s.id]]));
    const ok = saveSession({
      id: saved?.id ?? `att-${Date.now()}`,
      class_id: cls.id,
      class: cls.name_en,
      date,
      topic: topicEn.trim(),
      topic_am: topicAm.trim() || topicEn.trim(),
      teacher: cls.teacher,
      records: clean,
    });
    if (ok) {
      setSaved(findSavedSession(cls.id, date));
      setMessage({ kind: 'ok', text: t('Attendance saved.', 'ክትትሉ ተቀምጧል።') });
    } else {
      setMessage({
        kind: 'error',
        text: t(
          'Could not save. Browser storage is unavailable or full.',
          'ማስቀመጥ አልተቻለም። የአሳሽ ማከማቻ አይሰራም ወይም ሞልቷል።'
        ),
      });
    }
  };

  return (
    <>
      {/* Session picker */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="rc-class">
            {t('Class', 'ክፍል')}
          </label>
          <select
            id="rc-class"
            value={classId}
            onChange={(e) => switchSession(e.target.value, date)}
            className="form-input text-sm"
          >
            {MOCK_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'am' ? c.name_am : c.name_en}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            {t('Teacher', 'አስተማሪ')}: {cls.teacher}
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            {t('Date (Ethiopian calendar)', 'ቀን (በኢትዮጵያ ዘመን አቆጣጠር)')}
          </label>
          <EthiopianDateInput value={date} onChange={(d) => switchSession(classId, d)} hintIfNotSunday />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="rc-topic-en">
            {t('Lesson topic (English)', 'የትምህርት ርዕስ (እንግሊዝኛ)')}
          </label>
          <input
            id="rc-topic-en"
            type="text"
            value={topicEn}
            onChange={(e) => setTopicEn(e.target.value)}
            className="form-input text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="rc-topic-am">
            {t('Lesson topic (Amharic)', 'የትምህርት ርዕስ (አማርኛ)')}
          </label>
          <input
            id="rc-topic-am"
            type="text"
            value={topicAm}
            onChange={(e) => setTopicAm(e.target.value)}
            className="form-input text-sm"
          />
        </div>
        {saved && (
          <p className="md:col-span-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            {t(
              'Attendance was already saved for this class and date. Saving again will replace it.',
              'ለዚህ ክፍል እና ቀን ክትትል አስቀድሞ ተቀምጧል። እንደገና ማስቀመጥ ይተካዋል።'
            )}
          </p>
        )}
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Counter label={t('Present', 'የተገኙ')} value={totals.present} color="text-emerald-600" />
        <Counter label={t('Absent', 'የቀሩ')} value={totals.absent} color="text-red-600" />
        <Counter label={t('Late', 'የዘገዩ')} value={totals.late} color="text-amber-600" />
        <Counter label={t('Excused', 'በፈቃድ')} value={totals.excused} color="text-blue-600" />
        <Counter
          label={t('Rate', 'ምጣኔ')}
          value={marked === 0 ? '—' : `${attendanceRate(totals)}%`}
          color="text-slate-800"
        />
      </div>

      {/* Roll */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-600">
            {marked} / {students.length} {t('marked', 'ተመዝግበዋል')}
          </span>
          <button
            type="button"
            onClick={() => markAll('PRESENT')}
            disabled={students.length === 0}
            className="btn btn-secondary text-xs py-1.5"
          >
            {t('Mark everyone present', 'ሁሉንም የተገኘ አድርግ')}
          </button>
        </div>

        {students.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center">
            {t('No active students in this class.', 'በዚህ ክፍል ውስጥ ንቁ ተማሪ የለም።')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s, i) => {
              const current = records[s.id];
              return (
                <li key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">
                      <span className="text-slate-400 font-normal mr-2">{i + 1}.</span>
                      {locale === 'am' ? s.name_am : s.name_en}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono ml-6">{s.reg_no}</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap" role="group" aria-label={s.name_en}>
                    {ATTENDANCE_STATUSES.map((status) => {
                      const active = current === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          aria-pressed={active}
                          onClick={() => mark(s.id, status)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                            active
                              ? STATUS_STYLE[status].on
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {t(...STATUS_STYLE[status].label)}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs" aria-live="polite">
            {message?.kind === 'ok' && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 size={14} /> {message.text}{' '}
                <Link href="/dashboard/education/attendance" className="underline">
                  {t('View sessions', 'ክፍለ-ጊዜዎችን ተመልከት')}
                </Link>
              </span>
            )}
            {message?.kind === 'error' && <span className="text-red-600 font-medium">{message.text}</span>}
            {!message && unmarked > 0 && students.length > 0 && (
              <span className="text-slate-500">
                {unmarked} {t('students still need a mark before you can save.', 'ተማሪዎች ከማስቀመጥ በፊት ምልክት ያስፈልጋቸዋል።')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {t('Save attendance', 'ክትትል አስቀምጥ')}
          </button>
        </div>
      </div>
    </>
  );
}

function Counter({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
