'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Receipt, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { LIMIT_LABELS, LIMIT_METRICS, usagePercent, type BillingCycle, type PlanRow } from '@/lib/billing/access';
import { MODULE_LABELS, isModuleCode } from '@/lib/billing/modules';
import { choosePlanAction, loadBilling, setCancelAction, submitPaymentAction, type BillingPage } from './actions';

const STATUS: Record<string, [en: string, am: string, badge: string]> = {
  TRIALING: ['Free trial', 'የሙከራ ጊዜ', 'badge-info'],
  ACTIVE: ['Active', 'ንቁ', 'badge-success'],
  PAST_DUE: ['Payment overdue', 'ክፍያ አልፏል', 'badge-warning'],
  CANCELED: ['Canceled', 'ተሰርዟል', 'badge-danger'],
  EXPIRED: ['Expired', 'አልፏል', 'badge-danger'],
  SUSPENDED: ['Suspended', 'ታግዷል', 'badge-danger'],
};

const INVOICE_STATUS: Record<string, [string, string, string]> = {
  OPEN: ['To pay', 'የሚከፈል', 'badge-warning'],
  PAID: ['Paid', 'ተከፍሏል', 'badge-success'],
  VOID: ['Cancelled', 'ተሰርዟል', 'badge-primary'],
  UNCOLLECTIBLE: ['Unpaid', 'ያልተከፈለ', 'badge-danger'],
  DRAFT: ['Draft', 'ረቂቅ', 'badge-primary'],
};

const PAYMENT_STATUS: Record<string, [string, string, string]> = {
  PENDING: ['Waiting for confirmation', 'ማረጋገጫ በመጠበቅ ላይ', 'badge-warning'],
  SUCCEEDED: ['Confirmed', 'ተረጋግጧል', 'badge-success'],
  FAILED: ['Not accepted', 'አልተቀበለም', 'badge-danger'],
  REFUNDED: ['Refunded', 'ተመልሷል', 'badge-info'],
  CANCELED: ['Cancelled', 'ተሰርዟል', 'badge-primary'],
};

