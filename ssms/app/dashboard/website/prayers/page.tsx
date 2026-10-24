'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Check, HeartHandshake, Phone, Undo2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { loadPrayers, setPrayerStatus, type PrayerRequest, type PrayerStatus } from './actions';

const TIME = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' });

/**
 * Public Website → Prayer requests: "Pray for me" from the Contact page.
 * Private — only website managers see them.
 */
export default function PrayersPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [list, setList] = useState<PrayerRequest[]>([]);
  const [tab, setTab] = useState<PrayerStatus>('NEW');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    loadPrayers().then((res) => {
      if (res.mode === 'live') setList(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const move = async (p: PrayerRequest, status: PrayerStatus) => {
    setBusyId(p.id);
    const res = await setPrayerStatus(p.id, status);
    setBusyId(null);
    if (!res.ok) {
      setToast({ kind: 'error', text: res.error });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setList((l) => l.map((x) => (x.id === p.id ? { ...x, status, handled_at: status === 'NEW' ? null : new Date().toISOString() } : x)));
  };

  const tabs: [PrayerStatus, string][] = [
    ['NEW', `${t('New', 'አዲስ')} (${list.filter((p) => p.status === 'NEW').length})`],
    ['PRAYED', `${t('Prayed for', 'የተጸለየላቸው')} (${list.filter((p) => p.status === 'PRAYED').length})`],
    ['ARCHIVED', `${t('Archived', 'የተቀመጡ')} (${list.filter((p) => p.status === 'ARCHIVED').length})`],
  ];
  const shown = list.filter((p) => p.status === tab);

  return (
    <div className="space-y-6 max-w-4xl">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2"><HeartHandshake size={22} className="text-rose-700" /> {t('Prayer requests', 'የጸሎት ጥያቄዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('“Pray for me” from the Contact page of the public website. Private — only website managers see them.', 'ከሕዝብ ድረ-ገጹ «ያግኙን» ገጽ የመጡ «ጸሎት ይደረግልኝ» ጥያቄዎች። የግል ናቸው — የሚያዩት የድረ-ገጽ አስተዳዳሪዎች ብቻ ናቸው።')}
          </p>
        </div>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <>
          <div className="flex flex-wrap gap-2">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tab === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">{t('Nothing here.', 'እዚህ ምንም የለም።')}</div>}
          <div className="space-y-3">
            {shown.map((p) => (
              <div key={p.id} className="card p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">{p.name || t('No name given', 'ስም አልተሰጠም')}</span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Phone size={11} /> {p.phone}</a>
                  )}
                  {p.wants_call && <span className="badge badge-warning">{t('Wants a call', 'እንዲደወልለት ይፈልጋል')}</span>}
                  <span>{formatEthiopianDate(p.created_at.slice(0, 10), locale)} · {TIME(p.created_at)}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-line">{p.request}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {p.status === 'NEW' && (
                    <button disabled={busyId === p.id} onClick={() => move(p, 'PRAYED')} className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"><Check size={13} /> {t('Prayed for', 'ተጸልዮበታል')}</button>
                  )}
                  {p.status !== 'ARCHIVED' && (
                    <button disabled={busyId === p.id} onClick={() => move(p, 'ARCHIVED')} className="btn btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50"><Archive size={13} /> {t('Archive', 'አስቀምጥ')}</button>
                  )}
                  {p.status !== 'NEW' && (
                    <button disabled={busyId === p.id} onClick={() => move(p, 'NEW')} className="btn btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50"><Undo2 size={13} /> {t('Back to new', 'ወደ አዲስ መልስ')}</button>
                  )}
                  {p.handled_by && <span className="text-[11px] text-slate-400">{p.handled_by}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
