'use client';

// "Connect Telegram": links the signed-in person's Telegram chat to the bot,
// so school messages (notifications, absences, results) reach them there.
// Hidden while the bot is not set up.

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Send } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { loadMyTelegram, startTelegramLink, unlinkMyTelegram, type MyTelegram } from '@/app/dashboard/telegram/actions';

export function TelegramConnect({ what }: { what?: string }) {
  const { t, locale } = useLang();
  const [data, setData] = useState<MyTelegram | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMyTelegram>>) => {
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
  }, []);

  useEffect(() => {
    loadMyTelegram().then(apply);
  }, [apply]);

  if (!data?.configured) return null;

  const connect = async () => {
    setBusy(true);
    setError('');
    const res = await startTelegramLink();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    // A link the person taps (opening it automatically after a wait is blocked on phones)
    setLink(res.url);
  };

  const check = async () => {
    setLink('');
    loadMyTelegram().then(apply);
  };

  const remove = async (id: string) => {
    setBusy(true);
    const res = await unlinkMyTelegram(id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    loadMyTelegram().then(apply);
  };

  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
        <Send size={16} className="text-sky-600" /> Telegram
      </h2>
      <p className="text-xs text-slate-500">
        {what ?? t('Get school messages on Telegram.', 'የትምህርት ቤቱን መልእክቶች በቴሌግራም ያግኙ።')}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {data.links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 size={15} /> {t('Connected', 'ተገናኝቷል')}
            <span className="text-slate-500">
              {l.telegram_name ? `· ${l.telegram_name}` : ''} · {formatEthiopianDate(l.linked_at.slice(0, 10), locale)}
            </span>
          </span>
          <button disabled={busy} onClick={() => remove(l.id)} className="text-xs text-slate-500 hover:text-red-600">
            {t('Disconnect', 'አቋርጥ')}
          </button>
        </div>
      ))}

      {link ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2 text-sm text-sky-900">
          <p>{t('1. Open Telegram and tap “Start”.  2. Come back and press “Done”.', '1. ቴሌግራምን ከፍተው «Start» ይጫኑ።  2. ተመልሰው «ጨርሻለሁ» ይጫኑ።')}</p>
          <div className="flex flex-wrap gap-2">
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <ExternalLink size={14} /> {t('Open Telegram', 'ቴሌግራም ክፈት')}
            </a>
            <button onClick={check} className="btn btn-secondary text-xs">{t('Done', 'ጨርሻለሁ')}</button>
          </div>
        </div>
      ) : (
        <button disabled={busy} onClick={connect} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
          <Send size={14} /> {data.links.length ? t('Connect another Telegram', 'ሌላ ቴሌግራም አገናኝ') : t('Connect Telegram', 'ቴሌግራም አገናኝ')}
        </button>
      )}
    </div>
  );
}
