'use client';

// "Notifications" on My profile: per kind of notice, whether it reaches this
// person's phone / computer (push) and Telegram. The inbox (the bell) always
// keeps a copy. Server work: app/dashboard/inbox/actions.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Inbox, Send, Smartphone } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { NOTICE_KINDS, wants, type NoticeChannel, type NoticeKind, type NotificationPrefs } from '@/lib/notifications/prefs';
import { loadMyNotificationPrefs, saveMyNotificationPrefs } from '@/app/dashboard/inbox/actions';

export function NotificationSettings() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<NotificationPrefs>({});
  const [setup, setSetup] = useState({ devices: 0, telegram: false });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadMyNotificationPrefs().then((res) => {
      if (res.mode === 'live') {
        setPrefs(res.data.prefs);
        setSetup({ devices: res.data.devices, telegram: res.data.telegram });
      }
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);

  const apply = async (next: NotificationPrefs) => {
    const before = prefs;
    setPrefs(next);
    setSaving(true);
    setNote(null);
    const res = await saveMyNotificationPrefs(next);
    setSaving(false);
    if (!res.ok) {
      setPrefs(before);
      setNote({ kind: 'error', text: res.error });
    } else setNote({ kind: 'ok', text: t('Saved', 'ተቀምጧል') });
  };

  const set = (kind: NoticeKind, channel: NoticeChannel, on: boolean) => apply({ ...prefs, [kind]: { ...prefs[kind], [channel]: on } });
  const setAll = (channel: NoticeChannel, on: boolean) =>
    apply(Object.fromEntries(NOTICE_KINDS.map(({ kind }) => [kind, { ...prefs[kind], [channel]: on }])) as NotificationPrefs);
  const allOn = (channel: NoticeChannel) => NOTICE_KINDS.every(({ kind }) => wants(prefs, kind, channel));

  return (
    <div className="card p-6 space-y-4 max-w-3xl">
      <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
        <Bell size={18} className="text-blue-600" />
        {t('Notifications', 'ማሳወቂያዎች')}
      </h2>
      <p className="text-xs text-slate-500">
        {t(
          'Choose which notices reach your phone or computer and your Telegram. Every notice is still kept in your inbox (the bell), so nothing is lost.',
          'የትኞቹ ማሳወቂያዎች ስልክዎ ወይም ኮምፒውተርዎ ላይና ቴሌግራምዎ ላይ እንደሚደርሱ ይምረጡ። ሁሉም ማሳወቂያ በመልእክት ሳጥንዎ (ደወሉ) ውስጥ ይቀመጣል፤ ምንም አይጠፋም።'
        )}{' '}
        <Link href="/dashboard/inbox" className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"><Inbox size={12} /> {t('Open the inbox', 'የመልእክት ሳጥኑን ክፈት')}</Link>
      </p>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <>
          {(setup.devices === 0 || !setup.telegram) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              {setup.devices === 0 && <div>• {t('Phone / computer notifications are not on for any of your devices yet: choose “Allow” when the system asks “Turn on notifications?”.', 'የስልክ / የኮምፒውተር ማሳወቂያ በየትኛውም መሣሪያዎ ላይ ገና አልበራም፦ ስርዓቱ «ማሳወቂያ ይብራ?» ብሎ ሲጠይቅ «ፍቀድ» ይምረጡ።')}</div>}
              {!setup.telegram && <div>• {t('Your Telegram is not connected yet (My profile → My details → Connect Telegram).', 'ቴሌግራምዎ ገና አልተገናኘም (የእኔ መገለጫ → የእኔ መረጃ → ቴሌግራም አገናኝ)።')}</div>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-semibold">{t('Kind of notice', 'የማሳወቂያ ዓይነት')}</th>
                  <th className="py-2 px-3 font-semibold text-center w-28">
                    <span className="inline-flex items-center gap-1"><Smartphone size={13} /> {t('Phone / computer', 'ስልክ / ኮምፒውተር')}</span>
                  </th>
                  <th className="py-2 px-3 font-semibold text-center w-28">
                    <span className="inline-flex items-center gap-1"><Send size={13} /> Telegram</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="bg-slate-50/70">
                  <td className="py-2 pr-3 text-xs font-semibold text-slate-600">{t('All', 'ሁሉም')}</td>
                  <td className="py-2 px-3 text-center"><Toggle on={allOn('push')} disabled={saving} onChange={(v) => setAll('push', v)} label={t('All on phone / computer', 'ሁሉም በስልክ / ኮምፒውተር')} /></td>
                  <td className="py-2 px-3 text-center"><Toggle on={allOn('telegram')} disabled={saving} onChange={(v) => setAll('telegram', v)} label={t('All on Telegram', 'ሁሉም በቴሌግራም')} /></td>
                </tr>
                {NOTICE_KINDS.map(({ kind, label, hint }) => (
                  <tr key={kind}>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-800">{locale === 'am' ? label[1] : label[0]}</div>
                      <div className="text-[11px] text-slate-500">{locale === 'am' ? hint[1] : hint[0]}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center"><Toggle on={wants(prefs, kind, 'push')} disabled={saving} onChange={(v) => set(kind, 'push', v)} label={`${label[0]}: push`} /></td>
                    <td className="py-2.5 px-3 text-center"><Toggle on={wants(prefs, kind, 'telegram')} disabled={saving} onChange={(v) => set(kind, 'telegram', v)} label={`${label[0]}: Telegram`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            {t(
              'Reminders the bot sends to members (feasts, library return days, rosters, dues, event tickets) are not changed here; they stop with /stop in the bot.',
              'ቦቱ ለአባላት የሚልካቸው ማስታወሻዎች (በዓላት፣ የመጻሕፍት መመለሻ፣ ምደባ፣ መዋጮ፣ የመርሐ ግብር ትኬት) እዚህ አይቀየሩም፤ በቦቱ /stop በመላክ ይቆማሉ።'
            )}
          </p>
          {note && <p className={`text-xs ${note.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{note.text}</p>}
        </>
      )}
    </div>
  );
}

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}
