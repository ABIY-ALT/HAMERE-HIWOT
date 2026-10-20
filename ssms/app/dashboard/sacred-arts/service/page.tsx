'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronDown, ChevronRight, ClipboardList, Copy, MapPin, Shirt, Users } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ExportButton } from '@/components/ui/ExportButton';
import { RosterEditor, rateTone } from '@/components/choir/RosterEditor';
import { SessionVestments } from '@/components/choir/SessionVestments';
import { VestmentStore } from '@/components/choir/VestmentStore';
import { useChoir } from '@/lib/choir/client';
import { SESSION_KINDS, VOICE_PARTS, type ChoirMember, type ChoirSession } from '@/lib/choir/types';
import { MIN_RATE, RESPONSE_LABEL, takesRoster, type Roster, type ServiceData, type ServiceResponse } from '@/lib/choir/service';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import type { LoadMode } from '@/lib/admin/types';
import { loadService, setAssignmentResponse } from './actions';

const STATUS_BADGE = {
  NONE: { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: ['No roster yet', 'ገና አልተመደበም'] },
  DRAFT: { cls: 'bg-amber-50 text-amber-800 border-amber-200', label: ['Draft — not told', 'ረቂቅ — አልተነገረም'] },
  PUBLISHED: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: ['Published', 'ወጥቷል'] },
} as const;
const RESPONSE_STYLE: Record<ServiceResponse, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-red-100 text-red-700',
};

