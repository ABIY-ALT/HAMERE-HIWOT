'use client';

import React, { useState } from 'react';
import { AlertCircle, ArrowRight, ClipboardCheck, Pencil, Trash2, Truck, Wrench } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { formatETB } from '@/lib/finance/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { runProperty, useProperty } from '@/lib/property/client';
import {
  ASSET_CATEGORIES,
  CONDITION_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  assetCategoryLabel,
  isHeld,
  type Asset,
  type AssetCondition,
  type MaintenanceJob,
} from '@/lib/property/types';
import {
  cancelMaintenance,
  closeMaintenance,
  openMaintenance,
  saveAsset,
  setAssetStatus,
  transferAsset,
  verifyAsset,
  type AssetInput,
} from '@/app/dashboard/property/actions';

type Done = (message: string) => void;

function useT() {
  const { t, locale } = useLang();
  return { t, locale, pair: (p: [string, string]) => t(p[0], p[1]) };
}

function ErrorBox({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} /> {text}
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

function Footer({ busy, onCancel, label }: { busy: boolean; onCancel: () => void; label: string }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
      <button type="button" onClick={onCancel} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
      <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : label}</button>
    </div>
  );
}

const ConditionSelect = ({ value, onChange }: { value: AssetCondition; onChange: (v: AssetCondition) => void }) => {
  const { pair } = useT();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AssetCondition)} className="form-input text-sm">
      {(Object.keys(CONDITION_LABEL) as AssetCondition[]).map((c) => (
        <option key={c} value={c}>{pair(CONDITION_LABEL[c])}</option>
      ))}
    </select>
  );
};

// ── Register / edit ──────────────────────────────────────────────────────────

export function AssetFormDialog({ asset, onClose, onDone }: { asset?: Asset; onClose: () => void; onDone: Done }) {
  const { t, locale } = useT();
  const { units, people } = useProperty();
  const [form, setForm] = useState<AssetInput>({
    name_en: asset?.name_en ?? '',
    name_am: asset && asset.name_am !== asset.name_en ? asset.name_am : '',
    category: asset?.category ?? ASSET_CATEGORIES[0][0],
    serial_no: asset?.serial_no ?? '',
    condition: asset?.condition ?? 'GOOD',
    location: asset?.location ?? '',
    acquired_on: asset?.acquired_on ?? '',
    acquisition_type: asset?.acquisition_type ?? 'PURCHASE',
    value: asset?.value === null || asset?.value === undefined ? '' : String(asset.value),
    notes: asset?.notes ?? '',
    unit_id: '',
    custodian_id: '',
    in_store: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof AssetInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runProperty(() => saveAsset(asset?.id ?? null, form));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(asset ? t('Asset updated', 'ንብረቱ ተቀይሯል') : t('Asset registered', 'ንብረቱ ተመዝግቧል'));
  };

  return (
    <Modal isOpen onClose={onClose} title={asset ? `${t('Edit', 'አርትዕ')} ${asset.tag}` : t('Register Asset', 'ንብረት መዝግብ')} subtitle={asset ? undefined : t('A tag number is given automatically', 'የመለያ ቁጥር በራሱ ይሰጣል')} maxWidth="xl">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Item name (English)', 'የዕቃው ስም (እንግሊዝኛ)') + ' *'}>
            <input type="text" required value={form.name_en} onChange={set('name_en')} className="form-input text-sm" />
          </Field>
          <Field label={t('Item name (Amharic)', 'የዕቃው ስም (አማርኛ)')}>
            <input type="text" value={form.name_am} onChange={set('name_am')} className="form-input text-sm" />
          </Field>
          <Field label={t('Category', 'ምድብ') + ' *'}>
            <select value={form.category} onChange={set('category')} className="form-input text-sm">
              {ASSET_CATEGORIES.map(([en, am]) => <option key={en} value={en}>{locale === 'am' ? am : en}</option>)}
            </select>
          </Field>
          <Field label={t('Serial / model no.', 'ተከታታይ / ሞዴል ቁጥር')}>
            <input type="text" value={form.serial_no} onChange={set('serial_no')} className="form-input text-sm font-mono" />
          </Field>
          <Field label={t('Condition', 'ሁኔታ')}>
            <ConditionSelect value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />
          </Field>
          <Field label={t('Location', 'የሚገኝበት ቦታ')}>
            <input type="text" value={form.location} onChange={set('location')} placeholder={t('e.g. Store room, Hall', 'ለምሳሌ፡ መጋዘን፣ አዳራሽ')} className="form-input text-sm" />
          </Field>
          <Field label={t('Acquired', 'የተገኘበት')}>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.acquisition_type} onChange={set('acquisition_type')} className="form-input text-sm">
                <option value="PURCHASE">{t('Purchased', 'የተገዛ')}</option>
                <option value="DONATION">{t('Donated', 'በስጦታ')}</option>
                <option value="OTHER">{t('Other', 'ሌላ')}</option>
              </select>
              <input type="date" max={todayIso()} value={form.acquired_on} onChange={set('acquired_on')} className="form-input text-sm" />
            </div>
          </Field>
          <Field label={t('Value (ETB)', 'ዋጋ (ብር)')}>
            <input type="number" min="0" step="0.01" value={String(form.value)} onChange={set('value')} className="form-input text-sm font-mono" />
          </Field>
          {!asset && (
            <>
              <Field label={t('Held by department', 'የሚይዘው ክፍል')}>
                <select value={form.unit_id} onChange={set('unit_id')} className="form-input text-sm">
                  <option value="">—</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
                </select>
              </Field>
              <Field label={t('Custodian (person responsible)', 'ኃላፊ (የሚይዘው ሰው)')}>
                <select value={form.custodian_id} onChange={set('custodian_id')} className="form-input text-sm">
                  <option value="">—</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={form.in_store} onChange={(e) => setForm((f) => ({ ...f, in_store: e.target.checked }))} />
                {t('Kept in store (not in use yet)', 'በመጋዘን ተቀምጧል (ገና በአገልግሎት ላይ አይደለም)')}
              </label>
            </>
          )}
        </div>
        <Field label={t('Notes', 'ማስታወሻ')}>
          <textarea rows={2} value={form.notes} onChange={set('notes')} className="form-input text-sm" />
        </Field>
        <Footer busy={busy} onCancel={onClose} label={t('Save', 'መዝግብ')} />
      </form>
    </Modal>
  );
}

