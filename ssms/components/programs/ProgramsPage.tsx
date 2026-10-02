'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CalendarPlus, CheckCircle2, Clock, Download, MapPin, Pencil, Search, UserRound, Users, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { MOCK_EVENTS, MOCK_PROGRAMS } from '@/lib/mock/modules';
import { PROGRAM_TYPES, type Program, type ProgramOptions, type ProgramStatus, type ProgramType } from '@/lib/programs/types';
import type { LoadMode } from '@/lib/admin/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { loadPrograms, saveProgram, setProgramStatus, type ProgramInput } from '@/app/dashboard/programs/actions';

type Tab = 'UPCOMING' | 'PAST' | 'ALL';

const STATUS_STYLE: Record<ProgramStatus, string> = {
  PLANNED: 'badge badge-info',
  CONFIRMED: 'badge badge-warning',
  COMPLETED: 'badge badge-success',
  CANCELLED: 'badge bg-slate-100 text-slate-500',
};

function demoPrograms(): Program[] {
  const typeOf = (x: string): ProgramType =>
    x === 'Conference' ? 'CONFERENCE' : x === 'Assembly' ? 'ASSEMBLY' : x === 'Holiday' ? 'HOLIDAY' : x === 'Academic' ? 'ACADEMIC' : 'OTHER';
  const statusOf = (x: string): ProgramStatus => (x === 'COMPLETED' ? 'COMPLETED' : x === 'DRAFT' ? 'PLANNED' : 'CONFIRMED');
  return [
    ...MOCK_PROGRAMS.map((p) => ({
      id: p.id, title_en: p.title_en, title_am: p.title_am, type: typeOf(p.type), unit_id: null, unit: p.dept, unit_am: p.dept,
      start_date: p.date, start_time: p.time, end_date: null, location: p.location, coordinator_id: null, coordinator: p.coordinator,
      expected: p.participants, actual: null, description: '', outcome: '', status: statusOf(p.status), created_by_id: null,
    })),
    ...MOCK_EVENTS.map((e) => ({
      id: e.id, title_en: e.title_en, title_am: e.title_am, type: typeOf(e.type), unit_id: null, unit: e.responsible, unit_am: e.responsible,
      start_date: e.date, start_time: '', end_date: null, location: '', coordinator_id: null, coordinator: '',
      expected: null, actual: null, description: '', outcome: '', status: statusOf(e.status), created_by_id: null,
    })),
  ];
}

const EMPTY_FORM: ProgramInput = {
  title_en: '', title_am: '', type: 'ASSEMBLY', unit_id: '', start_date: '', start_time: '', end_date: '',
  location: '', coordinator_id: '', expected: '', description: '',
};

