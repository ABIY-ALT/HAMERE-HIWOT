'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Info, Link2, Plus, RefreshCw, Search, Send, Trash2, Users, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { MAX_TOPICS, SUGGESTED_TOPICS, type AboutTopic } from '@/lib/telegram/about-topics';
import {
  connectBot,
  countAudience,
  disconnectTelegramChat,
  loadBotAbout,
  loadBotStatus,
  loadTelegramChats,
  refreshTelegramChat,
  saveBotAbout,
  sendBroadcast,
  type BotStatus,
  type TelegramChatRow,
} from '@/app/dashboard/telegram/actions';

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

      {status && <AboutEditor notify={notify} />}

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
                ? t(`Reaches ${reach.connected} Telegram chat(s).`, `${reach.connected} የቴሌግራም ቻት(ዎች) ይደርሳል።`)
                : t(`Reaches ${reach.connected} Telegram chat(s) · ${reach.people} people in this group (the others have not connected Telegram).`, `${reach.connected} የቴሌግራም ቻት(ዎች) ይደርሳል · በዚህ ቡድን ${reach.people} ሰዎች አሉ (ሌሎቹ ቴሌግራም አላገናኙም)።`)}
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

      {status?.configured && <ConnectedChats notify={notify} />}
    </div>
  );
}

