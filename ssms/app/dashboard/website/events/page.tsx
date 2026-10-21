'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, CalendarX, ExternalLink, MapPin } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { PROGRAM_TYPES } from '@/lib/programs/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { cn } from '@/lib/utils';
import { loadWebsiteEvents, setEventPublic, type WebsiteEvent } from '../actions';

type Filter = 'ALL' | 'SHOWN' | 'HIDDEN';

/**
 * Public website → Events: programs are internal until they are added here.
 * Lists the coming programs (Programs & events) with one switch each.
 */
export default function WebsiteEventsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [events, setEvents] = useState<WebsiteEvent[]>([]);
  const [base, setBase] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    loadWebsiteEvents().then((res) => {
      if (res.mode === 'live') {
        setEvents(res.data.events);
        setBase(res.data.base);
      }
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const toggle = async (ev: WebsiteEvent) => {
    const show = !ev.is_public;
    if (show && !window.confirm(t(
      `Show “${ev.title_en}” on the public website?\n\nAnyone can see its title, date, time, place and description, and everyone connected to the Telegram bot gets a reminder the day before.`,
      `«${ev.title_am}» በሕዝብ ድረ-ገጹ ላይ ይታይ?\n\nርዕሱን፣ ቀኑን፣ ሰዓቱን፣ ቦታውንና መግለጫውን ማንም ሰው ያያል፤ ቦቱን ያገናኙ ሁሉ አንድ ቀን በፊት ማስታወሻ ይደርሳቸዋል።`
    ))) return;
    setBusyId(ev.id);
    const res = await setEventPublic(ev.id, show);
    setBusyId(null);
    if (!res.ok) return notify('error', res.error);
    setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, is_public: show } : e)));
    notify('success', show ? t('Added to the public website', 'ወደ ሕዝብ ድረ-ገጹ ተጨምሯል') : t('Taken off the public website', 'ከሕዝብ ድረ-ገጹ ተነሥቷል'));
  };

  const shown = events.filter((e) => e.is_public).length;
  const list = events.filter((e) => (filter === 'ALL' ? true : filter === 'SHOWN' ? e.is_public : !e.is_public));
  const tabs: [Filter, string][] = [
    ['ALL', `${t('All coming', 'የሚመጡ ሁሉ')} (${events.length})`],
    ['SHOWN', `${t('On the website', 'በድረ-ገጹ ላይ')} (${shown})`],
    ['HIDDEN', `${t('Internal only', 'የውስጥ ብቻ')} (${events.length - shown})`],
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Events on the website', 'በድረ-ገጹ ላይ ያሉ መርሐ ግብሮች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Programs made under Programs & events are internal. Only the ones you add here are shown on the public website.',
              'በ«ፕሮግራሞች» ስር የሚፈጠሩ መርሐ ግብሮች የውስጥ ናቸው። በሕዝብ ድረ-ገጹ ላይ የሚታዩት እዚህ የጨመሯቸው ብቻ ናቸው።'
            )}
          </p>
        </div>
        {mode === 'live' && (
          <a href={`${base}/events`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start">
            <ExternalLink size={14} /> {t('View Events page', 'የመርሐ ግብሮች ገጽን ይመልከቱ')}
          </a>
        )}
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <>
          <div className="flex flex-wrap gap-2">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border', filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
              >
                {label}
              </button>
            ))}
          </div>

          {list.length === 0 && (
            <div className="card p-8 text-center text-sm text-slate-500">
              {events.length === 0 ? (
                <>
                  {t('No coming programs. Create one first under ', 'የሚመጣ ፕሮግራም የለም። መጀመሪያ በ')}
                  <Link href="/dashboard/programs"className="font-semibold text-blue-600 hover:underline">{t('Programs & events', 'ፕሮግራሞች')}</Link>
                  {t('.', ' ስር ይፍጠሩ።')}
                </>
              ) : filter === 'SHOWN' ? (
                t('Nothing is on the website yet.', 'እስካሁን በድረ-ገጹ ላይ ምንም የለም።')
              ) : (
                t('Every coming program is on the website.', 'የሚመጡት ፕሮግራሞች ሁሉ በድረ-ገጹ ላይ ናቸው።')
              )}
            </div>
          )}

          <div className="space-y-3">
            {list.map((ev) => (
              <div key={ev.id} className={cn('card p-4 flex flex-col sm:flex-row sm:items-center gap-4', ev.is_public && 'border-emerald-200')}>
                <div className="sm:w-36 shrink-0 text-xs">
                  <div className="font-bold text-slate-900">{formatEthiopianDate(ev.start_date, locale)}</div>
                  {ev.end_date && ev.end_date !== ev.start_date && <div className="text-slate-500">→ {formatEthiopianDate(ev.end_date, locale)}</div>}
                  {ev.start_time && <div className="text-slate-500">{ev.start_time}</div>}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {ev.is_public ? <span className="badge badge-success">{t('On the website', 'በድረ-ገጹ ላይ')}</span> : <span className="badge badge-warning">{t('Internal only', 'የውስጥ ብቻ')}</span>}
                    <span className="text-slate-500">{t(...PROGRAM_TYPES[ev.type])}</span>
                    {ev.status === 'CONFIRMED' && <span className="text-slate-400">· {t('Confirmed', 'የተረጋገጠ')}</span>}
                  </div>
                  <h2 className="font-bold text-slate-900 truncate">{locale === 'am' ? ev.title_am : ev.title_en}</h2>
                  <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                    {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {ev.location}</span>}
                    {(ev.unit_en || ev.unit_am) && <span>{locale === 'am' ? ev.unit_am : ev.unit_en}</span>}
                  </div>
                  {ev.description && <p className="text-xs text-slate-500 line-clamp-2">{ev.description}</p>}
                </div>
                <button
                  onClick={() => toggle(ev)}
                  disabled={busyId === ev.id}
                  className={cn('btn text-xs inline-flex items-center gap-1.5 self-start sm:self-center shrink-0 disabled:opacity-60', ev.is_public ? 'btn-secondary' : 'btn-primary')}
                >
                  {ev.is_public ? <CalendarX size={14} /> : <CalendarPlus size={14} />}
                  {ev.is_public ? t('Take off website', 'ከድረ-ገጹ አንሣ') : t('Add to website', 'ወደ ድረ-ገጹ ጨምር')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
