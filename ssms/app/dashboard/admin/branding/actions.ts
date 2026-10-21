'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Branding (SYSTEM_CONFIGURE): the Sunday school's logo and main colour (every
// plan) and the website's front-page photo (website module). Pictures go to
// the public "site-media" bucket under "<tenant id>/brand/…"; the choice is
// kept in system_settings "branding" (lib/branding). The logo arrives already
// made small in the browser (PNG, keeps transparency), the photo as a JPEG
// (lib/site/shrink).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, authorizeIn, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { tenantPath } from '@/lib/tenant/db';
import { refreshPublicSite } from '@/lib/site/cache';
import { MAX_MEDIA_BYTES, MEDIA_BUCKET } from '@/lib/site/media';
import { BRANDING_KEY, EMPTY_BRANDING, MAX_LOGO_BYTES, brandOf, isHexColor, tooLight, type Branding, type TenantBrand } from '@/lib/branding';

export interface BrandingPage {
  branding: Branding;
  brand: TenantBrand;
  /** The front-page photo is part of the website module */
  website: boolean;
  /** Where the public website is */
  sitePath: string;
  isDefault: boolean;
}

async function current(db: SupabaseClient): Promise<Branding> {
  const { data } = await db.from('system_settings').select('value').eq('key', BRANDING_KEY).maybeSingle();
  return { ...EMPTY_BRANDING, ...((data?.value as Partial<Branding> | undefined) ?? {}) };
}

async function store(db: SupabaseClient, systemUserId: string, branding: Branding): Promise<void> {
  await db
    .from('system_settings')
    .upsert({ key: BRANDING_KEY, value: branding, updated_by: systemUserId, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .then(check);
  refreshPublicSite();
}

async function removeFile(db: SupabaseClient, path: string | null) {
  if (path) await db.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
}

export async function loadBrandingPage(): Promise<Loaded<BrandingPage>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    const branding = await current(db);
    return {
      mode: 'live',
      data: {
        branding,
        brand: brandOf(branding, me.tenant.is_default),
        website: me.tenant.access.modules.includes('website'),
        sitePath: me.tenant.is_default ? '/' : `/s/${me.tenant.slug}`,
        isDefault: me.tenant.is_default,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const LOGO_TYPES: Record<string, string> = { 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg' };

export async function uploadLogo(form: FormData): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    const file = form.get('logo');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a picture');
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new Error('The logo must be a PNG, JPG or WebP picture');
    if (file.size > MAX_LOGO_BYTES) throw new Error('The logo is larger than 1 MB');
    const path = tenantPath(db, 'brand', `logo-${crypto.randomUUID()}${ext}`);
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    const before = await current(db);
    await store(db, me.systemUser.id, { ...before, logo_path: path });
    await removeFile(db, before.logo_path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function uploadHero(form: FormData): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('website', 'SYSTEM_CONFIGURE');
    const file = form.get('hero');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo');
    if (file.type !== 'image/jpeg') throw new Error('The photo was not prepared — please try again');
    if (file.size > MAX_MEDIA_BYTES) throw new Error('The photo is too large');
    const path = tenantPath(db, 'brand', `hero-${crypto.randomUUID()}.jpg`);
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    const before = await current(db);
    await store(db, me.systemUser.id, { ...before, hero_path: path });
    await removeFile(db, before.hero_path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Remove the logo or the photo (back to the default look). */
export async function removeBrandPicture(which: 'logo' | 'hero'): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    const before = await current(db);
    const key = which === 'logo' ? 'logo_path' : 'hero_path';
    await store(db, me.systemUser.id, { ...before, [key]: null });
    await removeFile(db, before[key]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** The main colour (#rrggbb), or null for the default. White text sits on it, so very light colours are refused. */
export async function saveBrandColor(color: string | null): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    if (color !== null) {
      if (!isHexColor(color)) throw new Error('Choose a colour');
      if (tooLight(color)) throw new Error('This colour is too light — white writing on it would be hard to read. Choose a darker one.');
    }
    const before = await current(db);
    await store(db, me.systemUser.id, { ...before, color: color?.toLowerCase() ?? null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