// ── Transfer / assign ────────────────────────────────────────────────────────

export function TransferDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: Done }) {
  const { t, locale } = useT();
  const { units, people } = useProperty();
  const [toUnit, setToUnit] = useState(asset.unit_id ?? '');
  const [toPerson, setToPerson] = useState(asset.custodian_id ?? '');
  const [movedOn, setMovedOn] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [inStore, setInStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runProperty(() => transferAsset(asset.id, { to_unit_id: toUnit, to_person_id: toPerson, moved_on: movedOn, reason, in_store: inStore }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t('Custody updated — recorded in the history', 'ኃላፊነቱ ተቀይሯል — በታሪክ ተመዝግቧል'));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Transfer / Hand Over', 'ዝውውር / ርክክብ')} subtitle={`${asset.tag} · ${locale === 'am' ? asset.name_am : asset.name_en}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2.5">
          {t('Now', 'አሁን')}: <strong>{(locale === 'am' ? asset.unit_am : asset.unit) || '—'}</strong> · <strong>{asset.custodian || '—'}</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('To department', 'ወደ ክፍል')}>
            <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="form-input text-sm">
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
            </select>
          </Field>
          <Field label={t('To person (new custodian)', 'ለሰው (አዲስ ኃላፊ)')}>
            <select value={toPerson} onChange={(e) => setToPerson(e.target.value)} className="form-input text-sm">
              <option value="">—</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={t('Date', 'ቀን') + ' *'}>
            <input type="date" required max={todayIso()} value={movedOn} onChange={(e) => setMovedOn(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Reason', 'ምክንያት') + ' *'}>
            <input type="text" required value={reason} onChange={(e) => setReason(e.target.value)} className="form-input text-sm" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={inStore} onChange={(e) => setInStore(e.target.checked)} />
          {t('Returned to the store', 'ወደ መጋዘን ተመልሷል')}
        </label>
        <Footer busy={busy} onCancel={onClose} label={t('Record hand-over', 'ርክክብ መዝግብ')} />
      </form>
    </Modal>
  );
}

// ── Maintenance ──────────────────────────────────────────────────────────────

export function RepairDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: Done }) {
  const { t, locale } = useT();
  const [kind, setKind] = useState<'REPAIR' | 'SERVICE' | 'INSPECTION'>('REPAIR');
  const [description, setDescription] = useState('');
  const [reportedOn, setReportedOn] = useState(todayIso());
  const [handledBy, setHandledBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runProperty(() => openMaintenance(asset.id, { kind, description, reported_on: reportedOn, handled_by: handledBy }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(kind === 'REPAIR' ? t('Repair opened — asset marked under repair', 'ጥገና ተከፍቷል — ንብረቱ በጥገና ላይ ተደርጓል') : t('Maintenance job opened', 'የጥገና ሥራ ተከፍቷል'));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Report Repair / Service', 'ጥገና / አገልግሎት ሪፖርት')} subtitle={`${asset.tag} · ${locale === 'am' ? asset.name_am : asset.name_en}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Type', 'ዓይነት')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="form-input text-sm">
              <option value="REPAIR">{t('Repair', 'ጥገና')}</option>
              <option value="SERVICE">{t('Routine service', 'መደበኛ አገልግሎት')}</option>
              <option value="INSPECTION">{t('Inspection', 'ፍተሻ')}</option>
            </select>
          </Field>
          <Field label={t('Date reported', 'የተዘገበበት ቀን')}>
            <input type="date" max={todayIso()} value={reportedOn} onChange={(e) => setReportedOn(e.target.value)} className="form-input text-sm" />
          </Field>
        </div>
        <Field label={t('Problem / work needed', 'ችግሩ / የሚያስፈልገው ሥራ') + ' *'}>
          <textarea rows={2} required value={description} onChange={(e) => setDescription(e.target.value)} className="form-input text-sm" />
        </Field>
        <Field label={t('Handled by (technician / vendor)', 'የሚያከናውነው (ባለሙያ / ድርጅት)')}>
          <input type="text" value={handledBy} onChange={(e) => setHandledBy(e.target.value)} className="form-input text-sm" />
        </Field>
        <Footer busy={busy} onCancel={onClose} label={t('Open job', 'ሥራ ክፈት')} />
      </form>
    </Modal>
  );
}

export function CloseJobDialog({ job, asset, onClose, onDone }: { job: MaintenanceJob; asset: Asset | undefined; onClose: () => void; onDone: Done }) {
  const { t, locale } = useT();
  const { can } = useAuth();
  const [completedOn, setCompletedOn] = useState(todayIso());
  const [cost, setCost] = useState('');
  const [condition, setCondition] = useState<AssetCondition>(asset?.condition === 'DAMAGED' ? 'GOOD' : asset?.condition ?? 'GOOD');
  const [book, setBook] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runProperty(() => closeMaintenance(job.id, { completed_on: completedOn, cost, condition, book_expense: book }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(book ? t('Job closed — cost added to Expenses', 'ሥራው ተዘግቷል — ወጪው ወደ ወጪዎች ተጨምሯል') : t('Job closed', 'ሥራው ተዘግቷል'));
  };
  const cancelJob = async () => {
    setBusy(true);
    const res = await runProperty(() => cancelMaintenance(job.id));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t('Job cancelled', 'ሥራው ተሰርዟል'));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Close Maintenance Job', 'የጥገና ሥራ ዝጋ')} subtitle={`${asset?.tag ?? ''} · ${asset ? (locale === 'am' ? asset.name_am : asset.name_en) : ''}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{job.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('Completed on', 'የተጠናቀቀበት')}>
            <input type="date" required min={job.reported_on} max={todayIso()} value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Cost (ETB)', 'ወጪ (ብር)')}>
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="form-input text-sm font-mono" />
          </Field>
          <Field label={t('Condition now', 'የአሁኑ ሁኔታ')}>
            <ConditionSelect value={condition} onChange={setCondition} />
          </Field>
        </div>
        {can('FINANCE_CREATE') && Number(cost) > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} />
            {t(`Add ${formatETB(Number(cost))} to Expenses (Maintenance & Repair)`, `${formatETB(Number(cost))} ወደ ወጪዎች ጨምር (ጥገና)`)}
          </label>
        )}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
          <button type="button" disabled={busy} onClick={cancelJob} className="btn btn-secondary text-xs disabled:opacity-50">{t('Cancel job', 'ሥራውን ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Mark done', 'ተጠናቋል')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Stocktake ────────────────────────────────────────────────────────────────

export function VerifyDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: Done }) {
  const { t, locale } = useT();
  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [location, setLocation] = useState(asset.location);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runProperty(() => verifyAsset(asset.id, { condition, location }));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t(`${asset.tag} checked`, `${asset.tag} ተረጋግጧል`));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Stocktake: item seen', 'ቆጠራ፡ ዕቃው ታይቷል')} subtitle={`${asset.tag} · ${locale === 'am' ? asset.name_am : asset.name_en}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Condition', 'ሁኔታ')}>
            <ConditionSelect value={condition} onChange={setCondition} />
          </Field>
          <Field label={t('Found at', 'የተገኘበት ቦታ')}>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="form-input text-sm" />
          </Field>
        </div>
        <Footer busy={busy} onCancel={onClose} label={t('Confirm seen today', 'ዛሬ ታይቷል')} />
      </form>
    </Modal>
  );
}

