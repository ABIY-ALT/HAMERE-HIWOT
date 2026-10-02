'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Download, Gift, HandCoins, Printer, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { MOCK_DONATIONS } from '@/lib/mock/modules';
import { refreshFinance } from '@/lib/finance/client';
import { formatETB } from '@/lib/finance/types';
import {
  DONATION_PURPOSES,
  purposeLabel,
  type Donation,
  type DonationStatus,
  type DonationType,
  type DonorOption,
} from '@/lib/finance/donations';
import type { LoadMode } from '@/lib/admin/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { buildReceiptHtml } from '@/lib/finance/receipt';
import { cancelPledge, loadDonations, receivePledge, recordDonation, type DonationInput } from './actions';

type Tab = 'ALL' | 'RECEIVED' | 'PLEDGED' | 'IN_KIND';

const DEMO: Donation[] = MOCK_DONATIONS.map((d) => ({
  id: d.id, receipt_no: d.receipt, donor_name: d.donor, donor_phone: '', donor_person_id: null,
  type: d.type === 'Cash' ? 'CASH' : 'BANK', purpose: d.purpose, amount: d.amount, item_description: '',
  status: 'RECEIVED', pledged_on: null, received_on: d.date, notes: '', recorded_by: '', created_at: `${d.date}T09:00:00Z`,
}));

const EMPTY_FORM: DonationInput = {
  donor_name: '',
  donor_person_id: '',
  donor_phone: '',
  type: 'CASH',
  purpose: DONATION_PURPOSES[0][0],
  amount: '' as unknown as number,
  item_description: '',
  status: 'RECEIVED',
  date: '',
  notes: '',
};

