'use client';

// Offline roll calls and grades: a small bar at the bottom of the screen while
// there is no network, or while saves wait in the outbox to be sent. Sending
// itself happens by itself (lib/education/client); "Send now" just tries at once.

import React, { useState } from 'react';
import { CloudOff, Loader2, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { flushOutbox } from '@/lib/education/client';
import { removeItem, useOnline, useOutbox } from '@/lib/education/outbox';

export function SyncStatus() {
  const { t } = useLang();
  const items = useOutbox();
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const waiting = items.filter((i) => !i.error);
  const failed = items.filter((i) => i.error);
  if (online && items.length === 0) return null;

  const sendNow = async () => {
    setSending(true);
    await flushOutbox().catch(() => 0);
    setSending(false);
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md" role="status" aria-live="polite">
      <div className={`rounded-xl shadow-lg border text-sm ${failed.length ? 'bg-red-50 border-red-200' : online ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="px-3 py-2 flex items-center gap-2">
          {online ? <UploadCloud size={16} className="text-blue-700 shrink-0" /> : <CloudOff size={16} className="text-amber-700 shrink-0" />}
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex-1 text-left text-slate-800">
            {!online && <span className="font-semibold">{t('No network. ', 'ኔትወርክ የለም። ')}</span>}
            {waiting.length > 0
              ? t(`${waiting.length} save(s) kept on this phone — sent when the network is back.`, `${waiting.length} የተቀመጡ በዚህ ስልክ ላይ ናቸው — ኔትወርክ ሲመለስ ይላካሉ።`)
              : !online
                ? t('Roll calls and grades you save are kept on this phone.', 'የሚያስቀምጧቸው ክትትልና ውጤቶች በዚህ ስልክ ላይ ይቆያሉ።')
                : ''}
            {failed.length > 0 && <span className="text-red-700"> {t(`${failed.length} could not be sent.`, `${failed.length} መላክ አልተቻለም።`)}</span>}
          </button>
          {online && waiting.length > 0 && (
            <button type="button" disabled={sending} onClick={sendNow} className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1 shrink-0">
              {sending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('Send now', 'አሁን ላክ')}
            </button>
          )}
        </div>
        {open && items.length > 0 && (
          <ul className="border-t border-black/5 px-3 py-2 space-y-1 max-h-48 overflow-y-auto text-xs">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-2">
                <span className="flex-1">
                  {i.kind === 'attendance' ? t('Roll call', 'ስም ጥሪ') : t('Grade', 'ውጤት')} · {i.label}
                  {i.error ? <span className="block text-red-700">{i.error}</span> : <span className="text-slate-500"> — {t('waiting', 'በመጠባበቅ ላይ')}</span>}
                </span>
                {i.error && (
                  <button type="button" onClick={() => removeItem(i.id)} className="text-slate-500 hover:text-red-700" aria-label={t('Remove', 'አስወግድ')}>
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
