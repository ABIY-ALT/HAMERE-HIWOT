'use client';

// Journal entries: every posted entry of a period with its debit and credit
// lines, and the manual entries being written or waiting for approval.
// Manual entries: draft → sent for approval → posted (or returned with a
// note). A posted entry is final; a mistake is undone by a reversing entry.
// Server work: ../actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, RotateCcw, Search, Send, Trash2, Undo2, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { ExportButton } from '@/components/ui/ExportButton';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ErrorBox, Field, GlNav, PeriodBar, ReportHeading, periodText } from '@/components/finance/GlShared';
import { exportTable } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  GL_TYPES,
  SOURCE_LABEL,
  STATUS_LABEL,
  accountName,
  chartOrder,
  fmtAmount,
  type EntrySource,
  type JournalData,
  type JournalEntryView,
} from '@/lib/finance/gl';
import { approveEntry, deleteEntry, loadJournal, returnEntry, reverseEntry, saveEntry } from '../actions';

const EMPTY: JournalData = {
  entries: [], open: [], accounts: [], units: [], settings: { fiscal_year_start: '07-08', lock_date: null, require_approval: false, accrue_pledges: true }, from: todayIso(), to: todayIso(),
};

type FormLine = { account_id: string; description: string; unit_id: string; debit: string; credit: string };
type EntryForm = { id: string; date: string; memo: string; reference: string; lines: FormLine[] };
const BLANK_LINE: FormLine = { account_id: '', description: '', unit_id: '', debit: '', credit: '' };

const SOURCE_TONE: Record<EntrySource, string> = {
  MANUAL: 'bg-violet-50 text-violet-700',
  TRANSACTION: 'bg-slate-100 text-slate-600',
  TRANSFER: 'bg-sky-50 text-sky-700',
  OPENING: 'bg-amber-50 text-amber-700',
  REVERSAL: 'bg-rose-50 text-rose-700',
  PLEDGE: 'bg-emerald-50 text-emerald-700',
  ASSET: 'bg-teal-50 text-teal-700',
  DEPRECIATION: 'bg-orange-50 text-orange-700',
  DISPOSAL: 'bg-stone-100 text-stone-700',
};

const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

