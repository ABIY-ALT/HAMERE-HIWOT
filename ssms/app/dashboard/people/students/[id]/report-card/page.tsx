'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useEducation } from '@/lib/education/client';
import { useStudents } from '@/lib/students/useStudents';
import { attendanceRate } from '@/lib/attendance/store';
import { useSavedSessions } from '@/lib/attendance/useSavedSessions';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { useToday } from '@/lib/utils/useToday';
import { boldCell, cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';

const noopSubscribe = () => () => {};

export default function ReportCardPage() {
  const { t, locale } = useLang();
  const params = useParams<{ id: string }>();
  const students = useStudents();
  const savedSessions = useSavedSessions();
  const { grades: allGrades, years, activeYearId, mode } = useEducation();
  const today = useToday();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const student = students.find((s) => s.id === params.id);
  const backHref = `/dashboard/people/students/${params.id}`;

  if (!student) {
    return hydrated && mode !== 'loading' ? (
      <div className="space-y-4">
        <Link href="/dashboard/people/students" className="text-xs text-slate-500 hover:text-slate-800">
          ← {t('Back to students', 'ወደ ተማሪዎች ተመለስ')}
        </Link>
        <div className="card p-8 text-center text-sm text-slate-600">{t('Student not found', 'ተማሪው አልተገኘም')}</div>
      </div>
    ) : (
      <div className="card p-8 text-sm text-slate-400">…</div>
    );
  }

  const year = years.find((y) => y.id === activeYearId);
  const schoolName = t(
    'Sallo Debre Tsehay St. George Church · Hamere Hiwot Sabbath School',
    'ሳሎ ደ/ፀ/ቅ/ጊዮርጊስ · ሐመረ ሕይወት ሰ/ት/ቤት'
  );

  const grades = allGrades.filter((g) => g.student_id === student.id);
  const approved = grades.filter((g) => g.status === 'APPROVED');
  const average = approved.length
    ? Math.round((approved.reduce((sum, g) => sum + g.total, 0) / approved.length) * 10) / 10
    : null;

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  let sessionCount = 0;
  for (const s of savedSessions) {
    const status = s.records[student.id];
    if (!status) continue;
    counts[status.toLowerCase() as keyof typeof counts] += 1;
    sessionCount += 1;
  }

  const name = locale === 'am' ? student.name_am : student.name_en;

  const exportExcel = async () => {
    const rows = [
      [boldCell(`${schoolName} — ${t('Report Card', 'የውጤት ካርድ')}`)],
      [],
      [t('Student', 'ተማሪ'), student.name_en],
      [t('Name (Amharic)', 'ስም (አማርኛ)'), cell(student.name_am)],
      [t('Reg. No', 'የምዝገባ ቁጥር'), student.reg_no],
      [t('Class', 'ክፍል'), student.class],
      [t('Academic year', 'የትምህርት ዘመን'), year?.name ?? ''],
      [t('Printed', 'የታተመበት'), `${formatEthiopianDate(today, 'en')} (${today})`],
      [],
      [t('Subject', 'ትምህርት'), t('Continuous (30)', 'ቀጣይ (30)'), t('Final (70)', 'የመጨረሻ (70)'), t('Total (100)', 'ድምር (100)'), t('Grade', 'ደረጃ'), t('Status', 'ሁኔታ')].map(headerCell),
      ...grades.map((g) => [
        g.subject, g.continuous, g.final, g.total, g.grade,
        g.status === 'APPROVED' ? t('Approved', 'ጸድቋል') : t('Pending approval', 'ማጽደቅ በመጠባበቅ ላይ'),
      ]),
      [],
      [boldCell(t('Average (approved grades)', 'አማካይ (የጸደቁ)')), average ?? ''],
      [],
      [boldCell(t('Attendance', 'ተገኝነት'))],
      [t('Sessions recorded', 'የተመዘገቡ ክፍለ-ጊዜዎች'), sessionCount],
      [t('Present', 'የተገኘ'), counts.present],
      [t('Absent', 'የቀረ'), counts.absent],
      [t('Late', 'የዘገየ'), counts.late],
      [t('Excused', 'በፈቃድ'), counts.excused],
      [t('Attendance rate', 'የተገኝነት ምጣኔ'), sessionCount ? `${attendanceRate(counts)}%` : ''],
    ];
    await downloadXlsx(`report_card_${student.reg_no}`, rows as never, {
      sheet: 'Report Card',
      widths: [30, 18, 16, 14, 10, 22],
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar — not printed */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={14} />
          {t('Back to profile', 'ወደ መገለጫ ተመለስ')}
        </Link>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="btn btn-secondary text-xs inline-flex items-center gap-2">
            <Download size={14} />
            {t('Export Excel', 'ወደ ኤክሴል ላክ')}
          </button>
          <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-2">
            <Printer size={14} />
            {t('Print / Save as PDF', 'አትም / እንደ PDF አስቀምጥ')}
          </button>
        </div>
      </div>

      {/* The sheet that gets printed */}
      <div className="print-sheet card p-8 max-w-3xl mx-auto bg-white">
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{t('Student Report Card', 'የተማሪ የውጤት ካርድ')}</h1>
          <div className="text-sm text-slate-600 mt-0.5">
            {year ? `${t('Academic year', 'የትምህርት ዘመን')} ${year.name}` : ''}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
          <Field label={t('Student', 'ተማሪ')} value={name} bold />
          <Field label={t('Registration No.', 'የምዝገባ ቁጥር')} value={student.reg_no} mono />
          <Field label={t('Class', 'ክፍል')} value={student.class} />
          <Field label={t('Baptismal name', 'የክርስትና ስም')} value={student.baptismal || '—'} />
          <Field label={t('Parent / Guardian', 'ወላጅ / አሳዳጊ')} value={student.parent || '—'} />
          <Field label={t('Printed on', 'የታተመበት ቀን')} value={today ? `${formatEthiopianDate(today, locale)} (${today})` : '—'} />
        </dl>

        <h2 className="font-bold text-slate-800 text-sm mb-2">{t('Academic results', 'የትምህርት ውጤት')}</h2>
        {grades.length === 0 ? (
          <p className="text-sm text-slate-500 border border-slate-200 rounded-lg p-4 mb-6">
            {t('No grades have been recorded for this student.', 'ለዚህ ተማሪ ምንም ውጤት አልተመዘገበም።')}
          </p>
        ) : (
          <table className="w-full text-sm border border-slate-300 mb-2">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="p-2 border border-slate-300">{t('Subject', 'ትምህርት')}</th>
                <th className="p-2 border border-slate-300 text-center">{t('Continuous /30', 'ቀጣይ /30')}</th>
                <th className="p-2 border border-slate-300 text-center">{t('Final /70', 'የመጨረሻ /70')}</th>
                <th className="p-2 border border-slate-300 text-center">{t('Total /100', 'ድምር /100')}</th>
                <th className="p-2 border border-slate-300 text-center">{t('Grade', 'ደረጃ')}</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id}>
                  <td className="p-2 border border-slate-300">
                    {g.subject}
                    {g.status !== 'APPROVED' && (
                      <span className="ml-2 text-[11px] text-amber-700">({t('pending approval', 'ማጽደቅ በመጠባበቅ ላይ')})</span>
                    )}
                  </td>
                  <td className="p-2 border border-slate-300 text-center">{g.continuous}</td>
                  <td className="p-2 border border-slate-300 text-center">{g.final}</td>
                  <td className="p-2 border border-slate-300 text-center font-semibold">{g.total}</td>
                  <td className="p-2 border border-slate-300 text-center font-bold">{g.grade}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="p-2 border border-slate-300" colSpan={3}>
                  {t('Average (approved grades only)', 'አማካይ (የጸደቁ ብቻ)')}
                </td>
                <td className="p-2 border border-slate-300 text-center" colSpan={2}>
                  {average ?? '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="font-bold text-slate-800 text-sm mt-6 mb-2">{t('Attendance', 'ተገኝነት')}</h2>
        {sessionCount === 0 ? (
          <p className="text-sm text-slate-500 border border-slate-200 rounded-lg p-4">
            {t('No per-student attendance has been recorded yet.', 'የእያንዳንዱ ተማሪ ክትትል እስካሁን አልተመዘገበም።')}
          </p>
        ) : (
          <table className="w-full text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-2 border border-slate-300">{t('Sessions', 'ክፍለ-ጊዜዎች')}</th>
                <th className="p-2 border border-slate-300">{t('Present', 'የተገኘ')}</th>
                <th className="p-2 border border-slate-300">{t('Absent', 'የቀረ')}</th>
                <th className="p-2 border border-slate-300">{t('Late', 'የዘገየ')}</th>
                <th className="p-2 border border-slate-300">{t('Excused', 'በፈቃድ')}</th>
                <th className="p-2 border border-slate-300">{t('Rate', 'ምጣኔ')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-center">
                <td className="p-2 border border-slate-300">{sessionCount}</td>
                <td className="p-2 border border-slate-300">{counts.present}</td>
                <td className="p-2 border border-slate-300">{counts.absent}</td>
                <td className="p-2 border border-slate-300">{counts.late}</td>
                <td className="p-2 border border-slate-300">{counts.excused}</td>
                <td className="p-2 border border-slate-300 font-bold">{attendanceRate(counts)}%</td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-3 gap-8 mt-14 text-center text-xs text-slate-600">
          {[t('Class teacher', 'የክፍል አስተማሪ'), t('Head of education', 'የትምህርት ክፍል ኃላፊ'), t('Parent / Guardian', 'ወላጅ / አሳዳጊ')].map((label) => (
            <div key={label}>
              <div className="border-t border-slate-500 pt-1.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className={`${bold ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono' : ''} text-slate-900`}>{value}</dd>
    </div>
  );
}
