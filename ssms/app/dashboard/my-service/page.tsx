'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MapPin, Music, Shirt, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { WEEKS } from '@/lib/choir/service';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { MyService, MyServiceItem } from '@/lib/choir/service';
import { answerMyService, loadMyService } from './actions';

/** A member's own service roster, rehearsal attendance and the vestments they hold. */
export default function MyServicePage() {
  const { t } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<MyService | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMyService>>) => {
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadMyService().then(apply);
  }, [apply]);
  const notify = (text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
    if (kind === 'success') loadMyService().then(apply);
  };

  const r = data?.rehearsals;
  return (
    <div className="space-y-6 max-w-2xl">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2"><Music size={22} /> {t('My service', 'አገልግሎቴ')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Your place on the service rosters, your rehearsal attendance and the vestments you hold.', 'በአገልግሎት ምደባ ያለዎት ቦታ፣ የጥናት ተገኝነትዎና በእጅዎ ያለ የክብር ልብስ።')}</p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {data && !data.in_choir && data.holding.length === 0 && (
        <p className="card p-8 text-center text-sm text-slate-500">{t('You are not on the choir list. Ask the choir leaders if this is wrong.', 'በመዘምራን ዝርዝር ውስጥ አልተገኙም። ስህተት ከሆነ የመዘምራን ክፍሉን ይጠይቁ።')}</p>
      )}

      {data?.in_choir && r && (
        <div className="card p-4 flex items-center gap-4">
          <div className={`text-3xl font-bold tabular-nums ${r.rate === null ? 'text-slate-300' : r.rate >= 75 ? 'text-emerald-600' : r.rate >= 55 ? 'text-amber-600' : 'text-red-600'}`}>
            {r.rate === null ? '—' : `${r.rate}%`}
          </div>
          <div className="text-sm text-slate-600">
            {t(`Rehearsal attendance, last ${WEEKS} weeks`, `የጥናት ተገኝነት፣ ያለፉት ${WEEKS} ሳምንታት`)}
            <div className="text-xs text-slate-400">{t(`${r.came} of ${r.counted} rehearsals · rosters are made from this`, `ከ${r.counted} ጥናት ${r.came} · ምደባ የሚወጣው በዚህ ነው`)}</div>
          </div>
        </div>
      )}

      {data?.in_choir && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{t('Coming services', 'የሚመጡ አገልግሎቶች')}</h2>
          {data.upcoming.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">{t('No roster has been published yet.', 'ገና የወጣ ምደባ የለም።')}</p>}
          {data.upcoming.map((u) => <ServiceCard key={u.session_id} item={u} onDone={notify} />)}
        </div>
      )}

      {data && data.holding.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"><Shirt size={15} /> {t('Vestments you hold', 'በእጅዎ ያለ የክብር ልብስ')}</h2>
          {data.holding.map((h) => (
            <div key={h.id} className={`card p-3 flex flex-wrap items-center justify-between gap-2 ${h.overdue ? 'border-red-200 bg-red-50/40' : ''}`}>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{h.vestment}</div>
                {h.session && <div className="text-[11px] text-slate-500">{h.session}</div>}
              </div>
              <div className={`text-xs font-semibold ${h.overdue ? 'text-red-600' : 'text-slate-600'}`}>
                {h.overdue ? t('Overdue — please bring it back', 'ጊዜው አልፏል — እባክዎ ይመልሱ') : t('Bring back by', 'የሚመለስበት')} · {formatEthiopianDate(h.due_on, 'am')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ item: u, onDone }: { item: MyServiceItem; onDone: (text: string, kind?: 'success' | 'error') => void }) {
  const { t, locale } = useLang();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const answer = async (response: 'CONFIRMED' | 'DECLINED') => {
    setBusy(true);
    const res = await answerMyService(u.assignment_id!, response, note);
    setBusy(false);
    if (!res.ok) return onDone(res.error, 'error');
    setDeclining(false);
    onDone(response === 'CONFIRMED' ? t('Thank you — see you there!', 'እናመሰግናለን — እንገናኝ!') : t('Noted — the choir leaders were told', 'ተመዝግቧል — የመዘምራን ክፍሉ ተነግሯቸዋል'));
  };

  return (
    <div className={`card p-4 space-y-3 ${u.assignment_id ? 'border-l-4 border-l-blue-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">{u.title}</div>
          <div className="text-xs text-slate-500">
            {formatEthiopianDate(u.date, locale, { weekday: true })}{u.time && ` · ${u.time}`}
            {u.location && <span className="ml-2 inline-flex items-center gap-0.5"><MapPin size={11} />{u.location}</span>}
          </div>
        </div>
        {u.assignment_id ? (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">{t('You are on the roster', 'ተመድበዋል')}{u.role && ` · ${u.role}`}</span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">{t('Not on the roster', 'አልተመደቡም')}</span>
        )}
      </div>

      {u.assignment_id && (
        <>
          {u.response === 'CONFIRMED' && <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {t('You said you will serve', 'እመጣለሁ ብለዋል')}</p>}
          {u.response === 'DECLINED' && <p className="text-sm text-red-600 inline-flex items-center gap-1.5"><XCircle size={15} /> {t('You said you can’t come', 'አልችልም ብለዋል')}{u.response_note && `: ${u.response_note}`}</p>}
          {declining ? (
            <div className="space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('Why can’t you come? (goes to the choir leaders)', 'ለምን አይችሉም? (ለመዘምራን ክፍሉ ይደርሳል)')} className="form-input text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeclining(false)} className="btn btn-secondary text-xs">{t('Back', 'ተመለስ')}</button>
                <button disabled={busy || note.trim().length < 2} onClick={() => answer('DECLINED')} className="btn text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{t('Send', 'ላክ')}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {u.response !== 'CONFIRMED' && (
                <button disabled={busy} onClick={() => answer('CONFIRMED')} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={14} /> {t('I’ll serve', 'እመጣለሁ')}</button>
              )}
              {u.response !== 'DECLINED' && (
                <button disabled={busy} onClick={() => setDeclining(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 text-red-700"><XCircle size={14} /> {t('I can’t come', 'አልችልም')}</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
