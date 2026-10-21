// Platform overview: Sunday schools and subscriptions by status, monthly
// revenue from paid plans, payments waiting, recent sign-ups.

import Link from 'next/link';
import { platformMetrics } from '@/lib/platform/data';
import { badge, day, money } from '@/components/platform/format';

export default async function PlatformOverview() {
  const m = await platformMetrics();
  const total = Object.values(m.tenantsByStatus).reduce((a, b) => a + b, 0);
  const tiles: [string, string | number, string?][] = [
    ['Sunday schools', total],
    ['Active', m.tenantsByStatus.ACTIVE ?? 0],
    ['Waiting for approval', m.tenantsByStatus.PENDING ?? 0, '/platform/tenants?status=PENDING'],
    ['Sign-ups (30 days)', m.signupsLast30],
    ['Payments to confirm', m.pendingPayments, '/platform/payments'],
    ['Open invoices', m.openInvoices],
    ...Object.entries(m.monthlyRevenue).map(([c, v]) => [`Monthly revenue (${c})`, money(v, c)] as [string, string]),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {tiles.map(([label, value, href]) => {
          const body = (
            <>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
            </>
          );
          return href ? (
            <Link key={label} href={href} className="stat-card block">{body}</Link>
          ) : (
            <div key={label} className="stat-card">{body}</div>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-slate-800 text-sm mb-3">Subscriptions by status</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(m.subscriptionsByStatus).map(([s, n]) => (
            <span key={s} className={`badge ${badge(s)}`}>{s}: {n}</span>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-slate-800 text-sm mb-2">Newest Sunday schools</h2>
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Address</th><th>Status</th><th>Plan</th><th>Joined</th></tr></thead>
            <tbody>
              {m.recent.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/platform/tenants/${t.id}`} className="font-semibold text-indigo-700 hover:underline">{t.name_en}</Link></td>
                  <td className="font-mono text-xs">{t.slug}</td>
                  <td><span className={`badge ${badge(t.status)}`}>{t.status}</span></td>
                  <td>{t.subscription?.plan?.name_en ?? '—'} {t.subscription && <span className={`badge ${badge(t.subscription.status)}`}>{t.subscription.status}</span>}</td>
                  <td className="text-xs">{day(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
