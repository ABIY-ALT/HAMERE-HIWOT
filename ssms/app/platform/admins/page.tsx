// Platform administrators — only they open /platform. Added here or with
// `npm run create-platform-admin`; no Sunday-school role leads here.

import { platformAdmins } from '@/lib/platform/data';
import { getPlatformAdmin } from '@/lib/platform/auth';
import { dayTime } from '@/components/platform/format';
import { AddAdmin, AdminToggle } from '@/components/platform/AdminsManager';

export default async function AdminsPage() {
  const [admins, me] = await Promise.all([platformAdmins(), getPlatformAdmin()]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Administrators</h1>
      <div className="table-container">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Added</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.full_name}{a.id === me?.id && <span className="badge badge-primary ml-1">you</span>}</td>
                <td className="font-mono text-xs">{a.phone}</td>
                <td className="text-xs">{dayTime(a.created_at)}</td>
                <td>{a.is_active ? <span className="badge badge-success">yes</span> : <span className="badge badge-danger">no</span>}</td>
                <td>{a.id !== me?.id && <AdminToggle id={a.id} active={a.is_active} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddAdmin />
    </div>
  );
}
