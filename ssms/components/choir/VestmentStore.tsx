'use client';

// The choir's vestment store (የክብር ልብስ) — separate from the property register.
// Every vestment, who holds it and until when; add, give out, receive back,
// remind the holders of overdue ones in the bot, export.

import React, { useState } from 'react';
import { AlertCircle, BellRing, Layers, Plus, Search, Shirt } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import type { ChoirMember, ChoirSession } from '@/lib/choir/types';
import {
  CONDITION_LABEL,
  KIND_SUGGESTIONS,
  VESTMENT_STATUS_LABEL,
  dayAfter,
  isOverdue,
  vestmentLabel,
  type Vestment,
  type VestmentLoan,
  type VestmentStatus,
} from '@/lib/choir/service';
import { addVestments, issueVestments, remindOverdue, saveVestment, type VestmentInput } from '@/app/dashboard/sacred-arts/service/actions';
import { ReturnControl } from './SessionVestments';

type Notify = (text: string, kind?: 'success' | 'error') => void;
type Filter = 'ALL' | 'AVAILABLE' | 'OUT' | 'OVERDUE' | 'REPAIR' | 'GONE';

const STATUS_STYLE: Record<VestmentStatus, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OUT: 'bg-blue-50 text-blue-700 border-blue-200',
  REPAIR: 'bg-amber-50 text-amber-800 border-amber-200',
  RETIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  LOST: 'bg-red-50 text-red-700 border-red-200',
};
const EMPTY: VestmentInput = { code: '', kind: '', size: '', condition: 'GOOD', status: 'AVAILABLE', notes: '' };

