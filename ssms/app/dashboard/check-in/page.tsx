'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Expand, Lock, MapPin, Plus, QrCode, Search, UserPlus, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { CODE_SECONDS, FLAG_LABEL, KIND_LABEL, OPENS_BEFORE_MIN, addisDate, addisTime, checkinOpen, type CheckinEvent, type EventKind } from '@/lib/checkin/types';
import {
  closeCheckinEvent,
  createCheckinEvent,
  findPeople,
  liveCode,
  loadCheckinDetail,
  loadCheckinEvents,
  markPresent,
  reviewCheckin,
  type CheckinDetail,
  type CheckinEventsData,
} from './actions';

const KIND_STYLE: Record<EventKind, string> = {
  PROGRAM: 'bg-rose-50 text-rose-800',
  CHOIR: 'bg-violet-50 text-violet-800',
  OTHER: 'bg-slate-100 text-slate-700',
};

/** Leaders: open check-in for a program or rehearsal, show the changing code, and confirm who was there. */
export default function CheckinPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<CheckinEventsData | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  /** The time the lists are sorted by (open now / coming / earlier) */
  const [now, setNow] = useState(0);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadCheckinEvents>>) => {
    setNow(Date.now());
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadCheckinEvents().then(apply);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [apply]);
  const reload = () => loadCheckinEvents().then(apply);
  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const canRun = Boolean(data && (data.can_program || data.can_choir));
  const live = (data?.events ?? []).filter((e) => checkinOpen(e, now));
  const coming = (data?.events ?? []).filter((e) => e.status === 'OPEN' && !checkinOpen(e, now) && new Date(e.ends_at).getTime() > now);
  const past = (data?.events ?? []).filter((e) => !live.includes(e) && !coming.includes(e));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2">
            <QrCode size={22} /> {t('Check-in', 'መገኘት መመዝገቢያ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'People check themselves in at programs and choir rehearsals with the code on your screen. You only check the few that are flagged.',
              'ሰዎች በመርሐ ግብርና በመዝሙር ጥናት ላይ በስክሪንዎ ባለው ኮድ ራሳቸውን ያስመዘግባሉ። እርስዎ የተጠረጠሩትን ጥቂቶች ብቻ ያረጋግጣሉ።'
            )}
          </p>
        </div>
        {canRun && (
          <button onClick={() => setCreating(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start">
            <Plus size={14} /> {t('Open check-in', 'መመዝገቢያ ክፈት')}
          </button>
        )}
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {data && data.events.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500 space-y-2">
          <QrCode size={32} className="mx-auto text-slate-300" />
          <p>{t('No check-ins yet. Press “Open check-in” before a program or rehearsal.', 'እስካሁን መመዝገቢያ የለም። ከመርሐ ግብር ወይም ከጥናት በፊት «መመዝገቢያ ክፈት» ይጫኑ።')}</p>
        </div>
      )}

      {[
        [t('Open now', 'አሁን ክፍት'), live],
        [t('Coming', 'የሚመጡ'), coming],
        [t('Earlier', 'ያለፉ'), past],
      ].map(([label, list]) =>
        (list as CheckinEvent[]).length ? (
          <section key={label as string} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{label as string}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(list as CheckinEvent[]).map((ev) => (
                <button key={ev.id} onClick={() => setOpenId(ev.id)} className="card p-4 text-left hover:border-rose-300 transition-colors space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 leading-snug">{ev.title}</span>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${KIND_STYLE[ev.kind]}`}>{t(...KIND_LABEL[ev.kind])}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatEthiopianDate(addisDate(ev.starts_at), locale)} · {addisTime(ev.starts_at)}–{addisTime(ev.ends_at)}
                    {ev.has_place && <span className="ml-1 inline-flex items-center gap-0.5"><MapPin size={11} /> {ev.radius_m} m</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={14} /> {ev.present}</span>
                    {ev.flagged > 0 && <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><AlertTriangle size={14} /> {ev.flagged} {t('to check', 'ለማረጋገጥ')}</span>}
                    {ev.status === 'CLOSED' && <span className="ml-auto text-[11px] text-slate-400 inline-flex items-center gap-1"><Lock size={11} /> {t('Closed', 'ተዘግቷል')}</span>}
                    {checkinOpen(ev, now) && <span className="ml-auto text-[11px] text-emerald-700 font-semibold">● {t('Live', 'ክፍት')}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null
      )}

      {creating && data && (
        <CreateDialog
          data={data}
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            reload();
            setOpenId(id);
          }}
        />
      )}
      {openId && (
        <EventDialog
          eventId={openId}
          onClose={() => {
            setOpenId(null);
            reload();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function CreateDialog({ data, onClose, onDone }: { data: CheckinEventsData; onClose: () => void; onDone: (id: string) => void }) {
  const { t, locale } = useLang();
  const kinds = ([data.can_program && 'PROGRAM', data.can_choir && 'CHOIR', data.can_program && 'OTHER'].filter(Boolean) as EventKind[]);
  const [kind, setKind] = useState<EventKind>(kinds[0]);
  const [programId, setProgramId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('11:00');
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(200);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (list: { id: string; date: string; time: string | null }[], id: string) => {
    const x = list.find((y) => y.id === id);
    if (x) {
      setDate(x.date);
      if (x.time) setStart(x.time.slice(0, 5));
    }
  };
  const locate = () => {
    if (!navigator.geolocation) return setError(t('This browser cannot give a location.', 'ይህ አሳሽ ቦታ ማግኘት አይችልም።'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError(t('Could not get your location — allow location for this site, or open without a place.', 'ቦታዎን ማግኘት አልተቻለም — ለዚህ ድረ-ገጽ ቦታ ይፍቀዱ፣ ወይም ያለ ቦታ ይክፈቱ።'));
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await createCheckinEvent({ kind, program_id: programId, choir_session_id: sessionId, title, date, start, end, lat: place?.lat ?? null, lng: place?.lng ?? null, radius_m: radius });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.id);
  };
  const dateLabel = (iso: string) => formatEthiopianDate(iso, locale);

  return (
    <Modal isOpen onClose={onClose} maxWidth="lg" title={t('Open check-in', 'መመዝገቢያ ክፈት')}>
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`text-xs px-3 py-1.5 rounded-full border ${kind === k ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'}`}>
              {t(...KIND_LABEL[k])}
            </button>
          ))}
        </div>
        {kind === 'PROGRAM' && (
          <Field label={t('Program', 'መርሐ ግብር') + ' *'}>
            <select required value={programId} onChange={(e) => { setProgramId(e.target.value); pick(data.programs, e.target.value); }} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {data.programs.map((p) => <option key={p.id} value={p.id}>{dateLabel(p.date)} — {p.title}</option>)}
            </select>
            {data.programs.length === 0 && <p className="text-[11px] text-amber-700 mt-1">{t('No coming programs — add one under Programs first, or choose “Other gathering”.', 'የሚመጣ መርሐ ግብር የለም — በመርሐ ግብሮች ያስገቡ ወይም «ሌላ ስብሰባ» ይምረጡ።')}</p>}
          </Field>
        )}
        {kind === 'CHOIR' && (
          <Field label={t('Rehearsal', 'ጥናት') + ' *'}>
            <select required value={sessionId} onChange={(e) => { setSessionId(e.target.value); pick(data.choir, e.target.value); }} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {data.choir.map((c) => <option key={c.id} value={c.id}>{dateLabel(c.date)} — {c.title}</option>)}
            </select>
            {data.choir.length === 0 && <p className="text-[11px] text-amber-700 mt-1">{t('No coming rehearsals — add one under Sacred Arts → Choir first.', 'የሚመጣ ጥናት የለም — በመዝሙር ክፍል መጀመሪያ ያስገቡ።')}</p>}
          </Field>
        )}
        {kind === 'OTHER' && (
          <Field label={t('Name of the gathering', 'የስብሰባው ስም') + ' *'}>
            <input required minLength={2} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. General assembly', 'ለምሳሌ፦ ጠቅላላ ጉባኤ')} className="form-input text-sm" />
          </Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('Date', 'ቀን')}>
            <EthiopianDateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t('Starts', 'የሚጀምርበት')}>
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Ends', 'የሚያልቅበት')}>
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="form-input text-sm" />
          </Field>
        </div>
        <p className="text-[11px] text-slate-500">{t(`Check-in opens ${OPENS_BEFORE_MIN} minutes before the start and closes at the end (Addis Ababa time).`, `መመዝገቢያው ከመጀመሩ ${OPENS_BEFORE_MIN} ደቂቃ በፊት ይከፈታል፤ ሲያልቅ ይዘጋል።`)}</p>

        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><MapPin size={14} /> {t('Place (optional — checks that people are really there)', 'ቦታ (ካለ — ሰዎቹ እዚያ መሆናቸውን ያረጋግጣል)')}</div>
          {place ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-emerald-700 font-semibold">✓ {t('Place set', 'ቦታው ተቀምጧል')}</span>
              <span className="font-mono text-slate-500">{place.lat.toFixed(5)}, {place.lng.toFixed(5)}</span>
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="form-input text-xs py-1 w-auto">
                {[100, 200, 300, 500, 1000].map((r) => <option key={r} value={r}>{t(`within ${r} m`, `በ${r} ሜትር ውስጥ`)}</option>)}
              </select>
              <button type="button" onClick={() => setPlace(null)} className="text-slate-500 hover:text-red-600"><X size={14} /></button>
            </div>
          ) : (
            <>
              <button type="button" disabled={locating} onClick={locate} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                <MapPin size={13} /> {locating ? t('Finding you…', 'ቦታዎን በመፈለግ ላይ…') : t('Use where I am now (at the church)', 'አሁን ያለሁበትን ቦታ ተጠቀም (በቤተ ክርስቲያን)')}
              </button>
              <p className="text-[11px] text-slate-500">{t('Without a place, the code alone counts. With a place, people far away or without location are flagged for you.', 'ያለ ቦታ ኮዱ ብቻ ይበቃል። ቦታ ካለ፣ የራቁ ወይም ቦታ ያላጋሩ ለእርስዎ ይጠቆማሉ።')}</p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-50">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Open check-in', 'መመዝገቢያ ክፈት')}</button>
        </div>
      </form>
    </Modal>
  );
}

function EventDialog({ eventId, onClose, notify }: { eventId: string; onClose: () => void; notify: (kind: 'success' | 'error', text: string) => void }) {
  const { t, locale } = useLang();
  const [detail, setDetail] = useState<CheckinDetail | null>(null);
  const [code, setCode] = useState<{ code: string; seconds: number; open: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; code: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const codeBox = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    loadCheckinDetail(eventId).then((res) => {
      if (res.ok) setDetail(res.data);
      else notify('error', res.error);
    });
  }, [eventId, notify]);
  useEffect(() => {
    load();
  }, [load]);

  const ev = detail?.event;
  const isOpen = ev ? ev.status === 'OPEN' : false;
  const running = Boolean(detail?.can_run && isOpen);

  // The code: asked again when it changes; the list: every 10 s while open
  useEffect(() => {
    if (!running) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const res = await liveCode(eventId).catch(() => null);
      if (stop) return;
      if (res?.ok) setCode({ code: res.code, seconds: res.seconds, open: res.open });
      timer = setTimeout(tick, ((res?.ok ? res.seconds : 5) + 0.3) * 1000);
    };
    void tick();
    const list = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(list);
    };
  }, [running, eventId, load]);

  // Countdown between asks
  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setCode((c) => (c && c.seconds > 1 ? { ...c, seconds: c.seconds - 1 } : c)), 1000);
    return () => clearInterval(id);
  }, [code?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (search.trim().length < 2) return;
    const id = setTimeout(() => findPeople(search).then((res) => setFound(res.ok ? res.people : [])), 300);
    return () => clearTimeout(id);
  }, [search]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return notify('error', res.error ?? '');
    notify('success', msg);
    load();
  };
  const close = async () => {
    const choir = ev?.kind === 'CHOIR';
    if (!window.confirm(
      choir
        ? t('Close check-in? Unconfirmed ⚠ ones do not count. The choir attendance is written: checked in = present, other choir members = absent.', 'መመዝገቢያው ይዘጋ? ያልተረጋገጡ ⚠ አይቆጠሩም። የመዘምራን ክትትል ይጻፋል፦ የተመዘገቡ = ተገኝተዋል፣ ሌሎቹ = ቀርተዋል።')
        : t('Close check-in? Unconfirmed ⚠ ones do not count.', 'መመዝገቢያው ይዘጋ? ያልተረጋገጡ ⚠ አይቆጠሩም።')
    )) return;
    setBusy(true);
    const res = await closeCheckinEvent(eventId);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`Closed — ${res.present} present`, `ተዘግቷል — ${res.present} ተገኝተዋል`));
    load();
  };

  const rows = detail?.rows ?? [];
  const flagged = rows.filter((r) => r.status === 'FLAGGED');
  const present = rows.filter((r) => r.status === 'PRESENT');
  const removed = rows.filter((r) => r.status === 'REMOVED');
  const time = (iso: string) => addisTime(iso);

  return (
    <Modal isOpen onClose={onClose} maxWidth="2xl" title={ev?.title ?? '…'} subtitle={ev ? `${formatEthiopianDate(addisDate(ev.starts_at), locale)} · ${addisTime(ev.starts_at)}–${addisTime(ev.ends_at)}` : ''}>
      {!detail ? (
        <p className="text-sm text-slate-400 p-6 text-center">…</p>
      ) : (
        <div className="space-y-5">
          {/* The code */}
          {running && (
            <div ref={codeBox} className="rounded-2xl bg-slate-900 text-white p-6 text-center space-y-3 [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen]:rounded-none">
              {code && code.open ? (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{t('Check-in code', 'የመመዝገቢያ ኮድ')}</div>
                  <div className="font-mono font-bold tracking-[0.25em] text-7xl sm:text-8xl">{code.code}</div>
                  <div className="mx-auto max-w-xs h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-emerald-400 transition-all duration-1000 ease-linear" style={{ width: `${(code.seconds / CODE_SECONDS) * 100}%` }} />
                  </div>
                  <p className="text-sm text-slate-300">
                    {t('In the Telegram bot: tap “✅ I’m here” and type this code.', 'በቴሌግራም ቦቱ «✅ ተገኝቻለሁ» ይጫኑና ይህን ኮድ ይጻፉ።')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-300 py-6">
                  {t(`Check-in opens at ${addisTime(new Date(new Date(ev!.starts_at).getTime() - OPENS_BEFORE_MIN * 60_000).toISOString())}.`, `መመዝገቢያው በ${addisTime(new Date(new Date(ev!.starts_at).getTime() - OPENS_BEFORE_MIN * 60_000).toISOString())} ይከፈታል።`)}
                </p>
              )}
              <button
                onClick={() => codeBox.current?.requestFullscreen?.()}
                className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1"
              >
                <Expand size={13} /> {t('Full screen (for a projector)', 'ሙሉ ስክሪን (ለፕሮጀክተር)')}
              </button>
            </div>
          )}
          {!isOpen && <p className="text-sm text-slate-500 inline-flex items-center gap-1.5"><Lock size={14} /> {t('Check-in is closed.', 'መመዝገቢያው ተዘግቷል።')}</p>}

          <div className="grid grid-cols-3 gap-3">
            <Stat value={present.length} label={t('Present', 'ተገኝተዋል')} tone="text-emerald-700" />
            <Stat value={flagged.length} label={t('To check', 'ለማረጋገጥ')} tone={flagged.length ? 'text-amber-600' : 'text-slate-400'} />
            <Stat value={removed.length} label={t('Removed', 'ተወግደዋል')} tone="text-slate-400" />
          </div>

          {flagged.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <h4 className="text-xs font-bold text-amber-900 inline-flex items-center gap-1.5"><AlertTriangle size={14} /> {t('To check — were they really here?', 'ለማረጋገጥ — በእርግጥ እዚህ ነበሩ?')}</h4>
              <ul className="divide-y divide-amber-100">
                {flagged.map((r) => (
                  <li key={r.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900 flex-1 min-w-[10rem]">{r.name} <span className="text-[11px] font-mono text-slate-400">{r.code}</span></span>
                    <span className="text-xs text-amber-800">{r.flag ? t(...FLAG_LABEL[r.flag]) : ''}{r.distance_m !== null ? ` · ${r.distance_m} m` : ''} · {time(r.checked_at)}</span>
                    {running && (
                      <span className="flex gap-1">
                        <button disabled={busy} onClick={() => act(() => reviewCheckin(r.id, 'PRESENT'), t('Confirmed', 'ተረጋግጧል'))} className="btn btn-primary text-xs py-1">{t('Was here', 'ነበሩ')}</button>
                        <button disabled={busy} onClick={() => act(() => reviewCheckin(r.id, 'REMOVED'), t('Removed', 'ተወግዷል'))} className="btn btn-secondary text-xs py-1 text-red-600">{t('Was not', 'አልነበሩም')}</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {running && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5"><UserPlus size={14} /> {t('Mark someone present (no phone)', 'አንድ ሰው ተገኝቷል ብለህ መዝግብ (ስልክ የሌለው)')}</h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name, member ID or phone…', 'ስም፣ የአባልነት ቁጥር ወይም ስልክ…')} className="form-input text-sm pl-9" />
              </div>
              {search.trim().length >= 2 && found.length > 0 && (
                <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {found.map((p) => {
                    const already = rows.find((r) => r.person_id === p.id && r.status === 'PRESENT');
                    return (
                      <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                        <span>{p.name} <span className="text-[11px] font-mono text-slate-400">{p.code}</span></span>
                        {already ? (
                          <span className="text-xs text-emerald-700">✓ {t('present', 'ተገኝቷል')}</span>
                        ) : (
                          <button disabled={busy} onClick={() => act(() => markPresent(eventId, p.id), t(`${p.name} marked present`, `${p.name} ተገኝቷል ተብሏል`))} className="text-xs text-blue-600 font-semibold">+ {t('Present', 'ተገኝቷል')}</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-1.5">{t(`Present (${present.length})`, `የተገኙ (${present.length})`)}</h4>
            {present.length === 0 ? (
              <p className="text-xs text-slate-400">{t('Nobody yet.', 'እስካሁን ማንም የለም።')}</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                {present.map((r) => (
                  <li key={r.id} className="py-1.5 flex items-center gap-2 text-sm border-b border-slate-100">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="text-[11px] text-slate-400">{r.method === 'LEADER' ? t('by leader', 'በመሪ') : time(r.checked_at)}</span>
                    {running && (
                      <button disabled={busy} onClick={() => act(() => reviewCheckin(r.id, 'REMOVED'), t('Removed', 'ተወግዷል'))} className="text-slate-300 hover:text-red-600" aria-label={t('Remove', 'አስወግድ')}>
                        <X size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {running && (
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button disabled={busy} onClick={close} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                <Lock size={13} /> {t('Close check-in', 'መመዝገቢያውን ዝጋ')}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