export function ProgramsPage({
  types,
  defaultType,
  title,
  subtitle,
}: {
  /** Program types shown on this page (all when omitted). */
  types?: ProgramType[];
  defaultType: ProgramType;
  title: [string, string];
  subtitle: [string, string];
}) {
  const { t, locale } = useLang();
  const { user, can } = useAuth();
  const canCreate = can('PROGRAM_CREATE') || can('PROGRAM_MANAGE');
  const myId = user?.systemUser.id ?? '';

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [options, setOptions] = useState<ProgramOptions>({ units: [], people: [] });
  const [tab, setTab] = useState<Tab>('UPCOMING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ProgramType>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProgramInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [outcome, setOutcome] = useState('');

  const typeLabel = (x: ProgramType) => (locale === 'am' ? PROGRAM_TYPES[x][1] : PROGRAM_TYPES[x][0]);
  const statusLabel = (s: ProgramStatus) =>
    ({ PLANNED: t('Planned', 'የታቀደ'), CONFIRMED: t('Confirmed', 'የተረጋገጠ'), COMPLETED: t('Held', 'ተካሂዷል'), CANCELLED: t('Cancelled', 'ተሰርዟል') })[s];

  const apply = useCallback((res: Awaited<ReturnType<typeof loadPrograms>>) => {
    if (res.mode === 'live') {
      setPrograms(res.data.programs);
      setOptions({ units: res.data.units, people: res.data.people });
    } else if (res.mode === 'demo') {
      setPrograms((p) => (p.length ? p : demoPrograms()));
    } else {
      setError(res.error);
    }
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadPrograms().then(apply);
  }, [apply]);

  const showToast = (k: 'success' | 'error', text: string) => {
    setToast({ kind: k, text });
    setTimeout(() => setToast(null), 3500);
  };

  const today = todayIso();
  const mine = programs.filter((p) => !types || types.includes(p.type));
  const isPast = (p: Program) => p.status === 'COMPLETED' || p.status === 'CANCELLED' || (p.end_date ?? p.start_date) < today;
  const needsReport = (p: Program) => (p.status === 'PLANNED' || p.status === 'CONFIRMED') && (p.end_date ?? p.start_date) < today;
  const canChange = (p: Program) => can('PROGRAM_MANAGE') || (p.created_by_id !== null && p.created_by_id === myId);

  const needle = search.toLowerCase();
  const rows = mine
    .filter((p) => (tab === 'UPCOMING' ? !isPast(p) : tab === 'PAST' ? isPast(p) : true))
    .filter((p) => typeFilter === 'ALL' || p.type === typeFilter)
    .filter(
      (p) =>
        (locale === 'am' ? p.title_am : p.title_en).toLowerCase().includes(needle) ||
        p.location.toLowerCase().includes(needle) ||
        p.coordinator.toLowerCase().includes(needle) ||
        (locale === 'am' ? p.unit_am : p.unit).toLowerCase().includes(needle)
    )
    .sort((a, b) => (tab === 'UPCOMING' ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date)));

  const upcoming = mine.filter((p) => !isPast(p));
  const thisYear = today.slice(0, 4);
  const held = mine.filter((p) => p.status === 'COMPLETED' && p.start_date.startsWith(thisYear));
  const overdue = mine.filter(needsReport);

  const selected = programs.find((p) => p.id === selectedId) ?? null;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, type: defaultType, start_date: today });
    setFormError('');
    setFormOpen(true);
  };
  const openEdit = (p: Program) => {
    setSelectedId(null);
    setEditingId(p.id);
    setForm({
      title_en: p.title_en, title_am: p.title_am === p.title_en ? '' : p.title_am, type: p.type, unit_id: p.unit_id ?? '',
      start_date: p.start_date, start_time: p.start_time, end_date: p.end_date ?? '', location: p.location,
      coordinator_id: p.coordinator_id ?? '', expected: p.expected === null ? '' : String(p.expected), description: p.description,
    });
    setFormError('');
    setFormOpen(true);
  };
  const set = (key: keyof ProgramInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (mode === 'live') {
      setBusy(true);
      const res = await saveProgram(editingId, form);
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadPrograms());
    } else {
      const unit = options.units.find((u) => u.id === form.unit_id);
      const coord = options.people.find((x) => x.id === form.coordinator_id);
      const patch = {
        title_en: form.title_en, title_am: form.title_am || form.title_en, type: form.type, unit_id: form.unit_id || null,
        unit: unit?.name_en ?? '', unit_am: unit?.name_am ?? '', start_date: form.start_date, start_time: form.start_time,
        end_date: form.end_date || null, location: form.location, coordinator_id: form.coordinator_id || null, coordinator: coord?.name ?? '',
        expected: form.expected === '' ? null : Number(form.expected), description: form.description,
      };
      setPrograms((list) =>
        editingId
          ? list.map((p) => (p.id === editingId ? { ...p, ...patch } : p))
          : [{ id: `prg-${Date.now()}`, ...patch, actual: null, outcome: '', status: 'PLANNED', created_by_id: myId }, ...list]
      );
    }
    setFormOpen(false);
    setTab('UPCOMING');
    showToast('success', editingId ? t('Program updated', 'ፕሮግራሙ ተቀይሯል') : t('Program added to the calendar', 'ፕሮግራሙ ወደ መርሐ ግብር ተጨምሯል'));
  };

  const changeStatus = async (p: Program, status: Exclude<ProgramStatus, 'PLANNED'>) => {
    if (mode === 'live') {
      setBusy(true);
      const res = await setProgramStatus(p.id, status, status === 'COMPLETED' ? { actual, outcome } : undefined);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      apply(await loadPrograms());
    } else {
      setPrograms((list) =>
        list.map((x) => (x.id === p.id ? { ...x, status, ...(status === 'COMPLETED' ? { actual: Number(actual) || 0, outcome } : {}) } : x))
      );
    }
    setSelectedId(null);
    showToast(
      'success',
      status === 'CONFIRMED' ? t('Program confirmed', 'ፕሮግራሙ ተረጋግጧል') : status === 'COMPLETED' ? t('Report saved', 'ሪፖርቱ ተመዝግቧል') : t('Program cancelled', 'ፕሮግራሙ ተሰርዟል')
    );
  };

  const exportExcel = async () => {
    const header = [
      t('Date', 'ቀን'), t('Ethiopian date', 'የኢትዮጵያ ቀን'), t('Time', 'ሰዓት'), t('Title', 'ርዕስ'), t('Type', 'ዓይነት'),
      t('Responsible', 'ኃላፊ ክፍል'), t('Coordinator', 'አስተባባሪ'), t('Place', 'ቦታ'), t('Expected', 'የሚጠበቁ'), t('Attended', 'የተገኙ'),
      t('Status', 'ሁኔታ'), t('Outcome', 'ውጤት'),
    ].map(headerCell);
    const body = rows.map((p) => [
      p.start_date, formatEthiopianDate(p.start_date, 'en'), p.start_time, cell(locale === 'am' ? p.title_am : p.title_en), typeLabel(p.type),
      locale === 'am' ? p.unit_am : p.unit, p.coordinator, cell(p.location), p.expected, p.actual, statusLabel(p.status), cell(p.outcome),
    ]);
    await downloadXlsx(`programs_${today}`, [header, ...body], { sheet: 'Programs', widths: [12, 18, 8, 32, 20, 26, 20, 20, 10, 10, 12, 40] });
  };

  const availableTypes = (types ?? (Object.keys(PROGRAM_TYPES) as ProgramType[]));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t(title[0], title[1])}</h1>
          <p className="text-sm text-slate-500 mt-1">{t(subtitle[0], subtitle[1])}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
          {canCreate && (
            <button onClick={openCreate} disabled={mode === 'loading' || mode === 'error'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <CalendarPlus size={14} /> {t('Schedule Program', 'ፕሮግራም አቅድ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label={t('Upcoming', 'የሚመጡ')} value={upcoming.length} />
        <Kpi label={t(`Held in ${thisYear}`, `በ${thisYear} የተካሄዱ`)} value={held.length} sub={held.length ? t(`${held.reduce((s, p) => s + (p.actual ?? 0), 0)} attendances`, `${held.reduce((s, p) => s + (p.actual ?? 0), 0)} ተሳታፊዎች`) : undefined} />
        <Kpi label={t('Past, waiting for a report', 'ያለፉ፣ ሪፖርት የሚጠብቁ')} value={overdue.length} warn={overdue.length > 0} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-100 flex flex-wrap gap-1">
          {(['UPCOMING', 'PAST', 'ALL'] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {k === 'UPCOMING' ? t('Upcoming', 'የሚመጡ') : k === 'PAST' ? t('Past', 'ያለፉ') : t('All', 'ሁሉም')}
            </button>
          ))}
        </div>
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search title, place, coordinator…', 'ርዕስ፣ ቦታ፣ አስተባባሪ ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          {availableTypes.length > 1 && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="form-input text-xs py-1.5 sm:w-56">
              <option value="ALL">{t('All types', 'ሁሉም ዓይነቶች')}</option>
              {availableTypes.map((x) => (
                <option key={x} value={x}>{typeLabel(x)}</option>
              ))}
            </select>
          )}
        </div>

        <ul className="divide-y divide-slate-100">
          {rows.map((p) => (
            <li key={p.id}>
              <button onClick={() => { setSelectedId(p.id); setActual(p.expected ? String(p.expected) : ''); setOutcome(''); }} className="w-full text-left p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="sm:w-44 shrink-0">
                  <div className="text-sm font-semibold text-slate-900">{formatEthiopianDate(p.start_date, locale)}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {p.start_date}
                    {p.start_time && ` · ${p.start_time}`}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{locale === 'am' ? p.title_am : p.title_en}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span>{typeLabel(p.type)}</span>
                    {p.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{p.location}</span>}
                    {(p.unit || p.coordinator) && <span className="inline-flex items-center gap-1"><UserRound size={11} />{[locale === 'am' ? p.unit_am : p.unit, p.coordinator].filter(Boolean).join(' · ')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {needsReport(p) && (
                    <span className="text-[11px] text-amber-700 inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> {t('needs a report', 'ሪፖርት ይጠብቃል')}
                    </span>
                  )}
                  {p.status === 'COMPLETED' && p.actual !== null && (
                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Users size={12} />{p.actual}</span>
                  )}
                  <span className={STATUS_STYLE[p.status]}>{statusLabel(p.status)}</span>
                </div>
              </button>
            </li>
          ))}
          {mode !== 'loading' && rows.length === 0 && (
            <li className="p-8 text-center text-sm text-slate-400">
              {tab === 'UPCOMING' ? t('Nothing scheduled yet.', 'እስካሁን የታቀደ የለም።') : t('Nothing here.', 'ምንም የለም።')}
            </li>
          )}
        </ul>
      </div>

      {/* Details */}
      {selected && (
        <Modal isOpen onClose={() => setSelectedId(null)} title={locale === 'am' ? selected.title_am : selected.title_en} subtitle={`${typeLabel(selected.type)} · ${statusLabel(selected.status)}`} maxWidth="xl">
          <div className="space-y-4 text-sm">
            <dl className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <Line label={t('Date', 'ቀን')} value={`${formatEthiopianDate(selected.start_date, locale)} (${selected.start_date})${selected.end_date && selected.end_date !== selected.start_date ? ` → ${formatEthiopianDate(selected.end_date, locale)}` : ''}`} />
              {selected.start_time && <Line label={t('Time', 'ሰዓት')} value={selected.start_time} />}
              {selected.location && <Line label={t('Place', 'ቦታ')} value={selected.location} />}
              {selected.unit && <Line label={t('Responsible department', 'ኃላፊ ክፍል')} value={locale === 'am' ? selected.unit_am : selected.unit} />}
              {selected.coordinator && <Line label={t('Coordinator', 'አስተባባሪ')} value={selected.coordinator} />}
              <Line label={t('Participants', 'ተሳታፊዎች')} value={`${t('expected', 'የሚጠበቁ')} ${selected.expected ?? '—'}${selected.actual !== null ? ` · ${t('attended', 'የተገኙ')} ${selected.actual}` : ''}`} />
            </dl>
            {selected.description && <p className="text-xs text-slate-700 whitespace-pre-wrap">{selected.description}</p>}
            {selected.outcome && (
              <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900">
                <div className="font-bold mb-0.5">{t('Report', 'ሪፖርት')}</div>
                {selected.outcome}
              </div>
            )}

            {canChange(selected) && (selected.status === 'PLANNED' || selected.status === 'CONFIRMED') && (
              <>
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-700">{t('After it is held — record the report', 'ከተካሄደ በኋላ — ሪፖርት መዝግብ')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="number" min="0" value={actual} onChange={(e) => setActual(e.target.value)} placeholder={t('How many attended', 'የተገኙ ብዛት')} className="form-input text-sm" />
                    <input type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder={t('Short report / outcome', 'አጭር ሪፖርት / ውጤት')} className="form-input text-sm sm:col-span-2" />
                  </div>
                  <button disabled={busy || actual === ''} onClick={() => changeStatus(selected, 'COMPLETED')} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                    <CheckCircle2 size={14} /> {t('Mark as held', 'እንደተካሄደ መዝግብ')}
                  </button>
                </div>
                <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(selected)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Pencil size={13} /> {t('Edit', 'አርትዕ')}</button>
                    {selected.status === 'PLANNED' && (
                      <button disabled={busy} onClick={() => changeStatus(selected, 'CONFIRMED')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Clock size={13} /> {t('Confirm', 'አረጋግጥ')}</button>
                    )}
                  </div>
                  <button disabled={busy} onClick={() => changeStatus(selected, 'CANCELLED')} className="btn btn-danger text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><XCircle size={13} /> {t('Cancel program', 'ፕሮግራሙን ሰርዝ')}</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Create / edit */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingId ? t('Edit Program', 'ፕሮግራም አርትዕ') : t('Schedule Program', 'ፕሮግራም አቅድ')} maxWidth="xl">
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Title (English)', 'ርዕስ (እንግሊዝኛ)') + ' *'}>
              <input type="text" required value={form.title_en} onChange={set('title_en')} className="form-input text-sm" />
            </Field>
            <Field label={t('Title (Amharic)', 'ርዕስ (አማርኛ)')}>
              <input type="text" value={form.title_am} onChange={set('title_am')} className="form-input text-sm" />
            </Field>
            <Field label={t('Type', 'ዓይነት') + ' *'}>
              <select value={form.type} onChange={set('type')} className="form-input text-sm">
                {availableTypes.map((x) => (
                  <option key={x} value={x}>{typeLabel(x)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Responsible department', 'ኃላፊ ክፍል')}>
              <select value={form.unit_id} onChange={set('unit_id')} className="form-input text-sm">
                <option value="">—</option>
                {options.units.map((u) => (
                  <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Date', 'ቀን') + ' *'}>
              <input type="date" required value={form.start_date} onChange={set('start_date')} className="form-input text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Start time', 'የመጀመሪያ ሰዓት')}>
                <input type="time" value={form.start_time} onChange={set('start_time')} className="form-input text-sm" />
              </Field>
              <Field label={t('Ends (if several days)', 'የሚያበቃበት (ብዙ ቀን ከሆነ)')}>
                <input type="date" min={form.start_date} value={form.end_date} onChange={set('end_date')} className="form-input text-sm" />
              </Field>
            </div>
            <Field label={t('Place', 'ቦታ')}>
              <input type="text" value={form.location} onChange={set('location')} placeholder={t('e.g. Main Hall', 'ለምሳሌ፡ ዋናው አዳራሽ')} className="form-input text-sm" />
            </Field>
            <Field label={t('Coordinator', 'አስተባባሪ')}>
              <select value={form.coordinator_id} onChange={set('coordinator_id')} className="form-input text-sm">
                <option value="">—</option>
                {options.people.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Expected participants', 'የሚጠበቁ ተሳታፊዎች')}>
              <input type="number" min="0" value={String(form.expected)} onChange={set('expected')} className="form-input text-sm" />
            </Field>
          </div>
          <Field label={t('Description / program outline', 'መግለጫ / የፕሮግራም ዝርዝር')}>
            <textarea rows={3} value={form.description} onChange={set('description')} className="form-input text-sm" />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Kpi({ label, value, sub, warn = false }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className="card p-5">
      <div className={`text-2xl font-bold ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right font-medium">{value}</dd>
    </div>
  );
}
