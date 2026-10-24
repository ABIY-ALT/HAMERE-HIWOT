'use client';

import React from 'react';
import Link from 'next/link';
import { Award, CalendarCheck, ClipboardList, ChevronRight } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { PortalNotice, StartExamButton, attendanceCounts, useMyPortal } from '@/components/student/portal';
import { MyLiveQr } from '@/components/checkin/MyLiveQr';

/** A student's home: open exams, results and attendance at a glance. */
export default function MyHomePage() {
  const { t, locale } = useLang();
  const { mode, data, error } = useMyPortal();

  if (!data) return <PortalNotice mode={mode} error={error} />;
  const s = data.student;
  const open = data.exams.filter((e) => e.ticket);
  const att = attendanceCounts(data.attendance);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Welcome', 'እንኳን ደህና መጡ')}, {locale === 'am' ? s.name_am : s.name_en}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {[locale === 'am' ? s.class_name_am : s.class_name, s.year, s.reg_no].filter(Boolean).join(' · ')}
        </p>
      </div>

      {s.reg_no && (
        <details className="card p-4 group">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 list-none flex items-center justify-between">
            {t('📲 My QR — show it to the teacher or leader', '📲 የእኔ QR — ለመምህሩ ወይም ለመሪው ያሳዩ')}
            <ChevronRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
          </summary>
          <div className="pt-4 text-center space-y-1">
            <MyLiveQr size={200} />
            <p className="text-xs text-slate-500">{t('At programs and choir rehearsals the leader scans it and you are counted.', 'በመርሐ ግብሮችና በመዝሙር ጥናት መሪው ሲቃኘው ይቆጠራሉ።')}</p>
          </div>
        </details>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile
          href="/dashboard/my/exams"
          icon={<ClipboardList size={18} className="text-rose-800" />}
          value={String(open.length)}
          label={t('Exams open now', 'አሁን ክፍት የሆኑ ፈተናዎች')}
        />
        <Tile
          href="/dashboard/my/results"
          icon={<Award size={18} className="text-amber-600" />}
          value={data.average === null ? '—' : `${data.average}%`}
          label={data.rank ? t(`Average · rank ${data.rank} of ${data.class_size}`, `አማካይ · ከ${data.class_size} ${data.rank}ኛ`) : t('Average', 'አማካይ')}
        />
        <Tile
          href="/dashboard/my/attendance"
          icon={<CalendarCheck size={18} className="text-emerald-600" />}
          value={att.rate === null ? '—' : `${att.rate}%`}
          label={t('Attendance', 'ተገኝነት')}
        />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-800 text-sm">{t('Exams open now', 'አሁን ክፍት የሆኑ ፈተናዎች')}</h2>
        {open.length === 0 ? (
          <p className="text-sm text-slate-400">{t('No exam is open for you right now.', 'አሁን ለእርስዎ ክፍት የሆነ ፈተና የለም።')}</p>
        ) : (
          open.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <div>
                <div className="font-semibold text-slate-900">{e.title}</div>
                <div className="text-xs text-slate-500">
                  {locale === 'am' ? e.subject_am : e.subject} · {t(`${e.duration_minutes} min`, `${e.duration_minutes} ደቂቃ`)} · {t(`${e.questions} questions`, `${e.questions} ጥያቄ`)}
                </div>
              </div>
              <StartExamButton exam={e} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Tile({ href, icon, value, label }: { href: string; icon: React.ReactNode; value: string; label: string }) {
  return (
    <Link href={href} className="card p-5 flex items-center gap-4 hover:border-slate-300 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-semibold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500 truncate">{label}</div>
      </div>
      <ChevronRight size={16} className="text-slate-300" />
    </Link>
  );
}
