'use client';

import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { TelegramConnect } from '@/components/telegram/TelegramConnect';
import { ATTENDANCE_STYLE, attendanceCounts, useAttendanceLabel } from '@/components/student/portal';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { loadMyFamily, type MyChild } from './actions';

/** A parent's view of their own children: results, attendance and exams. */
export default function FamilyPage() {
  const { t, locale } = useLang();
  const label = useAttendanceLabel();
  const [state, setState] = useState<{ mode: LoadMode; error: string; parent: string; children: MyChild[] }>({ mode: 'loading', error: '', parent: '', children: [] });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    loadMyFamily().then((res) =>
      setState(
        res.mode === 'live'
          ? { mode: 'live', error: '', parent: locale === 'am' ? res.data.parent_am : res.data.parent, children: res.data.children }
          : { mode: res.mode, error: res.mode === 'error' ? res.error : '', parent: '', children: [] }
      )
    );
  }, [locale]);

  if (state.mode !== 'live') {
    return state.mode === 'demo' ? (
      <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">{t('The parent pages need the database.', 'የወላጅ ገጾች ዳታቤዝ ያስፈልጋቸዋል።')}</p>
    ) : (
      <AdminModeNotice mode={state.mode} error={state.error} />
    );
  }

  const child = state.children[selected];
  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My children', 'ልጆቼ')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t(`Welcome, ${state.parent}`, `እንኳን ደህና መጡ፣ ${state.parent}`)}</p>
      </div>

      {state.children.length === 0 ? (
        <p className="card p-6 text-sm text-slate-500">{t('No children are linked to your account yet. Please ask the school office.', 'እስካሁን ከመለያዎ ጋር የተያያዘ ልጅ የለም። እባክዎ የትምህርት ቤቱን ጽ/ቤት ይጠይቁ።')}</p>
      ) : (
        <>
          {state.children.length > 1 && (
            <div className="no-print flex flex-wrap gap-2">
              {state.children.map((c, i) => (
                <button
                  key={c.student_id}
                  onClick={() => setSelected(i)}
                  className={`px-4 py-2 rounded-xl border text-sm font-semibold ${i === selected ? 'border-rose-800 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {locale === 'am' ? c.student.name_am : c.student.name_en}
                </button>
              ))}
            </div>
          )}
          {child && <ChildView child={child} label={label} />}
        </>
      )}

      <div className="no-print">
        <TelegramConnect what={t('Get a message on Telegram when your child is absent or gets a new result.', 'ልጅዎ ሲቀር ወይም አዲስ ውጤት ሲያገኝ በቴሌግራም መልእክት ያግኙ።')} />
      </div>
    </div>
  );
}

function ChildView({ child, label }: { child: MyChild; label: ReturnType<typeof useAttendanceLabel> }) {
  const { t, locale } = useLang();
  const s = child.student;
  const att = attendanceCounts(child.attendance);
  const passed = child.average !== null && child.average >= child.pass_mark;
  const open = child.exams.filter((e) => e.exam_status === 'OPEN' && !e.submitted);
  const finished = child.exams.filter((e) => e.submitted);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={t('Class', 'ክፍል')} value={(locale === 'am' ? s.class_name_am : s.class_name) || '—'} />
        <Tile label={t('Average', 'አማካይ')} value={child.average === null ? '—' : `${child.average}%`} tone={child.average === null ? undefined : passed ? 'good' : 'bad'} />
        <Tile label={t('Rank in class', 'በክፍል ደረጃ')} value={child.rank ? `${child.rank} / ${child.class_size}` : '—'} />
        <Tile label={t('Attendance', 'ተገኝነት')} value={att.rate === null ? '—' : `${att.rate}%`} />
      </div>

      <div className="print-sheet card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800 text-sm">
            {t('Results', 'ውጤቶች')} — {locale === 'am' ? s.name_am : s.name_en} · {s.reg_no}
          </h2>
          <button onClick={() => window.print()} className="no-print btn btn-secondary text-xs inline-flex items-center gap-1.5">
            <Printer size={14} /> {t('Print', 'አትም')}
          </button>
        </div>
        {child.grades.length === 0 ? (
          <p className="text-sm text-slate-400">{t('No approved results yet.', 'እስካሁን የጸደቀ ውጤት የለም።')}</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('Subject', 'ትምህርት')}</th>
                  <th>{t('Term', 'ሩብ')}</th>
                  <th className="text-right">{t('Total /100', 'ድምር /100')}</th>
                  <th className="text-right">{t('Grade', 'ደረጃ')}</th>
                </tr>
              </thead>
              <tbody>
                {child.grades.map((g) => (
                  <tr key={g.id}>
                    <td>{locale === 'am' ? g.subject_am : g.subject}</td>
                    <td className="text-xs">{g.term}</td>
                    <td className="text-right font-mono">{g.total}</td>
                    <td className="text-right font-bold">{g.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {child.pending > 0 && <p className="text-xs text-slate-500">{t(`${child.pending} more result(s) are waiting for approval.`, `${child.pending} ተጨማሪ ውጤት(ዎች) ማጽደቅ እየጠበቁ ነው።`)}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
        <div className="card p-5 space-y-2">
          <h2 className="font-bold text-slate-800 text-sm">{t('Attendance', 'ክትትል')}</h2>
          <p className="text-xs text-slate-500">
            {t(`Present ${att.present} · Late ${att.late} · Absent ${att.absent} · Excused ${att.excused}`, `ተገኝቷል ${att.present} · ዘግይቷል ${att.late} · ቀርቷል ${att.absent} · በፈቃድ ${att.excused}`)}
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {child.attendance.slice(0, 10).map((r) => (
              <li key={r.date} className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600">{formatEthiopianDate(r.date, locale, { weekday: true })}</span>
                <span className={ATTENDANCE_STYLE[r.status]}>{label(r.status)}</span>
              </li>
            ))}
            {child.attendance.length === 0 && <li className="py-2 text-sm text-slate-400">{t('No roll calls recorded yet.', 'እስካሁን የተመዘገበ ክትትል የለም።')}</li>}
          </ul>
        </div>

        <div className="card p-5 space-y-2">
          <h2 className="font-bold text-slate-800 text-sm">{t('Online exams', 'የኦንላይን ፈተናዎች')}</h2>
          {open.map((e) => (
            <p key={e.id} className="text-sm text-blue-700">
              {t(`Open now: ${e.title}`, `አሁን ክፍት፦ ${e.title}`)} ({locale === 'am' ? e.subject_am : e.subject})
            </p>
          ))}
          <ul className="divide-y divide-slate-100 text-sm">
            {finished.map((e) => (
              <li key={e.id} className="py-1.5 flex items-center justify-between gap-2">
                <span>
                  {e.title} <span className="text-xs text-slate-400">· {locale === 'am' ? e.subject_am : e.subject}</span>
                </span>
                <span className="text-xs font-mono">
                  {e.score !== null ? `${e.score} / ${e.total_marks}` : e.needs_marking ? t('being marked', 'እየታረመ') : t('handed in', 'ገብቷል')}
                </span>
              </li>
            ))}
            {open.length === 0 && finished.length === 0 && <li className="py-2 text-sm text-slate-400">{t('No online exams yet.', 'እስካሁን የኦንላይን ፈተና የለም።')}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className={`text-lg font-semibold ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
