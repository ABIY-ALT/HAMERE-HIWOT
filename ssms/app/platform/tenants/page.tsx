// All Sunday schools: search, filter by status, and register one directly.

import Link from 'next/link';
import { listTenants } from '@/lib/platform/data';
import { badge, day } from '@/components/platform/format';
import { NewTenantForm } from '@/components/platform/NewTenantForm';

const STATUSES = ['', 'ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED'];

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = '', status = '' } = await searchParams;
  const tenants = await listTenants({ q, status: STATUSES.includes(status) ? status : '' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Sunday schools</h1>
        <NewTenantForm />
      </div>

      <form className="flex flex-wrap gap-2" action="/platform/tenants">
        <input name="q" defaultValue={q} placeholder="Name, address, phone, city…" className="form-input w-auto flex-1 min-w-[14rem]" />
        <select name="status" defaultValue={status} className="form-input w-auto">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'Any status'}</option>)}
        </select>
        <button className="btn btn-secondary">Search</button>
      </form>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Name</th><th>Address</th><th>City</th><th>Contact</th><th>Status</th><th>Plan</th><th>Until</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {tenants.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400">No Sunday schools found</td></tr>}
            {tenants.map((t) => {
              const s = t.subscription;
              const until = s?.status === 'TRIALING' ? s.trial_ends_at : s?.current_period_end;
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/platform/tenants/${t.id}`} className="font-semibold text-indigo-700 hover:underline">{t.name_en}</Link>
                    {t.is_default && <span className="badge badge-primary ml-1">default</span>}
                    {t.name_am && <div className="text-xs text-slate-500">{t.name_am}</div>}
                  </td>
                  <td className="font-mono text-xs">{t.slug}</td>
                  <td className="text-xs">{t.city ?? '—'}</td>
                  <td className="text-xs">{t.contact_name ?? '—'}<div className="text-slate-500">{t.contact_phone}</div></td>
                  <td><span className={`badge ${badge(t.status)}`}>{t.status}</span></td>
                  <td className="text-xs">{s?.plan?.name_en ?? '—'} {s && <span className={`badge ${badge(s.status)}`}>{s.status}</span>}</td>
                  <td className="text-xs">{day(until)}</td>
                  <td className="text-xs">{day(t.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