export function VestmentStore({
  vestments,
  loans,
  members,
  services,
  canManage,
  onDone,
}: {
  vestments: Vestment[];
  loans: VestmentLoan[];
  members: ChoirMember[];
  /** Upcoming services, to say what a vestment is for */
  services: ChoirSession[];
  canManage: boolean;
  onDone: Notify;
}) {
  const { t, locale } = useLang();
  const pair = (p: [string, string]) => t(p[0], p[1]);
  const today = todayIso();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vestment | 'new' | null>(null);
  const [batch, setBatch] = useState(false);
  const [giving, setGiving] = useState<Vestment | null>(null);
  const [history, setHistory] = useState(false);

  const open = new Map(loans.filter((l) => !l.returned_at).map((l) => [l.vestment_id, l]));
  const overdue = loans.filter((l) => isOverdue(l, today));
  const count = (s: VestmentStatus) => vestments.filter((v) => v.status === s).length;
  const q = search.trim().toLowerCase();
  const shown = vestments.filter((v) => {
    const loan = open.get(v.id);
    const okFilter =
      filter === 'ALL' ||
      (filter === 'OVERDUE' ? Boolean(loan && isOverdue(loan, today)) : filter === 'GONE' ? v.status === 'RETIRED' || v.status === 'LOST' : v.status === filter);
    const okSearch = !q || `${vestmentLabel(v)} ${loan?.person ?? ''}`.toLowerCase().includes(q);
    return okFilter && okSearch;
  });
  const returned = loans.filter((l) => l.returned_at).sort((a, b) => (b.returned_at ?? '').localeCompare(a.returned_at ?? ''));

  const remind = async () => {
    if (!window.confirm(t(`Send a reminder in the bot to everyone holding an overdue vestment (${overdue.length})?`, `የመመለሻ ቀናቸው ያለፈ (${overdue.length}) የክብር ልብስ ለያዙ ሁሉ በቦቱ ማስታወሻ ይላክ?`))) return;
    const res = await remindOverdue();
    if (!res.ok) return onDone(res.error, 'error');
    onDone(t(`Reminder going out to ${res.people} person(s)`, `ማስታወሻ ለ${res.people} ሰው እየተላከ ነው`));
  };

  const exportStore = (format: ExportFormat) =>
    exportTable(
      `vestments_${today}`,
      [t('Code', 'ቁጥር'), t('Kind', 'ዓይነት'), t('Size', 'መጠን'), t('Condition', 'ሁኔታ'), t('Status', 'ያለበት'), t('Held by', 'የያዘው'), t('Phone', 'ስልክ'), t('For', 'ለ'), t('Given on', 'የተሰጠበት'), t('Due back', 'የሚመለስበት'), t('Overdue', 'ያለፈ'), t('Times used', 'የተሰጠበት ብዛት'), t('Notes', 'ማስታወሻ')],
      shown.map((v) => {
        const l = open.get(v.id);
        return [
          v.code, v.kind, v.size, pair(CONDITION_LABEL[v.condition]), pair(VESTMENT_STATUS_LABEL[v.status]),
          l?.person ?? '', l?.phone ?? '', l?.session ?? '', l ? formatEthiopianDate(l.issued_at.slice(0, 10), locale) : '',
          l ? formatEthiopianDate(l.due_on, locale) : '', l && isOverdue(l, today) ? t('Yes', 'አዎ') : '', v.uses, v.notes,
        ];
      }),
      format,
      { sheet: 'Vestments', widths: [12, 18, 8, 10, 14, 26, 14, 30, 14, 14, 8, 10, 30] }
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi value={vestments.length} label={t('Vestments', 'የክብር ልብሶች')} />
        <Kpi value={count('AVAILABLE')} label={t('In the store', 'መጋዘን ውስጥ')} tone="text-emerald-700" />
        <Kpi value={count('OUT')} label={t('Given out', 'የተሰጡ')} tone="text-blue-700" />
        <Kpi value={overdue.length} label={t('Overdue', 'ጊዜው ያለፈ')} tone={overdue.length ? 'text-red-600' : undefined} />
        <Kpi value={count('REPAIR')} label={t('Being repaired', 'በጥገና ላይ')} tone={count('REPAIR') ? 'text-amber-700' : undefined} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          {(['ALL', 'AVAILABLE', 'OUT', 'OVERDUE', 'REPAIR', 'GONE'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {{ ALL: t('All', 'ሁሉም'), AVAILABLE: t('In store', 'መጋዘን'), OUT: t('Given out', 'የተሰጡ'), OVERDUE: t('Overdue', 'ጊዜው ያለፈ'), REPAIR: t('Repair', 'ጥገና'), GONE: t('Retired / lost', 'የወጡ / የጠፉ') }[f]}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Code or person…', 'ቁጥር ወይም ሰው…')} className="form-input text-xs py-1.5 pl-7 w-44" />
          </div>
          <ExportButton onExport={exportStore} disabled={shown.length === 0} />
          {canManage && overdue.length > 0 && (
            <button onClick={remind} className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1 text-red-700">
              <BellRing size={13} /> {t('Remind overdue', 'ያለፈባቸውን አስታውስ')} ({overdue.length})
            </button>
          )}
          {canManage && (
            <>
              <button onClick={() => setBatch(true)} className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1"><Layers size={13} /> {t('Add several', 'ብዙ ጨምር')}</button>
              <button onClick={() => setEditing('new')} className="btn btn-primary text-xs py-1.5 inline-flex items-center gap-1"><Plus size={13} /> {t('Add vestment', 'የክብር ልብስ ጨምር')}</button>
            </>
          )}
        </div>

        {vestments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Shirt size={28} className="mx-auto text-slate-300 mb-2" />
            {t('No vestments registered yet. Use “Add several” to register a whole set at once (e.g. KB-001 … KB-040).', 'ገና የተመዘገበ የክብር ልብስ የለም። «ብዙ ጨምር»ን ተጠቅመው ሙሉውን በአንድ ጊዜ ይመዝግቡ (ለምሳሌ KB-001 … KB-040)።')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">{t('Vestment', 'የክብር ልብስ')}</th>
                  <th className="text-left px-3 py-2">{t('Status', 'ያለበት')}</th>
                  <th className="text-left px-3 py-2">{t('Held by', 'የያዘው')}</th>
                  <th className="text-right px-3 py-2">{t('Used', 'ተሰጥቷል')}</th>
                  {canManage && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((v) => {
                  const l = open.get(v.id);
                  const late = l && isOverdue(l, today);
                  return (
                    <tr key={v.id} className={v.status === 'RETIRED' || v.status === 'LOST' ? 'opacity-60' : ''}>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900 font-mono text-xs">{v.code}</div>
                        <div className="text-[11px] text-slate-500">{[v.kind, v.size, v.condition !== 'GOOD' ? pair(CONDITION_LABEL[v.condition]) : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${late ? 'bg-red-50 text-red-700 border-red-200' : STATUS_STYLE[v.status]}`}>
                          {late ? t('Overdue', 'ጊዜው ያለፈ') : pair(VESTMENT_STATUS_LABEL[v.status])}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {l ? (
                          <>
                            <div className="text-slate-900 font-medium">{l.person}</div>
                            <div className={late ? 'text-red-600' : 'text-slate-500'}>
                              {t('back by', 'የሚመለስበት')} {formatEthiopianDate(l.due_on, locale)}
                              {l.reminded_at && <span className="text-slate-400"> · {t('reminded', 'ተታውሷል')}</span>}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{v.uses}</td>
                      {canManage && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {l ? (
                            <ReturnControl loan={l} onDone={onDone} />
                          ) : v.status === 'AVAILABLE' ? (
                            <button onClick={() => setGiving(v)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50">{t('Give out', 'ስጥ')}</button>
                          ) : null}
                          <button onClick={() => setEditing(v)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded hover:bg-slate-50">{t('Edit', 'አርትዕ')}</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-slate-400">{t('Nothing here.', 'እዚህ ምንም የለም።')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {returned.length > 0 && (
        <div className="card overflow-hidden">
          <button onClick={() => setHistory((h) => !h)} className="w-full p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {history ? '▾' : '▸'} {t('Received back — last 90 days', 'የተመለሱ — ያለፉት 90 ቀናት')} ({returned.length})
          </button>
          {history && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {returned.map((l) => (
                <li key={l.id} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-mono font-semibold text-slate-800">{l.vestment}</span>
                  <span className="text-slate-700">{l.person}</span>
                  <span className="text-slate-500">
                    {formatEthiopianDate(l.issued_at.slice(0, 10), locale)} → {formatEthiopianDate((l.returned_at ?? '').slice(0, 10), locale)}
                  </span>
                  {l.return_condition && l.return_condition !== 'GOOD' && (
                    <span className={l.return_condition === 'LOST' || l.return_condition === 'DAMAGED' ? 'text-red-600 font-semibold' : 'text-amber-700'}>{pair(CONDITION_LABEL[l.return_condition])}</span>
                  )}
                  {(l.returned_at ?? '').slice(0, 10) > l.due_on && <span className="text-amber-700">{t('late', 'ዘግይቶ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <VestmentForm vestment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(text, kind) => { onDone(text, kind); if (kind !== 'error') setEditing(null); }} />}
      {batch && <BatchForm onClose={() => setBatch(false)} onDone={(text, kind) => { onDone(text, kind); if (kind !== 'error') setBatch(false); }} />}
      {giving && (
        <GiveForm vestment={giving} members={members} services={services} onClose={() => setGiving(null)} onDone={(text, kind) => { onDone(text, kind); if (kind !== 'error') setGiving(null); }} />
      )}
    </div>
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

function Err({ text }: { text: string }) {
  return text ? <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16} /> {text}</div> : null;
}

function KindList() {
  const { locale } = useLang();
  return (
    <datalist id="vestment-kinds">
      {KIND_SUGGESTIONS.map(([en, am]) => <option key={en} value={locale === 'am' ? am : en} />)}
    </datalist>
  );
}

function VestmentForm({ vestment, onClose, onDone }: { vestment: Vestment | null; onClose: () => void; onDone: Notify }) {
  const { t } = useLang();
  const [form, setForm] = useState<VestmentInput>(
    vestment
      ? { code: vestment.code, kind: vestment.kind, size: vestment.size, condition: vestment.condition, status: vestment.status === 'OUT' ? 'AVAILABLE' : vestment.status, notes: vestment.notes }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof VestmentInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveVestment(vestment?.id ?? null, form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t('Saved', 'ተቀምጧል'));
  };
  return (
    <Modal isOpen onClose={onClose} title={vestment ? t('Edit vestment', 'የክብር ልብስ አርትዕ') : t('Add vestment', 'የክብር ልብስ ጨምር')}>
      <form onSubmit={submit} className="space-y-3">
        <Err text={error} />
        <KindList />
        <div className="grid grid-cols-2 gap-3">
          <L label={t('Number / code', 'ቁጥር') + ' *'}><input required value={form.code} onChange={set('code')} placeholder="KB-001" className="form-input text-sm font-mono" /></L>
          <L label={t('Size', 'መጠን')}><input value={form.size} onChange={set('size')} placeholder="S / M / L / XL" className="form-input text-sm" /></L>
        </div>
        <L label={t('Kind', 'ዓይነት') + ' *'}><input required list="vestment-kinds" value={form.kind} onChange={set('kind')} className="form-input text-sm" /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label={t('Condition', 'ሁኔታ')}>
            <select value={form.condition} onChange={set('condition')} className="form-input text-sm">
              {(['GOOD', 'WORN', 'DAMAGED'] as const).map((c) => <option key={c} value={c}>{t(...CONDITION_LABEL[c])}</option>)}
            </select>
          </L>
          {vestment?.status === 'OUT' ? (
            <L label={t('Status', 'ያለበት')}><p className="text-sm text-blue-700 py-2">{t('Given out — receive it back first', 'ተሰጥቷል — መጀመሪያ ይመለስ')}</p></L>
          ) : (
            <L label={t('Status', 'ያለበት')}>
              <select value={form.status} onChange={set('status')} className="form-input text-sm">
                {(['AVAILABLE', 'REPAIR', 'RETIRED', 'LOST'] as const).map((s) => <option key={s} value={s}>{t(...VESTMENT_STATUS_LABEL[s])}</option>)}
              </select>
            </L>
          )}
        </div>
        <L label={t('Notes', 'ማስታወሻ')}><input value={form.notes} onChange={set('notes')} className="form-input text-sm" /></L>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function BatchForm({ onClose, onDone }: { onClose: () => void; onDone: Notify }) {
  const { t } = useLang();
  const [prefix, setPrefix] = useState('KB-');
  const [from, setFrom] = useState(1);
  const [count, setCount] = useState(20);
  const [kind, setKind] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const width = Math.max(3, String(from + count - 1).length);
  const code = (n: number) => `${prefix.toUpperCase()}${String(n).padStart(width, '0')}`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await addVestments({ prefix, from, count, kind, size });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t(`${res.added} vestments added`, `${res.added} የክብር ልብሶች ተጨምረዋል`));
  };
  return (
    <Modal isOpen onClose={onClose} title={t('Add several vestments', 'ብዙ የክብር ልብሶች ጨምር')} subtitle={t('Same kind and size, numbered one after another', 'አንድ ዓይነትና መጠን፣ በተከታታይ ቁጥር')}>
      <form onSubmit={submit} className="space-y-3">
        <Err text={error} />
        <KindList />
        <div className="grid grid-cols-3 gap-3">
          <L label={t('Code starts with', 'ቁጥሩ የሚጀምረው')}><input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="form-input text-sm font-mono" /></L>
          <L label={t('From number', 'ከቁጥር')}><input type="number" min={0} value={from} onChange={(e) => setFrom(Number(e.target.value) || 0)} className="form-input text-sm" /></L>
          <L label={t('How many', 'ብዛት')}><input type="number" min={1} max={300} value={count} onChange={(e) => setCount(Number(e.target.value) || 0)} className="form-input text-sm" /></L>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L label={t('Kind', 'ዓይነት') + ' *'}><input required list="vestment-kinds" value={kind} onChange={(e) => setKind(e.target.value)} className="form-input text-sm" /></L>
          <L label={t('Size', 'መጠን')}><input value={size} onChange={(e) => setSize(e.target.value)} className="form-input text-sm" /></L>
        </div>
        {count > 0 && <p className="text-xs text-slate-500">{t('Will add', 'የሚጨመሩት')}: <span className="font-mono">{code(from)}</span>{count > 1 && <> … <span className="font-mono">{code(from + count - 1)}</span></>}</p>}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          <button type="submit" disabled={busy || count < 1} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t(`Add ${count}`, `${count} ጨምር`)}</button>
        </div>
      </form>
    </Modal>
  );
}

function GiveForm({ vestment, members, services, onClose, onDone }: { vestment: Vestment; members: ChoirMember[]; services: ChoirSession[]; onClose: () => void; onDone: Notify }) {
  const { t, locale } = useLang();
  const today = todayIso();
  const [person, setPerson] = useState('');
  const [session, setSession] = useState('');
  const [due, setDue] = useState(dayAfter(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickSession = (id: string) => {
    setSession(id);
    const s = services.find((x) => x.id === id);
    if (s) setDue(dayAfter(s.date));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await issueVestments([{ vestment_id: vestment.id, person_id: person, session_id: session, due_on: due }]);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t('Given out — they were told in the bot', 'ተሰጥቷል — በቦቱ ተነግሯቸዋል'));
  };
  return (
    <Modal isOpen onClose={onClose} title={`${t('Give out', 'ስጥ')} — ${vestmentLabel(vestment)}`}>
      <form onSubmit={submit} className="space-y-3">
        <Err text={error} />
        <L label={t('To', 'ለ') + ' *'}>
          <select required value={person} onChange={(e) => setPerson(e.target.value)} className="form-input text-sm">
            <option value="">—</option>
            {members.filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.person_id}>{locale === 'am' ? m.name_am : m.name}</option>)}
          </select>
        </L>
        <L label={t('For which service', 'ለየትኛው አገልግሎት')}>
          <select value={session} onChange={(e) => pickSession(e.target.value)} className="form-input text-sm">
            <option value="">—</option>
            {services.map((s) => <option key={s.id} value={s.id}>{formatEthiopianDate(s.date, locale)} · {s.title || t('Service', 'አገልግሎት')}</option>)}
          </select>
        </L>
        <L label={t('Bring back by', 'የሚመለስበት ቀን') + ' *'}>
          <input type="date" required min={today} value={due} onChange={(e) => setDue(e.target.value)} className="form-input text-sm" />
          <p className="text-[11px] text-slate-400 mt-1">{formatEthiopianDate(due, locale, { weekday: true })}</p>
        </L>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          <button type="submit" disabled={busy || !person} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Give out', 'ስጥ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
