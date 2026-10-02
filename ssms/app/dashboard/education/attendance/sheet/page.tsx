'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useEducation } from '@/lib/education/client';
import { EducationNotice } from '@/components/education/EducationNotice';
import { useStudents } from '@/lib/students/useStudents';
import { useSavedSessions } from '@/lib/attendance/useSavedSessions';
import { buildAttendanceSheet, STATUS_LETTER } from '@/lib/attendance/sheet';
import { attendanceRate, type AttendanceStatus } from '@/lib/attendance/store';
import { ethiopianMonthName, formatEthiopianDate, isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';
import { boldCell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { useToday } from '@/lib/utils/useToday';

const CELL_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'text-emerald-700 bg-emerald-50',
  ABSENT: 'text-red-700 bg-red-50',
  LATE: 'text-amber-700 bg-amber-50',
  EXCUSED: 'text-blue-700 bg-blue-50',
};

export default function AttendanceSheetPage() {
  const { t, locale } = useLang();
  const students = useStudents();
  const savedSessions = useSavedSessions();
  const today = useToday();

  const { classes } = useEducation();
  const [chosenClassId, setClassId] = useState('');
  const classId = chosenClassId || classes[0]?.id || '';
  const [limit, setLimit] = useState(12);

  const cls = classes.find((c) => c.id === classId) ?? { id: '', name_en: '—', name_am: '—', teacher: '—' };

  const sheet = useMemo(() => {
    const roll = students.filter((s) => s.class_id === classId && s.status === 'ACTIVE');
    const sessions = savedSessions.filter((s) => s.class_id === classId);
    return buildAttendanceSheet(roll, sessions, limit);
  }, [students, savedSessions, classId, limit]);

  const exportExcel = async () => {
    const title = `${cls.name_en} — ${t('Attendance sheet', 'የተገኝነት ሉህ')}`;
    const dateHeaders = sheet.columns.map((c) => headerCell(formatEthiopianDate(c.date, 'en')));
    const gregHeaders = sheet.columns.map((c) => ({ value: c.date, fontWeight: 'bold' as const, textColor: '#64748b' }));
    const fixed = ['#', t('Reg. No', 'የምዝገባ ቁጥር'), t('Name', 'ስም')];
    const tail = [t('Present', 'የተገኘ'), t('Absent', 'የቀረ'), t('Late', 'የዘገየ'), t('Excused', 'በፈቃድ'), t('Rate', 'ምጣኔ')];

    const rows = [
      [boldCell(title)],
      [`${t('Printed', 'የታተመበት')}: ${formatEthiopianDate(todayIso(), 'en')} (${todayIso()})`],
      [],
      [...fixed.map(headerCell), ...dateHeaders, ...tail.map(headerCell)],
      [null, null, null, ...gregHeaders],
      ...sheet.rows.map((r, i) => [
        i + 1,
        r.student.reg_no,
        locale === 'am' ? r.student.name_am : r.student.name_en,
        ...r.cells.map((c) => (c ? STATUS_LETTER[c] : null)),
        r.totals.present, r.totals.absent, r.totals.late, r.totals.excused,
        r.rate === null ? null : `${r.rate}%`,
      ]),
      [
        null, null, boldCell(t('Present per session', 'በክፍለ-ጊዜ የተገኙ')),
        ...sheet.columnTotals.map((c) => c.present),
      ],
      [null, null, `${t('Legend', 'ማብራሪያ')}: P = ${t('Present', 'የተገኘ')}, A = ${t('Absent', 'የቀረ')}, L = ${t('Late', 'የዘገየ')}, E = ${t('Excused', 'በፈቃድ')}`],
    ];
    await downloadXlsx(`attendance_${cls.id}_${todayIso()}`, rows as never, {
      sheet: cls.name_en,
      widths: [5, 16, 26, ...sheet.columns.map(() => 11), 9, 9, 9, 9, 8],
    });
  };

  const totalPresentAll = sheet.columnTotals.reduce((sum, c) => sum + c.present, 0);
  const grand = sheet.columnTotals.reduce(
    (g, c) => ({ present: g.present + c.present, absent: g.absent + c.absent, late: g.late + c.late, excused: g.excused + c.excused }),
    { present: 0, absent: 0, late: 0, excused: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <Link
          href="/dashboard/education/attendance"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={14} />
          {t('Back to attendance', 'ወደ ክትትል ተመለስ')}
        </Link>
        <EducationNotice needs="classes" demoSavedInBrowser />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t('Attendance Sheet', 'የተገኝነት ሉህ')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {t(
                'Every student in a class across recent sessions. Print it or export it to Excel.',
                'በአንድ ክፍል ያሉ ተማሪዎች በቅርብ ክፍለ-ጊዜዎች። ያትሙት ወይም ወደ ኤክሴል ይላኩት።'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="sheet-class">
                {t('Class', 'ክፍል')}
              </label>
              <select id="sheet-class" value={classId} onChange={(e) => setClassId(e.target.value)} className="form-input text-sm">
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="sheet-limit">
                {t('Show', 'አሳይ')}
              </label>
              <select id="sheet-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="form-input text-sm">
                <option value={6}>{t('Last 6 sessions', 'ባለፉት 6 ክፍለ-ጊዜዎች')}</option>
                <option value={12}>{t('Last 12 sessions', 'ባለፉት 12 ክፍለ-ጊዜዎች')}</option>
                <option value={26}>{t('Last 26 sessions', 'ባለፉት 26 ክፍለ-ጊዜዎች')}</option>
                <option value={0}>{t('All sessions', 'ሁሉም ክፍለ-ጊዜዎች')}</option>
              </select>
            </div>
            <button
              onClick={exportExcel}
              disabled={sheet.rows.length === 0}
              className="btn btn-secondary text-xs inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={14} />
              {t('Export Excel', 'ወደ ኤክሴል ላክ')}
            </button>
            <button
              onClick={() => window.print()}
              disabled={sheet.rows.length === 0}
              className="btn btn-primary text-xs inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Printer size={14} />
              {t('Print / Save as PDF', 'አትም / እንደ PDF አስቀምጥ')}
            </button>
          </div>
        </div>
      </div>

      <div className="print-sheet print-landscape card overflow-hidden bg-white">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">
            {locale === 'am' ? cls.name_am : cls.name_en}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('Teacher', 'አስተማሪ')}: {cls.teacher} · {t('Printed', 'የታተመበት')}: {today ? formatEthiopianDate(today, locale) : ''}
          </p>
        </div>

        {sheet.rows.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center">
            {t('No active students in this class.', 'በዚህ ክፍል ውስጥ ንቁ ተማሪ የለም።')}
          </p>
        ) : sheet.columns.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center">
            {t(
              'No roll call has been saved for this class yet. Take a roll call and it will appear here.',
              'ለዚህ ክፍል የተቀመጠ የስም ጥሪ የለም። የስም ጥሪ ያድርጉ እና እዚህ ይታያል።'
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 text-left border-b border-slate-200 w-8">#</th>
                  <th className="p-2 text-left border-b border-slate-200 min-w-[10rem]">{t('Student', 'ተማሪ')}</th>
                  {sheet.columns.map((c) => {
                    const et = isoToEthiopian(c.date);
                    return (
                      <th key={c.sessionId} className="p-1.5 text-center border-b border-slate-200 font-semibold min-w-[3rem]">
                        <div className="text-sm text-slate-800">{et?.day}</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {et ? ethiopianMonthName(et.month, locale) : ''}
                        </div>
                      </th>
                    );
                  })}
                  <th className="p-2 text-center border-b border-slate-200 text-emerald-700">P</th>
                  <th className="p-2 text-center border-b border-slate-200 text-red-700">A</th>
                  <th className="p-2 text-center border-b border-slate-200 text-amber-700">L</th>
                  <th className="p-2 text-center border-b border-slate-200 text-blue-700">E</th>
                  <th className="p-2 text-center border-b border-slate-200">{t('Rate', 'ምጣኔ')}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r, i) => (
                  <tr key={r.student.id} className="border-b border-slate-100">
                    <td className="p-2 text-slate-400">{i + 1}</td>
                    <td className="p-2">
                      <div className="font-medium text-slate-900">
                        {locale === 'am' ? r.student.name_am : r.student.name_en}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.student.reg_no}</div>
                    </td>
                    {r.cells.map((status, idx) => (
                      <td key={sheet.columns[idx].sessionId} className="p-1 text-center">
                        {status ? (
                          <span
                            title={status}
                            className={`inline-block w-6 py-0.5 rounded font-bold ${CELL_STYLE[status]}`}
                          >
                            {STATUS_LETTER[status]}
                          </span>
                        ) : (
                          <span className="text-slate-300">–</span>
                        )}
                      </td>
                    ))}
                    <td className="p-2 text-center">{r.totals.present}</td>
                    <td className="p-2 text-center">{r.totals.absent}</td>
                    <td className="p-2 text-center">{r.totals.late}</td>
                    <td className="p-2 text-center">{r.totals.excused}</td>
                    <td className="p-2 text-center font-bold">{r.rate === null ? '—' : `${r.rate}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="p-2" colSpan={2}>{t('Present per session', 'በክፍለ-ጊዜ የተገኙ')}</td>
                  {sheet.columnTotals.map((c, idx) => (
                    <td key={sheet.columns[idx].sessionId} className="p-1.5 text-center">{c.present}</td>
                  ))}
                  <td className="p-2 text-center" colSpan={4}>{totalPresentAll}</td>
                  <td className="p-2 text-center">{attendanceRate(grand)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="p-3 text-[11px] text-slate-500 border-t border-slate-100">
          P = {t('Present', 'የተገኘ')} · A = {t('Absent', 'የቀረ')} · L = {t('Late', 'የዘገየ')} · E = {t('Excused', 'በፈቃድ')} · – = {t('not recorded', 'አልተመዘገበም')}
        </p>
      </div>
    </div>
  );
}
