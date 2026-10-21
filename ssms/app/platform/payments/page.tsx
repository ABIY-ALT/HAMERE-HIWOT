// Payments: the ones waiting first (confirm when the money is in the account,
// or reject with a reason), then all others; refunds are recorded here.

import Link from 'next/link';
import { listPayments } from '@/lib/platform/data';
import { badge, dayTime, money } from '@/components/platform/format';
import { PaymentActions } from '@/components/platform/PaymentActions';

const STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELED', ''];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'PENDING' } = await searchParams;
  const filter = STATUSES.includes(status) ? status : 'PENDING';
  const payments = await listPayments(filter || undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s || 'all'} href={`/platform/payments?status=${s}`} className={`px-3 py-1.5 rounded-lg border ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 bg-white'}`}>
            {s || 'All'}
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Confirm a payment only after checking the money arrived in the account (bank statement / mobile-money record).
        The reference and amount must match. Confirming applies the invoice’s plan at once.
      </p>
      <div className="table-container">
        <table>
          <thead>
            <tr><th>Sent</th><th>Sunday school</th><th>Invoice</th><th>Amount</th><th>Method / reference</th><th>Payer</th><th>Receipt</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {payments.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400">Nothing here</td></tr>}
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="text-xs whitespace-nowrap">{dayTime(p.submitted_at)}</td>
                <td className="text-xs">{p.tenant ? <Link href={`/platform/tenants/${p.tenant.id}`} className="text-indigo-700 hover:underline">{p.tenant.name_en}</Link> : '—'}</td>
                <td className="font-mono text-xs">{p.invoice?.invoice_no ?? '—'}<div className="text-slate-500">{p.invoice?.billing_cycle}</div></td>
                <td>{money(p.amount, p.currency)}{p.refunded_amount > 0 && <div className="text-xs text-slate-500">refunded {money(p.refunded_amount, p.currency)}</div>}</td>
                <td className="text-xs">{p.method}<div className="font-mono">{p.reference_no ?? '—'}</div></td>
                <td className="text-xs">{p.payer_name ?? '—'}<div className="text-slate-500">{p.payer_phone}</div></td>
                <td className="text-xs">{p.proof_path ? <a href={`/platform/payments/${p.id}/proof`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline">Open</a> : '—'}</td>
                <td><span className={`badge ${badge(p.status)}`}>{p.status}</span>{p.review_note && <div className="text-xs text-slate-500 max-w-[12rem]">{p.review_note}</div>}</td>
                <td><PaymentActions id={p.id} status={p.status} amount={p.amount} refunded={p.refunded_amount} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
