'use client';

import React from 'react';
import { TenantLogo, useSchoolName } from '@/components/branding/TenantLogo';
import { Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { partScore } from '@/lib/education/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { useToday } from '@/lib/utils/useToday';
import { PortalNotice, attendanceCounts, useMyPortal } from '@/components/student/portal';

/** The student's own report card: approved grades, average, rank and attendance — printable. */
export default function MyResultsPage() {
  const { t, locale } = useLang();
  const school = useSchoolName('Sallo Debre Tsehay St. George Church · Hamere Hiwot Sabbath School', 'ሳሎ ደ/ፀ/ቅ/ጊዮርጊስ · ሐመረ ሕይወት ሰ/ት/ቤት');
  const today = useToday();
  const { mode, data, error } = useMyPortal();

  if (!data) return <PortalNotice mode={mode} error={error} />;
  const s = data.student;
  const att = attendanceCounts(data.attendance);
  const passed = data.average !== null && data.average >= data.pass_mark;
  const partLabel = (p: (typeof data.scheme)[number]) => `${locale === 'am' ? p.name_am : p.name_en} /${p.weight}`;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My results', 'የእኔ ውጤት')}</h1>
        <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-2">
          <Printer size={14} /> {t('Print / Save as PDF', 'አትም / እንደ PDF አስቀምጥ')}
        </button>
      </div>
      {data.pending > 0 && (
        <p className="no-print p-3 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">
          {t(
            `${data.pending} result(s) are still waiting for approval and will appear here once approved.`,
            `${data.pending} ውጤት(ዎች) ማጽደቅ እየጠበቁ ነው፤ ሲጸድቁ እዚህ ይታያሉ።`
          )}
        </p>
      )}

      <div className="print-sheet card p-6 sm:p-8 max-w-3xl mx-auto bg-white">
        <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-4 mb-5">
          <TenantLogo size={64} className="rounded-full shrink-0" />
          <div className="flex-1 text-center">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              {t(...school)}
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{t('Student Report Card', 'የተማሪ የውጤት ካርድ')}</h2>
            {s.year && <div className="text-sm text-slate-600">{t('Academic year', 'የትምህርት ዘመን')} {s.year}</div>}
          </div>
          <div className="w-[64px] shrink-0" aria-hidden />
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
          <Field label={t('Student', 'ተማሪ')} value={locale === 'am' ? s.name_am : s.name_en} />
          <Field label={t('Registration No.', 'የምዝገባ ቁጥር')} value={s.reg_no} />
          <Field label={t('Class', 'ክፍል')} value={(locale === 'am' ? s.class_name_am : s.class_name) || '—'} />
          <Field label={t('Printed on', 'የታተመበት ቀን')} value={today ? formatEthiopianDate(today, locale) : '—'} />
        </dl>

        {data.grades.length === 0 ? (
          <p className="text-sm text-slate-500 border border-slate-200 rounded-lg p-4 mb-6">{t('No approved results yet.', 'እስካሁን የጸደቀ ውጤት የለም።')}</p>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="p-2 border border-slate-300">{t('Subject', 'ትምህርት')}</th>
                  <th className="p-2 border border-slate-300 text-center">{t('Term', 'ሩብ')}</th>
                  {data.scheme.map((p) => (
                    <th key={p.key} className="p-2 border border-slate-300 text-center">{partLabel(p)}</th>
                  ))}
                  <th className="p-2 border border-slate-300 text-center">{t('Total /100', 'ድምር /100')}</th>
                  <th className="p-2 border border-slate-300 text-center">{t('Grade', 'ደረጃ')}</th>
                </tr>
              </thead>
              <tbody>
                {data.grades.map((g) => (
                  <tr key={g.id}>
                    <td className="p-2 border border-slate-300">{locale === 'am' ? g.subject_am : g.subject}</td>
                    <td className="p-2 border border-slate-300 text-center">{g.term}</td>
                    {data.scheme.map((p) => {
                      const sc = partScore(g, p);
                      return <td key={p.key} className="p-2 border border-slate-300 text-center">{sc ? sc.score : '—'}</td>;
                    })}
                    <td className="p-2 border border-slate-300 text-center font-semibold">{g.total}</td>
                    <td className="p-2 border border-slate-300 text-center font-bold">{g.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Box label={t('Average', 'አማካይ')} value={data.average === null ? '—' : `${data.average}%`} />
          <Box label={t('Rank in class', 'በክፍል ደረጃ')} value={data.rank ? `${data.rank} / ${data.class_size}` : '—'} />
          <Box
            label={t('Status', 'ሁኔታ')}
            value={data.average === null ? '—' : passed ? t('Promoted', 'አልፏል') : t('Below pass mark', 'ከማለፊያ በታች')}
            tone={data.average === null ? undefined : passed ? 'good' : 'bad'}
          />
          <Box label={t('Attendance', 'ተገኝነት')} value={att.rate === null ? '—' : `${att.rate}%`} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          {t(`Only approved results are shown. Pass mark ${data.pass_mark}%.`, `የጸደቁ ውጤቶች ብቻ ይታያሉ። ማለፊያ ${data.pass_mark}%።`)}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-center">
      <div className={`text-lg font-bold ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
