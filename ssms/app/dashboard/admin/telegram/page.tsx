'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, Send, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { connectBot, countAudience, loadBotStatus, sendBroadcast, type BotStatus } from '@/app/dashboard/telegram/actions';

/** Set up the Telegram bot, and send a message to a group of people who connected it. */
export default function TelegramAdminPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [audience, setAudience] = useState('EVERYONE');
  const [reach, setReach] = useState<{ people: number; connected: number } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadBotStatus>>) => {
    if (res.mode === 'live') setStatus(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadBotStatus().then(apply);
  }, [apply]);

  useEffect(() => {
    if (!status?.configured) return;
    countAudience(audience).then((res) => setReach(res.ok ? { people: res.people, connected: res.connected } : null));
  }, [audience, status?.configured]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const connect = async () => {
    setBusy(true);
    const res = await connectBot();
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('The bot is connected to this site', 'ቦቱ ከዚህ ድረ-ገጽ ጋር ተገናኝቷል'));
    loadBotStatus().then(apply);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await sendBroadcast(audience, message);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    setMessage('');
    notify('success', t('Sending — the history below shows how many it reached', 'በመላክ ላይ — ስንቶች እንደደረሳቸው ከታች ይታያል'));
    setTimeout(() => loadBotStatus().then(apply), 4000);
  };

  const className = (id: string) => {
    const c = status?.classes.find((x) => x.id === id);
    return c ? (locale === 'am' ? c.name_am : c.name_en) : '';
  };
  const audienceLabel = (a: string) => {
    if (a === 'EVERYONE') return t('Everyone connected', 'የተገናኙ ሁሉ');
    if (a === 'STAFF') return t('Staff', 'ሠራተኞች');
    const [kind, scope] = a.split(':');
    const who = kind === 'STUDENTS' ? t('Students', 'ተማሪዎች') : t('Parents', 'ወላጆች');
    return scope === 'ALL' ? `${who} · ${t('all classes', 'ሁሉም ክፍሎች')}` : `${who} · ${className(scope)}`;
  };
  const webhookOk = Boolean(status?.webhook_url) && status?.webhook_url === status?.expected_url;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Telegram bot', 'የቴሌግራም ቦት')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Notifications, absence alerts and new results reach people on Telegram once they press “Connect Telegram” on their profile.',
            'ሰዎች በመገለጫቸው ላይ «ቴሌግራም አገናኝ» ሲጫኑ ማሳወቂያዎች፣ የመቅረት መልእክቶችና አዲስ ውጤቶች በቴሌግራም ይደርሷቸዋል።'
          )}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {status && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-slate-800 text-sm">{t('Status', 'ሁኔታ')}</h2>
          <ul className="space-y-1.5 text-sm">
            <Check ok={status.configured} text={status.configured ? t(`Bot token set${status.username ? ` — @${status.username}` : ''}`, `የቦት ቁልፍ ገብቷል${status.username ? ` — @${status.username}` : ''}`) : t('TELEGRAM_BOT_TOKEN is not set on the server', 'TELEGRAM_BOT_TOKEN በሰርቨሩ ላይ አልገባም')} />
            {status.configured && (
              <Check
                ok={webhookOk}
                text={webhookOk ? t('Connected to this site', 'ከዚህ ድረ-ገጽ ጋር ተገናኝቷል') : status.webhook_url ? t(`Connected to another address: ${status.webhook_url}`, `ከሌላ አድራሻ ጋር ተገናኝቷል፦ ${status.webhook_url}`) : t('Not connected to this site yet', 'ገና ከዚህ ድረ-ገጽ ጋር አልተገናኘም')}
              />
            )}
            {status.last_error && <li className="text-xs text-amber-700">{t('Last error from Telegram', 'ከቴሌግራም የመጣ የመጨረሻ ስህተት')}: {status.last_error}</li>}
            <li className="text-slate-600">{t(`${status.linked_people} people have connected Telegram`, `${status.linked_people} ሰዎች ቴሌግራም አገናኝተዋል`)}</li>
          </ul>
          {status.can_configure && status.configured && (
            <button disabled={busy} onClick={connect} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
              <Link2 size={14} /> {webhookOk ? t('Connect again', 'እንደገና አገናኝ') : t('Connect the bot to this site', 'ቦቱን ከዚህ ድረ-ገጽ ጋር አገናኝ')}
            </button>
          )}
          {status.can_configure && !webhookOk && (
            <ol className="text-xs text-slate-600 list-decimal pl-5 space-y-1 border-t border-slate-100 pt-3">
              <li>{t('In Telegram, open @BotFather, send /newbot, give a name (e.g. “Hamere Hiwot Sunday School”) and a username ending in “bot”. Copy the token it gives you.', 'በቴሌግራም @BotFather ን ከፍተው /newbot ይላኩ፤ ስም (ለምሳሌ «Hamere Hiwot Sunday School») እና በ«bot» የሚያልቅ የተጠቃሚ ስም ይስጡ። የሚሰጥዎትን ቁልፍ (token) ይቅዱ።')}</li>
              <li>{t('On Render, open the site’s service → Environment → add TELEGRAM_BOT_TOKEN with that token (and SITE_URL with the site address, e.g. https://hamere-hiwot.onrender.com). Save and deploy.', 'በRender የድረ-ገጹን አገልግሎት ከፍተው → Environment → TELEGRAM_BOT_TOKEN በዚያ ቁልፍ ያስገቡ (SITE_URL ደግሞ በድረ-ገጹ አድራሻ፣ ለምሳሌ https://hamere-hiwot.onrender.com)። አስቀምጠው deploy ያድርጉ።')}</li>
              <li>{t('Open this page on the live site and press “Connect the bot to this site”.', 'ይህን ገጽ በቀጥታው ድረ-ገጽ ላይ ከፍተው «ቦቱን ከዚህ ድረ-ገጽ ጋር አገናኝ» ይጫኑ።')}</li>
              <li>{t('Then everyone connects from their profile with “Connect Telegram”.', 'ከዚያ ሁሉም ከመገለጫቸው «ቴሌግራም አገናኝ» በመጫን ይገናኛሉ።')}</li>
            </ol>
          )}
        </div>
      )}

      {status?.configured && (
        <form onSubmit={send} className="card p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
            <Send size={16} /> {t('Send a message', 'መልእክት ላክ')}
          </h2>
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className="form-input text-sm w-auto">
            <option value="EVERYONE">{audienceLabel('EVERYONE')}</option>
            <option value="STAFF">{audienceLabel('STAFF')}</option>
            <optgroup label={t('Students', 'ተማሪዎች')}>
              <option value="STUDENTS:ALL">{audienceLabel('STUDENTS:ALL')}</option>
              {status.classes.map((c) => <option key={c.id} value={`STUDENTS:${c.id}`}>{audienceLabel(`STUDENTS:${c.id}`)}</option>)}
            </optgroup>
            <optgroup label={t('Parents', 'ወላጆች')}>
              <option value="PARENTS:ALL">{audienceLabel('PARENTS:ALL')}</option>
              {status.classes.map((c) => <option key={c.id} value={`PARENTS:${c.id}`}>{audienceLabel(`PARENTS:${c.id}`)}</option>)}
            </optgroup>
          </select>
          {reach && (
            <p className="text-xs text-slate-500">
              {audience === 'EVERYONE'
                ? t(`Reaches ${reach.connected} people.`, `${reach.connected} ሰዎች ይደርሳቸዋል።`)
                : t(`Reaches ${reach.connected} of ${reach.people} — the others have not connected Telegram.`, `ከ${reach.people} ውስጥ ${reach.connected} ይደርሳቸዋል — ሌሎቹ ቴሌግራም አላገናኙም።`)}
            </p>
          )}
          <textarea required rows={4} maxLength={3500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('e.g. Sunday’s program starts at 8:00.', 'ለምሳሌ፦ የእሑድ መርሐ ግብር በ2:00 ይጀምራል።')} className="form-input text-sm" />
          <button type="submit" disabled={busy || !reach?.connected} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Send size={14} /> {t('Send', 'ላክ')}
          </button>

          {status.broadcasts.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{t('Sent', 'የተላኩ')}</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {status.broadcasts.map((b) => (
                  <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span className="text-slate-800 line-clamp-1 flex-1 min-w-[12rem]">{b.message}</span>
                    <span className="text-xs text-slate-500">
                      {audienceLabel(b.audience)} · {formatEthiopianDate(b.created_at.slice(0, 10), locale)} · {t(`${b.delivered}/${b.recipients} delivered`, `${b.recipients} ውስጥ ${b.delivered} ደርሷል`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`inline-flex items-center gap-1.5 w-full ${ok ? 'text-emerald-700' : 'text-slate-600'}`}>
      {ok ? <CheckCircle2 size={15} /> : <XCircle size={15} className="text-slate-400" />} {text}
    </li>
  );
}
