'use client';

// "Scan attendance": the leader keeps the camera open at the door and scans
// each person's QR — their member / student card, or "📲 My QR" in the
// Telegram bot or on the website. Everyone scanned is marked present at once
// (app/dashboard/check-in/actions → scanPresent), with their photo shown so
// the leader can see it is really them. A code can be typed as well.

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Keyboard, UserRound, X, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { QrScanner } from '@/components/common/QrScanButton';
import { scanPresent, type ScanResult } from '@/app/dashboard/check-in/actions';

type Shown = { at: number; code: string; result: ScanResult };

/** A short tone: high = present, low = problem (no sound where the browser does not allow it) */
function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    osc.onended = () => void ctx.close();
  } catch {
    // no sound
  }
}

export function ScanAttendance({ eventId, title, onClose }: { eventId: string; title: string; onClose: () => void }) {
  const { t } = useLang();
  const [last, setLast] = useState<Shown | null>(null);
  const [history, setHistory] = useState<Shown[]>([]);
  const [typed, setTyped] = useState('');
  const busy = useRef(false);

  const handle = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    const result = await scanPresent(eventId, code);
    busy.current = false;
    const shown = { at: Date.now(), code, result };
    setLast(shown);
    setHistory((h) => [shown, ...h].slice(0, 30));
    beep(result.ok && !result.already && !result.not_in_choir);
    if (navigator.vibrate) navigator.vibrate(result.ok ? 60 : [80, 60, 80]);
  };

  const present = new Set(history.filter((h) => h.result.ok).map((h) => (h.result.ok ? h.result.person.id : ''))).size;

  // Above the event's dialog, whatever its layout
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-950 text-white flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <div className="text-xs text-slate-400">{t('Scan attendance', 'ክትትል በQR')}</div>
          <div className="font-bold truncate">{title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{present}</div>
          <div className="text-[10px] text-slate-400">{t('scanned now', 'አሁን የተቃኙ')}</div>
        </div>
        <button onClick={onClose} aria-label={t('Close', 'ዝጋ')} className="p-2 -mr-2 text-slate-300 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md p-4 space-y-4">
          <div className="rounded-2xl overflow-hidden border-2 border-white/10">
            <QrScanner continuous onScan={handle} />
          </div>

          {last && <ResultCard shown={last} />}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) void handle(typed.trim());
              setTyped('');
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Keyboard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t('Or type the member code / reg. no.', 'ወይም የአባልነት / የምዝገባ ቁጥር ይጻፉ')}
                className="w-full rounded-lg bg-white/10 border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 font-mono"
              />
            </div>
            <button type="submit" className="btn btn-primary text-xs">{t('Mark', 'መዝግብ')}</button>
          </form>

          {history.length > 1 && (
            <ul className="divide-y divide-white/5 rounded-xl bg-white/5">
              {history.slice(1).map((h) => (
                <li key={h.at} className="px-3 py-2 flex items-center gap-2 text-sm">
                  {h.result.ok ? <CheckCircle2 size={14} className={h.result.already ? 'text-slate-500' : 'text-emerald-400'} /> : <XCircle size={14} className="text-red-400" />}
                  <span className="flex-1 truncate">{h.result.ok ? h.result.person.name : h.result.error}</span>
                  <span className="text-[11px] text-slate-500">{new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResultCard({ shown }: { shown: Shown }) {
  const { t } = useLang();
  const r = shown.result;
  if (!r.ok) {
    return (
      <div className="rounded-2xl bg-red-500/15 border border-red-400/40 p-4 flex items-center gap-3">
        <XCircle size={36} className="text-red-400 shrink-0" />
        <div className="text-sm">{r.error}</div>
      </div>
    );
  }
  const tone = r.not_in_choir ? 'bg-amber-500/15 border-amber-400/40' : r.already ? 'bg-white/5 border-white/15' : 'bg-emerald-500/15 border-emerald-400/40';
  return (
    <div key={shown.at} className={`rounded-2xl border p-4 flex items-center gap-4 ${tone}`}>
      {r.person.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/dashboard/people/members/photo/${r.person.id}`} alt="" className="h-20 w-20 rounded-xl object-cover bg-white/10 shrink-0" />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><UserRound size={36} className="text-slate-400" /></div>
      )}
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight">{r.person.name}</div>
        <div className="text-xs font-mono text-slate-400">{r.person.code}</div>
        <div className="mt-1 text-sm">
          {r.already ? (
            <span className="text-slate-300">{t('Already marked present', 'ቀድሞ ተገኝቷል ተብሏል')}</span>
          ) : (
            <span className="text-emerald-300 font-semibold">✓ {t('Present', 'ተገኝቷል')}</span>
          )}
        </div>
        {r.not_in_choir && (
          <div className="mt-1 text-xs text-amber-300 inline-flex items-center gap-1">
            <AlertTriangle size={12} /> {t('Not a choir member — counted here, but not in the choir attendance', 'የመዘምራን አባል አይደሉም — እዚህ ተቆጥረዋል፣ በመዘምራን ክትትል ግን አይገቡም')}
          </div>
        )}
      </div>
    </div>
  );
}
