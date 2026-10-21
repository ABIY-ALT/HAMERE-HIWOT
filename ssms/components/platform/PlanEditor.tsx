'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanRow } from '@/lib/billing/access';
import { LIMIT_LABELS, LIMIT_METRICS } from '@/lib/billing/access';
import { MODULE_CODES, MODULE_LABELS } from '@/lib/billing/modules';
import { savePlan } from '@/app/platform/actions';

const blank = {
  code: '', name_en: '', name_am: '', description_en: '', description_am: '', price_monthly: '', price_annual: '',
  currency: 'ETB', is_free: false, is_public: true, is_active: true, sort_order: 50, features: [] as string[],
  limits: Object.fromEntries(LIMIT_METRICS.map((m) => [m, ''])) as Record<string, string>, overage_pct: 0,
};

export function PlanEditor({ plan }: { plan: PlanRow | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [p, setP] = useState(
    plan
      ? {
          code: plan.code, name_en: plan.name_en, name_am: plan.name_am ?? '', description_en: plan.description_en ?? '', description_am: plan.description_am ?? '',
          price_monthly: plan.price_monthly?.toString() ?? '', price_annual: plan.price_annual?.toString() ?? '', currency: plan.currency,
          is_free: plan.is_free, is_public: plan.is_public, is_active: plan.is_active, sort_order: plan.sort_order, features: plan.features,
          limits: Object.fromEntries(LIMIT_METRICS.map((m) => [m, plan.limits[m]?.toString() ?? ''])) as Record<string, string>, overage_pct: plan.overage_pct,
        }
      : blank
  );

  const save = async () => {
    setBusy(true);
    setError('');
    const res = await savePlan({
      id: plan?.id ?? null,
      code: p.code,
      name_en: p.name_en,
      name_am: p.name_am,
      description_en: p.description_en,
      description_am: p.description_am,
      price_monthly: p.price_monthly === '' ? null : Number(p.price_monthly),
      price_annual: p.price_annual === '' ? null : Number(p.price_annual),
      currency: p.currency,
      is_free: p.is_free,
      is_public: p.is_public,
      is_active: p.is_active,
      sort_order: Number(p.sort_order),
      features: p.features as never[],
      limits: Object.fromEntries(Object.entries(p.limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      overage_pct: Number(p.overage_pct),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <div className="card p-4 flex items-start justify-between gap-3">
        {plan ? (
          <div>
            <div className="font-bold text-slate-900">{plan.name_en} <span className="font-mono text-xs text-slate-500">{plan.code}</span></div>
            <div className="text-sm text-slate-600">
              {plan.is_free ? 'Free' : `${plan.currency} ${plan.price_monthly ?? '—'} / month · ${plan.price_annual ?? '—'} / year`}
              {!plan.is_active && <span className="badge badge-danger ml-2">off</span>}
              {!plan.is_public && <span className="badge badge-primary ml-2">hidden</span>}
            </div>
            <div className="text-xs text-slate-500 mt-1">{plan.features.join(', ') || 'core only'}</div>
            <div className="text-xs text-slate-500">{LIMIT_METRICS.map((m) => `${LIMIT_LABELS[m][0]}: ${plan.limits[m] ?? '∞'}`).join(' · ')}</div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">A new plan</div>
        )}
        <button onClick={() => setOpen(true)} className="btn btn-secondary btn-sm shrink-0">{plan ? 'Edit' : 'Add plan'}</button>
      </div>
    );
  }

  const field = (key: keyof typeof p, label: string, type = 'text') => (
    <label className="form-group"><span className="form-label text-xs">{label}</span>
      <input type={type} value={p[key] as string | number} onChange={(e) => setP({ ...p, [key]: e.target.value })} className="form-input" />
    </label>
  );
  const flag = (key: 'is_free' | 'is_public' | 'is_active', label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.checked })} /> {label}</label>
  );

  return (
    <div className="card p-4 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {field('code', 'Code (e.g. BASIC)')}
        {field('sort_order', 'Order', 'number')}
        {field('name_en', 'Name (English)')}
        {field('name_am', 'Name (Amharic)')}
        {field('price_monthly', 'Price per month (empty = not offered)', 'number')}
        {field('price_annual', 'Price per year (empty = not offered)', 'number')}
        {field('currency', 'Currency')}
        {field('overage_pct', 'Over the limit (%)', 'number')}
      </div>
      <div className="flex flex-wrap gap-4">{flag('is_free', 'Free')}{flag('is_public', 'Offered on sign-up/upgrade')}{flag('is_active', 'Active')}</div>
      <div>
        <div className="form-label text-xs mb-1">Limits (empty = unlimited)</div>
        <div className="grid grid-cols-2 gap-2">
          {LIMIT_METRICS.map((m) => (
            <label key={m} className="form-group"><span className="text-xs text-slate-600">{LIMIT_LABELS[m][0]}</span>
              <input type="number" min={0} value={p.limits[m]} onChange={(e) => setP({ ...p, limits: { ...p.limits, [m]: e.target.value } })} className="form-input" />
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="form-label text-xs mb-1">Modules included</div>
        <div className="grid grid-cols-2 gap-1">
          {MODULE_CODES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={p.features.includes(c)} onChange={(e) => setP({ ...p, features: e.target.checked ? [...p.features, c] : p.features.filter((f) => f !== c) })} />
              {MODULE_LABELS[c][0]}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="btn btn-primary btn-sm">Save</button>
        <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  );
}