/** Service roster (ምደባ) from rehearsal attendance, and the choir's vestments (የክብር ልብስ). */
export default function ServiceRosterPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('CHOIR_MANAGE');
  const choir = useChoir();
  const today = todayIso();
  const [tab, setTab] = useState<'ROSTER' | 'VESTMENTS'>('ROSTER');
  const [view, setView] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<ServiceData | null>(null);
  const [editing, setEditing] = useState<ChoirSession | null>(null);
  const [dressing, setDressing] = useState<ChoirSession | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadService>>) => {
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadService().then(apply);
  }, [apply]);
  const reload = () => loadService().then(apply);
  const notify = (text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4500);
    if (kind === 'success') reload();
  };

  const rosterOf = (id: string): Roster | undefined => data?.rosters.find((r) => r.session_id === id);
  const services = choir.sessions.filter(takesRoster);
  const key = (s: ChoirSession) => `${s.date} ${s.start_time}`;
  const upcoming = services.filter((s) => s.status === 'PLANNED' && s.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const past = services.filter((s) => !(s.status === 'PLANNED' && s.date >= today)).sort((a, b) => key(b).localeCompare(key(a))).slice(0, 30);
  const rows = view === 'UPCOMING' ? upcoming : past;
  const memberById = new Map(choir.members.map((m) => [m.id, m]));
  const name = (m: ChoirMember | undefined) => (!m ? '—' : locale === 'am' ? m.name_am : m.name);

  const upcomingAssignments = upcoming.flatMap((s) => (rosterOf(s.id)?.status === 'PUBLISHED' ? rosterOf(s.id)!.assignments : []));
  const waiting = upcomingAssignments.filter((a) => a.response === 'PENDING').length;
  const declined = upcomingAssignments.filter((a) => a.response === 'DECLINED').length;
  const notMade = upcoming.filter((s) => (rosterOf(s.id)?.status ?? 'NONE') !== 'PUBLISHED').length;
  const overdue = (data?.loans ?? []).filter((l) => !l.returned_at && l.due_on < today).length;

  /** The roster as text, to paste in the Telegram group like the paper used to be */
  const rosterText = (s: ChoirSession) => {
    const r = rosterOf(s.id);
    const list = (r?.assignments ?? []).map((a, i) => `${i + 1}. ${name(memberById.get(a.member_id))}${a.role ? ` — ${a.role}` : ''}`);
    return [
      `🎵 ${s.title || t('Service', 'አገልግሎት')}`,
      `📅 ${formatEthiopianDate(s.date, 'am', { weekday: true })}${s.start_time ? ` · ${s.start_time}` : ''}`,
      s.location ? `📍 ${s.location}` : '',
      '',
      `የተመደቡ · On the roster (${list.length}):`,
      ...list,
      '',
      'ምደባዎን በቦቱ «🎵 ምደባዬ» ያረጋግጡ · Confirm in the bot: “🎵 My roster”',
    ].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n');
  };
  const copy = async (s: ChoirSession) => {
    try {
      await navigator.clipboard.writeText(rosterText(s));
      notify(t('Copied — paste it in the Telegram group', 'ተቀድቷል — በቴሌግራም ግሩፑ ይለጥፉት'));
    } catch {
      notify(t('Could not copy on this device', 'በዚህ መሣሪያ መቅዳት አልተቻለም'), 'error');
    }
  };
  const exportRoster = (s: ChoirSession) => (format: ExportFormat) => {
    const r = rosterOf(s.id);
    return exportTable(
      `roster_${s.date}`,
      [t('No.', 'ተ.ቁ'), t('Name', 'ስም'), t('Phone', 'ስልክ'), t('Voice', 'ድምፅ'), t('Part', 'ድርሻ'), t('Rehearsal %', 'የጥናት %'), t('Answer', 'መልስ'), t('Reason', 'ምክንያት'), t('Vestment', 'የክብር ልብስ')],
      (r?.assignments ?? []).map((a, i) => {
        const m = memberById.get(a.member_id);
        const loan = (data?.loans ?? []).find((l) => l.session_id === s.id && l.person_id === m?.person_id);
        return [i + 1, name(m), m?.phone ?? '', m ? t(...VOICE_PARTS[m.voice_part]) : '', a.role, a.rate, t(...RESPONSE_LABEL[a.response]), a.response_note, loan ? `${loan.vestment}${loan.returned_at ? ` (${t('returned', 'ተመልሷል')})` : ''}` : ''];
      }),
      format,
      { sheet: 'Roster', widths: [5, 28, 14, 10, 18, 11, 14, 30, 24] }
    );
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Service roster & vestments', 'የአገልግሎት ምደባና የክብር ልብስ')}</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            {t(
              'Choose who serves from their rehearsal attendance, publish the roster to everyone in the Telegram bot, and keep track of the vestments given out and brought back.',
              'የሚያገለግሉትን ከጥናት ተገኝነታቸው ይምረጡ፣ ምደባውን በቴሌግራም ቦቱ ለሁሉም ያውጡ፣ የተሰጡትንና የተመለሱትን የክብር ልብሶች ይከታተሉ።'
            )}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start bg-white">
          {(['ROSTER', 'VESTMENTS'] as const).map((v) => (
            <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 ${tab === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {v === 'ROSTER' ? <><Users size={14} /> {t('Rosters', 'ምደባ')}</> : <><Shirt size={14} /> {t('Vestments', 'የክብር ልብስ')}{overdue > 0 && <span className="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[10px]">{overdue}</span>}</>}
            </button>
          ))}
        </div>
      </div>

      <AdminModeNotice mode={choir.mode === 'error' ? 'error' : mode} error={choir.mode === 'error' ? choir.error : error} />
      {mode === 'demo' && <p className="text-sm text-slate-500">{t('The service roster needs the database.', 'የአገልግሎት ምደባ ዳታቤዝ ያስፈልገዋል።')}</p>}

      {data && tab === 'VESTMENTS' && (
        <VestmentStore vestments={data.vestments} loans={data.loans} members={choir.members} services={upcoming} canManage={canManage} onDone={notify} />
      )}

      {data && tab === 'ROSTER' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi value={upcoming.length} label={t('Upcoming services', 'የሚመጡ አገልግሎቶች')} />
            <Kpi value={notMade} label={t('Roster not out yet', 'ምደባ ያልወጣላቸው')} tone={notMade ? 'text-amber-600' : undefined} />
            <Kpi value={waiting} label={t('Not answered yet', 'ገና ያልመለሱ')} />
            <Kpi value={declined} label={t('Can’t come', 'አንችልም ያሉ')} tone={declined ? 'text-red-600' : undefined} />
          </div>

          <div className="card overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {(['UPCOMING', 'PAST'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {v === 'UPCOMING' ? `${t('Upcoming', 'የሚመጡ')} (${upcoming.length})` : `${t('Past', 'ያለፉ')} (${past.length})`}
                  </button>
                ))}
              </div>
              <Link href="/dashboard/sacred-arts/choir" className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1">
                <CalendarClock size={13} /> {t('Plan a service / take rehearsal attendance', 'አገልግሎት ያዝ / የጥናት ተገኝነት ያዝ')}
              </Link>
            </div>

            <ul className="divide-y divide-slate-100">
              {rows.map((s) => (
                <ServiceRow
                  key={s.id}
                  session={s}
                  roster={rosterOf(s.id)}
                  members={choir.members}
                  loansOut={(data.loans ?? []).filter((l) => l.session_id === s.id && !l.returned_at).length}
                  canManage={canManage}
                  isUpcoming={view === 'UPCOMING'}
                  onEdit={() => setEditing(s)}
                  onDress={() => setDressing(s)}
                  onCopy={() => copy(s)}
                  onExport={exportRoster(s)}
                  onDone={notify}
                />
              ))}
              {choir.mode !== 'loading' && rows.length === 0 && (
                <li className="p-10 text-center text-sm text-slate-500">
                  <ClipboardList size={26} className="mx-auto text-slate-300 mb-2" />
                  {view === 'UPCOMING'
                    ? t('No service planned. Plan one on “Rehearsals & Services” with the kind “Service” or “Performance”.', 'የታቀደ አገልግሎት የለም። በ«ልምምድና አገልግሎት» ዓይነቱን «አገልግሎት» ወይም «ዝግጅት» አድርገው ይያዙ።')
                    : t('No past services.', 'ያለፈ አገልግሎት የለም።')}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {editing && (
        <RosterEditor
          session={editing}
          roster={rosterOf(editing.id)}
          members={choir.members}
          sessions={choir.sessions}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            notify(text);
          }}
        />
      )}
      {dressing && data && (
        <SessionVestments
          session={dressing}
          roster={rosterOf(dressing.id)}
          members={choir.members}
          vestments={data.vestments}
          loans={data.loans}
          onClose={() => setDressing(null)}
          onDone={notify}
        />
      )}
    </div>
  );
}