/** ℹ️ About us: the topics anyone sees in the bot. */
function AboutEditor({ notify }: { notify: (kind: 'success' | 'error', text: string) => void }) {
  const { t } = useLang();
  const [topics, setTopics] = useState<AboutTopic[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadBotAbout>>) => {
    if (res.mode === 'live') setTopics(res.data.topics);
  }, []);
  useEffect(() => {
    loadBotAbout().then(apply);
  }, [apply]);
  if (!topics) return null;

  const newId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const change = (next: AboutTopic[]) => {
    setTopics(next);
    setDirty(true);
  };
  const edit = (id: string, key: keyof AboutTopic, value: string) => change(topics.map((x) => (x.id === id ? { ...x, [key]: value } : x)));
  const move = (i: number, by: number) => {
    const next = [...topics];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    change(next);
  };
  const add = () => {
    const topic = { id: newId(), title_am: '', title_en: '', body_am: '', body_en: '' };
    change([...topics, topic]);
    setOpen(topic.id);
  };
  const save = async () => {
    setBusy(true);
    const res = await saveBotAbout(topics);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    setDirty(false);
    notify('success', t('Saved — the bot shows it now', 'ተቀምጧል — ቦቱ አሁኑኑ ያሳያል'));
  };

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
          <Info size={16} /> {t('“About us” in the bot', 'በቦቱ «ስለ እኛ»')}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {t(
            'Anyone who finds the bot can read these — connected or not. Each topic is a button. A topic without text is not shown.',
            'ቦቱን ያገኘ ማንኛውም ሰው ያነባቸዋል — የተገናኘም ያልተገናኘም። እያንዳንዱ ርዕስ አዝራር ነው። ጽሑፍ የሌለው ርዕስ አይታይም።'
          )}
        </p>
      </div>
      {topics.length === 0 && (
        <button
          type="button"
          onClick={() => change(SUGGESTED_TOPICS.map((x) => ({ ...x, id: newId() })))}
          className="btn btn-secondary text-xs"
        >
          {t('Start from suggested topics', 'ከተጠቆሙ ርዕሶች ጀምር')}
        </button>
      )}
      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {topics.map((x, i) => (
          <li key={x.id} className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="flex-1 text-left text-sm font-medium text-slate-800">
                📖 {[x.title_am, x.title_en].filter(Boolean).join(' · ') || t('(no title)', '(ርዕስ የለውም)')}
                {!x.body_am && !x.body_en && <span className="ml-2 text-[11px] text-amber-700">{t('no text yet — not shown', 'ጽሑፍ የለውም — አይታይም')}</span>}
              </button>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t('Up', 'ወደ ላይ')}><ArrowUp size={14} /></button>
              <button type="button" disabled={i === topics.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t('Down', 'ወደ ታች')}><ArrowDown size={14} /></button>
              <button type="button" onClick={() => change(topics.filter((y) => y.id !== x.id))} className="p-1 text-slate-400 hover:text-red-600" aria-label={t('Remove', 'አስወግድ')}><Trash2 size={14} /></button>
            </div>
            {open === x.id && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={x.title_am} maxLength={60} onChange={(e) => edit(x.id, 'title_am', e.target.value)} placeholder="ርዕስ (አማርኛ)" className="form-input text-sm" />
                <input value={x.title_en} maxLength={60} onChange={(e) => edit(x.id, 'title_en', e.target.value)} placeholder="Title (English)" className="form-input text-sm" />
                <textarea value={x.body_am} maxLength={3000} rows={5} onChange={(e) => edit(x.id, 'body_am', e.target.value)} placeholder="ጽሑፍ (አማርኛ)" className="form-input text-sm" />
                <textarea value={x.body_en} maxLength={3000} rows={5} onChange={(e) => edit(x.id, 'body_en', e.target.value)} placeholder="Text (English)" className="form-input text-sm" />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-between gap-2">
        <button type="button" disabled={topics.length >= MAX_TOPICS} onClick={add} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
          <Plus size={14} /> {t('Add a topic', 'ርዕስ ጨምር')}
        </button>
        <button type="button" disabled={busy || !dirty} onClick={save} className="btn btn-primary text-xs disabled:opacity-50">
          {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}
        </button>
      </div>
    </div>
  );
}

type Role = 'ALL' | 'MEMBER' | 'STUDENT' | 'PARENT' | 'WAITING';

/** Who is connected, and what the bot treats each chat as: member, student, parent (or several). */
function ConnectedChats({ notify }: { notify: (kind: 'success' | 'error', text: string) => void }) {
  const { t, locale } = useLang();
  const [chats, setChats] = useState<TelegramChatRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState<Role>('ALL');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadTelegramChats>>) => {
    if (res.mode === 'live') {
      setChats(res.data.chats);
      setCanManage(res.data.can_manage);
    }
    if (res.mode === 'error') setError(res.error);
  }, []);
  useEffect(() => {
    loadTelegramChats().then(apply);
  }, [apply]);

  const refresh = async (chatId: number) => {
    setBusy(chatId);
    const res = await refreshTelegramChat(chatId);
    setBusy(null);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`Checked: ${res.added} added, ${res.removed} removed`, `ተፈትሿል፦ ${res.added} ተጨመሩ፣ ${res.removed} ተወገዱ`));
    loadTelegramChats().then(apply);
  };
  const disconnect = async (chatId: number) => {
    if (!window.confirm(t('Disconnect this chat? It stops getting messages until they connect again.', 'ይህን ቻት ይቋረጥ? እንደገና እስኪገናኙ መልእክት አይደርሳቸውም።'))) return;
    setBusy(chatId);
    const res = await disconnectTelegramChat(chatId);
    setBusy(null);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Disconnected', 'ተቋርጧል'));
    loadTelegramChats().then(apply);
  };

  if (error) return <p className="card p-4 text-sm text-red-700">{error}</p>;
  if (!chats) return null;
  const count = (r: Role) =>
    chats.filter((c) =>
      r === 'ALL' ? true : r === 'MEMBER' ? c.members.length > 0 : r === 'STUDENT' ? c.students.length > 0 : r === 'PARENT' ? c.children.length > 0 : c.waiting
    ).length;
  const needle = search.trim().toLowerCase();
  const shown = chats
    .filter((c) => (role === 'ALL' ? true : role === 'MEMBER' ? c.members.length > 0 : role === 'STUDENT' ? c.students.length > 0 : role === 'PARENT' ? c.children.length > 0 : c.waiting))
    .filter((c) => !needle || [c.telegram_name, c.phone, ...c.members, ...c.students, ...c.children].join(' ').toLowerCase().includes(needle));
  const roles: [Role, string][] = [
    ['ALL', t('All', 'ሁሉም')],
    ['MEMBER', t('🪪 Members', '🪪 አባላት')],
    ['STUDENT', t('🎓 Students', '🎓 ተማሪዎች')],
    ['PARENT', t('👨‍👩‍👧 Parents', '👨‍👩‍👧 ወላጆች')],
    ['WAITING', t('⏳ Not found yet', '⏳ ገና ያልተገኙ')],
  ];

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div>
          <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
            <Users size={16} /> {t(`Connected chats (${chats.length})`, `የተገናኙ ቻቶች (${chats.length})`)}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              'What the bot treats each chat as. A member: their own number is on a member record. A student: on their student record. A parent: their number is the guardian phone of a current student. Fix a wrong one on the record, then press ⟳.',
              'ቦቱ እያንዳንዱን ቻት እንደ ምን እንደሚያየው። አባል፦ ስልኩ በአባልነት መዝገብ ላይ ያለ። ተማሪ፦ በተማሪ መዝገቡ ላይ። ወላጅ፦ ስልኩ የአሁን ተማሪ የወላጅ ስልክ የሆነ። የተሳሳተ ካለ መዝገቡን አስተካክለው ⟳ ይጫኑ።'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {roles.map(([r, label]) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`text-xs px-2.5 py-1 rounded-full border ${role === r ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {label} · {count(r)}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name or phone…', 'ስም ወይም ስልክ…')} className="form-input text-xs pl-8 py-1.5 w-48" />
          </div>
        </div>
      </div>
      <div className="table-container rounded-none border-0">
        <table>
          <thead>
            <tr>
              <th>{t('Telegram', 'ቴሌግራም')}</th>
              <th>{t('The bot treats it as', 'ቦቱ የሚያየው እንደ')}</th>
              <th>{t('Connected', 'የተገናኘበት')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.chat_id}>
                <td>
                  <div className="font-medium text-slate-900">{c.telegram_name || '—'}</div>
                  <div className="text-[11px] font-mono text-slate-500">{c.phone || t('from the website', 'ከድረ-ገጹ')}</div>
                </td>
                <td className="text-xs space-y-0.5">
                  {c.members.length > 0 && <RoleLine tone="bg-rose-50 text-rose-800" label={t('🪪 Member', '🪪 አባል')} names={c.members} />}
                  {c.students.length > 0 && <RoleLine tone="bg-indigo-50 text-indigo-800" label={t('🎓 Student', '🎓 ተማሪ')} names={c.students} />}
                  {c.children.length > 0 && <RoleLine tone="bg-emerald-50 text-emerald-800" label={t('👨‍👩‍👧 Parent of', '👨‍👩‍👧 ወላጅ')} names={c.children} />}
                  {c.waiting && <span className="text-amber-700">{t('⏳ This number is on no record yet — add it to the member or student record.', '⏳ ይህ ስልክ ገና በምንም መዝገብ ላይ የለም — በአባል ወይም በተማሪ መዝገብ ላይ ያስገቡ።')}</span>}
                </td>
                <td className="text-xs text-slate-500 whitespace-nowrap">{c.connected_at ? formatEthiopianDate(c.connected_at.slice(0, 10), locale) : '—'}</td>
                <td className="text-right whitespace-nowrap">
                  {c.phone && (
                    <button disabled={busy === c.chat_id} onClick={() => refresh(c.chat_id)} title={t('Check the links again by the shared number', 'በተጋራው ስልክ እንደገና ፈትሽ')} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                      <RefreshCw size={14} />
                    </button>
                  )}
                  {canManage && (
                    <button disabled={busy === c.chat_id} onClick={() => disconnect(c.chat_id)} className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50">
                      {t('Disconnect', 'አቋርጥ')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-sm text-slate-400 py-8">{t('No chats', 'ምንም ቻት የለም')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleLine({ tone, label, names }: { tone: string; label: string; names: string[] }) {
  return (
    <div>
      <span className={`inline-block px-1.5 py-0.5 rounded font-semibold mr-1.5 ${tone}`}>{label}</span>
      <span className="text-slate-700">{names.join(', ')}</span>
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
