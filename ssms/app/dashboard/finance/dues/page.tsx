'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, ChevronLeft, ChevronRight, Plus, Printer, Search, Send } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatETB } from '@/lib/finance/types';
import { DUES_MONTHS, unpaidMonths } from '@/lib/finance/dues';
import { ETHIOPIAN_MONTHS_AM, ETHIOPIAN_MONTHS_EN, formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  cancelDuesReceipt,
  loadDues,
  recordDuesPayment,
  sendDuesReminders,
  setDuesRate,
  type DuesData,
  type DuesMember,
  type DuesReceipt,
} from './actions';

const MONTHS = Array.from({ length: DUES_MONTHS }, (_, i) => i + 1);

/** Monthly member dues: who paid which month, payments with receipts, and reminders. */
export default function DuesPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<DuesData | null>(null);
  const [rate, setRate] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'BEHIND' | 'PAID'>('ALL');
  const [paying, setPaying] = useState<DuesMember | 'NEW' | null>(null);
  const [receipt, setReceipt] = useState<DuesReceipt | null>(null);
  const [viewing, setViewing] = useState<{ member: DuesMember; receipt_no: string } | null>(null);
  const [remindBehind, setRemindBehind] = useState(2);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadDues>>) => {
    if (res.mode === 'live') {
      setData(res.data);
      setRate(res.data.rate === null ? '' : String(res.data.rate));
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadDues().then(apply);
  }, [apply]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };
  const reload = (year = data?.year) => loadDues(year).then(apply);
  const monthName = (m: number) => (locale === 'am' ? ETHIOPIAN_MONTHS_AM[m - 1] : ETHIOPIAN_MONTHS_EN[m - 1]);
  const name = (m: { name_en: string; name_am: string }) => (locale === 'am' ? m.name_am : m.name_en);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.members
      .map((m) => ({ ...m, behind: unpaidMonths(Object.keys(m.paid).map(Number), data.due_months).length }))
      .filter((m) => !needle || `${m.name_en} ${m.name_am} ${m.code} ${m.phone}`.toLowerCase().includes(needle))
      .filter((m) => filter === 'ALL' || (filter === 'BEHIND' ? m.behind > 0 : m.behind === 0));
  }, [data, search, filter]);

  const totals = useMemo(() => {
    if (!data) return { collected: 0, paidUp: 0, behind: 0, owed: 0 };
    let collected = 0;
    let paidUp = 0;
    let behindMembers = 0;
    let behindMonths = 0;
    for (const m of data.members) {
      for (const p of Object.values(m.paid)) collected += p.amount;
      const b = unpaidMonths(Object.keys(m.paid).map(Number), data.due_months).length;
      if (b === 0) paidUp += 1;
      else behindMembers += 1;
      behindMonths += b;
    }
    return { collected, paidUp, behind: behindMembers, owed: data.rate === null ? 0 : behindMonths * data.rate };
  }, [data]);

  const saveRate = async () => {
    if (!data) return;
    setBusy(true);
    const res = await setDuesRate(data.year, Number(rate));
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Monthly amount saved', 'ወርሃዊ መጠኑ ተቀምጧል'));
    reload();
  };

  const remind = async () => {
    if (!data) return;
    setBusy(true);
    const res = await sendDuesReminders(data.year, remindBehind);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`${res.members} members are behind; ${res.delivered} reminders delivered on Telegram`, `${res.members} አባላት ዘግይተዋል፤ ${res.delivered} ማስታወሻዎች በቴሌግራም ደርሰዋል`));
  };

  const cancel = async (receiptNo: string) => {
    setBusy(true);
    const res = await cancelDuesReceipt(receiptNo);
    setBusy(false);
    setViewing(null);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Receipt cancelled', 'ደረሰኙ ተሰርዟል'));
    reload();
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Member dues', 'ወርሃዊ መዋጮ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Who has paid which month. Payments are also recorded as income in Finance.', 'ማን የትኛውን ወር እንደከፈለ። ክፍያዎች በፋይናንስ ገቢ ውስጥም ይመዘገባሉ።')}
          </p>
        </div>
        {data?.can_record && (
          <button onClick={() => setPaying('NEW')} className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2">
            <Plus size={16} /> {t('Record payment', 'ክፍያ መዝግብ')}
          </button>
        )}
      </div>

      <div className="no-print">
        <AdminModeNotice mode={mode} error={error} />
      </div>

      {data && (
        <div className="no-print space-y-6">
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-1">
              <button onClick={() => reload(data.year - 1)} className="p-1.5 rounded hover:bg-slate-100" aria-label={t('Previous year', 'ያለፈው ዓመት')}>
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-slate-900 px-2">{data.year} {t('E.C.', 'ዓ.ም')}</span>
              <button onClick={() => reload(data.year + 1)} className="p-1.5 rounded hover:bg-slate-100" aria-label={t('Next year', 'ቀጣዩ ዓመት')}>
                <ChevronRight size={18} />
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              {t('Monthly amount', 'ወርሃዊ መጠን')}
              <input
                type="number"
                min={0}
                value={rate}
                disabled={!data.can_record}
                onChange={(e) => setRate(e.target.value)}
                className="form-input text-sm w-28 py-1"
              />
              {t('birr', 'ብር')}
            </label>
            {data.can_record && (
              <button disabled={busy || rate === '' || Number(rate) === data.rate} onClick={saveRate} className="btn btn-secondary text-xs disabled:opacity-50">
                {t('Save', 'አስቀምጥ')}
              </button>
            )}
            {data.rate === null && <span className="text-xs text-amber-700">{t('Set the monthly amount for this year.', 'የዚህን ዓመት ወርሃዊ መጠን ያስገቡ።')}</span>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label={t('Collected this year', 'በዚህ ዓመት የተሰበሰበ')} value={formatETB(totals.collected)} />
            <Stat label={t('Paid up', 'ሙሉ የከፈሉ')} value={`${totals.paidUp} / ${data.members.length}`} />
            <Stat label={t('Behind', 'የዘገዩ')} value={String(totals.behind)} warn={totals.behind > 0} />
            <Stat label={t('Still owed', 'ያልተከፈለ')} value={data.rate === null ? '—' : formatETB(totals.owed)} />
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[12rem] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search member…', 'አባል ፈልግ…')} className="form-input pl-9 text-sm" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="form-input text-sm w-auto">
                <option value="ALL">{t('All members', 'ሁሉም አባላት')}</option>
                <option value="BEHIND">{t('Behind', 'የዘገዩ')}</option>
                <option value="PAID">{t('Paid up', 'ሙሉ የከፈሉ')}</option>
              </select>
              {data.can_record && (
                <span className="inline-flex items-center gap-2 text-xs text-slate-600 ml-auto">
                  {t('Remind on Telegram those behind', 'የዘገዩትን በቴሌግራም አስታውስ፤')}
                  <select value={remindBehind} onChange={(e) => setRemindBehind(Number(e.target.value))} className="form-input text-xs py-1 w-auto">
                    {[1, 2, 3, 6].map((n) => <option key={n} value={n}>{t(`${n}+ months`, `${n}+ ወራት`)}</option>)}
                  </select>
                  <button disabled={busy} onClick={remind} className="btn btn-secondary text-xs inline-flex items-center gap-1">
                    <Send size={13} /> {t('Send', 'ላክ')}
                  </button>
                </span>
              )}
            </div>
            <div className="table-container rounded-none border-0">
              <table>
                <thead>
                  <tr>
                    <th>{t('Member', 'አባል')}</th>
                    {MONTHS.map((m) => (
                      <th key={m} className="text-center px-1 text-[10px]" title={monthName(m)}>
                        {locale === 'am' ? monthName(m) : monthName(m).slice(0, 3)}
                      </th>
                    ))}
                    <th className="text-center">{t('Behind', 'ዘግይቷል')}</th>
                    {data.can_record && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.person_id}>
                      <td>
                        <div className="font-medium text-slate-900">{name(m)}</div>
                        <div className="text-[11px] font-mono text-slate-400">{m.code}</div>
                      </td>
                      {MONTHS.map((month) => {
                        const p = m.paid[month];
                        const due = month <= data.due_months;
                        return (
                          <td key={month} className="text-center px-1">
                            {p ? (
                              <button
                                onClick={() => setViewing({ member: m, receipt_no: p.receipt_no })}
                                title={`${p.receipt_no} · ${formatEthiopianDate(p.paid_on, locale)}`}
                                className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-200"
                              >
                                <Check size={13} />
                              </button>
                            ) : (
                              <span className={`inline-block w-6 h-6 rounded-md ${due ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-100'}`} />
                            )}
                          </td>
                        );
                      })}
                      <td className={`text-center text-xs font-semibold ${m.behind ? 'text-red-600' : 'text-emerald-700'}`}>{m.behind || '✓'}</td>
                      {data.can_record && (
                        <td className="text-right">
                          <button onClick={() => setPaying(m)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 whitespace-nowrap">
                            {t('Pay', 'ክፍያ')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={MONTHS.length + 3} className="text-center text-sm text-slate-400 py-8">{t('No members found', 'ምንም አባል አልተገኘም')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && paying && (
        <PaymentDialog
          data={data}
          member={paying === 'NEW' ? null : paying}
          onClose={() => setPaying(null)}
          onDone={(r) => {
            setPaying(null);
            setReceipt(r);
            reload();
          }}
        />
      )}

      {viewing && data && (
        <Modal isOpen onClose={() => setViewing(null)} title={t('Receipt', 'ደረሰኝ')} subtitle={viewing.receipt_no} maxWidth="md">
          <div className="space-y-3 text-sm text-slate-700">
            <p className="font-semibold">{name(viewing.member)}</p>
            <p>
              {MONTHS.filter((m) => viewing.member.paid[m]?.receipt_no === viewing.receipt_no).map(monthName).join(', ')} {data.year} {t('E.C.', 'ዓ.ም')}
            </p>
            <p>
              {formatETB(MONTHS.reduce((sum, m) => sum + (viewing.member.paid[m]?.receipt_no === viewing.receipt_no ? viewing.member.paid[m].amount : 0), 0))} ·{' '}
              {formatEthiopianDate(Object.values(viewing.member.paid).find((p) => p.receipt_no === viewing.receipt_no)?.paid_on ?? '', locale)}
            </p>
            {data.can_cancel && (
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center gap-2">
                <span className="text-xs text-slate-500">{t('Recorded by mistake?', 'በስህተት ተመዝግቧል?')}</span>
                <button disabled={busy} onClick={() => cancel(viewing.receipt_no)} className="btn btn-secondary text-xs text-red-600">
                  {t('Cancel this receipt', 'ይህን ደረሰኝ ሰርዝ')}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {receipt && <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function PaymentDialog({ data, member, onClose, onDone }: { data: DuesData; member: DuesMember | null; onClose: () => void; onDone: (r: DuesReceipt) => void }) {
  const { t, locale } = useLang();
  const [personId, setPersonId] = useState(member?.person_id ?? '');
  const chosen = data.members.find((m) => m.person_id === personId) ?? null;
  // Start with the earliest unpaid month (one month by default)
  const firstUnpaid = (m: DuesMember | null) => (m ? MONTHS.find((x) => !m.paid[x]) : undefined);
  const [months, setMonths] = useState<number[]>(() => {
    const f = firstUnpaid(member);
    return f ? [f] : [];
  });
  const [amount, setAmount] = useState(data.rate === null ? '' : String(data.rate));
  const [paidOn, setPaidOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const monthName = (m: number) => (locale === 'am' ? ETHIOPIAN_MONTHS_AM[m - 1] : ETHIOPIAN_MONTHS_EN[m - 1]);
  const total = (Number(amount) || 0) * months.length;

  const pickMember = (id: string) => {
    setPersonId(id);
    const f = firstUnpaid(data.members.find((m) => m.person_id === id) ?? null);
    setMonths(f ? [f] : []);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await recordDuesPayment({ person_id: personId, year: data.year, months, amount_per_month: Number(amount), paid_on: paidOn });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.receipt);
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Record a dues payment', 'የመዋጮ ክፍያ መዝግብ')} subtitle={`${data.year} ${t('E.C.', 'ዓ.ም')}`} maxWidth="lg">
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Member', 'አባል')} *</label>
          <select required value={personId} onChange={(e) => pickMember(e.target.value)} className="form-input text-sm">
            <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
            {data.members.map((m) => (
              <option key={m.person_id} value={m.person_id}>
                {locale === 'am' ? m.name_am : m.name_en} {m.code ? `· ${m.code}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Months paid for', 'የተከፈለባቸው ወራት')} *</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {MONTHS.map((m) => {
              const done = Boolean(chosen?.paid[m]);
              return (
                <label key={m} className={`flex items-center gap-1.5 text-sm rounded-lg border px-2 py-1.5 ${done ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-700'}`}>
                  <input
                    type="checkbox"
                    disabled={done || !chosen}
                    checked={done || months.includes(m)}
                    onChange={(e) => setMonths((list) => (e.target.checked ? [...list, m] : list.filter((x) => x !== m)))}
                  />
                  {monthName(m)}
                </label>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Amount per month (birr)', 'የአንድ ወር መጠን (ብር)')} *</label>
            <input type="number" required min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="form-input text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Paid on', 'የተከፈለበት ቀን')}</label>
            <EthiopianDateInput value={paidOn} onChange={setPaidOn} />
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-900">
          {t('Total', 'ድምር')}: {formatETB(total)} {months.length > 0 && <span className="text-xs font-normal text-slate-500">({months.length} × {formatETB(Number(amount) || 0)})</span>}
        </p>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy || !personId || months.length === 0} className="btn btn-primary text-xs disabled:opacity-50">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save and print receipt', 'አስቀምጥና ደረሰኝ አትም')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptSheet({ receipt, onClose }: { receipt: DuesReceipt; onClose: () => void }) {
  const { t, locale } = useLang();
  const monthName = (m: number) => (locale === 'am' ? ETHIOPIAN_MONTHS_AM[m - 1] : ETHIOPIAN_MONTHS_EN[m - 1]);
  return (
    <Modal isOpen onClose={onClose} title={t('Payment recorded', 'ክፍያው ተመዝግቧል')} subtitle={receipt.receipt_no} maxWidth="md">
      <div className="space-y-4">
        <div className="print-sheet border border-slate-300 rounded-lg p-5 space-y-3 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-300 pb-3">
            <Image src="/logo.png" alt="" width={48} height={48} className="rounded-full" />
            <div>
              <div className="text-[11px] text-slate-500">{t('Hamere Hiwot Sunday School', 'የሐመረ ሕይወት ሰንበት ትምህርት ቤት')}</div>
              <div className="font-bold text-slate-900">{t('Monthly dues receipt', 'የወርሃዊ መዋጮ ደረሰኝ')}</div>
            </div>
            <div className="ml-auto font-mono text-sm font-bold">{receipt.receipt_no}</div>
          </div>
          <dl className="text-sm space-y-1.5">
            <Line label={t('Member', 'አባል')} value={`${locale === 'am' ? receipt.name_am : receipt.name_en}${receipt.code ? ` · ${receipt.code}` : ''}`} />
            <Line label={t('Months', 'ወራት')} value={`${receipt.months.map(monthName).join(', ')} ${receipt.year} ${t('E.C.', 'ዓ.ም')}`} />
            <Line label={t('Amount', 'መጠን')} value={`${receipt.months.length} × ${formatETB(receipt.amount_per_month)} = ${formatETB(receipt.total)}`} />
            <Line label={t('Paid on', 'የተከፈለበት ቀን')} value={formatEthiopianDate(receipt.paid_on, locale)} />
          </dl>
          <div className="pt-8 text-xs text-slate-500 grid grid-cols-2 gap-8">
            <div className="border-t border-slate-400 pt-1">{t('Received by', 'የተቀበለው')}</div>
            <div className="border-t border-slate-400 pt-1">{t('Signature', 'ፊርማ')}</div>
          </div>
        </div>
        <div className="no-print flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
            <Printer size={14} /> {t('Print receipt', 'ደረሰኝ አትም')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-semibold ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