function ServiceRow({
  session: s,
  roster,
  members,
  loansOut,
  canManage,
  isUpcoming,
  onEdit,
  onDress,
  onCopy,
  onExport,
  onDone,
}: {
  session: ChoirSession;
  roster: Roster | undefined;
  members: ChoirMember[];
  loansOut: number;
  canManage: boolean;
  isUpcoming: boolean;
  onEdit: () => void;
  onDress: () => void;
  onCopy: () => void;
  onExport: (format: ExportFormat) => Promise<void> | void;
  onDone: (text: string, kind?: 'success' | 'error') => void;
}) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const status = roster?.status ?? 'NONE';
  const list = roster?.assignments ?? [];
  const by = (r: ServiceResponse) => list.filter((a) => a.response === r).length;
  const byId = new Map(members.map((m) => [m.id, m]));
  const badge = STATUS_BADGE[status];

  const mark = async (id: string, response: ServiceResponse) => {
    const note = response === 'DECLINED' ? window.prompt(t('Reason (optional)', 'ምክንያት (አማራጭ)')) ?? '' : '';
    const res = await setAssignmentResponse(id, response, note);
    onDone(res.ok ? t('Saved', 'ተቀምጧል') : res.error, res.ok ? 'success' : 'error');
  };

  return (
    <li className={`p-4 ${s.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        <div className="lg:w-48 shrink-0">
          <div className="text-sm font-semibold text-slate-900">{formatEthiopianDate(s.date, locale, { weekday: true })}</div>
          <div className="text-[11px] text-slate-400 font-mono">{s.date}{s.start_time && ` · ${s.start_time}`}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{s.title || t(...SESSION_KINDS[s.kind])}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{t(...SESSION_KINDS[s.kind])}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{t(badge.label[0], badge.label[1])}</span>
            {s.status === 'CANCELLED' && <span className="text-[11px] text-red-600 font-semibold">{t('Cancelled', 'ተሰርዟል')}</span>}
          </div>
          {s.location && <div className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1"><MapPin size={11} />{s.location}</div>}
          {list.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs text-slate-600 inline-flex flex-wrap items-center gap-x-3 gap-y-1 hover:text-slate-900">
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span><b>{list.length}</b> {t('on the roster', 'ተመድበዋል')}</span>
              {status === 'PUBLISHED' && (
                <>
                  <span className="text-emerald-700">✓ {by('CONFIRMED')}</span>
                  <span className="text-red-600">✕ {by('DECLINED')}</span>
                  <span className="text-slate-500">⏳ {by('PENDING')}</span>
                </>
              )}
              {loansOut > 0 && <span className="text-blue-700">👘 {loansOut} {t('out', 'የወጡ')}</span>}
              {roster?.min_rate != null && <span className="text-slate-400">{t('rule', 'መስፈርት')} ≥{roster.min_rate}% · {roster.weeks} {t('wk', 'ሳምንት')}</span>}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-end shrink-0">
          {canManage && isUpcoming && s.status === 'PLANNED' && (
            <button onClick={onEdit} className="btn btn-primary text-xs py-1.5 inline-flex items-center gap-1">
              <Users size={13} /> {status === 'NONE' ? t('Make roster', 'ምደባ አውጣ') : t('Edit roster', 'ምደባ አርትዕ')}
            </button>
          )}
          {canManage && s.status !== 'CANCELLED' && (
            <button onClick={onDress} className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1">
              <Shirt size={13} /> {t('Vestments', 'የክብር ልብስ')}
            </button>
          )}
          {list.length > 0 && (
            <>
              <button onClick={onCopy} title={t('Copy the list for the Telegram group', 'ዝርዝሩን ለቴሌግራም ግሩፕ ቅዳ')} className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1">
                <Copy size={13} /> {t('Copy', 'ቅዳ')}
              </button>
              <ExportButton onExport={onExport} />
            </>
          )}
        </div>
      </div>

      {open && list.length > 0 && (
        <ul className="mt-3 lg:ml-48 border border-slate-200 rounded-xl divide-y divide-slate-100">
          {list.map((a, i) => {
            const m = byId.get(a.member_id);
            const tone = rateTone(a.rate, roster?.min_rate ?? MIN_RATE);
            return (
              <li key={a.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                <span className="text-xs text-slate-400 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-900">{m ? (locale === 'am' ? m.name_am : m.name) : '—'}</span>
                  <span className="text-[11px] text-slate-500 ml-2">{[m ? t(...VOICE_PARTS[m.voice_part]) : '', a.role].filter(Boolean).join(' · ')}</span>
                  {a.response === 'DECLINED' && a.response_note && <div className="text-[11px] text-red-600">“{a.response_note}”</div>}
                </div>
                <span className={`text-xs font-semibold tabular-nums ${tone.text}`} title={t('Rehearsal attendance when put on the roster', 'ሲመደቡ የነበራቸው የጥናት ተገኝነት')}>
                  {a.rate === null ? '—' : `${a.rate}%`}
                </span>
                {status === 'PUBLISHED' &&
                  (canManage && isUpcoming ? (
                    <select
                      value={a.response}
                      onChange={(e) => mark(a.id, e.target.value as ServiceResponse)}
                      className={`text-[11px] rounded px-1.5 py-0.5 border-0 font-semibold ${RESPONSE_STYLE[a.response]}`}
                      aria-label={t('Answer', 'መልስ')}
                    >
                      {(Object.keys(RESPONSE_LABEL) as ServiceResponse[]).map((r) => <option key={r} value={r}>{t(...RESPONSE_LABEL[r])}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${RESPONSE_STYLE[a.response]}`}>{t(...RESPONSE_LABEL[a.response])}</span>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Kpi({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
