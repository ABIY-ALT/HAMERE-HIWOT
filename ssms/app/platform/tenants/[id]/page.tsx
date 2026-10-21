// One Sunday school: status, subscription (and editing it), usage against
// limits, invoices, payments, subscription history and its audit entries.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { tenantDetail } from '@/lib/platform/data';
import { LIMIT_LABELS, LIMIT_METRICS, usagePercent } from '@/lib/billing/access';
import { badge, day, dayTime, money } from '@/components/platform/format';
import { TenantControls } from '@/components/platform/TenantControls';

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await tenantDetail(id);
  if (!d) notFound();
  const { tenant, access } = d;
  const sub = tenant.subscription;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/tenants" className="text-sm text-slate-500 hover:text-slate-900">← Sunday schools</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">{tenant.name_en}</h1>
          <span className={`badge ${badge(tenant.status)}`}>{tenant.status}</span>
          <span className={`badge ${access.mode === 'full' ? 'badge-success' : 'badge-danger'}`}>access: {access.mode}</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {tenant.name_am && <>{tenant.name_am} · </>}
          <a href={tenant.is_default ? '/' : `/s/${tenant.slug}`} target="_blank" rel="noopener noreferrer" className="font-mono text-indigo-700 hover:underline">{tenant.is_default ? '/' : `/s/${tenant.slug}`}</a>
          {' · '}{tenant.city ?? 'no city'} · {tenant.contact_name} {tenant.contact_phone} {tenant.contact_email}
          {' · '}joined {day(tenant.created_at)} ({tenant.created_via.toLowerCase()}) · {d.users.active} active of {d.users.total} accounts
        </p>
        {tenant.status_reason && <p className="text-sm text-red-700 mt-1">Reason: {tenant.status_reason}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-3">Usage</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {LIMIT_METRICS.map((m) => {
                const used = Number(d.usage[m] ?? 0);
                const limit = access.limits[m];
                const pct = usagePercent(used, limit);
                return (
                  <div key={m} className="text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">{LIMIT_LABELS[m][0]}</span><b>{used} / {limit ?? '∞'}</b></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${pct !== null && pct >= 100 ? 'bg-red-500' : pct !== null && pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct ?? 3, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-3">Modules: {access.modules.join(', ') || 'none'}</p>
          </div>

          <div>
            <h2 className="font-bold text-slate-800 text-sm mb-2">Invoices</h2>
            <div className="table-container">
              <table>
                <thead><tr><th>Number</th><th>Kind</th><th>Amount</th><th>Period</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>
                  {d.invoices.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">None</td></tr>}
                  {d.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs">{i.invoice_no}</td>
                      <td className="text-xs">{i.kind} · {i.billing_cycle}</td>
                      <td>{money(i.amount, i.currency)}</td>
                      <td className="text-xs">{day(i.period_start)} → {day(i.period_end)}</td>
                      <td className="text-xs">{day(i.due_at)}</td>
                      <td><span className={`badge ${badge(i.status)}`}>{i.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-bold text-slate-800 text-sm mb-2">Payments</h2>
            <div className="table-container">
              <table>
                <thead><tr><th>Sent</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {d.payments.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">None</td></tr>}
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-xs">{dayTime(p.submitted_at)}</td>
                      <td className="text-xs">{p.method}</td>
                      <td className="font-mono text-xs">{p.reference_no ?? '—'}</td>
                      <td>{money(p.amount, p.currency)}{p.refunded_amount > 0 && <div className="text-xs text-slate-500">refunded {money(p.refunded_amount, p.currency)}</div>}</td>
                      <td><span className={`badge ${badge(p.status)}`}>{p.status}</span>{p.review_note && <div className="text-xs text-slate-500">{p.review_note}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-1"><Link href="/platform/payments" className="text-indigo-700 hover:underline">Confirm payments →</Link></p>
          </div>

          <div>
            <h2 className="font-bold text-slate-800 text-sm mb-2">Subscription history</h2>
            <div className="table-container">
              <table>
                <thead><tr><th>When</th><th>Event</th><th>Status</th><th>By</th><th>Details</th></tr></thead>
                <tbody>
                  {d.events.map((e) => (
                    <tr key={e.id}>
                      <td className="text-xs whitespace-nowrap">{dayTime(e.created_at)}</td>
                      <td className="text-xs">{e.event}</td>
                      <td className="text-xs">{e.from_status ?? '—'} → {e.to_status ?? '—'}</td>
                      <td className="text-xs">{e.actor_type}</td>
                      <td className="text-xs font-mono break-all">{JSON.stringify(e.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <TenantControls
          tenant={{ id: tenant.id, status: tenant.status, is_default: tenant.is_default }}
          subscription={sub ? { ...sub, plan: undefined } : null}
          plans={d.plans.map((p) => ({ id: p.id, code: p.code, name_en: p.name_en, is_free: p.is_free, price_monthly: p.price_monthly, price_annual: p.price_annual }))}
          openInvoices={d.invoices.filter((i) => i.status === 'OPEN').map((i) => ({ id: i.id, invoice_no: i.invoice_no }))}
        />
      </div>
    </div>
  );
}
