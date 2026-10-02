'use client';

import React, { useState } from 'react';
import { Download, Lock, Plus, Search, ShieldAlert } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ErrorBox, Field, personName, useHrDialogs } from '@/components/hr/HrDialogs';
import { runHr, useHr } from '@/lib/hr/client';
import { activeSuspension, addDays, CASE_KINDS, CASE_STATUS, type CaseKind, type DisciplineCase } from '@/lib/hr/types';
import { closeDisciplineCase, saveDisciplineCase, type CaseInput, type CloseCaseInput } from '@/app/dashboard/hr/actions';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const EMPTY: CaseInput = { person_id: '', opened_on: '', kind: 'WARNING', reason: '', handled_by: '', suspended_until: '', end_assignments: false };

export default function DisciplinePage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const hr = useHr();
  const canManage = can('HR_MANAGE');
  const today = todayIso();
  const yearAgo = addDays(today, -365);

  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [kind, setKind] = useState<'ALL' | CaseKind>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DisciplineCase | 'new' | null>(null);
  const [form, setForm] = useState<CaseInput>(EMPTY);
  const [closing, setClosing] = useState<DisciplineCase | null>(null);
  const [closeForm, setCloseForm] = useState<CloseCaseInput>({ status: 'RESOLVED', closed_on: '', resolution: '' });
  const [viewing, setViewing] = useState<DisciplineCase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const notify = (text: string) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  };
  const dialogs = useHrDialogs(notify);
  const name = (id: string) => personName(hr, id, locale);

  const needle = search.trim().toLowerCase();
  const rows = hr.cases
    .filter((c) => status === 'ALL' || (status === 'OPEN' ? c.status === 'OPEN' : c.status !== 'OPEN'))
    .filter((c) => kind === 'ALL' || c.kind === kind)
    .filter((c) => !needle || [name(c.person_id), c.reason, c.handled_by].some((v) => v.toLowerCase().includes(needle)));
  const suspendedNow = new Set(hr.cases.filter((c) => activeSuspension(hr.cases, c.person_id, today)).map((c) => c.person_id));
  const choices = [...new Map([...hr.people.map((p) => [p.id, p.name] as const), ...hr.candidates.map((c) => [c.id, c.name] as const)]).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const openForm = (c: DisciplineCase | 'new') => {
    setError('');
    setEditing(c);
    setForm(
      c === 'new'
        ? { ...EMPTY, opened_on: today }
        : { person_id: c.person_id, opened_on: c.opened_on, kind: c.kind, reason: c.reason, handled_by: c.handled_by, suspended_until: c.suspended_until ?? '', end_assignments: false }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runHr(() => saveDisciplineCase(editing === 'new' ? null : (editing as DisciplineCase).id, form));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    notify(editing === 'new' ? t('Case recorded', 'ጉዳዩ ተመዝግቧል') : t('Saved', 'ተቀምጧል'));
  };

  const openClose = (c: DisciplineCase) => {
    setError('');
    setViewing(null);
    setClosing(c);
    setCloseForm({ status: 'RESOLVED', closed_on: today, resolution: '' });
  };

  const close = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closing) return;
    setBusy(true);
    const res = await runHr(() => closeDisciplineCase(closing.id, closeForm));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setClosing(null);
    notify(t('Case closed', 'ጉዳዩ ተዘግቷል'));
  };

  const exportExcel = async () => {
    const header = [t('Servant', 'አገልጋይ'), t('Kind', 'ዓይነት'), t('Reason', 'ምክንያት'), t('Opened', 'የተከፈተበት'), t('Handled by', 'ጉዳዩን የያዘው'), t('Suspended until', 'እገዳው እስከ'), t('Status', 'ሁኔታ'), t('Closed', 'የተዘጋበት'), t('Resolution', 'ውሳኔ')].map(headerCell);
    const body = rows.map((c) => [cell(name(c.person_id)), t(...CASE_KINDS[c.kind]), c.reason, c.opened_on, c.handled_by, c.suspended_until ?? '', t(...CASE_STATUS[c.status].label), c.closed_on ?? '', c.resolution]);
    await downloadXlsx(`discipline_${today}`, [header, ...body], { sheet: 'Discipline', widths: [24, 20, 40, 12, 22, 14, 12, 12, 40] });
  };

  if (hr.mode === 'live' && !hr.canSeeCases) {
    return (
      <div className="card p-8 text-center space-y-2">
        <Lock size={22} className="mx-auto text-slate-400" />
        <p className="text-sm text-slate-600">{t('Discipline records are confidential and visible only to HR managers.', 'የዲሲፕሊን መዝገብ ሚስጥራዊ ነው፤ የሚታየው ለሰው ሀብት ኃላፊዎች ብቻ ነው።')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      {dialogs.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Discipline & Pastoral Care', 'ዲሲፕሊንና መንፈሳዊ ክትትል')}</h1>
          <p className="text-sm text-slate-500 mt-1 inline-flex items-center gap-1.5"><Lock size={13} /> {t('Confidential — visible only to HR managers', 'ሚስጥራዊ — የሚታየው ለሰው ሀብት ኃላፊዎች ብቻ')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => openForm('new')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Plus size={14} /> {t('Record a Case', 'ጉዳይ መዝግብ')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={hr.mode} error={hr.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={hr.cases.filter((c) => c.status === 'OPEN').length} label={t('Open cases', 'በሂደት ያሉ ጉዳዮች')} warn />
        <Kpi value={suspendedNow.size} label={t('Suspended now', 'አሁን የታገዱ')} />
        <Kpi value={hr.cases.filter((c) => c.opened_on >= yearAgo).length} label={t('Opened, last 12 months', 'ባለፉት 12 ወራት የተከፈቱ')} />
        <Kpi value={hr.cases.filter((c) => c.closed_on && c.closed_on >= yearAgo).length} label={t('Closed, last 12 months', 'ባለፉት 12 ወራት የተዘጉ')} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start">
            {(['OPEN', 'CLOSED', 'ALL'] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${status === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s === 'OPEN' ? t('Open', 'በሂደት') : s === 'CLOSED' ? t('Closed', 'የተዘጉ') : t('All', 'ሁሉም')}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search name or reason…', 'ስም ወይም ምክንያት ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All kinds', 'ሁሉም ዓይነት')}</option>
            {(Object.keys(CASE_KINDS) as CaseKind[]).map((k) => <option key={k} value={k}>{t(...CASE_KINDS[k])}</option>)}
          </select>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Servant', 'አገልጋይ')}</th>
                <th>{t('Kind', 'ዓይነት')}</th>
                <th>{t('Reason', 'ምክንያት')}</th>
                <th>{t('Opened', 'የተከፈተበት')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><button onClick={() => dialogs.openPerson(c.person_id)} className="font-medium text-slate-900 hover:text-blue-700 text-left">{name(c.person_id)}</button></td>
                  <td className="text-xs text-slate-700 whitespace-nowrap">
                    {t(...CASE_KINDS[c.kind])}
                    {c.kind === 'SUSPENSION' && c.suspended_until && <div className="text-[11px] text-slate-400">{t('until', 'እስከ')} {formatEthiopianDate(c.suspended_until, locale)}</div>}
                  </td>
                  <td className="text-xs text-slate-600 max-w-xs"><div className="line-clamp-2">{c.reason}</div></td>
                  <td className="text-xs text-slate-600 whitespace-nowrap">{formatEthiopianDate(c.opened_on, locale)}</td>
                  <td><span className={CASE_STATUS[c.status].cls}>{t(...CASE_STATUS[c.status].label)}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => setViewing(c)} className="text-xs text-slate-600 hover:bg-slate-50 font-semibold px-2 py-1 rounded">{t('Details', 'ዝርዝር')}</button>
                    {canManage && c.status === 'OPEN' && (
                      <>
                        <button onClick={() => openForm(c)} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded">{t('Edit', 'አርትዕ')}</button>
                        <button onClick={() => openClose(c)} className="text-xs text-emerald-700 hover:bg-emerald-50 font-semibold px-2 py-1 rounded">{t('Close', 'ዝጋ')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {hr.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-8"><ShieldAlert size={18} className="inline mr-1" /> {t('No cases here.', 'እዚህ ምንም ጉዳይ የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing === 'new' ? t('Record a Case', 'ጉዳይ መዝግብ') : t('Edit Case', 'ጉዳይ አርትዕ')} subtitle={editing === 'new' ? undefined : name(editing.person_id)} maxWidth="xl">
          <form onSubmit={save} className="space-y-4">
            {error && <ErrorBox text={error} />}
            {editing === 'new' && (
              <Field label={t('Servant', 'አገልጋይ') + ' *'}>
                <select required value={form.person_id} onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))} className="form-input text-sm">
                  <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
                  {choices.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Kind', 'ዓይነት')}>
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CaseKind }))} className="form-input text-sm">
                  {(Object.keys(CASE_KINDS) as CaseKind[]).map((k) => <option key={k} value={k}>{t(...CASE_KINDS[k])}</option>)}
                </select>
              </Field>
              <Field label={t('Date', 'ቀን') + ' *'} hint={form.opened_on ? formatEthiopianDate(form.opened_on, locale) : undefined}>
                <input type="date" required max={today} value={form.opened_on} onChange={(e) => setForm((f) => ({ ...f, opened_on: e.target.value }))} className="form-input text-sm" />
              </Field>
            </div>
            <Field label={t('What happened', 'የተፈጠረው ጉዳይ') + ' *'}>
              <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="form-input text-sm" />
            </Field>
            <Field label={t('Handled by', 'ጉዳዩን የያዘው')}>
              <input type="text" value={form.handled_by} placeholder={t('e.g. HR department, father of confession', 'ለምሳሌ፦ የሰው ሀብት ክፍል፣ የንስሐ አባት')} onChange={(e) => setForm((f) => ({ ...f, handled_by: e.target.value }))} className="form-input text-sm" />
            </Field>
            {form.kind === 'SUSPENSION' && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 space-y-3">
                <Field label={t('Suspended until', 'እገዳው እስከ')} hint={form.suspended_until ? formatEthiopianDate(form.suspended_until, locale) : t('Leave empty until further notice', 'እስከ ተጨማሪ ውሳኔ ከሆነ ባዶ ይተዉ')}>
                  <input type="date" min={form.opened_on} value={form.suspended_until} onChange={(e) => setForm((f) => ({ ...f, suspended_until: e.target.value }))} className="form-input text-sm" />
                </Field>
                {editing === 'new' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={form.end_assignments} onChange={(e) => setForm((f) => ({ ...f, end_assignments: e.target.checked }))} />
                    {t('Also end their current assignments (recorded as suspended)', 'የአሁን ምደባዎቻቸውንም አጠናቅ (እንደታገደ ይመዘገባል)')}
                  </label>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
            </div>
          </form>
        </Modal>
      )}

      {closing && (
        <Modal isOpen onClose={() => setClosing(null)} title={t('Close Case', 'ጉዳይ ዝጋ')} subtitle={`${name(closing.person_id)} · ${t(...CASE_KINDS[closing.kind])}`}>
          <form onSubmit={close} className="space-y-4">
            {error && <ErrorBox text={error} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Outcome', 'ውጤት')}>
                <select value={closeForm.status} onChange={(e) => setCloseForm((f) => ({ ...f, status: e.target.value as 'RESOLVED' | 'DISMISSED' }))} className="form-input text-sm">
                  <option value="RESOLVED">{t('Resolved', 'ተፈትቷል')}</option>
                  <option value="DISMISSED">{t('Dismissed (unfounded)', 'ውድቅ (መሠረት የሌለው)')}</option>
                </select>
              </Field>
              <Field label={t('Closed on', 'የተዘጋበት ቀን') + ' *'} hint={formatEthiopianDate(closeForm.closed_on, locale)}>
                <input type="date" required min={closing.opened_on} max={today} value={closeForm.closed_on} onChange={(e) => setCloseForm((f) => ({ ...f, closed_on: e.target.value }))} className="form-input text-sm" />
              </Field>
            </div>
            <Field label={t('How it was settled', 'እንዴት እንደተፈታ') + ' *'}>
              <textarea required rows={3} value={closeForm.resolution} onChange={(e) => setCloseForm((f) => ({ ...f, resolution: e.target.value }))} className="form-input text-sm" />
            </Field>
            {closing.kind === 'SUSPENSION' && <p className="text-[11px] text-slate-500">{t('Closing a suspension lifts it. Assign the servant again under Assignments if they return to service.', 'እገዳውን መዝጋት እገዳውን ያነሳል። ወደ አገልግሎት ከተመለሱ በምደባዎች እንደገና ይመድቡ።')}</p>}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setClosing(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Close case', 'ጉዳዩን ዝጋ')}</button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal isOpen onClose={() => setViewing(null)} title={name(viewing.person_id)} subtitle={`${t(...CASE_KINDS[viewing.kind])} · ${formatEthiopianDate(viewing.opened_on, locale)}`}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <span className={CASE_STATUS[viewing.status].cls}>{t(...CASE_STATUS[viewing.status].label)}</span>
              {viewing.closed_on && <span className="text-xs text-slate-500">{formatEthiopianDate(viewing.closed_on, locale)}</span>}
            </div>
            <Detail label={t('What happened', 'የተፈጠረው ጉዳይ')} text={viewing.reason} />
            {viewing.handled_by && <Detail label={t('Handled by', 'ጉዳዩን የያዘው')} text={viewing.handled_by} />}
            {viewing.kind === 'SUSPENSION' && <Detail label={t('Suspended until', 'እገዳው እስከ')} text={viewing.suspended_until ? formatEthiopianDate(viewing.suspended_until, locale) : t('Further notice', 'ተጨማሪ ውሳኔ')} />}
            {viewing.resolution && <Detail label={t('How it was settled', 'እንዴት እንደተፈታ')} text={viewing.resolution} />}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              {canManage && viewing.status === 'OPEN' && <button onClick={() => openClose(viewing)} className="btn btn-primary text-xs">{t('Close case', 'ጉዳዩን ዝጋ')}</button>}
              <button onClick={() => setViewing(null)} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-0.5">{label}</div>
      <p className="text-slate-800 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function Kpi({ value, label, warn = false }: { value: React.ReactNode; label: string; warn?: boolean }) {
  return (
    <div className="card p-5">
      <div className={`text-2xl font-bold tabular-nums ${warn && Number(value) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