export default function DonationsPage() {
  const { t, locale } = useLang();
  const { user, can } = useAuth();
  const canRecord = can('FINANCE_CREATE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [donations, setDonations] = useState<Donation[]>([]);
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DonationInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Donation | null>(null);
  const [receivedOn, setReceivedOn] = useState('');

  const typeLabel = (x: DonationType) =>
    ({ CASH: t('Cash', 'በጥሬ ገንዘብ'), BANK: t('Bank transfer', 'በባንክ'), IN_KIND: t('In kind (items)', 'በዓይነት (ዕቃ)') })[x];
  const statusLabel = (s: DonationStatus) =>
    ({ RECEIVED: t('Received', 'ደርሷል'), PLEDGED: t('Pledged', 'ቃል የተገባ'), CANCELLED: t('Cancelled', 'ተሰርዟል') })[s];
  const statusClass = (s: DonationStatus) =>
    s === 'RECEIVED' ? 'badge badge-success' : s === 'PLEDGED' ? 'badge badge-warning' : 'badge bg-slate-100 text-slate-500';

  const apply = useCallback((res: Awaited<ReturnType<typeof loadDonations>>) => {
    if (res.mode === 'live') {
      setDonations(res.data.donations);
      setDonors(res.data.donors);
    } else if (res.mode === 'demo') {
      setDonations((d) => (d.length ? d : DEMO));
    } else {
      setError(res.error);
    }
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadDonations().then(apply);
  }, [apply]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const year = todayIso().slice(0, 4);
  const received = donations.filter((d) => d.status === 'RECEIVED');
  const kpi = {
    cashThisYear: received.filter((d) => d.type !== 'IN_KIND' && (d.received_on ?? '').startsWith(year)).reduce((s, d) => s + d.amount, 0),
    pledgesOpen: donations.filter((d) => d.status === 'PLEDGED').reduce((s, d) => s + d.amount, 0),
    inKindThisYear: received.filter((d) => d.type === 'IN_KIND' && (d.received_on ?? '').startsWith(year)).reduce((s, d) => s + d.amount, 0),
    donors: new Set(donations.filter((d) => d.status !== 'CANCELLED' && d.donor_name !== 'Anonymous').map((d) => d.donor_name)).size,
  };

  const needle = search.toLowerCase();
  const rows = donations
    .filter((d) =>
      tab === 'ALL' ? true : tab === 'IN_KIND' ? d.type === 'IN_KIND' : d.status === tab
    )
    .filter(
      (d) =>
        d.receipt_no.toLowerCase().includes(needle) ||
        d.donor_name.toLowerCase().includes(needle) ||
        purposeLabel(d.purpose, locale).toLowerCase().includes(needle) ||
        d.item_description.toLowerCase().includes(needle)
    );

  const set = (key: keyof DonationInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const pickMember = (personId: string) => {
    const p = donors.find((d) => d.id === personId);
    setForm((f) => ({ ...f, donor_person_id: personId, donor_name: p?.name ?? f.donor_name, donor_phone: p?.phone ?? f.donor_phone }));
  };

  const openForm = () => {
    setForm({ ...EMPTY_FORM, date: todayIso() });
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (mode === 'live') {
      setBusy(true);
      const res = await recordDonation({ ...form, amount: Number(form.amount) });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadDonations());
      void refreshFinance();
      showToast('success', t(`Donation recorded — receipt ${res.receipt_no}`, `ስጦታው ተመዝግቧል — ደረሰኝ ${res.receipt_no}`));
    } else {
      const receipt = `DON-${year}-${String(donations.length + 1).padStart(4, '0')}`;
      setDonations((list) => [
        {
          id: `don-${Date.now()}`, receipt_no: receipt, donor_name: form.donor_name || 'Anonymous', donor_phone: form.donor_phone,
          donor_person_id: form.donor_person_id || null, type: form.type, purpose: form.purpose, amount: Number(form.amount),
          item_description: form.item_description, status: form.status, pledged_on: form.status === 'PLEDGED' ? form.date : null,
          received_on: form.status === 'RECEIVED' ? form.date : null, notes: form.notes, recorded_by: user?.person.full_name_en ?? '',
          created_at: new Date().toISOString(),
        },
        ...list,
      ]);
      showToast('success', t(`Donation recorded — receipt ${receipt}`, `ስጦታው ተመዝግቧል — ደረሰኝ ${receipt}`));
    }
    setFormOpen(false);
  };

  const runOnSelected = async (action: 'receive' | 'cancel') => {
    if (!selected) return;
    setBusy(true);
    if (mode === 'live') {
      const res = action === 'receive' ? await receivePledge(selected.id, receivedOn) : await cancelPledge(selected.id);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      apply(await loadDonations());
      void refreshFinance();
    } else {
      setBusy(false);
      setDonations((list) =>
        list.map((d) =>
          d.id === selected.id
            ? action === 'receive' ? { ...d, status: 'RECEIVED', received_on: receivedOn } : { ...d, status: 'CANCELLED' }
            : d
        )
      );
    }
    setSelected(null);
    showToast('success', action === 'receive' ? t('Pledge received and booked as income', 'ቃሉ ደርሷል፤ እንደ ገቢ ተመዝግቧል') : t('Pledge cancelled', 'ቃሉ ተሰርዟል'));
  };

  const printReceipt = (d: Donation) => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return showToast('error', t('Allow pop-ups to print the receipt.', 'ደረሰኙን ለማተም ብቅ-ባይ መስኮቶችን ይፍቀዱ።'));
    w.document.write(buildReceiptHtml(d, d.recorded_by || user?.person.full_name_en || ''));
    w.document.close();
  };

  const exportExcel = async () => {
    const header = [
      t('Receipt', 'ደረሰኝ'), t('Donor', 'ለጋሽ'), t('Phone', 'ስልክ'), t('Type', 'ዓይነት'), t('Purpose', 'ዓላማ'),
      t('Amount (ETB)', 'መጠን (ብር)'), t('Items', 'ዕቃዎች'), t('Status', 'ሁኔታ'), t('Date', 'ቀን'), t('Recorded by', 'የመዘገበው'),
    ].map(headerCell);
    const body = rows.map((d) => [
      d.receipt_no, cell(d.donor_name), d.donor_phone, typeLabel(d.type), purposeLabel(d.purpose, locale), d.amount,
      cell(d.item_description), statusLabel(d.status), d.received_on ?? d.pledged_on ?? '', d.recorded_by,
    ]);
    await downloadXlsx(`donations_${todayIso()}`, [header, ...body], { sheet: 'Donations', widths: [16, 24, 14, 14, 22, 14, 24, 12, 12, 20] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Donations & Pledges', 'ስጦታዎችና የስጦታ ቃሎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Received cash and bank donations are added to income automatically.', 'የደረሱ የጥሬ ገንዘብና የባንክ ስጦታዎች በራሳቸው ወደ ገቢ ይመዘገባሉ።')}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
          {canRecord && (
            <button onClick={openForm} disabled={mode === 'loading' || mode === 'error'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Gift size={14} /> {t('Record Donation', 'ስጦታ መዝግብ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={t(`Received in ${year} (cash & bank)`, `በ${year} የደረሰ (ጥሬና ባንክ)`)} value={formatETB(kpi.cashThisYear)} />
        <Kpi label={t('Open pledges', 'ያልደረሱ የስጦታ ቃሎች')} value={formatETB(kpi.pledgesOpen)} />
        <Kpi label={t(`In-kind gifts ${year} (estimated)`, `በዓይነት ስጦታ ${year} (ግምት)`)} value={formatETB(kpi.inKindThisYear)} />
        <Kpi label={t('Named donors', 'ስማቸው የተመዘገቡ ለጋሾች')} value={String(kpi.donors)} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-100 flex flex-wrap gap-1">
          {(['ALL', 'RECEIVED', 'PLEDGED', 'IN_KIND'] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {k === 'ALL' ? t('All', 'ሁሉም') : k === 'RECEIVED' ? t('Received', 'የደረሱ') : k === 'PLEDGED' ? t('Pledges', 'የስጦታ ቃሎች') : t('In kind', 'በዓይነት')}
            </button>
          ))}
        </div>
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search donor, receipt, purpose…', 'ለጋሽ፣ ደረሰኝ፣ ዓላማ ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Receipt', 'ደረሰኝ')}</th>
                <th>{t('Donor', 'ለጋሽ')}</th>
                <th>{t('Purpose', 'ዓላማ')}</th>
                <th>{t('Type', 'ዓይነት')}</th>
                <th className="text-right">{t('Amount', 'መጠን')}</th>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{d.receipt_no}</td>
                  <td>
                    <div className="font-medium text-slate-900">{d.donor_name}</div>
                    {d.donor_phone && <div className="text-[11px] text-slate-400 font-mono">{d.donor_phone}</div>}
                  </td>
                  <td className="text-xs text-slate-700">
                    {purposeLabel(d.purpose, locale)}
                    {d.item_description && <div className="text-[11px] text-slate-400">{d.item_description}</div>}
                  </td>
                  <td className="text-xs text-slate-600">{typeLabel(d.type)}</td>
                  <td className="text-right font-mono font-semibold whitespace-nowrap">{formatETB(d.amount)}</td>
                  <td className="text-xs text-slate-600 whitespace-nowrap">{formatEthiopianDate(d.received_on ?? d.pledged_on ?? d.created_at.slice(0, 10), locale)}</td>
                  <td><span className={statusClass(d.status)}>{statusLabel(d.status)}</span></td>
                  <td className="text-right whitespace-nowrap">
                    {d.status !== 'CANCELLED' && (
                      <button onClick={() => printReceipt(d)} className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 inline-flex items-center gap-1" title={t('Print receipt', 'ደረሰኝ አትም')}>
                        <Printer size={13} />
                      </button>
                    )}
                    {d.status === 'PLEDGED' && canRecord && (
                      <button
                        onClick={() => {
                          setSelected(d);
                          setReceivedOn(todayIso());
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 inline-flex items-center gap-1"
                      >
                        <HandCoins size={13} /> {t('Received', 'ደርሷል')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">{t('No donations yet.', 'እስካሁን ስጦታ የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record donation */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={t('Record Donation', 'ስጦታ መዝግብ')} subtitle={t('A receipt number is given automatically', 'የደረሰኝ ቁጥር በራሱ ይሰጣል')} maxWidth="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          <div className="flex gap-2">
            {(['RECEIVED', 'PLEDGED'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm((f) => ({ ...f, status: s }))}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border ${form.status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
              >
                {s === 'RECEIVED' ? t('Received now', 'አሁን ደርሷል') : t('Pledge (promised, not yet received)', 'ቃል (ገና ያልደረሰ)')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {donors.length > 0 && (
              <Field label={t('Registered member (optional)', 'የተመዘገበ አባል (ካለ)')}>
                <select value={form.donor_person_id} onChange={(e) => pickMember(e.target.value)} className="form-input text-sm">
                  <option value="">{t('— Not a member / anonymous —', '— አባል ያልሆነ / ስም የሌለው —')}</option>
                  {donors.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t('Donor name (empty = Anonymous)', 'የለጋሹ ስም (ባዶ = ስም የለሽ)')}>
              <input type="text" value={form.donor_name} onChange={set('donor_name')} className="form-input text-sm" />
            </Field>
            <Field label={t('Phone', 'ስልክ')}>
              <input type="tel" value={form.donor_phone} onChange={set('donor_phone')} className="form-input text-sm" />
            </Field>
            <Field label={t('Type', 'ዓይነት') + ' *'}>
              <select value={form.type} onChange={set('type')} className="form-input text-sm">
                {(['CASH', 'BANK', 'IN_KIND'] as DonationType[]).map((x) => (
                  <option key={x} value={x}>{typeLabel(x)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Purpose', 'ዓላማ') + ' *'}>
              <select value={form.purpose} onChange={set('purpose')} className="form-input text-sm">
                {DONATION_PURPOSES.map(([en, am]) => (
                  <option key={en} value={en}>{locale === 'am' ? am : en}</option>
                ))}
              </select>
            </Field>
            <Field label={(form.type === 'IN_KIND' ? t('Estimated value (ETB)', 'የተገመተ ዋጋ (ብር)') : t('Amount (ETB)', 'መጠን (ብር)')) + ' *'}>
              <input type="number" required min="0.01" step="0.01" value={String(form.amount)} onChange={set('amount')} className="form-input text-sm font-mono" />
            </Field>
            <Field label={(form.status === 'RECEIVED' ? t('Date received', 'የደረሰበት ቀን') : t('Date pledged', 'ቃል የተገባበት ቀን')) + ' *'}>
              <input type="date" required max={todayIso()} value={form.date} onChange={set('date')} className="form-input text-sm" />
            </Field>
          </div>
          {form.type === 'IN_KIND' && (
            <Field label={t('Items given', 'የተሰጡ ዕቃዎች') + ' *'}>
              <input type="text" required value={form.item_description} onChange={set('item_description')} placeholder={t('e.g. 20 Bibles, 1 projector', 'ለምሳሌ፡ 20 መጽሐፍ ቅዱስ፣ 1 ፕሮጀክተር')} className="form-input text-sm" />
            </Field>
          )}
          <Field label={t('Notes', 'ማስታወሻ')}>
            <input type="text" value={form.notes} onChange={set('notes')} className="form-input text-sm" />
          </Field>
          <p className="text-xs text-slate-500">
            {form.status === 'PLEDGED'
              ? t('A pledge is not counted as income until it is marked received.', 'የስጦታ ቃል እስኪደርስ ድረስ እንደ ገቢ አይቆጠርም።')
              : form.type === 'IN_KIND'
                ? t('In-kind gifts are recorded with their value but are not cash income.', 'በዓይነት የተሰጡ ስጦታዎች በዋጋቸው ይመዘገባሉ፤ ግን የጥሬ ገንዘብ ገቢ አይደሉም።')
                : t('This donation will also appear on the Income page.', 'ይህ ስጦታ በገቢ ገጽ ላይም ይታያል።')}
          </p>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
          </div>
        </form>
      </Modal>

      {/* Pledge received / cancel */}
      {selected && (
        <Modal isOpen onClose={() => setSelected(null)} title={t('Pledge', 'የስጦታ ቃል')} subtitle={`${selected.receipt_no} · ${selected.donor_name} · ${formatETB(selected.amount)}`}>
          <div className="space-y-4 text-sm">
            <Field label={t('Date received', 'የደረሰበት ቀን')}>
              <input type="date" max={todayIso()} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="form-input text-sm" />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100">
              <button disabled={busy} onClick={() => runOnSelected('cancel')} className="btn btn-secondary text-xs disabled:opacity-50">{t('Cancel pledge', 'ቃሉን ሰርዝ')}</button>
              <button disabled={busy || !receivedOn} onClick={() => runOnSelected('receive')} className="btn btn-primary text-xs disabled:opacity-50">{t('Mark as received', 'እንደደረሰ መዝግብ')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
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
