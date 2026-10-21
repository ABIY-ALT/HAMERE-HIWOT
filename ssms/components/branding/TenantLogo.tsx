'use client';

// The signed-in user's Sunday school logo (lib/branding) — on receipts, report
// cards, results and the dashboard. Without a logo: the first letter of the
// name in the school's colour.

import { useOptionalAuth } from '@/contexts/AuthContext';

/**
 * The school's name for printed headings: the default Sunday school keeps the
 * wording given (church + school); others show their own names.
 */
export function useSchoolName(defaultEn: string, defaultAm: string): [en: string, am: string] {
  const user = useOptionalAuth()?.user;
  const tenant = user?.tenant;
  if (!tenant || tenant.is_default) return [defaultEn, defaultAm];
  return [tenant.name_en, tenant.name_am || tenant.name_en];
}

export function TenantLogo({ size, className = '', brand, name }: {
  size: number;
  className?: string;
  /** For pages without a signed-in user (the exam page) */
  brand?: { logoUrl: string | null; color: string } | null;
  name?: string;
}) {
  const user = useOptionalAuth()?.user;
  const b = brand ?? user?.tenant?.brand ?? { logoUrl: '/logo.png', color: '#1e2770' };
  const label = name ?? user?.tenant?.name_en ?? '';
  if (b.logoUrl) {
    // A plain <img>: logos come from storage and are already small
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.logoUrl} alt={label} width={size} height={size} className={`object-contain ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${className}`}
      style={{ width: size, height: size, background: b.color, fontSize: Math.round(size * 0.45) }}
      aria-label={label}
    >
      {(label || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
