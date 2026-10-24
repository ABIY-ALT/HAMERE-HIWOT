'use client';

// "My QR": the signed-in person's live QR (app/dashboard/check-in/actions →
// myLiveQr). It is valid for a minute and replaced every 20 seconds while the
// page is open, so a screenshot sent to someone else soon stops working.

import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { QrCode } from '@/components/common/QrCode';
import { myLiveQr, type MyLiveQr as Live } from '@/app/dashboard/check-in/actions';

const REFRESH_MS = 20_000;

export function MyLiveQr({ size = 220 }: { size?: number }) {
  const { t } = useLang();
  const [qr, setQr] = useState<Live | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () => myLiveQr().then((res) => !stop && setQr(res));
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, []);

  if (!qr) return <div className="mx-auto rounded-2xl bg-slate-100 animate-pulse" style={{ width: size + 24, height: size + 24 }} />;
  if (!qr.ok) return <p className="text-sm text-red-600">{qr.error}</p>;
  const left = now ? Math.max(0, Math.round((qr.expiresAt - now) / 1000)) : null;
  return (
    <div className="space-y-2 text-center">
      <div className="inline-block rounded-2xl bg-white p-3 border border-slate-200">
        <QrCode value={qr.value} size={size} />
      </div>
      <div className="font-bold text-slate-900">{qr.name}</div>
      <div className="font-mono text-sm text-slate-500">{qr.code}</div>
      <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
        <ShieldCheck size={13} /> {t('Live QR — changes by itself; a screenshot stops working.', 'ሕያው QR — በራሱ ይቀየራል፤ ፎቶ (screenshot) አይሠራም።')}
        {left !== null && left < 45 && <RefreshCw size={11} className="animate-spin" />}
      </div>
    </div>
  );
}
