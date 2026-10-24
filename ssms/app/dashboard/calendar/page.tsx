'use client';

// The Church's calendar: an Ethiopian month with its feasts, fasts and monthly
// commemorations, fasting days shaded, and the great feasts and fasts coming
// up. Computed in the browser (lib/calendar/orthodox) — nothing to load.

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { dayInfo, holyDays, upcoming } from '@/lib/calendar/orthodox';
import {
  daysInEthiopianMonth,
  ethiopianMonthName,
  ethiopianToIso,
  formatEthiopianDate,
  isoToEthiopian,
  todayIso,
  weekdayName,
} from '@/lib/utils/ethiopian-calendar';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const gShort = (iso: string) => `${MONTHS_EN[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export default function CalendarPage() {
  const { t, locale } = useLang();
  const today = todayIso();
  const now = isoToEthiopian(today)!;
  const [view, setView] = useState({ year: now.year, month: now.month });

  const days = useMemo(() => [...holyDays(view.year - 1), ...holyDays(view.year), ...holyDays(view.year + 1)], [view.year]);
  const count = daysInEthiopianMonth(view.year, view.month);
  const first = ethiopianToIso({ year: view.year, month: view.month, day: 1 })!;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay(); // Sunday first
  const cells = Array.from({ length: count }, (_, i) => {
    const date = ethiopianToIso({ year: view.year, month: view.month, day: i + 1 })!;
    return { day: i + 1, date, info: dayInfo(date, days) };
  });
  const coming = upcoming(today, 10);
  const todayInfo = dayInfo(today);

  const move = (step: number) =>
    setView((v) => {
      let month = v.month + step;
      let year = v.year;
      if (month < 1) {
        month = 13;
        year -= 1;
      } else if (month > 13) {
        month = 1;
        year += 1;
      }
      return { year, month };
    });

  const name = (n: [string, string]) => (locale === 'am' ? n[1] : n[0]);

  return (
    <div className="space-y-5 print-sheet">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Church calendar', 'የቤተ ክርስቲያን ቀን መቁጠሪያ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Feasts and fasts of the Ethiopian Orthodox Tewahedo Church, by Bahire Hasab', 'የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን በዓላትና አጽዋማት በባሕረ ሐሳብ')}
          </p>
        </div>
        <button onClick={() => window.print()} className="no-print btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start">
          <Printer size={14} /> {t('Print', 'አትም')}
        </button>
      </div>

      {/* Today */}
      <div className={`card p-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${todayInfo.fasting ? 'border-amber-200 bg-amber-50/50' : ''}`}>
        <div className="font-bold text-slate-900">{formatEthiopianDate(today, locale, { weekday: true })}</div>
        <div className="text-sm text-slate-600">
          {todayInfo.feasts.length > 0 && <span className="font-semibold text-rose-700">{todayInfo.feasts.map((f) => name(f.name)).join(' · ')} · </span>}
          {todayInfo.fasting
            ? todayInfo.fast
              ? `${t('Fasting day', 'የጾም ቀን')} — ${name(todayInfo.fast.name)}`
              : t('Fasting day (Wednesday / Friday)', 'የጾም ቀን (ረቡዕ / ዓርብ)')
            : t('Not a fasting day', 'የጾም ቀን አይደለም')}
          {todayInfo.monthly && <span className="text-slate-400"> · {name(todayInfo.monthly)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => move(-1)} className="no-print p-2 rounded-lg hover:bg-slate-100" aria-label={t('Previous month', 'ያለፈው ወር')}>
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{ethiopianMonthName(view.month, locale)} {view.year}</div>
              <div className="text-[11px] text-slate-500">{gShort(first)} – {gShort(cells[cells.length - 1].date)} {cells[cells.length - 1].date.slice(0, 4)}</div>
            </div>
            <button onClick={() => move(1)} className="no-print p-2 rounded-lg hover:bg-slate-100" aria-label={t('Next month', 'የሚቀጥለው ወር')}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 mb-1">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d}>{weekdayName(d, locale)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {cells.map((c) => {
              const major = c.info.feasts.some((f) => f.major);
              return (
                <div
                  key={c.day}
                  className={`min-h-[76px] rounded-lg border p-1.5 text-left ${c.date === today ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-100'} ${
                    c.info.fasting ? 'bg-amber-50' : 'bg-white'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-bold ${major ? 'text-rose-700' : 'text-slate-800'}`}>{c.day}</span>
                    <span className="text-[9px] text-slate-400">{gShort(c.date)}</span>
                  </div>
                  {c.info.feasts.map((f) => (
                    <div key={f.key} className={`text-[10px] leading-tight mt-0.5 ${f.major ? 'font-semibold text-rose-700' : 'text-rose-600'}`}>
                      {name(f.name)}
                    </div>
                  ))}
                  {c.info.fast && c.info.fast.date === c.date && (
                    <div className="text-[10px] leading-tight mt-0.5 font-semibold text-amber-800">▶ {name(c.info.fast.name)}</div>
                  )}
                  {!c.info.feasts.length && c.info.monthly && <div className="text-[9px] leading-tight mt-0.5 text-slate-400">{name(c.info.monthly)}</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> {t('Fasting day', 'የጾም ቀን')}</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-600" /> {t('Great feast', 'ዐቢይ በዓል')}</span>
          </div>
        </div>

        <aside className="card p-4 space-y-3 self-start">
          <div className="font-bold text-slate-900 text-sm">{t('Coming up', 'የሚመጡ')}</div>
          <ul className="space-y-2">
            {coming.map((d) => (
              <li key={`${d.key}-${d.date}`} className="text-sm">
                <div className={`font-semibold ${d.kind === 'FAST' ? 'text-amber-800' : 'text-rose-700'}`}>{name(d.name)}</div>
                <div className="text-[11px] text-slate-500">
                  {formatEthiopianDate(d.date, locale)}
                  {d.end && ` – ${formatEthiopianDate(d.end, locale)}`}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
