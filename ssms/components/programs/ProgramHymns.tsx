'use client';

// In a program's details: the choir sessions planned for it (Sacred Arts →
// Rehearsals & Services, "Program") with the hymns to be sung, in order.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Music } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { HYMN_CATEGORIES, SESSION_KINDS } from '@/lib/choir/types';
import type { SessionHymns } from '@/lib/choir/session-hymns';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { loadProgramHymns } from '@/app/dashboard/programs/actions';

export function ProgramHymns({ programId }: { programId: string }) {
  const { t, locale } = useLang();
  const [sessions, setSessions] = useState<SessionHymns[] | null>(null);

  useEffect(() => {
    loadProgramHymns(programId).then((res) => setSessions(res.ok ? res.sessions : []));
  }, [programId]);

  if (sessions === null) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5"><Music size={14} className="text-violet-600" /> {t('Hymns to be sung', 'የሚዘመሩ መዝሙራት')}</h4>
        <Link href="/dashboard/sacred-arts/choir" className="text-[11px] font-semibold text-blue-600 hover:underline">{t('Plan in Sacred Arts', 'በቅዱስ ጥበብ ያዘጋጁ')}</Link>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-slate-500">
          {t('No choir session is linked to this program yet. In Sacred Arts → Rehearsals & Services, create one, choose this program and add the hymns.', 'እስካሁን ከዚህ ፕሮግራም ጋር የተያያዘ የመዘምራን መርሐ ግብር የለም። በቅዱስ ጥበብ → ልምምድና አገልግሎት ይፍጠሩ፣ ይህን ፕሮግራም ይምረጡና መዝሙራቱን ይጨምሩ።')}
        </p>
      ) : (
        sessions.map((s) => (
          <div key={s.session_id} className="space-y-1">
            <div className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{t(...(SESSION_KINDS[s.kind] ?? [s.kind, s.kind]))}</span>
              {s.title && ` · ${s.title}`} · {formatEthiopianDate(s.date, locale)}{s.time ? ` · ${s.time}` : ''}
            </div>
            {s.hymns.length === 0 ? (
              <p className="text-xs text-slate-400">{t('No hymns chosen yet.', 'መዝሙር ገና አልተመረጠም።')}</p>
            ) : (
              <ol className="space-y-0.5">
                {s.hymns.map((h, i) => (
                  <li key={h.id} className="text-xs text-slate-800 flex gap-2">
                    <span className="text-slate-400 w-4 text-right">{i + 1}.</span>
                    <span className="flex-1">
                      {h.title_am}
                      {h.title_en && h.title_en !== h.title_am && <span className="text-slate-400"> · {h.title_en}</span>}
                      <span className="text-slate-400"> · {t(...HYMN_CATEGORIES[h.category])}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))
      )}
    </div>
  );
}
