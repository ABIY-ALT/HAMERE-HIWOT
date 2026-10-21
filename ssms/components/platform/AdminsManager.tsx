'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPlatformAdmin, setPlatformAdminActive } from '@/app/platform/actions';

export function AdminToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (active && !window.confirm('Switch off this administrator’s access?')) return;
        setBusy(true);
        const res = await setPlatformAdminActive(id, !active);
        setBusy(false);
        if (!res.ok) window.alert(res.error);
        router.refresh();
      }}
      className="text-xs text-slate-600 hover:underline"
    >
      {active ? 'Switch off' : 'Switch on'}
    </button>
  );
}

export function AddAdmin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        const res = await addPlatformAdmin({ full_name: String(form.get('full_name')), phone: String(form.get('phone')), password: String(form.get('password')) });
        setBusy(false);
        if (!res.ok) return setMessage({ ok: false, text: res.error });
        setMessage({ ok: true, text: res.linked ? 'Added — their phone already had a login, so they keep their existing password.' : 'Added.' });
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
      className="card p-5 grid gap-3 sm:grid-cols-3"
    >
      <h2 className="sm:col-span-3 font-bold text-slate-800 text-sm">Add an administrator</h2>
      {message && <p className={`sm:col-span-3 text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>}
      <label className="form-group"><span className="form-label">Full name</span><input name="full_name" required minLength={2} className="form-input" /></label>
      <label className="form-group"><span className="form-label">Phone</span><input name="phone" required type="tel" className="form-input" /></label>
      <label className="form-group"><span className="form-label">Password (12+ characters)</span><input name="password" required minLength={12} type="password" autoComplete="new-password" className="form-input" /></label>
      <div className="sm:col-span-3"><button disabled={busy} className="btn btn-primary btn-sm">Add</button></div>
    </form>
  );
}

