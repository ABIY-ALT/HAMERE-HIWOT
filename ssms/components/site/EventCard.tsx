// One public program: an Ethiopian-date block, title, time, place (server component).

import { Clock, MapPin } from 'lucide-react';
import { PROGRAM_TYPES } from '@/lib/programs/types';
import type { PublicEvent } from '@/lib/site/public-data';
import { ethiopianMonthName, formatEthiopianDate, isoToEthiopian } from '@/lib/utils/ethiopian-calendar';
import type { SiteLang } from './SiteShell';
import { EventSignup } from './EventSignup';

export function EventCard({ event, lang, full = false, signup }: { event: PublicEvent; lang: SiteLang; full?: boolean; /** Open for sign-up (Events page only): places left, and the Sunday school slug */ signup?: { left: number | null; site: string } }) {
  const d = isoToEthiopian(event.start_date);
  const title = lang === 'am' ? event.title_am : event.title_en;
  const [typeEn, typeAm] = PROGRAM_TYPES[event.type] ?? ['', ''];
  const until = event.end_date && event.end_date !== event.start_date ? ` → ${formatEthiopianDate(event.end_date, lang)}` : '';
  return (
    <article id={`event-${event.id}`} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm scroll-mt-28">
      <div className="w-16 shrink-0 rounded-xl bg-[var(--site-main)] text-white text-center py-2 self-start">
        <div className="text-2xl font-bold leading-none">{d?.day ?? '—'}</div>
        <div className="text-[11px] mt-1 text-amber-300 font-semibold">{d ? ethiopianMonthName(d.month, lang) : ''}</div>
        <div className="text-[10px] text-white/70">{d?.year}</div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{lang === 'am' ? typeAm : typeEn}</div>
        <h3 className="font-bold text-slate-900 leading-snug">{title}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} /> {formatEthiopianDate(event.start_date, lang)}{until}{event.start_time ? ` · ${event.start_time}` : ''}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {event.location}
            </span>
          )}
        </div>
        {full && event.description && <p className="pt-1 text-sm text-slate-700 whitespace-pre-line">{event.description}</p>}
        {signup && <EventSignup eventId={event.id} left={signup.left} lang={lang} site={signup.site} />}
      </div>
    </article>
  );
}
