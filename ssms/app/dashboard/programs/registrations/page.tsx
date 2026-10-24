'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Globe, MapPin, Search, Ticket, Undo2, UserPlus, Users, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { QrScanButton } from '@/components/common/QrScanButton';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { cn } from '@/lib/utils';
import { MAX_SEATS_OFFICE, REG_SOURCES, seatsLeft, type RegEvent, type Registration } from '@/lib/events/types';
import {
  addRegistration,
  cancelRegistration,
  checkInAtDoor,
  findMembers,
  loadRegEvents,
  loadRegistrations,
  saveRegSettings,
  setCheckedIn,
  type DoorResult,
} from './actions';

type Filter = 'OPEN' | 'COMING' | 'PAST';
type Toast = { kind: 'success' | 'error'; text: string } | null;

const addisTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' });

/**
 * Programs → Sign-up & tickets: open a program for sign-up (website and bot),
 * see who registered, and check people in at the door by ticket, member card
 * or phone.
 */
export default function RegistrationsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [events, setEvents] = useState<RegEvent[]>([]);
  const [canRun, setCanRun] = useState(false);
  const [filter, setFilter] = useState<Filter>('COMING');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const reload = useCallback(() => {
    loadRegEvents().then((res) => {
      if (res.mode === 'live') {
        setEvents(res.data.events);
        setCanRun(res.data.can_run);
        // Opened from a program's page: /dashboard/programs/registrations?program=<id>
        const wanted = new URLSearchParams(window.location.search).get('program');
        if (wanted && res.data.events.some((e) => e.id === wanted)) setSelectedId((cur) => cur ?? wanted);
      }
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const today = todayIso();
  const isPast = (e: RegEvent) => (e.end_date ?? e.start_date) < today || e.status === 'COMPLETED' || e.status === 'CANCELLED';
  const lists: Record<Filter, RegEvent[]> = {
    OPEN: events.filter((e) => e.settings.open && !isPast(e)),
    COMING: events.filter((e) => !isPast(e)),
    PAST: events.filter(isPast).reverse(),
  };
  const tabs: [Filter, string][] = [
    ['COMING', `${t('Coming', 'የሚመጡ')} (${lists.COMING.length})`],
    ['OPEN', `${t('Open for sign-up', 'ምዝገባ ክፍት')} (${lists.OPEN.length})`],
    ['PAST', `${t('Recent', 'ያለፉ')} (${lists.PAST.length})`],
  ];
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const patchEvent = (id: string, patch: Partial<RegEvent>) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Event sign-up & tickets', 'የመርሐ ግብር ምዝገባና ትኬት')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Open a program for sign-up: people register on the website (programs shown on the website) or with the Telegram bot, and get a ticket code. At the door, scan the ticket or the member card.',
            'ፕሮግራሙን ለምዝገባ ይክፈቱ፦ ሰዎች በድረ-ገጹ (በድረ-ገጹ ላይ ለሚታዩ ፕሮግራሞች) ወይም በቴሌግራም ቦቱ ተመዝግበው የመግቢያ ኮድ ያገኛሉ። በመግቢያው ላይ ትኬቱን ወይም የአባልነት ካርዱን ይቃኙ።'
          )}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border', filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
                >
                  {label}
                </button>
              ))}
            </div>
            {lists[filter].length === 0 && (
              <div className="card p-6 text-center text-sm text-slate-500">
                {filter === 'OPEN' ? t('No program is open for sign-up. Choose one under “Coming” to open it.', 'ለምዝገባ ክፍት የሆነ ፕሮግራም የለም። ለመክፈት ከ«የሚመጡ» ይምረጡ።') : (
                  <>
                    {t('No programs here. Create one under ', 'እዚህ ፕሮግራም የለም። በ')}
                    <Link href="/dashboard/programs" className="font-semibold text-blue-600 hover:underline">{t('Programs', 'ፕሮግራሞች')}</Link>
                    {t('.', ' ስር ይፍጠሩ።')}
                  </>
                )}
              </div>
            )}
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {lists[filter].map((e) => {
                const left = seatsLeft(e.settings.capacity, e.seats);
                return (
                  <button key={e.id} onClick={() => setSelectedId(e.id)} className={cn('w-full text-left p-3 hover:bg-slate-50 space-y-1', selectedId === e.id && 'bg-blue-50/60')}>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-slate-700">{formatEthiopianDate(e.start_date, locale)}</span>
                      {e.start_time && <span className="text-slate-400">{e.start_time}</span>}
                      {e.settings.open && !isPast(e) && <span className="badge badge-success">{t('Sign-up open', 'ምዝገባ ክፍት')}</span>}
                      {e.status === 'CANCELLED' && <span className="badge badge-danger">{t('Cancelled', 'ተሰርዟል')}</span>}
                    </div>
                    <div className="font-semibold text-sm text-slate-900 truncate">{locale === 'am' ? e.title_am : e.title_en}</div>
                    {(e.people > 0 || e.settings.open) && (
                      <div className="text-xs text-slate-500">
                        {t(`${e.people} registered · ${e.seats} people`, `${e.people} ምዝገባ · ${e.seats} ሰዎች`)}
                        {left !== null && ` · ${t(`${left} left`, `${left} ቀርቷል`)}`}
                        {e.arrived > 0 && ` · ${t(`${e.arrived} arrived`, `${e.arrived} ደርሰዋል`)}`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {selected ? (
              <EventPanel key={selected.id} event={selected} canRun={canRun} notify={notify} onChange={(patch) => patchEvent(selected.id, patch)} />
            ) : (
              <div className="card p-10 text-center text-sm text-slate-500">
                <Ticket className="mx-auto mb-2 text-slate-300" size={32} />
                {t('Choose a program on the left.', 'በግራ በኩል ፕሮግራም ይምረጡ።')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventPanel({ event, canRun, notify, onChange }: { event: RegEvent; canRun: boolean; notify: (k: 'success' | 'error', text: string) => void; onChange: (patch: Partial<RegEvent>) => void }) {
  const { t, locale } = useLang();
  const [regs, setRegs] = useState<Registration[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<null | { name: string; phone: string; person_id: string; checkIn: boolean }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadRegistrations(event.id).then((res) => {
      if (res.ok) setRegs(res.registrations);
      else setLoadError(res.error);
    });
  }, [event.id]);
  useEffect(refresh, [refresh]);

  // The numbers on the left follow the list
  const sync = (list: Registration[]) => {
    setRegs(list);
    const live = list.filter((r) => r.status === 'REGISTERED');
    onChange({ people: live.length, seats: live.reduce((s, r) => s + r.seats, 0), arrived: live.filter((r) => r.checked_in_at).reduce((s, r) => s + r.seats, 0) });
  };
  const upsert = (r: Registration) => regs && sync(regs.some((x) => x.id === r.id) ? regs.map((x) => (x.id === r.id ? r : x)) : [...regs, r]);

  const toggleArrived = async (r: Registration) => {
    setBusyId(r.id);
    const res = await setCheckedIn(r.id, !r.checked_in_at);
    setBusyId(null);
    if (!res.ok) return notify('error', res.error);
    upsert({ ...r, checked_in_at: r.checked_in_at ? null : new Date().toISOString() });
  };
  const cancel = async (r: Registration) => {
    if (!window.confirm(t(`Cancel ${r.full_name}'s registration? Their places become free again.`, `የ${r.full_name} ምዝገባ ይሰረዝ? ቦታቸው ለሌሎች ክፍት ይሆናል።`))) return;
    setBusyId(r.id);
    const res = await cancelRegistration(r.id);
    setBusyId(null);
    if (!res.ok) return notify('error', res.error);
    upsert({ ...r, status: 'CANCELLED' });
  };

  const q = search.trim().toLowerCase();
  const shown = (regs ?? []).filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.phone.includes(q) || r.ticket_code.toLowerCase().includes(q) || r.member_code.toLowerCase().includes(q));
  const live = (regs ?? []).filter((r) => r.status === 'REGISTERED');
  const left = seatsLeft(event.settings.capacity, event.seats);
  const over = (event.end_date ?? event.start_date) < todayIso() || event.status === 'COMPLETED' || event.status === 'CANCELLED';

  const doExport = (format: ExportFormat) =>
    exportTable(
      `signup-${event.title_en}`,
      [t('Ticket', 'ትኬት'), t('Name', 'ስም'), t('Phone', 'ስልክ'), t('Member code', 'የአባል መለያ'), t('People', 'ሰዎች'), t('From', 'ከ'), t('Status', 'ሁኔታ'), t('Arrived', 'የደረሰበት'), t('Note', 'ማስታወሻ'), t('Registered', 'የተመዘገበበት')],
      (regs ?? []).map((r) => [
        r.ticket_code, r.full_name, r.phone, r.member_code, r.seats, t(...REG_SOURCES[r.source]),
        r.status === 'CANCELLED' ? t('Cancelled', 'ተሰርዟል') : t('Registered', 'ተመዝግቧል'),
        r.checked_in_at ? addisTime(r.checked_in_at) : '', r.note, `${formatEthiopianDate(r.created_at.slice(0, 10), locale)} ${addisTime(r.created_at)}`,
      ]),
      format,
      { sheet: 'Sign-up', widths: [10, 30, 14, 14, 8, 12, 12, 10, 24, 22] }
    );

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{formatEthiopianDate(event.start_date, locale)}{event.end_date && event.end_date !== event.start_date ? ` → ${formatEthiopianDate(event.end_date, locale)}` : ''}</span>
          {event.start_time && <span>{event.start_time}</span>}
          {event.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {event.location}</span>}
          {event.is_public ? (
            <span className="badge badge-success inline-flex items-center gap-1"><Globe size={11} /> {t('On the website', 'በድረ-ገጹ ላይ')}</span>
          ) : (
            <span className="badge badge-warning">{t('Internal: sign-up by bot only', 'የውስጥ፦ ምዝገባ በቦት ብቻ')}</span>
          )}
        </div>
        <h2 className="text-lg font-bold text-slate-900">{locale === 'am' ? event.title_am : event.title_en}</h2>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Stat label={t('Registered', 'ተመዝግበዋል')} value={`${event.people}`} sub={t(`${event.seats} people`, `${event.seats} ሰዎች`)} />
          <Stat label={t('Places left', 'የቀሩ ቦታዎች')} value={left === null ? '∞' : `${left}`} sub={event.settings.capacity ? t(`of ${event.settings.capacity}`, `ከ${event.settings.capacity}`) : t('no limit', 'ገደብ የለም')} />
          <Stat label={t('Arrived', 'ደርሰዋል')} value={`${event.arrived}`} sub={event.seats ? `${Math.round((event.arrived / event.seats) * 100)}%` : ''} />
        </div>
      </div>

      {event.can_manage && !over && <SettingsCard event={event} notify={notify} onSaved={(settings) => onChange({ settings })} />}

      {canRun && event.status !== 'CANCELLED' && (
        <DoorCard
          event={event}
          notify={notify}
          onResult={(r) => upsert(r)}
          onAddMember={(m) => setAdding({ name: m.name, phone: m.phone, person_id: m.id, checkIn: true })}
        />
      )}

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-slate-900 mr-auto inline-flex items-center gap-2"><Users size={16} /> {t('Who registered', 'የተመዘገቡ')} ({live.length})</h3>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name, phone, ticket…', 'ስም፣ ስልክ፣ ትኬት…')} className="form-input pl-8 py-1.5 text-xs w-44" />
          </div>
          <ExportButton onExport={doExport} disabled={!regs?.length} />
          {canRun && event.status !== 'CANCELLED' && (
            <button onClick={() => setAdding({ name: '', phone: '', person_id: '', checkIn: false })} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <UserPlus size={14} /> {t('Add person', 'ሰው ጨምር')}
            </button>
          )}
        </div>
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {regs === null && !loadError && <p className="text-sm text-slate-400">{t('Loading…', 'በመጫን ላይ…')}</p>}
        {regs?.length === 0 && <p className="text-sm text-slate-500">{t('Nobody has registered yet.', 'እስካሁን የተመዘገበ የለም።')}</p>}
        {shown.length > 0 && (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">{t('Ticket', 'ትኬት')}</th>
                  <th className="px-2 py-2 font-semibold">{t('Name', 'ስም')}</th>
                  <th className="px-2 py-2 font-semibold">{t('Phone', 'ስልክ')}</th>
                  <th className="px-2 py-2 font-semibold text-center">{t('People', 'ሰዎች')}</th>
                  <th className="px-2 py-2 font-semibold">{t('From', 'ከ')}</th>
                  <th className="px-2 py-2 font-semibold">{t('Arrived', 'ደርሷል')}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shown.map((r) => (
                  <tr key={r.id} className={cn(r.status === 'CANCELLED' && 'opacity-50')}>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.ticket_code}</td>
                    <td className="px-2 py-2">
                      <div className={cn('font-semibold text-slate-900', r.status === 'CANCELLED' && 'line-through')}>{r.full_name}</div>
                      {(r.member_code || r.note) && <div className="text-slate-400">{[r.member_code, r.note].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{r.phone}</td>
                    <td className="px-2 py-2 text-center">{r.seats}</td>
                    <td className="px-2 py-2 text-slate-500">{t(...REG_SOURCES[r.source])}</td>
                    <td className="px-2 py-2">
                      {r.status === 'CANCELLED' ? (
                        <span className="text-red-600">{t('Cancelled', 'ተሰርዟል')}</span>
                      ) : r.checked_in_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> {addisTime(r.checked_in_at)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {canRun && r.status === 'REGISTERED' && (
                        <div className="flex justify-end gap-1">
                          <button disabled={busyId === r.id} onClick={() => toggleArrived(r)} className="btn btn-secondary text-[11px] px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50">
                            {r.checked_in_at ? <><Undo2 size={12} /> {t('Undo', 'መልስ')}</> : <><CheckCircle2 size={12} /> {t('Arrived', 'ደርሷል')}</>}
                          </button>
                          {event.can_manage && !r.checked_in_at && (
                            <button disabled={busyId === r.id} onClick={() => cancel(r)} title={t('Cancel registration', 'ምዝገባ ሰርዝ')} className="btn btn-secondary text-[11px] px-2 py-1 text-red-600 disabled:opacity-50">
                              <XCircle size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <AddModal
          event={event}
          initial={adding}
          onClose={() => setAdding(null)}
          onAdded={(r) => {
            setAdding(null);
            upsert(r);
            notify('success', r.checked_in_at ? t(`${r.full_name} added and checked in`, `${r.full_name} ተጨምሮ ገብቷል`) : t(`${r.full_name} added — ticket ${r.ticket_code}`, `${r.full_name} ተጨምሯል — ትኬት ${r.ticket_code}`));
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function SettingsCard({ event, notify, onSaved }: { event: RegEvent; notify: (k: 'success' | 'error', text: string) => void; onSaved: (s: RegEvent['settings']) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(event.settings.open);
  const [capacity, setCapacity] = useState(event.settings.capacity ? String(event.settings.capacity) : '');
  const [closesOn, setClosesOn] = useState(event.settings.closes_on ?? '');
  const [busy, setBusy] = useState(false);
  const changed = open !== event.settings.open || capacity !== (event.settings.capacity ? String(event.settings.capacity) : '') || closesOn !== (event.settings.closes_on ?? '');

  const save = async () => {
    setBusy(true);
    const res = await saveRegSettings(event.id, { open, capacity, closes_on: closesOn });
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    onSaved({ open, capacity: capacity ? Number(capacity) : null, closes_on: closesOn || null });
    notify('success', open ? t('Sign-up is open', 'ምዝገባ ተከፍቷል') : t('Sign-up settings saved', 'የምዝገባ ቅንብሮች ተቀምጠዋል'));
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900">{t('Sign-up', 'ምዝገባ')}</h3>
        <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="h-4 w-4" />
          {open ? t('Open', 'ክፍት') : t('Closed', 'ዝግ')}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="reg-cap" className="block text-xs font-semibold text-slate-600 mb-1">{t('Places (empty = no limit)', 'የቦታ ብዛት (ባዶ = ገደብ የለም)')}</label>
          <input id="reg-cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="form-input" />
        </div>
        <div>
          <label htmlFor="reg-close" className="block text-xs font-semibold text-slate-600 mb-1">{t('Last day to sign up (optional)', 'የመጨረሻ የምዝገባ ቀን (አማራጭ)')}</label>
          <EthiopianDateInput id="reg-close" value={closesOn} onChange={setClosesOn} optional yearsBack={0} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {event.is_public
          ? t('Open: a “Register” button shows under this event on the website, and members can register from the Telegram bot (📅 Events).', 'ክፍት ሲሆን፦ በድረ-ገጹ ላይ ከዚህ መርሐ ግብር ስር «ይመዝገቡ» ይታያል፤ አባላትም በቴሌግራም ቦቱ (📅 መርሐ ግብር) መመዝገብ ይችላሉ።')
          : t('This program is not on the website, so only members can register, from the Telegram bot (📅 Events). Add it under Public Website → Events to let anyone register.', 'ይህ ፕሮግራም በድረ-ገጹ ላይ ስለሌለ አባላት ብቻ በቴሌግራም ቦቱ (📅 መርሐ ግብር) ይመዘገባሉ። ማንም እንዲመዘገብ በ«የሕዝብ ድረ-ገጽ → መርሐ ግብሮች» ስር ይጨምሩት።')}
        {!event.is_public && (
          <Link href="/dashboard/website/events" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:underline">
            <ExternalLink size={11} /> {t('Website events', 'የድረ-ገጽ መርሐ ግብሮች')}
          </Link>
        )}
      </p>
      <button disabled={!changed || busy} onClick={save} className="btn btn-primary text-xs disabled:opacity-50">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
    </div>
  );
}

function DoorCard({ event, notify, onResult, onAddMember }: {
  event: RegEvent;
  notify: (k: 'success' | 'error', text: string) => void;
  onResult: (r: Registration) => void;
  onAddMember: (m: { id: string; name: string; phone: string }) => void;
}) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<DoorResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    const res = await checkInAtDoor(event.id, value);
    setBusy(false);
    setLast(res);
    if (res.ok) {
      onResult(res.registration);
      setCode('');
    } else if (!res.member) notify('error', res.error);
    input.current?.focus();
  };

  return (
    <div className="card p-4 space-y-3 border-blue-200">
      <h3 className="font-bold text-slate-900 inline-flex items-center gap-2"><Ticket size={16} /> {t('At the door', 'በመግቢያው ላይ')}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(code);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          ref={input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('Ticket code, member code or phone', 'የትኬት ኮድ፣ የአባል መለያ ወይም ስልክ')}
          className="form-input flex-1 min-w-[12rem] font-mono uppercase"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !code.trim()} className="btn btn-primary text-xs disabled:opacity-50">{busy ? '…' : t('Check in', 'አስገባ')}</button>
        <QrScanButton onScan={(v) => { setCode(v); run(v); }} />
      </form>
      {last?.ok && (
        <div className={cn('rounded-xl p-3 text-sm', last.already ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200')}>
          <div className="font-bold">
            {last.already ? '⚠️ ' : '✓ '}
            {last.registration.full_name}
            {last.registration.seats > 1 ? ` · ${last.registration.seats} ${t('people', 'ሰዎች')}` : ''}
          </div>
          <div className="text-xs">
            {last.already
              ? t(`Already checked in at ${addisTime(last.registration.checked_in_at!)}`, `ቀድሞ ገብቷል (${addisTime(last.registration.checked_in_at!)})`)
              : t(`Ticket ${last.registration.ticket_code} — welcome!`, `ትኬት ${last.registration.ticket_code} — እንኳን ደህና መጡ!`)}
          </div>
        </div>
      )}
      {last && !last.ok && last.member && (
        <div className="rounded-xl p-3 text-sm bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-3">
          <span className="flex-1">{t(`${last.member.name} has not signed up for this program.`, `${last.member.name} ለዚህ ፕሮግራም አልተመዘገቡም።`)}</span>
          <button onClick={() => onAddMember(last.member!)} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><UserPlus size={13} /> {t('Add and check in', 'ጨምርና አስገባ')}</button>
        </div>
      )}
    </div>
  );
}

function AddModal({ event, initial, onClose, onAdded }: {
  event: RegEvent;
  initial: { name: string; phone: string; person_id: string; checkIn: boolean };
  onClose: () => void;
  onAdded: (r: Registration) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [personId, setPersonId] = useState(initial.person_id);
  const [seats, setSeats] = useState('1');
  const [note, setNote] = useState('');
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; code: string; phone: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(() => {
      findMembers(query).then((res) => setFound(res.ok ? res.people : []));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);
  const matches = useMemo(() => (query.trim().length < 2 ? [] : found), [query, found]);

  const save = async () => {
    setBusy(true);
    setError('');
    const res = await addRegistration(event.id, { name, phone, seats, note, person_id: personId }, checkIn);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onAdded(res.registration);
  };

  const label = 'block text-xs font-semibold text-slate-600 mb-1';
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Add a person', 'ሰው ጨምር')}
      subtitle={t('Walk-ins and people who registered by phone. Office additions are allowed after sign-up closes and beyond the places.', 'በቦታው የመጡና በስልክ የተመዘገቡ። ጽ/ቤቱ ምዝገባ ከተዘጋ በኋላም ከቦታ ብዛት በላይም መጨመር ይችላል።')}
      maxWidth="md"
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button disabled={busy || name.trim().length < 2} onClick={save} className="btn btn-primary text-xs disabled:opacity-50">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Add', 'ጨምር')}</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!personId ? (
          <div>
            <label htmlFor="add-find" className={label}>{t('A member? Find by name or code', 'አባል ከሆኑ፦ በስም ወይም በመለያ ይፈልጉ')}</label>
            <input id="add-find" value={query} onChange={(e) => setQuery(e.target.value)} className="form-input" placeholder={t('Optional', 'አማራጭ')} />
            {matches.length > 0 && (
              <ul className="mt-1 rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPersonId(p.id);
                        setName(p.name.split(' · ')[0]);
                        setPhone(p.phone);
                        setQuery('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {p.name} <span className="text-xs text-slate-400">{p.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
            <span>{t('Member', 'አባል')}: <b>{name}</b></span>
            <button type="button" onClick={() => { setPersonId(''); setName(''); setPhone(''); }} className="text-xs text-blue-700 hover:underline">{t('Change', 'ቀይር')}</button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="add-name" className={label}>{t('Full name', 'ሙሉ ስም')}</label>
            <input id="add-name" value={name} onChange={(e) => setName(e.target.value)} className="form-input" disabled={Boolean(personId)} />
          </div>
          <div>
            <label htmlFor="add-phone" className={label}>{t('Phone (optional)', 'ስልክ (አማራጭ)')}</label>
            <input id="add-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="form-input" placeholder="09…" />
          </div>
          <div>
            <label htmlFor="add-seats" className={label}>{t('How many people', 'ስንት ሰው')}</label>
            <input id="add-seats" type="number" min={1} max={MAX_SEATS_OFFICE} value={seats} onChange={(e) => setSeats(e.target.value)} className="form-input" />
          </div>
          <div>
            <label htmlFor="add-note" className={label}>{t('Note (optional)', 'ማስታወሻ (አማራጭ)')}</label>
            <input id="add-note" value={note} onChange={(e) => setNote(e.target.value)} className="form-input" maxLength={300} />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} className="h-4 w-4" />
          {t('They are here now — check in at once', 'አሁን ደርሰዋል — ወዲያው አስገባ')}
        </label>
      </div>
    </Modal>
  );
}
