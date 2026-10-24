'use client';

// The inbox: every notice the user was sent (push / Telegram), newest first,
// read or unread. Server work: ./actions.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCheck, Inbox } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { loadInbox, markInboxRead, type InboxItem } from './actions';

export default function InboxPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadInbox>>, p: number) => {
    if (res.mode === 'live') {
      setItems((prev) => (p === 0 ? res.data.items : [...prev, ...res.data.items]));
      setMore(res.data.more);
      setUnread(res.data.unread);
    } else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  const load = (p: number, only: boolean) => loadInbox(p, only).then((res) => apply(res, p));
  useEffect(() => {
    loadInbox(0, onlyUnread).then((res) => apply(res, 0));
  }, [apply, onlyUnread]);

  const open = async (item: InboxItem) => {
    if (!item.read) {
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
      setUnread((n) => Math.max(0, n - 1));
      await markInboxRead([item.id]);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Inbox', 'የመልእክት ሳጥን')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Every notification you were sent, kept here', 'የተላኩልዎ ማሳወቂያዎች ሁሉ እዚህ ይቀመጣሉ')}</p>
        </div>
        <div className="flex gap-2 self-start">
          <label className="text-xs text-slate-600 inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => {
                setPage(0);
                setOnlyUnread(e.target.checked);
              }}
            />
            {t('Unread only', 'ያልተነበቡ ብቻ')}
          </label>
          {unread > 0 && (
            <button
              onClick={async () => {
                await markInboxRead('all');
                setItems((list) => list.map((x) => ({ ...x, read: true })));
                setUnread(0);
              }}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
            >
              <CheckCheck size={14} /> {t('Mark all read', 'ሁሉንም እንደተነበበ')} ({unread})
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <div className="card overflow-hidden divide-y divide-slate-100">
          {items.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              <Inbox className="mx-auto mb-2" size={28} />
              {t('Nothing here yet', 'እስካሁን ምንም የለም')}
            </div>
          )}
          {items.map((n) => (
            <Link key={n.id} href={n.url} onClick={() => open(n)} className={`block p-4 hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/40'}`}>
              <div className="flex items-start gap-3">
                {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm text-slate-900 ${n.read ? '' : 'font-semibold'}`}>{n.title}</div>
                  {n.body && <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{n.body}</div>}
                  <div className="text-[10px] text-slate-400 mt-1">
                    {formatEthiopianDate(n.created_at.slice(0, 10), locale)} · {new Date(n.created_at).toLocaleTimeString(locale === 'am' ? 'am-ET' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {more && (
            <button
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void load(next, onlyUnread);
              }}
              className="w-full p-3 text-xs font-semibold text-blue-600 hover:bg-slate-50"
            >
              {t('Show older', 'የቆዩትን አሳይ')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
