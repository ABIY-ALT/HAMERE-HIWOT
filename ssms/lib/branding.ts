// ─────────────────────────────────────────────────────────────────────────────
// A Sunday school's look: logo, main colour and the website's front-page
// photo (system_settings "branding", per tenant). No server code, so client
// pages can use it. Files are in the public "site-media" bucket under
// "<tenant id>/brand/…" (lib/site/media mediaUrl).
//
// Logo and colour come with every plan; the front-page photo only with the
// website module (it is only shown there).
// The default Sunday school (Hamere Hiwot) keeps its own logo, photo and
// colour unless it sets others.
// ─────────────────────────────────────────────────────────────────────────────

import { mediaUrl } from '@/lib/site/media';

export const BRANDING_KEY = 'branding';

/** Stored in system_settings */
export interface Branding {
  logo_path: string | null;
  hero_path: string | null;
  /** #rrggbb */
  color: string | null;
}

/** What pages use */
export interface TenantBrand {
  logoUrl: string | null;
  heroUrl: string | null;
  color: string;
}

export const DEFAULT_BRAND_COLOR = '#1e2770';
const DEFAULT_TENANT_BRAND: TenantBrand = { logoUrl: '/logo.png', heroUrl: '/images/hamere.jpg', color: DEFAULT_BRAND_COLOR };

export const EMPTY_BRANDING: Branding = { logo_path: null, hero_path: null, color: null };

/** Largest logo kept (pixels, longer side) and accepted file size */
export const LOGO_MAX_SIDE = 512;
export const MAX_LOGO_BYTES = 1024 * 1024;

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function brandOf(saved: Partial<Branding> | null | undefined, isDefaultTenant: boolean): TenantBrand {
  const base = isDefaultTenant ? DEFAULT_TENANT_BRAND : { logoUrl: null, heroUrl: null, color: DEFAULT_BRAND_COLOR };
  return {
    logoUrl: saved?.logo_path ? mediaUrl(saved.logo_path) : base.logoUrl,
    heroUrl: saved?.hero_path ? mediaUrl(saved.hero_path) : base.heroUrl,
    color: isHexColor(saved?.color) ? saved.color.toLowerCase() : base.color,
  };
}

/** Mixes a colour with white (amount > 0) or black (amount < 0), amount in 0–1. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * a);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Light enough that dark text would be needed — the colour is refused (white text is used on it). */
export function tooLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** CSS variables for the dashboard sidebar */
export function sidebarVars(color: string): Record<string, string> {
  return {
    '--sidebar-bg': color,
    '--sidebar-hover': shade(color, 0.15),
    '--sidebar-active': shade(color, 0.25),
  };
}

/** CSS variables for the public website (header, footer, title bands) */
export function siteVars(color: string): Record<string, string> {
  return {
    '--site-main': color,
    '--site-dark': shade(color, -0.3),
    '--site-light': shade(color, 0.15),
  };
}
