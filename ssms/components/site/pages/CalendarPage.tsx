// The public Calendar page: an Ethiopian month of the Church's year — feasts,
// fasts (fasting days shaded) and monthly commemorations, computed by Bahire
// Hasab (lib/calendar/orthodox) — with the Sunday school's own public events
// on their days, and the great feasts and fasts coming up. The month is the
// page's ?y=<Ethiopian year>&m=<1–13>.

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { publicSite, type PublicEvent } from '@/lib/site/public-data';
import type { TenantInfo } from '@/lib/tenant/context';
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
import { PageTitle, SiteShell, hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const gShort = (iso: string) => `${MONTHS_EN[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** The month asked for, or this month */
function monthOf(y: string | undefined, m: string | undefined, now: { year: number; month: number }) {
  const year = Number(y);
  const month = Number(m);
  if (Number.isInteger(year) && year > 1900 && year < 2200 && Number.isInteger(month) && month >= 1 && month <= 13) return { year, month };
  return now;
}

const step = (v: { year: number; month: number }, by: number) => {
  let month = v.month + by;
  let year = v.year;
  if (month < 1) {
    month = 13;
    year -= 1;
  } else if (month > 13) {
    month = 1;
    year += 1;
  }
  return { year, month };
};

export async function CalendarPage({ tenant, lang, y, m }: { tenant: TenantInfo; lang: SiteLang; y?: string; m?: string }) {
  const site = await publicSite(tenant);
  const t = (am: string, en: string) => pick(lang, am, en);
  const name = (n: [string, string]) => (lang === 'am' ? n[1] : n[0]);
  const today = todayIso();
  const now = isoToEthiopian(today)!;
  const view = monthOf(y, m, now);

  const days = [...holyDays(view.year - 1), ...holyDays(view.year), ...holyDays(view.year + 1)];
  const count = daysInEthiopianMonth(view.year, view.month);
  const first = ethiopianToIso({ year: view.year, month: view.month, day: 1 })!;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay(); // Sunday first
  const cells = Array.from({ length: count }, (_, i) => {
    const date = ethiopianToIso({ year: view.year, month: view.month, day: i + 1 })!;
    return { day: i + 1, date, info: dayInfo(date, days) };
  });
  const eventsOn = (date: string): PublicEvent[] => site.events.filter((e) => e.start_date <= date && date <= (e.end_date ?? e.start_date));
  const coming = upcoming(today, 10);
  const todayInfo = dayInfo(today);

  const link = (v: { year: number; month: number }) => {
    const base = hrefFor('/calendar', lang, site.base);
    return `${base}${base.includes('?') ? '&' : '?'}y=${v.year}&m=${v.month}`;
  };
  const prev = step(view, -1);
  const next = step(view, 1);

  return (
    <SiteShell lang={lang} path="/calendar" site={site}>
      <PageTitle
        title={t('የቤተ ክርስቲያን ቀን መቁጠሪያ', 'Church calendar')}
        subtitle={t('የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን በዓላትና አጽዋማት (በባሕረ ሐሳብ)፣ ከመርሐ ግብሮቻችን ጋር።', 'Feasts and fasts of the Ethiopian Orthodox Tewahedo Church (by Bahire Hasab), with our programs.')}
      />
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        {/* Today */}
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${todayInfo.fasting ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="font-bold text-slate-900">{t('ዛሬ', 'Today')}: {formatEthiopianDate(today, lang, { weekday: true })}</div>
          <div className="text-sm text-slate-600">
            {todayInfo.feasts.length > 0 && <span className="font-semibold text-rose-700">{todayInfo.feasts.map((f) => name(f.name)).join(' · ')} · </span>}
            {todayInfo.fasting
              ? todayInfo.fast
                ? `${t('የጾም ቀን', 'Fasting day')} — ${name(todayInfo.fast.name)}`
                : t('የጾም ቀን (ረቡዕ / ዓርብ)', 'Fasting day (Wednesday / Friday)')
              : t('የጾም ቀን አይደለም', 'Not a fasting day')}
            {todayInfo.monthly && <span className="text-slate-400"> · {name(todayInfo.monthly)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <Link href={link(prev)} className="p-2 rounded-lg hover:bg-slate-100" aria-label={t('ያለፈው ወር', 'Previous month')} scroll={false}>
                <ChevronLeft size={18} />
              </Link>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">{ethiopianMonthName(view.month, lang)} {view.year}</div>
                <div className="text-[11px] text-slate-500">{gShort(first)} – {gShort(cells[cells.length - 1].date)} {cells[cells.length - 1].date.slice(0, 4)}</div>
              </div>
              <Link href={link(next)} className="p-2 rounded-lg hover:bg-slate-100" aria-label={t('የሚቀጥለው ወር', 'Next month')} scroll={false}>
                <ChevronRight size={18} />
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 mb-1">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div key={d}>{weekdayName(d, lang)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {cells.map((c) => {
                const major = c.info.feasts.some((f) => f.major);
                const ours = eventsOn(c.date);
                return (
                  <div
                    key={c.day}
                    className={`min-h-[64px] sm:min-h-[84px] rounded-lg border p-1 sm:p-1.5 text-left overflow-hidden ${c.date === today ? 'border-[var(--site-main)] ring-1 ring-[var(--site-main)]' : 'border-slate-100'} ${
                      c.info.fasting ? 'bg-amber-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={`text-sm font-bold ${major ? 'text-rose-700' : 'text-slate-800'}`}>{c.day}</span>
                      <span className="hidden sm:inline text-[9px] text-slate-400">{gShort(c.date)}</span>
                    </div>
                    {c.info.feasts.map((f) => (
                      <div key={f.key} className={`text-[9px] sm:text-[10px] leading-tight mt-0.5 ${f.major ? 'font-semibold text-rose-700' : 'text-rose-600'}`}>
                        {name(f.name)}
                      </div>
                    ))}
                    {c.info.fast && c.info.fast.date === c.date && (
                      <div className="text-[9px] sm:text-[10px] leading-tight mt-0.5 font-semibold text-amber-800">▶ {name(c.info.fast.name)}</div>
                    )}
                    {ours.map((e) => (
                      <Link
                        key={e.id}
                        href={`${hrefFor('/events', lang, site.base)}#event-${e.id}`}
                        className="block mt-0.5 rounded bg-[var(--site-main)] px-1 text-[9px] sm:text-[10px] leading-tight text-white truncate hover:opacity-90"
                      >
                        {lang === 'am' ? e.title_am : e.title_en}
                      </Link>
                    ))}
                    {!c.info.feasts.length && !ours.length && c.info.monthly && (
                      <div className="hidden sm:block text-[9px] leading-tight mt-0.5 text-slate-400">{name(c.info.monthly)}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> {t('የጾም ቀን', 'Fasting day')}</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-600" /> {t('ዐቢይ በዓል', 'Great feast')}</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[var(--site-main)]" /> {t('የእኛ መርሐ ግብር', 'Our program')}</span>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 self-start">
            <h2 className="font-bold text-slate-900">{t('የሚመጡ በዓላትና አጽዋማት', 'Coming feasts and fasts')}</h2>
            <ul className="space-y-2">
              {coming.map((d) => (
                <li key={`${d.key}-${d.date}`} className="text-sm">
                  <div className={`font-semibold ${d.kind === 'FAST' ? 'text-amber-800' : 'text-rose-700'}`}>{name(d.name)}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatEthiopianDate(d.date, lang)}
                    {d.end && ` – ${formatEthiopianDate(d.end, lang)}`}
                  </div>
                </li>
              ))}
            </ul>
            {site.bot && (
              <p className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                {t('ከበዓልና ከጾም አንድ ቀን በፊት ማስታወሻ በቴሌግራም ቦታችን ይደርሳል፦ ', 'Reminders the day before feasts and fasts come through our Telegram bot: ')}
                <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--site-main)] hover:underline">@{site.bot}</a>
              </p>
            )}
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}