const money = (amount: number | null, currency: string) =>
  amount === null ? '—' : `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** The Sunday school's plan, what it uses of it, and paying for it. */
export default function BillingAdminPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState<BillingPage | null>(null);
  const [cycle, setCycle] = useState<Exclude<BillingCycle, 'NONE'>>('MONTHLY');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    loadBilling().then((res) => {
      if (res.mode === 'live') setPage(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  };
  const date = (iso: string | null) => (iso ? formatEthiopianDate(iso.slice(0, 10), locale) : '—');
  const L = (pair: readonly [string, string] | [string, string, string]) => t(pair[0], pair[1]);

  const current = page?.plans.find((p) => p.id === page.currentPlanId) ?? null;
  const openInvoice = page?.invoices.find((i) => i.status === 'OPEN') ?? null;
  const waiting = openInvoice ? page?.payments.find((p) => p.invoice_id === openInvoice.id && p.status === 'PENDING') : undefined;

  const choose = async (plan: PlanRow) => {
    setBusy(plan.code);
    const res = await choosePlanAction(plan.code, plan.is_free ? 'NONE' : cycle);
    setBusy('');
    if (!res.ok) return notify('error', res.error);
    notify('success', res.invoiceId ? t('Invoice ready — pay it below', 'ደረሰኝ ተዘጋጅቷል — ከታች ይክፈሉ') : t('Plan changed', 'ዕቅዱ ተቀይሯል'));
    reload();
  };

  const cancel = async (value: boolean) => {
    if (value && !window.confirm(t('Stop the plan at the end of the paid period?', 'ዕቅዱ በተከፈለበት ጊዜ መጨረሻ ይቁም?'))) return;
    setBusy('cancel');
    const res = await setCancelAction(value);
    setBusy('');
    if (!res.ok) return notify('error', res.error);
    reload();
  };

  const pay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy('pay');
    const res = await submitPaymentAction(new FormData(e.currentTarget));
    setBusy('');
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Sent — we confirm it as soon as the money arrives', 'ተልኳል — ገንዘቡ እንደደረሰ እናረጋግጣለን'));
    reload();
  };

  const featureList = (plan: PlanRow) => plan.features.filter(isModuleCode).map((m) => L(MODULE_LABELS[m]));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Billing & plan', 'ክፍያና ዕቅድ')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Your Sunday school’s plan, what it uses, and payments. Your data is never deleted if a payment is late.', 'የሰንበት ትምህርት ቤትዎ ዕቅድ፣ አጠቃቀምና ክፍያዎች። ክፍያ ቢዘገይም መረጃዎ አይሰረዝም።')}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {page && (
        <>
          {/* ── Current plan ── */}
          <div className="card p-5 grid gap-4 md:grid-cols-[1fr_auto] items-start">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">{current ? t(current.name_en, current.name_am || current.name_en) : t('No plan', 'ዕቅድ የለም')}</h2>
                {page.subscription && <span className={`badge ${STATUS[page.access.status ?? page.subscription.status]?.[2] ?? 'badge-primary'}`}>{L(STATUS[page.access.status ?? page.subscription.status] ?? ['—', '—'])}</span>}
                {page.access.mode === 'read_only' && <span className="badge badge-danger">{t('Read-only', 'ለማየት ብቻ')}</span>}
              </div>
              {page.subscription?.status === 'TRIALING' && <p className="text-sm text-slate-600">{t('Trial ends', 'የሙከራ ጊዜ የሚያበቃው')}: <b>{date(page.subscription.trial_ends_at)}</b></p>}
              {page.subscription?.current_period_end && (
                <p className="text-sm text-slate-600">
                  {page.subscription.cancel_at_period_end ? t('Ends on', 'የሚያበቃው') : t('Paid until', 'የተከፈለው እስከ')}: <b>{date(page.subscription.current_period_end)}</b>
                  {' · '}
                  {page.subscription.billing_cycle === 'ANNUAL' ? t('yearly', 'በዓመት') : t('monthly', 'በወር')}
                </p>
              )}
              {page.pendingPlan && <p className="text-sm text-slate-600">{t(`Changes to ${page.pendingPlan} at the next renewal.`, `በሚቀጥለው እድሳት ወደ ${page.pendingPlan} ይቀየራል።`)}</p>}
            </div>
            {page.subscription?.current_period_end && page.subscription.billing_cycle !== 'NONE' && (
              <button disabled={busy !== ''} onClick={() => cancel(!page.subscription!.cancel_at_period_end)} className="btn btn-secondary btn-sm disabled:opacity-60">
                {page.subscription.cancel_at_period_end ? t('Keep the plan', 'ዕቅዱን ቀጥል') : t('Stop at period end', 'በጊዜው መጨረሻ አቁም')}
              </button>
            )}
          </div>

          {/* ── Usage ── */}
          <div className="card p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-4">{t('Usage', 'አጠቃቀም')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LIMIT_METRICS.map((m) => {
                const used = Number(page.usage[m] ?? 0);
                const limit = page.access.limits[m];
                const pct = usagePercent(used, limit);
                const bar = pct === null ? 'bg-emerald-500' : pct >= 100 ? 'bg-red-500' : pct >= page.warnPct ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={m}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-600">{L(LIMIT_LABELS[m])}</span>
                      <span className="font-semibold text-slate-900">
                        {used.toLocaleString()} / {limit === undefined ? t('unlimited', 'ገደብ የለም') : limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${bar}`} style={{ width: `${Math.min(pct ?? 4, 100)}%` }} />
                    </div>
                    {pct !== null && pct >= page.warnPct && (
                      <p className={`mt-1 text-xs ${pct >= 100 ? 'text-red-600' : 'text-amber-700'}`}>
                        {pct >= 100 ? t('Limit reached — upgrade to add more', 'ገደቡ ደርሷል — ተጨማሪ ለማከል ያሳድጉ') : t(`${pct}% used`, `${pct}% ጥቅም ላይ ውሏል`)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Pay the open invoice ── */}
          {openInvoice && (
            <div className="card p-5 space-y-4 border-amber-200">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-amber-600" />
                <h2 className="font-bold text-slate-800">
                  {t('Invoice to pay', 'የሚከፈል ደረሰኝ')} {openInvoice.invoice_no} — {money(openInvoice.amount, openInvoice.currency)}
                </h2>
              </div>
              <p className="text-sm text-slate-600">{t('Due', 'የመክፈያ ቀን')}: {date(openInvoice.due_at)}</p>
              {waiting ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 size={16} /> {t(`Payment reported (${waiting.reference_no}). It is confirmed as soon as the money arrives.`, `ክፍያ ተልኳል (${waiting.reference_no})። ገንዘቡ እንደደረሰ ይረጋገጣል።`)}
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{locale === 'am' ? page.manual.instructions_am || page.manual.instructions_en : page.manual.instructions_en}</p>
                  {page.manual.accounts.length > 0 && (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {page.manual.accounts.map((a, i) => (
                        <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <div className="font-semibold text-slate-800">{a.bank}</div>
                          <div className="text-slate-600">{a.name}</div>
                          <div className="font-mono text-slate-900">{a.number}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={pay} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="invoice_id" value={openInvoice.id} />
                    <label className="form-group">
                      <span className="form-label">{t('Paid by', 'የተከፈለው በ')}</span>
                      <select name="method" className="form-input" defaultValue="BANK_TRANSFER">
                        <option value="BANK_TRANSFER">{t('Bank transfer', 'የባንክ ዝውውር')}</option>
                        <option value="MOBILE_MONEY">{t('Mobile money (telebirr, M-Pesa…)', 'የሞባይል ገንዘብ (ቴሌብር፣ ኤም-ፔሳ…)')}</option>
                        <option value="CASH">{t('Cash', 'ጥሬ ገንዘብ')}</option>
                        <option value="OTHER">{t('Other', 'ሌላ')}</option>
                      </select>
                    </label>
                    <label className="form-group">
                      <span className="form-label">{t('Transaction reference', 'የግብይት ቁጥር')}</span>
                      <input name="reference_no" required minLength={4} maxLength={80} className="form-input" />
                    </label>
                    <label className="form-group">
                      <span className="form-label">{t('Name of the payer', 'የከፋዩ ስም')}</span>
                      <input name="payer_name" required minLength={2} maxLength={120} className="form-input" />
                    </label>
                    <label className="form-group">
                      <span className="form-label">{t('Phone of the payer', 'የከፋዩ ስልክ')}</span>
                      <input name="payer_phone" required type="tel" placeholder="09…" className="form-input" />
                    </label>
                    <label className="form-group sm:col-span-2">
                      <span className="form-label">{t('Receipt (photo or PDF, up to 5 MB)', 'ደረሰኝ (ፎቶ ወይም PDF፣ እስከ 5 MB)')}</span>
                      <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="form-input" />
                    </label>
                    <div className="sm:col-span-2">
                      <button disabled={busy !== ''} className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-60">
                        <Upload size={15} /> {t('Send for confirmation', 'ለማረጋገጫ ላክ')}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ── Plans ── */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-slate-800 text-sm">{t('Plans', 'ዕቅዶች')}</h2>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
                  <button key={c} onClick={() => setCycle(c)} className={`px-3 py-1.5 rounded-md ${cycle === c ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                    {c === 'MONTHLY' ? t('Monthly', 'በወር') : t('Yearly', 'በዓመት')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {page.plans.map((plan) => {
                const price = plan.is_free ? 0 : cycle === 'MONTHLY' ? plan.price_monthly : plan.price_annual;
                const isCurrent = plan.id === page.currentPlanId && page.access.mode === 'full';
                return (
                  <div key={plan.id} className={`rounded-2xl border p-4 flex flex-col ${isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                    <h3 className="font-bold text-slate-900">{t(plan.name_en, plan.name_am || plan.name_en)}</h3>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {price === null ? t('Contact us', 'ያግኙን') : price === 0 ? t('Free', 'ነፃ') : money(price, plan.currency)}
                      {price ? <span className="text-xs font-normal text-slate-500"> / {cycle === 'MONTHLY' ? t('month', 'ወር') : t('year', 'ዓመት')}</span> : null}
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-slate-600 flex-1">
                      {LIMIT_METRICS.map((m) => (
                        <li key={m}>
                          {L(LIMIT_LABELS[m])}: <b>{plan.limits[m] === undefined ? t('unlimited', 'ገደብ የለም') : plan.limits[m]!.toLocaleString()}</b>
                        </li>
                      ))}
                      {featureList(plan).map((f) => (
                        <li key={f} className="flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      disabled={busy !== '' || isCurrent || price === null}
                      onClick={() => choose(plan)}
                      className="btn btn-primary btn-sm mt-4 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <CreditCard size={14} /> {isCurrent ? t('Current plan', 'የአሁኑ ዕቅድ') : t('Choose', 'ምረጥ')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── History ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="font-bold text-slate-800 text-sm mb-2">{t('Invoices', 'ደረሰኞች')}</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Number', 'ቁጥር')}</th>
                      <th>{t('Amount', 'መጠን')}</th>
                      <th>{t('Period', 'ጊዜ')}</th>
                      <th>{t('Status', 'ሁኔታ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.invoices.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-slate-400">{t('No invoices yet', 'እስካሁን ደረሰኝ የለም')}</td></tr>
                    )}
                    {page.invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="font-mono text-xs">{i.invoice_no}</td>
                        <td>{money(i.amount, i.currency)}</td>
                        <td className="text-xs">{date(i.period_start)} → {date(i.period_end)}</td>
                        <td><span className={`badge ${INVOICE_STATUS[i.status]?.[2]}`}>{L(INVOICE_STATUS[i.status] ?? [i.status, i.status])}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm mb-2">{t('Payments', 'ክፍያዎች')}</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Date', 'ቀን')}</th>
                      <th>{t('Reference', 'ቁጥር')}</th>
                      <th>{t('Amount', 'መጠን')}</th>
                      <th>{t('Status', 'ሁኔታ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.payments.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-slate-400">{t('No payments yet', 'እስካሁን ክፍያ የለም')}</td></tr>
                    )}
                    {page.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="text-xs">{date(p.submitted_at)}</td>
                        <td className="font-mono text-xs">{p.reference_no ?? '—'}</td>
                        <td>{money(p.amount, p.currency)}</td>
                        <td>
                          <span className={`badge ${PAYMENT_STATUS[p.status]?.[2]}`}>{L(PAYMENT_STATUS[p.status] ?? [p.status, p.status])}</span>
                          {p.status === 'FAILED' && p.review_note && <div className="text-xs text-red-600 mt-1">{p.review_note}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
