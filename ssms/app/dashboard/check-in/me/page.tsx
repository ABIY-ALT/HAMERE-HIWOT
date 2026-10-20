'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, QrCode } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { KIND_LABEL, addisTime } from '@/lib/checkin/types';
import { checkInMe, loadMyCheckin, type MyCheckin } from '../actions';

/** "✅ I'm here" on the website: the code on the leader's screen, and the phone's location. */
export default function CheckMeInPage() {
  const { t } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<MyCheckin | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMyCheckin>>) => {
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadMyCheckin().then(apply);
  }, [apply]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <QrCode size={36} className="mx-auto text-rose-800" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">{t('I’m here', 'ተገኝቻለሁ')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Type the code on the leader’s screen.', 'በመሪው ስክሪን ላይ ያለውን ኮድ ይጻፉ።')}</p>
      </div>
      <AdminModeNotice mode={mode} error={error} />
      {data && data.events.length === 0 && (
        <p className="card p-8 text-center text-sm text-slate-500">{t('No program or rehearsal is open for check-in right now.', 'አሁን መገኘት የሚመዘገብበት መርሐ ግብር ወይም ጥናት የለም።')}</p>
      )}
      {data?.events.map((ev) => <EventCard key={ev.id} ev={ev} onDone={() => loadMyCheckin().then(apply)} />)}
    </div>
  );
}

function EventCard({ ev, onDone }: { ev: MyCheckin['events'][number]; onDone: () => void }) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [useLocation, setUseLocation] = useState(ev.has_place);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(
    ev.mine === 'PRESENT' ? { kind: 'ok', text: t('You are checked in.', 'ተመዝግበዋል።') } : ev.mine === 'FLAGGED' ? { kind: 'warn', text: t('Recorded — the leader will confirm it.', 'ተመዝግቧል — መሪው ያረጋግጣሉ።') } : null
  );

  /** The phone's location, or null (refused / not available) */
  const where = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!useLocation || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12_000 }
      );
    });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await checkInMe(ev.id, code, await where());
    setBusy(false);
    if (!res.ok) return setResult({ kind: 'error', text: res.error });
    setResult(
      res.status === 'PRESENT'
        ? { kind: 'ok', text: t('You are checked in. Welcome!', 'ተመዝግበዋል። እንኳን ደህና መጡ!') }
        : {
            kind: 'warn',
            text: res.flag === 'FAR' ? t('Recorded, but you seem far from the place — the leader will confirm it.', 'ተመዝግቧል፤ ግን ከቦታው የራቁ ይመስላሉ — መሪው ያረጋግጣሉ።') : t('Recorded — without your location, the leader will confirm it.', 'ተመዝግቧል — ቦታዎ ስላልተገኘ መሪው ያረጋግጣሉ።'),
          }
    );
    onDone();
  };

  const done = result?.kind === 'ok';
  return (
    <form onSubmit={send} className="card p-5 space-y-4">
      <div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t(...KIND_LABEL[ev.kind])} · {addisTime(ev.starts_at)}–{addisTime(ev.ends_at)}</div>
        <h2 className="font-bold text-slate-900 text-lg">{ev.title}</h2>
      </div>
      {result && (
        <p className={`p-3 rounded-lg text-sm flex items-start gap-2 ${result.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : result.kind === 'warn' ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.kind === 'ok' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />} {result.text}
        </p>
      )}
      {!done && (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0000"
            className="form-input text-center font-mono text-4xl tracking-[0.5em] py-3"
          />
          {ev.has_place && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={useLocation} onChange={(e) => setUseLocation(e.target.checked)} />
              <MapPin size={14} /> {t('Send my location (otherwise the leader confirms it)', 'ቦታዬን ላክ (ካልሆነ መሪው ያረጋግጣሉ)')}
            </label>
          )}
          <button type="submit" disabled={busy || code.length !== 4} className="btn btn-primary w-full justify-center disabled:opacity-50">
            {busy ? t('Checking…', 'በማረጋገጥ ላይ…') : t('✅ I’m here', '✅ ተገኝቻለሁ')}
          </button>
        </>
      )}
    </form>
  );
}
