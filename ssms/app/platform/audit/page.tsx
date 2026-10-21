// Platform audit log: every platform-admin action, sign-up and billing event
// (permanent — the database refuses changes). 200 at a time, newest first.

import Link from 'next/link';
import { platformAudit } from '@/lib/platform/data';
import { dayTime } from '@/components/platform/format';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; before?: string }> }) {
  const { action = '', before = '' } = await searchParams;
  const rows = await platformAudit({ action, before: /^\d{4}-\d{2}-\d{2}T/.test(before) ? before : undefined });
  const last = rows.at(-1)?.created_at;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>
      <form className="flex gap-2" action="/platform/audit">
        <input name="action" defaultValue={action} placeholder="Action contains… (e.g. PAYMENT, TENANT_SUSPENDED)" className="form-input w-auto flex-1" />
        <button className="btn btn-secondary">Filter</button>
      </form>
      <div className="table-container">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Sunday school</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap">{dayTime(r.created_at)}</td>
                <td className="text-xs">{r.actor_label}</td>
                <td className="text-xs font-semibold">{r.action}</td>
                <td className="text-xs">{r.tenant_id ? <Link href={`/platform/tenants/${r.tenant_id}`} className="text-indigo-700 hover:underline">open</Link> : '—'}</td>
                <td className="text-xs">{r.target_type ?? ''} <span className="font-mono">{r.target_id?.slice(0, 8)}</span></td>
                <td className="text-xs font-mono break-all max-w-md">{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 200 && last && (
        <Link href={`/platform/audit?action=${encodeURIComponent(action)}&before=${encodeURIComponent(last)}`} className="btn btn-secondary btn-sm">Older →</Link>
      )}
    </div>
  );
}