export default function JournalPage() {
  const { t, locale } = useLang();
  const { can, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const canWrite = can('FINANCE_CREATE') || can('FINANCE_APPROVE');
  const canApprove = can('FINANCE_APPROVE');
  const myId = user?.systemUser.id ?? '';

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<JournalData>(EMPTY);
  const [range, setRange] = useState<{ from?: string; to?: string; source?: string }>({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    source: params.get('source') ?? '',
  });
  const [q, setQ] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<EntryForm | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [returning, setReturning] = useState<{ id: string; note: string } | null>(null);
  const [reversing, setReversing] = useState<{ id: string; no: string; date: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadJournal>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  const reload = useCallback(async () => apply(await loadJournal(range)), [apply, range]);
  useEffect(() => {
    loadJournal(range).then(apply);
  }, [apply, range]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const setPeriod = (from: string, to: string) => {
    setRange((r) => ({ ...r, from, to }));
    router.replace(`?from=${from}&to=${to}${range.source ? `&source=${range.source}` : ''}`);
  };

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const search = q.trim().toLowerCase();
  const posted = data.entries.filter(
    (e) =>
      !search ||
      e.entry_no.toLowerCase().includes(search) ||
      e.memo.toLowerCase().includes(search) ||
      e.reference.toLowerCase().includes(search) ||
      e.lines.some((l) => l.code.includes(search) || l.name_en.toLowerCase().includes(search) || l.description.toLowerCase().includes(search))
  );
  const postedTotal = posted.reduce((s, e) => s + e.total, 0);

  // ── Entry form ─────────────────────────────────────────────────────────────
  const accountOptions = useMemo(() => chartOrder(data.accounts).filter((a) => !a.is_header && a.is_active), [data.accounts]);
  const openNew = () => {
    setFormError('');
    setForm({ id: '', date: todayIso(), memo: '', reference: '', lines: [{ ...BLANK_LINE }, { ...BLANK_LINE }] });
  };
  const openEdit = (e: JournalEntryView) => {
    setFormError('');
    setForm({
      id: e.id,
      date: e.date,
      memo: e.memo,
      reference: e.reference,
      lines: e.lines.map((l) => ({
        account_id: l.account_id, description: l.description, unit_id: l.unit_id ?? '',
        debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '',
      })),
    });
  };
  const setLine = (i: number, patch: Partial<FormLine>) =>
    setForm((f) => (f ? { ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));
  const dr = form ? form.lines.reduce((s, l) => s + toCents(l.debit), 0) : 0;
  const cr = form ? form.lines.reduce((s, l) => s + toCents(l.credit), 0) : 0;
  const balanced = dr === cr && dr > 0;

  const submit = async (action: 'draft' | 'submit' | 'post') => {
    if (!form) return;
    setBusy(true);
    setFormError('');
    const res = await saveEntry({
      id: form.id,
      date: form.date,
      memo: form.memo,
      reference: form.reference,
      action,
      lines: form.lines
        .filter((l) => l.account_id && (toCents(l.debit) || toCents(l.credit)))
        .map((l) => ({ account_id: l.account_id, description: l.description, unit_id: l.unit_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    });
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setForm(null);
    say(
      'success',
      res.status === 'POSTED'
        ? t(`${res.entry_no} posted`, `${res.entry_no} ተመዝግቧል`)
        : res.status === 'PENDING'
          ? t(`${res.entry_no} sent for approval`, `${res.entry_no} ለማጽደቅ ተልኳል`)
          : t(`${res.entry_no} saved as a draft`, `${res.entry_no} በረቂቅ ተቀምጧል`)
    );
    await reload();
  };

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    const res = await fn();
    if (!res.ok) return say('error', res.error ?? '');
    say('success', done);
    await reload();
  };

  const exportJournal = async (format: 'xlsx' | 'csv') => {
    const rows = posted.flatMap((e) =>
      e.lines.map((l, i) => [
        i === 0 ? e.date : '',
        i === 0 ? e.entry_no : '',
        i === 0 ? e.memo : '',
        i === 0 ? e.reference : '',
        i === 0 ? SOURCE_LABEL[e.source][0] : '',
        l.code,
        l.name_en,
        l.description,
        l.unit,
        l.debit || null,
        l.credit || null,
      ])
    );
    rows.push(['', '', 'Total', '', '', '', '', '', '', postedTotal, postedTotal]);
    await exportTable(
      `journal_${data.from}_${data.to}`,
      ['Date', 'Entry no.', 'Memo', 'Reference', 'Source', 'Account no.', 'Account', 'Line description', 'Department', 'Debit', 'Credit'],
      rows,
      format,
      { sheet: 'Journal', widths: [12, 14, 40, 14, 16, 10, 30, 30, 20, 14, 14] }
    );
  };

  const canPostOwn = (e: JournalEntryView) => canApprove && (!data.settings.require_approval || e.created_by_id !== myId);

  return (
    <div className="space-y-5 print-sheet">
      <AdminToast toast={toast} />
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Accounting', 'የሂሳብ አያያዝ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Every entry with its debits and credits. Write manual entries for accruals, depreciation, corrections and opening balances.', 'እያንዳንዱ ምዝገባ ከዴቢትና ክሬዲቱ ጋር። ለተጠራቀሙ ወጪዎች፣ ለእርጅና ቅናሽ፣ ለማስተካከያና ለመነሻ ቀሪዎች የእጅ ምዝገባ ይጻፉ።')}
          </p>
        </div>
        {canWrite && (
          <button onClick={openNew} disabled={mode !== 'live'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
            <Plus size={14} /> {t('New journal entry', 'አዲስ የሂሳብ ምዝገባ')}
          </button>
        )}
      </div>
      <GlNav />
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && data.open.length > 0 && (
        <div className="no-print card overflow-hidden border-amber-200">
          <div className="p-4 border-b border-amber-100 bg-amber-50/60 font-bold text-amber-900 text-sm">
            {t('Drafts and entries waiting for approval', 'ረቂቆችና ማጽደቅ የሚጠብቁ ምዝገባዎች')} ({data.open.length})
          </div>
          <div className="divide-y divide-slate-100">
            {data.open.map((e) => (
              <div key={e.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      <span className="font-mono text-xs text-slate-500 mr-2">{e.entry_no}</span>
                      {e.memo}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatEthiopianDate(e.date, locale)} ({e.date}) · {e.created_by || '—'} ·{' '}
                      <span className={e.status === 'PENDING' ? 'text-amber-700 font-semibold' : 'text-slate-500'}>{t(...STATUS_LABEL[e.status])}</span>
                    </div>
                    {e.review_note && <div className="mt-1 text-xs text-red-700 bg-red-50 rounded px-2 py-1 inline-block">{t('Returned', 'የተመለሰ')}: {e.review_note}</div>}
                  </div>
                  <div className="font-mono font-semibold text-slate-900">{fmtAmount(e.total || e.lines.reduce((s, l) => s + l.debit, 0))}</div>
                </div>
                <LinesTable entry={e} locale={locale} t={t} compact />
                <div className="flex flex-wrap gap-2">
                  {(e.created_by_id === myId || canApprove) && (
                    <button onClick={() => openEdit(e)} className="btn btn-secondary text-xs inline-flex items-center gap-1"><Pencil size={12} /> {t('Edit', 'አርትዕ')}</button>
                  )}
                  {e.status === 'PENDING' && canPostOwn(e) && (
                    <button onClick={() => act(() => approveEntry(e.id), t(`${e.entry_no} posted`, `${e.entry_no} ተመዝግቧል`))} className="btn btn-primary text-xs inline-flex items-center gap-1">
                      <Check size={12} /> {t('Approve and post', 'አጽድቅና መዝግብ')}
                    </button>
                  )}
                  {e.status === 'PENDING' && canApprove && e.created_by_id !== myId && (
                    <button onClick={() => setReturning({ id: e.id, note: '' })} className="btn btn-secondary text-xs inline-flex items-center gap-1"><Undo2 size={12} /> {t('Return', 'መልስ')}</button>
                  )}
                  {(e.created_by_id === myId || canApprove) && (
                    <button
                      onClick={() => window.confirm(t('Delete this entry?', 'ይህ ምዝገባ ይሰረዝ?')) && act(() => deleteEntry(e.id), t('Entry deleted', 'ምዝገባው ተሰርዟል'))}
                      className="btn btn-secondary text-xs inline-flex items-center gap-1 text-red-600"
                    >
                      <Trash2 size={12} /> {t('Delete', 'ሰርዝ')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'live' && (
        <>
          <PeriodBar from={data.from} to={data.to} fyStart={data.settings.fiscal_year_start} onChange={setPeriod}>
            <label className="text-xs font-semibold text-slate-600">
              {t('Source', 'ምንጭ')}
              <select value={range.source ?? ''} onChange={(e) => setRange((r) => ({ ...r, source: e.target.value }))} className="form-input text-sm mt-1 block">
                <option value="">{t('All', 'ሁሉም')}</option>
                {(Object.keys(SOURCE_LABEL) as EntrySource[]).map((s) => (
                  <option key={s} value={s}>{t(...SOURCE_LABEL[s])}</option>
                ))}
              </select>
            </label>
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search number, memo, account', 'ቁጥር፣ መግለጫ፣ ሂሳብ ፈልግ')} className="form-input text-sm pl-8" />
            </div>
            <ExportButton onExport={exportJournal} />
          </PeriodBar>

          <div className="card p-4 space-y-3">
            <ReportHeading
              tenant={[user?.tenant?.name_en ?? '', user?.tenant?.name_am || user?.tenant?.name_en || '']}
              title={['Journal', 'የሂሳብ መዝገብ']}
              period={periodText(data.from, data.to, locale)}
              onPrint={() => {
                setOpenIds(new Set(posted.map((e) => e.id)));
                setTimeout(() => window.print(), 100);
              }}
            />
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th className="w-8 no-print" />
                    <th>{t('Date', 'ቀን')}</th>
                    <th>{t('Entry', 'ምዝገባ')}</th>
                    <th>{t('Memo', 'መግለጫ')}</th>
                    <th className="hidden md:table-cell">{t('Source', 'ምንጭ')}</th>
                    <th className="text-right">{t('Amount', 'መጠን')}</th>
                    {canApprove && <th className="no-print w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {posted.map((e) => {
                    const open = openIds.has(e.id);
                    return (
                      <React.Fragment key={e.id}>
                        <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(e.id)}>
                          <td className="no-print text-slate-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className="text-xs whitespace-nowrap">
                            {formatEthiopianDate(e.date, locale)}
                            <div className="text-[10px] text-slate-400">{e.date}</div>
                          </td>
                          <td className="font-mono text-xs whitespace-nowrap">{e.entry_no}</td>
                          <td className="text-sm text-slate-800">
                            {e.memo}
                            {e.reference && <span className="ml-1 text-[11px] text-slate-400">· {e.reference}</span>}
                            {e.reversed_by && <div className="text-[11px] text-rose-700">{t('Reversed by', 'የተሰረዘው በ')} {e.reversed_by}</div>}
                          </td>
                          <td className="hidden md:table-cell">
                            <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${SOURCE_TONE[e.source]}`}>{t(...SOURCE_LABEL[e.source])}</span>
                          </td>
                          <td className="text-right font-mono font-semibold">{fmtAmount(e.total)}</td>
                          {canApprove && (
                            <td className="no-print text-right" onClick={(ev) => ev.stopPropagation()}>
                              {e.source === 'MANUAL' && !e.reversed_by && (
                                <button
                                  onClick={() => setReversing({ id: e.id, no: e.entry_no, date: todayIso() })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                  title={t('Reverse', 'ሰርዝ (በተቃራኒ ምዝገባ)')}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {open && (
                          <tr>
                            <td className="no-print" />
                            <td colSpan={canApprove ? 6 : 5} className="bg-slate-50/60">
                              <LinesTable entry={e} locale={locale} t={t} />
                              <div className="text-[10px] text-slate-400 mt-1">
                                {e.posted_by && `${t('Posted by', 'የመዘገበው')} ${e.posted_by}`}
                                {e.created_by && e.created_by !== e.posted_by && ` · ${t('written by', 'የጻፈው')} ${e.created_by}`}
                                {e.reverses && ` · ${t('reverses', 'የሚሰርዘው')} ${e.reverses}`}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {posted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-sm text-slate-400 py-8">{t('No posted entries in this period', 'በዚህ ጊዜ የተመዘገበ ምዝገባ የለም')}</td>
                    </tr>
                  )}
                </tbody>
                {posted.length > 0 && (
                  <tfoot>
                    <tr className="font-bold">
                      <td className="no-print" />
                      <td colSpan={4} className="text-right text-sm">{t('Total', 'ድምር')} ({posted.length})</td>
                      <td className="text-right font-mono">{fmtAmount(postedTotal)}</td>
                      {canApprove && <td className="no-print" />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* New / edit entry */}
      <Modal
        isOpen={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('Edit journal entry', 'የሂሳብ ምዝገባ አርትዕ') : t('New journal entry', 'አዲስ የሂሳብ ምዝገባ')}
        subtitle={t('Total debits must equal total credits', 'የዴቢት ድምር ከክሬዲት ድምር ጋር እኩል መሆን አለበት')}
        maxWidth="2xl"
      >
        {form && (
          <div className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label={t('Date', 'ቀን') + ' *'}>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="form-input text-sm" />
                <div className="text-[10px] text-slate-400 mt-0.5">{formatEthiopianDate(form.date, locale)}</div>
              </Field>
              <Field label={t('Memo (what it is for)', 'መግለጫ (ለምን እንደሆነ)') + ' *'} className="sm:col-span-2">
                <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder={t('e.g. Electricity for Tikimt, not yet paid', 'ለምሳሌ፡ የጥቅምት መብራት፣ ገና ያልተከፈለ')} className="form-input text-sm" />
              </Field>
              <Field label={t('Reference / voucher', 'ማጣቀሻ / ቫውቸር')}>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="form-input text-sm font-mono" />
              </Field>
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-[11px] text-slate-500 text-left">
                    <th className="py-1 pr-2 w-[34%]">{t('Account', 'ሂሳብ')}</th>
                    <th className="py-1 pr-2">{t('Line description', 'የመስመር መግለጫ')}</th>
                    <th className="py-1 pr-2 w-[16%]">{t('Department', 'ክፍል')}</th>
                    <th className="py-1 pr-2 w-[12%] text-right">{t('Debit', 'ዴቢት')}</th>
                    <th className="py-1 pr-2 w-[12%] text-right">{t('Credit', 'ክሬዲት')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <select value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value })} className="form-input text-xs">
                          <option value="">— {t('Choose', 'ይምረጡ')} —</option>
                          {GL_TYPES.map((g) => (
                            <optgroup key={g.code} label={locale === 'am' ? g.label[1] : g.label[0]}>
                              {accountOptions.filter((a) => a.type === g.code).map((a) => (
                                <option key={a.id} value={a.id}>{a.code} · {accountName(a, locale)}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className="form-input text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <select value={l.unit_id} onChange={(e) => setLine(i, { unit_id: e.target.value })} className="form-input text-xs">
                          <option value="">—</option>
                          {data.units.map((u) => (
                            <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number" min="0" step="0.01" value={l.debit}
                          onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                          className="form-input text-xs font-mono text-right"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number" min="0" step="0.01" value={l.credit}
                          onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                          className="form-input text-xs font-mono text-right"
                        />
                      </td>
                      <td>
                        {form.lines.length > 2 && (
                          <button type="button" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })} className="p-1 text-slate-400 hover:text-red-600">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-xs font-semibold">
                    <td colSpan={3} className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          // A new line offers the amount that would balance the entry
                          const diff = (dr - cr) / 100;
                          setForm({ ...form, lines: [...form.lines, { ...BLANK_LINE, debit: diff < 0 ? String(-diff) : '', credit: diff > 0 ? String(diff) : '' }] });
                        }}
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                      >
                        <Plus size={13} /> {t('Add line', 'መስመር ጨምር')}
                      </button>
                    </td>
                    <td className="pt-2 pr-2 text-right font-mono">{fmtAmount(dr / 100)}</td>
                    <td className="pt-2 pr-2 text-right font-mono">{fmtAmount(cr / 100)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={6} className={`pt-1 text-right text-xs font-semibold ${balanced ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {balanced
                        ? t('Balanced ✓', 'ሚዛናዊ ነው ✓')
                        : `${t('Difference', 'ልዩነት')}: ${fmtAmount(Math.abs(dr - cr) / 100)} ${dr > cr ? t('more debit', 'ዴቢት ይበልጣል') : dr < cr ? t('more credit', 'ክሬዲት ይበልጣል') : ''}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {data.settings.lock_date && (
              <p className="text-[11px] text-slate-500">{t(`The books are closed up to ${data.settings.lock_date}.`, `መዝገቡ እስከ ${formatEthiopianDate(data.settings.lock_date, 'am')} ተዘግቷል።`)}</p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="button" disabled={busy} onClick={() => submit('draft')} className="btn btn-secondary text-xs disabled:opacity-60">{t('Save draft', 'ረቂቅ አስቀምጥ')}</button>
              {canApprove && !(data.settings.require_approval) ? (
                <button type="button" disabled={busy || !balanced} onClick={() => submit('post')} className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-60">
                  <Check size={13} /> {t('Post', 'መዝግብ')}
                </button>
              ) : (
                <button type="button" disabled={busy || !balanced} onClick={() => submit('submit')} className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-60">
                  <Send size={13} /> {t('Send for approval', 'ለማጽደቅ ላክ')}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Return with a note */}
      <Modal isOpen={Boolean(returning)} onClose={() => setReturning(null)} title={t('Return for changes', 'ለማስተካከያ መልስ')}>
        {returning && (
          <div className="space-y-3">
            <textarea rows={3} value={returning.note} onChange={(e) => setReturning({ ...returning, note: e.target.value })} placeholder={t('What needs to change?', 'ምን መስተካከል አለበት?')} className="form-input text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReturning(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button
                onClick={async () => {
                  const r = returning;
                  setReturning(null);
                  await act(() => returnEntry(r.id, r.note), t('Returned to the writer', 'ለጸሐፊው ተመልሷል'));
                }}
                className="btn btn-primary text-xs"
              >
                {t('Return', 'መልስ')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reverse */}
      <Modal isOpen={Boolean(reversing)} onClose={() => setReversing(null)} title={t('Reverse entry', 'ምዝገባውን በተቃራኒ ሰርዝ')} subtitle={reversing?.no}>
        {reversing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {t('A new entry with every debit and credit swapped is posted on the date you choose. Both stay in the journal.', 'እያንዳንዱ ዴቢትና ክሬዲት የተገለበጠበት አዲስ ምዝገባ በመረጡት ቀን ይመዘገባል። ሁለቱም በመዝገቡ ይቀራሉ።')}
            </p>
            <Field label={t('Reversal date', 'የመሰረዣ ቀን')}>
              <input type="date" value={reversing.date} onChange={(e) => setReversing({ ...reversing, date: e.target.value })} className="form-input text-sm" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReversing(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button
                onClick={async () => {
                  const r = reversing;
                  setReversing(null);
                  const res = await reverseEntry(r.id, r.date);
                  if (!res.ok) return say('error', res.error);
                  say('success', t(`${r.no} reversed by ${res.entry_no}`, `${r.no} በ${res.entry_no} ተሰርዟል`));
                  await reload();
                }}
                className="btn btn-primary text-xs"
              >
                {t('Post reversal', 'መሰረዣውን መዝግብ')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function LinesTable({ entry, locale, t, compact = false }: { entry: JournalEntryView; locale: string; t: (en: string, am: string) => string; compact?: boolean }) {
  const dr = entry.lines.reduce((s, l) => s + l.debit, 0);
  const cr = entry.lines.reduce((s, l) => s + l.credit, 0);
  return (
    <table className={`w-full ${compact ? 'text-xs' : 'text-xs'}`}>
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left">
          <th className="py-1 pr-2 font-semibold">{t('Account', 'ሂሳብ')}</th>
          <th className="py-1 pr-2 font-semibold hidden sm:table-cell">{t('Description', 'መግለጫ')}</th>
          <th className="py-1 pr-2 font-semibold hidden md:table-cell">{t('Department', 'ክፍል')}</th>
          <th className="py-1 pr-2 font-semibold text-right">{t('Debit', 'ዴቢት')}</th>
          <th className="py-1 font-semibold text-right">{t('Credit', 'ክሬዲት')}</th>
        </tr>
      </thead>
      <tbody>
        {entry.lines.map((l, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className={`py-1 pr-2 ${l.credit ? 'pl-6' : ''}`}>
              <span className="font-mono text-slate-500 mr-1">{l.code}</span>
              {accountName(l, locale)}
            </td>
            <td className="py-1 pr-2 text-slate-500 hidden sm:table-cell">{l.description}</td>
            <td className="py-1 pr-2 text-slate-500 hidden md:table-cell">{l.unit}</td>
            <td className="py-1 pr-2 text-right font-mono">{fmtAmount(l.debit, true)}</td>
            <td className="py-1 text-right font-mono">{fmtAmount(l.credit, true)}</td>
          </tr>
        ))}
        <tr className="border-t border-slate-200 font-semibold">
          <td className="py-1 pr-2" colSpan={1} />
          <td className="hidden sm:table-cell" />
          <td className="hidden md:table-cell" />
          <td className="py-1 pr-2 text-right font-mono">{fmtAmount(dr)}</td>
          <td className="py-1 text-right font-mono">{fmtAmount(cr)}</td>
        </tr>
      </tbody>
    </table>
  );
}
