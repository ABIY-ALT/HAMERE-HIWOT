'use client';

// The Sunday school's logo, colour and website photo, as the platform admin
// sees them — with a way to remove an unsuitable picture.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TenantBrand } from '@/lib/branding';
import { removeTenantPicture } from '@/app/platform/actions';

export function BrandingReview({ tenantId, brand, hasLogo, hasHero }: { tenantId: string; brand: TenantBrand; hasLogo: boolean; hasHero: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async (which: 'logo' | 'hero') => {
    const reason = window.prompt(`Remove this ${which === 'logo' ? 'logo' : 'photo'}? Note why (kept in the audit log):`);
    if (reason === null) return;
    setBusy(true);
    const res = await removeTenantPicture(tenantId, which, reason);
    setBusy(false);
    if (!res.ok) window.alert(res.error);
    router.refresh();
  };

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-bold text-slate-800 text-sm">Branding</h2>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">no logo</span>
          )}
        </div>
        <div className="text-xs text-slate-600 space-y-1">
          <div className="flex items-center gap-2">Colour <span className="inline-block w-5 h-5 rounded" style={{ background: brand.color }} /> <span className="font-mono">{brand.color}</span></div>
          {hasLogo && <button disabled={busy} onClick={() => remove('logo')} className="text-red-600 hover:underline">Remove logo</button>}
        </div>
      </div>
      {brand.heroUrl && (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.heroUrl} alt="" className="w-full h-24 object-cover rounded-lg" />
          {hasHero && <button disabled={busy} onClick={() => remove('hero')} className="text-xs text-red-600 hover:underline">Remove website photo</button>}
        </div>
      )}
    </div>
  );
}
