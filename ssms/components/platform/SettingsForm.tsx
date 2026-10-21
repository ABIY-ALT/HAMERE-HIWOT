'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { PlatformSettingsData } from '@/lib/platform/data';
import { savePlatformSettings, setModuleActive } from '@/app/platform/actions';

export function SettingsForm({ initial }: { initial: PlatformSettingsData }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const b = s.billing;
  const setBilling = (patch: Partial<typeof b>) => setS({ ...s, billing: { ...b, ...patch } });

  const save = async () => {
    setBusy(true);
    const res = await savePlatformSettings({ billing: s.billing, registration: s.registration, manual: s.manual });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: 'Saved' } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  };

  const toggleModule = async (code: string, active: boolean) => {
    const res = await setModuleActive(code, active);
    if (!res.ok) return setMessage({ ok: false, text: res.error });
    setS({ ...s, modules: s.modules.map((m) => (m.code === code ? { ...m, is_active: active } : m)) });
  };

  const num = (value: number, onChange: (n: number) => void, label: string, hint?: string) => (
    <label className="form-group"><span className="form-label">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="form-input" />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-6">
      {message && <p className={`text-sm rounded-lg px-3 py-2 ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-800">Trials and payments</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {num(b.trial_days, (n) => setBilling({ trial_days: n }), 'Trial length (days)', '0 = no trial')}
          <label className="form-group"><span className="form-label">Trial plan (code)</span><input value={b.trial_plan_code} onChange={(e) => setBilling({ trial_plan_code: e.target.value })} className="form-input" /></label>
          <label className="form-group"><span className="form-label">After an unpaid trial (plan code)</span><input value={b.after_trial_plan_code} onChange={(e) => setBilling({ after_trial_plan_code: e.target.value })} className="form-input" /><span className="text-xs text-slate-500">A free plan, or empty for read-only</span></label>
          {num(b.grace_days, (n) => setBilling({ grace_days: n }), 'Grace days after a missed renewal')}
          {num(b.invoice_due_days, (n) => setBilling({ invoice_due_days: n }), 'Invoices due after (days)', 'Renewal invoices are made this many days ahead')}
          {num(b.warn_usage_pct, (n) => setBilling({ warn_usage_pct: n }), 'Warn at usage (%)')}
          <label className="form-group"><span className="form-label">Currency</span><input value={b.currency} onChange={(e) => setBilling({ currency: e.target.value })} className="form-input" /></label>
          <label className="form-group sm:col-span-2"><span className="form-label">When the grace days are over</span>
            <select value={b.expired_mode} onChange={(e) => setBilling({ expired_mode: e.target.value as typeof b.expired_mode })} className="form-input">
              <option value="read_only">Read-only (data visible and exportable, nothing can change)</option>
              <option value="free_plan">Move to the free plan above (its limits and modules)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-800">Sign-ups</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.registration.open} onChange={(e) => setS({ ...s, registration: { ...s.registration, open: e.target.checked } })} /> New Sunday schools can register themselves (/register)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.registration.require_approval} onChange={(e) => setS({ ...s, registration: { ...s.registration, require_approval: e.target.checked } })} /> They wait for approval before they can sign in</label>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-800">How Sunday schools pay</h2>
        <label className="form-group"><span className="form-label">Instructions (English)</span><textarea rows={3} value={s.manual.instructions_en} onChange={(e) => setS({ ...s, manual: { ...s.manual, instructions_en: e.target.value } })} className="form-input" /></label>
        <label className="form-group"><span className="form-label">Instructions (Amharic)</span><textarea rows={3} value={s.manual.instructions_am} onChange={(e) => setS({ ...s, manual: { ...s.manual, instructions_am: e.target.value } })} className="form-input" /></label>
        <div className="space-y-2">
          <div className="form-label">Accounts</div>
          {s.manual.accounts.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              {(['bank', 'name', 'number'] as const).map((k) => (
                <input key={k} placeholder={k === 'bank' ? 'Bank / telebirr' : k === 'name' ? 'Account name' : 'Account number'} value={a[k]}
                  onChange={(e) => setS({ ...s, manual: { ...s.manual, accounts: s.manual.accounts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) } })}
                  className="form-input" />
              ))}
              <button onClick={() => setS({ ...s, manual: { ...s.manual, accounts: s.manual.accounts.filter((_, j) => j !== i) } })} className="btn btn-ghost btn-sm"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => setS({ ...s, manual: { ...s.manual, accounts: [...s.manual.accounts, { bank: '', name: '', number: '' }] } })} className="btn btn-secondary btn-sm inline-flex items-center gap-1"><Plus size={14} /> Add account</button>
        </div>
      </div>

      <button disabled={busy} onClick={save} className="btn btn-primary">{busy ? 'Saving…' : 'Save settings'}</button>

      <div className="card p-5 space-y-2">
        <h2 className="font-bold text-slate-800">Modules</h2>
        <p className="text-xs text-slate-500">A module switched off here is closed for every Sunday school, whatever its plan (saved at once).</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {s.modules.map((m) => (
            <label key={m.code} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m.is_active} onChange={(e) => toggleModule(m.code, e.target.checked)} /> {m.name_en} <span className="font-mono text-xs text-slate-400">{m.code}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
