'use client';

// Book requests from the Telegram bot, as soon as they are made: is a copy on
// the shelf? Tell the person it is ready, lend it to them, or close it.

import React, { useEffect, useState } from 'react';
import { Bell, BookOpen, Check, Send, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { LendDialog } from '@/components/library/LoanDialogs';
import { refreshLibrary, runLibrary, useLibrary } from '@/lib/library/client';
import { REQUEST_STATUS, label, type LibraryRequest } from '@/lib/library/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { cancelLibraryRequest, markRequestReady } from '@/app/dashboard/library/actions';

export function RequestsPanel({ canManage, onMessage }: { canManage: boolean; onMessage: (kind: 'success' | 'error', text: string) => void }) {
  const { t, locale } = useLang();
  const lib = useLibrary();
  const [lend, setLend] = useState<LibraryRequest | null>(null);
  const [busy, setBusy] = useState('');
  // New requests from the bot show up without reloading the page
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshLibrary();
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  const open = lib.requests.filter((r) => r.status === 'WAITING' || r.status === 'READY');
  if (open.length === 0) return null;

  const free = (bookId: string) => lib.copies.filter((c) => c.book_id === bookId && c.status === 'AVAILABLE');
  const nextBack = (bookId: string) =>
    lib.loans.filter((l) => l.book_id === bookId && l.status === 'OUT' && l.due_date).map((l) => l.due_date!).sort()[0];
  const titleOf = (id: string) => lib.books.find((b) => b.id === id)?.title ?? '—';

  const act = async (id: string, work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(id);
    const res = await runLibrary(work as () => Promise<{ ok: true } | { ok: false; error: string }>);
    setBusy('');
    onMessage(res.ok ? 'success' : 'error', res.ok ? success : res.error);
  };

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="p-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
        <Bell size={16} className="text-amber-600" />
        <h2 className="font-bold text-slate-800 text-sm">{t('Book requests', 'የመጽሐፍ ጥያቄዎች')} ({open.length})</h2>
        <span className="text-xs text-slate-500">{t('— asked for on Telegram', '— በቴሌግራም የተጠየቁ')}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {open.map((r) => {
          const copies = free(r.book_id);
          const back = nextBack(r.book_id);
          return (
            <div key={r.id} className={`p-3 px-4 flex flex-wrap items-center gap-3 text-sm ${busy === r.id ? 'opacity-60' : ''}`}>
              <BookOpen size={16} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{titleOf(r.book_id)}</div>
                <div className="text-xs text-slate-500">
                  {locale === 'am' ? r.person_am : r.person}{r.phone && ` · ${r.phone}`} · {formatEthiopianDate(r.requested_at.slice(0, 10), locale)}
                </div>
                <div className="text-xs mt-0.5">
                  {copies.length ? (
                    <span className="text-emerald-700 font-semibold">{t(`${copies.length} on the shelf`, `${copies.length} መደርደሪያ ላይ`)}</span>
                  ) : (
                    <span className="text-amber-700">{t('All copies are out', 'ሁሉም ቅጂዎች ወጥተዋል')}{back && ` · ${t('first back', 'የመጀመሪያው የሚመለሰው')} ${formatEthiopianDate(back, locale)}`}</span>
                  )}
                </div>
              </div>
              <span className={REQUEST_STATUS[r.status].badge + ' text-[11px]'}>{label(REQUEST_STATUS[r.status].label, locale)}</span>
              {canManage && (
                <div className="flex flex-wrap gap-1">
                  {copies.length > 0 && (
                    <button onClick={() => setLend(r)} className="btn btn-primary text-[11px] py-1 px-2 inline-flex items-center gap-1"><Check size={12} /> {t('Lend', 'አውስ')}</button>
                  )}
                  {r.status === 'WAITING' && copies.length > 0 && (
                    <button onClick={() => act(r.id, () => markRequestReady(r.id), t('The person was told it is ready', 'ሰውየው ዝግጁ መሆኑ ተነግሯቸዋል'))} className="btn btn-secondary text-[11px] py-1 px-2 inline-flex items-center gap-1">
                      <Send size={12} /> {t('Tell: ready', 'ዝግጁ ነው በል')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const note = window.prompt(t('Why is the request closed? (the person reads this)', 'ጥያቄው ለምን ተዘጋ? (ሰውየው ያነቡታል)'));
                      if (note) void act(r.id, () => cancelLibraryRequest(r.id, note), t('Request closed', 'ጥያቄው ተዘግቷል'));
                    }}
                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title={t('Close request', 'ጥያቄውን ዝጋ')}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lend && (
        <LendDialog
          initialCopyId={free(lend.book_id)[0]?.id}
          initialPerson={{ id: lend.person_id, name: lend.person, name_am: lend.person_am, phone: lend.phone, reg_no: '', kind: 'OTHER', open: 0, overdue: 0 }}
          onClose={() => setLend(null)}
          onDone={(text) => {
            setLend(null);
            onMessage('success', text);
          }}
        />
      )}
    </div>
  );
}
