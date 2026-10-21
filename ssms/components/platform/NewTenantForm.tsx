'use client';

// Platform admin registers a Sunday school (same steps as self sign-up).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { createTenantAction } from '@/app/platform/actions';

export function NewTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await createTenantAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.linked) window.alert('The administrator’s phone already had a login: they sign in with their existing password.');
    setOpen(false);
    router.push(`/platform/tenants/${res.id}`);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary inline-flex items-center gap-1.5"><Plus size={16} /> New Sunday school</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New Sunday school">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
          <label className="form-group"><span className="form-label">Name (English)</span><input name="name_en" required minLength={3} className="form-input" /></label>
          <label className="form-group"><span className="form-label">Name (Amharic)</span><input name="name_am" className="form-input" /></label>
          <label className="form-group"><span className="form-label">Address (slug, optional)</span><input name="slug" pattern="[a-z0-9-]{3,40}" className="form-input" /></label>
          <label className="form-group"><span className="form-label">City</span><input name="city" className="form-input" /></label>
          <label className="form-group"><span className="form-label">Administrator’s name</span><input name="admin_name" required minLength={2} className="form-input" /></label>
          <label className="form-group"><span className="form-label">Administrator’s phone</span><input name="phone" required type="tel" className="form-input" /></label>
          <label className="form-group"><span className="form-label">First password</span><input name="password" required minLength={8} type="password" autoComplete="new-password" className="form-input" /></label>
          <label className="form-group">
            <span className="form-label">Gender</span>
            <select name="gender" className="form-input"><option value="MALE">Male</option><option value="FEMALE">Female</option></select>
          </label>
          <div className="sm:col-span-2"><button disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? 'Creating…' : 'Create'}</button></div>
        </form>
      </Modal>
    </>
  );
}