// ── Details with history and actions ─────────────────────────────────────────

export type AssetAction = 'edit' | 'transfer' | 'repair' | 'verify';

export function AssetDetails({ asset, onClose, onAction, onDone }: { asset: Asset; onClose: () => void; onAction: (a: AssetAction) => void; onDone: Done }) {
  const { t, locale, pair } = useT();
  const { can } = useAuth();
  const { movements, maintenance } = useProperty();
  const [writeOff, setWriteOff] = useState<'DISPOSED' | 'LOST' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const history = [
    ...movements.filter((m) => m.asset_id === asset.id).map((m) => ({
      date: m.moved_on,
      text: `${m.reason === 'Registered' ? t('Registered', 'ተመዘገበ') : t('Handed over', 'ተሰጠ')}: ${[m.from_unit, m.from_person].filter(Boolean).join(' · ') || '—'} → ${[m.to_unit, m.to_person].filter(Boolean).join(' · ') || t('store', 'መጋዘን')}${m.reason && m.reason !== 'Registered' ? ` (${m.reason})` : ''}`,
    })),
    ...maintenance.filter((j) => j.asset_id === asset.id).map((j) => ({
      date: j.reported_on,
      text: `${j.kind === 'REPAIR' ? t('Repair', 'ጥገና') : j.kind === 'SERVICE' ? t('Service', 'አገልግሎት') : t('Inspection', 'ፍተሻ')}: ${j.description} — ${j.status === 'DONE' ? `${t('done', 'ተጠናቋል')} ${j.completed_on}${j.cost ? `, ${formatETB(j.cost)}` : ''}` : j.status === 'OPEN' ? t('open', 'ክፍት') : t('cancelled', 'ተሰርዟል')}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const confirmWriteOff = async () => {
    if (!writeOff) return;
    setBusy(true);
    const res = await runProperty(() => setAssetStatus(asset.id, writeOff, note));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(writeOff === 'DISPOSED' ? t('Asset written off as disposed', 'ንብረቱ እንደተወገደ ተመዝግቧል') : t('Asset recorded as lost', 'ንብረቱ እንደጠፋ ተመዝግቧል'));
  };

  const held = isHeld(asset);
  const canEdit = can('ASSET_CREATE');
  const canMove = can('ASSET_ASSIGN') || can('ASSET_TRANSFER');

  return (
    <Modal isOpen onClose={onClose} title={`${asset.tag} · ${locale === 'am' ? asset.name_am : asset.name_en}`} subtitle={assetCategoryLabel(asset.category, locale)} maxWidth="xl">
      <div className="space-y-4 text-sm">
        <ErrorBox text={error} />
        <div className="flex flex-wrap gap-2">
          <span className={STATUS_STYLE[asset.status]}>{pair(STATUS_LABEL[asset.status])}</span>
          <span className="badge bg-slate-100 text-slate-700">{pair(CONDITION_LABEL[asset.condition])}</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-xs">
          <Info label={t('Department', 'ክፍል')} value={(locale === 'am' ? asset.unit_am : asset.unit) || '—'} />
          <Info label={t('Custodian', 'ኃላፊ')} value={asset.custodian || '—'} />
          <Info label={t('Location', 'ቦታ')} value={asset.location || '—'} />
          <Info label={t('Serial no.', 'ተከታታይ ቁጥር')} value={asset.serial_no || '—'} />
          <Info label={t('Acquired', 'የተገኘበት')} value={`${asset.acquisition_type === 'DONATION' ? t('donated', 'በስጦታ') : asset.acquisition_type === 'PURCHASE' ? t('purchased', 'የተገዛ') : t('other', 'ሌላ')}${asset.acquired_on ? ` · ${formatEthiopianDate(asset.acquired_on, locale)}` : ''}`} />
          <Info label={t('Value', 'ዋጋ')} value={asset.value === null ? '—' : formatETB(asset.value)} />
          <Info label={t('Last checked (stocktake)', 'መጨረሻ የተቆጠረው')} value={asset.last_verified_on ? formatEthiopianDate(asset.last_verified_on, locale) : t('never', 'በጭራሽ')} />
        </dl>
        {asset.notes && <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg p-2.5">{asset.notes}</p>}

        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{t('History', 'ታሪክ')}</h4>
          {history.length === 0 ? (
            <p className="text-xs text-slate-400">{t('No history yet.', 'እስካሁን ታሪክ የለም።')}</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {history.map((h, i) => (
                <li key={i} className="text-xs flex gap-3">
                  <span className="text-slate-400 font-mono shrink-0">{h.date}</span>
                  <span className="text-slate-700">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {held && (canEdit || canMove) && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {canMove && <button onClick={() => onAction('transfer')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Truck size={13} /> {t('Transfer / hand over', 'ዝውውር / ርክክብ')}</button>}
            {canEdit && <button onClick={() => onAction('repair')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Wrench size={13} /> {t('Report repair', 'ጥገና ሪፖርት')}</button>}
            {canEdit && <button onClick={() => onAction('verify')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><ClipboardCheck size={13} /> {t('Stocktake', 'ቆጠራ')}</button>}
            {canEdit && <button onClick={() => onAction('edit')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Pencil size={13} /> {t('Edit', 'አርትዕ')}</button>}
            {canEdit && <button onClick={() => setWriteOff('DISPOSED')} className="btn btn-danger text-xs inline-flex items-center gap-1.5"><Trash2 size={13} /> {t('Write off', 'አስወግድ')}</button>}
          </div>
        )}
        {!held && canEdit && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await runProperty(() => setAssetStatus(asset.id, 'IN_STORE', t('Found / returned to store', 'ተገኝቷል / ወደ መጋዘን ተመልሷል')));
              setBusy(false);
              if (!res.ok) return setError(res.error);
              onDone(t('Asset back in the store', 'ንብረቱ ወደ መጋዘን ተመልሷል'));
            }}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {t('Found again — return to store', 'እንደገና ተገኝቷል — ወደ መጋዘን መልስ')}
          </button>
        )}

        {writeOff && (
          <div className="space-y-2 p-3 rounded-lg border border-red-200 bg-red-50">
            <div className="flex gap-2">
              {(['DISPOSED', 'LOST'] as const).map((w) => (
                <button key={w} type="button" onClick={() => setWriteOff(w)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${writeOff === w ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                  {w === 'DISPOSED' ? t('Disposed (worn out, broken)', 'የተወገደ (ያረጀ፣ የተሰበረ)') : t('Lost / stolen', 'የጠፋ / የተሰረቀ')}
                </button>
              ))}
            </div>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Reason (required)', 'ምክንያት (ግዴታ)')} className="form-input text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setWriteOff(null)} className="btn btn-secondary text-xs">{t('Back', 'ተመለስ')}</button>
              <button disabled={busy} onClick={confirmWriteOff} className="btn btn-danger text-xs disabled:opacity-50">{t('Confirm', 'አረጋግጥ')} <ArrowRight size={12} /></button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1.5 flex justify-between gap-3 border-b border-slate-100">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right font-medium">{value}</dd>
    </div>
  );
}
