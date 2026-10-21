'use client';

// The platform admin's controls for one Sunday school: its status, its
// subscription (plan, state, dates, grace, custom limits and modules), and
// invoices to issue or void.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SubscriptionRow } from '@/lib/billing/access';
import { LIMIT_LABELS, LIMIT_METRICS } from '@/lib/billing/access';
import { MODULE_CODES } from '@/lib/billing/modules';
import { createInvoiceAction, saveSubscription, setTenantStatus, voidInvoiceAction } from '@/app/platform/actions';

type Plan = { id: string; code: string; name_en: string; is_free: boolean; price_monthly: number | null; price_annual: number | null };

const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (v: string) => (v ? new Date(`${v}T23:59:59Z`).toISOString() : null);

export function TenantControls({
  tenant,
  subscription,
  plans,
  openInvoices,
}: {
  tenant: { id: string; status: string; is_default: boolean };
  subscription: (Omit<SubscriptionRow, 'plan'> & { plan?: undefined }) | null;
  plans: Plan[];
  openInvoices: { id: string; invoice_no: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sub, setSub] = useState({
    plan_id: subscription?.plan_id ?? plans[0]?.id ?? '',
    status: subscription?.status ?? 'ACTIVE',
    billing_cycle: subscription?.billing_cycle ?? 'NONE',
    trial_ends_at: toDateInput(subscription?.trial_ends_at),
    current_period_end: toDateInput(subscription?.current_period_end),
    grace_days: subscription?.grace_days ?? 7,
    limits: Object.fromEntries(LIMIT_METRICS.map((m) => [m, subscription?.limit_overrides?.[m]?.toString() ?? ''])) as Record<string, string>,
    add: subscription?.feature_overrides?.add ?? [],
    remove: subscription?.feature_overrides?.remove ?? [],
    notes: subscription?.notes ?? '',
  });
  const [invoice, setInvoice] = useState({ plan_id: plans.find((p) => !p.is_free)?.id ?? '', cycle: 'MONTHLY' });

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    setMessage(null);
    const res = await work();
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: success } : { ok: false, text: res.error ?? 'Failed' });
    if (res.ok) router.refresh();
  };

  const status = (next: string) => {
    const reason = next === 'ACTIVE' ? '' : window.prompt(`Reason for ${next.toLowerCase()} (the Sunday school sees it):`) ?? '';
    if (next !== 'ACTIVE' && !reason.trim()) return;
    void run(() => setTenantStatus(tenant.id, next, reason), `Status set to ${next}`);
  };

  const toggle = (list: 'add' | 'remove', code: string) =>
    setSub((s) => ({ ...s, [list]: s[list].includes(code as never) ? s[list].filter((c) => c !== code) : [...s[list], code] }));

  const save = () =>
    run(
      () =>
        saveSubscription(tenant.id, {
          plan_id: sub.plan_id,
          status: sub.status,
          billing_cycle: sub.billing_cycle,
          trial_ends_at: fromDateInput(sub.trial_ends_at),
          current_period_end: fromDateInput(sub.current_period_end),
          grace_days: Number(sub.grace_days),
          limit_overrides: Object.fromEntries(Object.entries(sub.limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
          feature_overrides: { add: sub.add as never[], remove: sub.remove as never[] },
          notes: sub.notes || null,
        }),
      'Subscription saved'
    );

  return (
    <aside className="space-y-4">
      {message && <p className={`text-sm rounded-lg px-3 py-2 ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <div className="card p-4 space-y-2">
        <h2 className="font-bold text-slate-800 text-sm">Sunday school status</h2>
        {tenant.is_default ? (
          <p className="text-xs text-slate-500">The default Sunday school stays active.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tenant.status !== 'ACTIVE' && <button disabled={busy} onClick={() => status('ACTIVE')} className="btn btn-primary btn-sm">{tenant.status === 'PENDING' ? 'Approve' : 'Activate'}</button>}
            {tenant.status !== 'SUSPENDED' && <button disabled={busy} onClick={() => status('SUSPENDED')} className="btn btn-secondary btn-sm">Suspend</button>}
            {tenant.status !== 'DEACTIVATED' && <button disabled={busy} onClick={() => status('DEACTIVATED')} className="btn btn-danger btn-sm">Deactivate</button>}
          </div>
        )}
        <p className="text-xs text-slate-500">Suspended or deactivated: nobody can sign in to it; its data is kept.</p>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-bold text-slate-800 text-sm">Subscription</h2>
        <label className="form-group"><span className="form-label">Plan</span>
          <select value={sub.plan_id} onChange={(e) => setSub({ ...sub, plan_id: e.target.value })} className="form-input">
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name_en} ({p.code})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="form-group"><span className="form-label">Status</span>
            <select value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value as typeof sub.status })} className="form-input">
              {['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="form-group"><span className="form-label">Billing</span>
            <select value={sub.billing_cycle} onChange={(e) => setSub({ ...sub, billing_cycle: e.target.value as typeof sub.billing_cycle })} className="form-input">
              {['NONE', 'MONTHLY', 'ANNUAL'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="form-group"><span className="form-label">Trial ends</span>
            <input type="date" value={sub.trial_ends_at} onChange={(e) => setSub({ ...sub, trial_ends_at: e.target.value })} className="form-input" />
          </label>
          <label className="form-group"><span className="form-label">Paid until</span>
            <input type="date" value={sub.current_period_end} onChange={(e) => setSub({ ...sub, current_period_end: e.target.value })} className="form-input" />
          </label>
          <label className="form-group"><span className="form-label">Grace days</span>
            <input type="number" min={0} max={90} value={sub.grace_days} onChange={(e) => setSub({ ...sub, grace_days: Number(e.target.value) })} className="form-input" />
          </label>
        </div>
        <details>
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer">Custom limits and modules (Enterprise)</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LIMIT_METRICS.map((m) => (
              <label key={m} className="form-group"><span className="form-label text-xs">{LIMIT_LABELS[m][0]}</span>
                <input type="number" min={0} placeholder="plan's" value={sub.limits[m]} onChange={(e) => setSub({ ...sub, limits: { ...sub.limits, [m]: e.target.value } })} className="form-input" />
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs">
            <div className="font-semibold text-slate-700">Add modules</div>
            <div className="flex flex-wrap gap-1 mt-1">{MODULE_CODES.map((c) => (
              <button type="button" key={c} onClick={() => toggle('add', c)} className={`badge ${sub.add.includes(c as never) ? 'badge-success' : 'badge-primary opacity-60'}`}>{c}</button>
            ))}</div>
            <div className="font-semibold text-slate-700 mt-2">Remove modules</div>
            <div className="flex flex-wrap gap-1 mt-1">{MODULE_CODES.map((c) => (
              <button type="button" key={c} onClick={() => toggle('remove', c)} className={`badge ${sub.remove.includes(c as never) ? 'badge-danger' : 'badge-primary opacity-60'}`}>{c}</button>
            ))}</div>
          </div>
        </details>
        <label className="form-group"><span className="form-label">Notes</span>
          <textarea value={sub.notes} onChange={(e) => setSub({ ...sub, notes: e.target.value })} rows={2} className="form-input" />
        </label>
        <button disabled={busy} onClick={save} className="btn btn-primary btn-sm">Save subscription</button>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-bold text-slate-800 text-sm">Invoices</h2>
        <div className="flex gap-2">
          <select value={invoice.plan_id} onChange={(e) => setInvoice({ ...invoice, plan_id: e.target.value })} className="form-input">
            {plans.filter((p) => !p.is_free).map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
          </select>
          <select value={invoice.cycle} onChange={(e) => setInvoice({ ...invoice, cycle: e.target.value })} className="form-input w-auto">
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Yearly</option>
          </select>
        </div>
        <button disabled={busy || !invoice.plan_id} onClick={() => run(() => createInvoiceAction(tenant.id, invoice.plan_id, invoice.cycle), 'Invoice issued')} className="btn btn-secondary btn-sm">Issue invoice</button>
        {openInvoices.map((i) => (
          <div key={i.id} className="flex items-center justify-between text-xs">
            <span className="font-mono">{i.invoice_no}</span>
            <button disabled={busy} onClick={() => window.confirm(`Void ${i.invoice_no}?`) && run(() => voidInvoiceAction(i.id), 'Invoice voided')} className="text-red-600 hover:underline">Void</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
