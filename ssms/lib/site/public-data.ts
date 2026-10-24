// ─────────────────────────────────────────────────────────────────────────────
// What a Sunday school's public website shows (server only). Read with a
// client held to that Sunday school, and every query here names its columns:
// only what the office chose to publish — the parish profile, the About
// topics written for the bot, programs added under Public Website → Events,
// the department names for the contact form, published news posts and photo
// albums (039), and how many active members and students there are (counts
// only). Never people, students, finance or anything else.
// The default Sunday school is served at /, others at /s/<slug> (publicPath).
// Cached for 5 minutes per Sunday school; saving any of these refreshes it
// (lib/site/cache).
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { DEFAULT_PARISH_SETTINGS, PARISH_SETTINGS_KEY, type ParishSettings } from '@/lib/admin/types';
import { loadAbout, type AboutTopic } from '@/lib/telegram/about';
import { botUsername, telegramConfigured } from '@/lib/telegram/bot';
import type { ProgramType } from '@/lib/programs/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { tenantClient } from '@/lib/tenant/db';
import { runInTenant } from '@/lib/tenant/scope';
import { publicPath, type TenantInfo } from '@/lib/tenant/context';
import { loadBranding } from '@/lib/tenant/branding';
import { DEFAULT_BRAND_COLOR, EMPTY_BRANDING, brandOf, type Branding } from '@/lib/branding';
import { SITE_TAG } from './cache';
import { POST_COLUMNS, albumList, albumPhotos, toPost } from './content';
import type { SiteAlbum, SitePhoto, SitePost } from './media';

export interface PublicEvent {
  id: string;
  title_en: string;
  title_am: string;
  type: ProgramType;
  start_date: string;
  /** HH:MM or '' */
  start_time: string;
  end_date: string | null;
  location: string;
  description: string;
}

/** Names and pictures in the header, hero and footer */
export interface SiteBrand {
  name_am: string;
  name_en: string;
  /** The church the Sunday school belongs to (small line above the name) */
  church_am: string;
  church_en: string;
  /** Hero picture and logo — only the default Sunday school has its own for now */
  image: string | null;
  logo: string | null;
  /** Main colour (#rrggbb) — header, footer and title bands */
  color: string;
}

export interface PublicSite {
  /** '' for the default Sunday school, '/s/<slug>' for the others — every link starts with it */
  base: string;
  brand: SiteBrand;
  parish: ParishSettings;
  topics: AboutTopic[];
  /** Coming (or still running) public programs, soonest first */
  events: PublicEvent[];
  /** For the contact form: the same departments as "✉️ Ask a department" in the bot */
  departments: { id: string; name_en: string; name_am: string }[];
  /** The bot's @username, for t.me links */
  bot: string | null;
  /** Active members and students — numbers only, for the home page */
  stats: { members: number; students: number };
}

type SiteData = Omit<PublicSite, 'base' | 'brand'>;

const EMPTY: SiteData = { parish: DEFAULT_PARISH_SETTINGS, topics: [], events: [], departments: [], bot: null, stats: { members: 0, students: 0 } };

/** Hamere Hiwot (the default Sunday school) keeps its own look */
const DEFAULT_BRAND: SiteBrand = {
  name_am: 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት',
  name_en: 'Hamere Hiwot Sunday School',
  church_am: 'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን',
  church_en: 'Sallo Debre Tsehay Saint George Church',
  image: '/images/hamere.jpg',
  logo: '/logo.png',
  color: DEFAULT_BRAND_COLOR,
};

function siteBrandOf(tenant: TenantInfo, parish: ParishSettings, saved: Branding): SiteBrand {
  // Logo, photo and colour as the Sunday school chose them (Administration → Branding)
  const look = brandOf(saved, tenant.is_default);
  const pictures = { image: look.heroUrl, logo: look.logoUrl, color: look.color };
  if (tenant.is_default) return { ...DEFAULT_BRAND, ...pictures };
  return {
    name_am: tenant.name_am || tenant.name_en,
    name_en: tenant.name_en,
    church_am: parish.parish_name_am === DEFAULT_PARISH_SETTINGS.parish_name_am ? '' : parish.parish_name_am,
    church_en: parish.parish_name_en === DEFAULT_PARISH_SETTINGS.parish_name_en ? '' : parish.parish_name_en,
    ...pictures,
  };
}

async function load(tenantId: string, today: string): Promise<SiteData> {
  if (!isSupabaseEnabled()) return EMPTY;
  return runInTenant(tenantId, async () => {
    const db = tenantClient(tenantId);
    const [parish, topics, events, units, bot, members, students] = await Promise.all([
      db.from('system_settings').select('value').eq('key', PARISH_SETTINGS_KEY).maybeSingle(),
      loadAbout(db).catch(() => []),
      // Before migration 038 there is no is_public: nothing is published yet
      db.from('programs')
        .select('id, title_en, title_am, program_type, start_date, start_time, end_date, location, description')
        .eq('is_public', true)
        .in('status', ['PLANNED', 'CONFIRMED'])
        .or(`start_date.gte.${today},end_date.gte.${today}`)
        .order('start_date')
        .order('start_time')
        .limit(40),
      db.from('organization_units')
        .select('id, name_en, name_am')
        .eq('is_active', true)
        .in('unit_type', ['DEPARTMENT', 'COORDINATION'])
        .order('sort_order'),
      (await telegramConfigured()) ? botUsername() : Promise.resolve(null),
      db.from('persons').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').not('membership_type', 'is', null),
      db.from('students').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    ]);
    // A new Sunday school has not written its profile yet: its own name, not the default one
    const saved = (parish.data as { value?: Partial<ParishSettings> } | null)?.value;
    return {
      parish: { ...DEFAULT_PARISH_SETTINGS, ...(saved ?? {}) },
      topics,
      events: ((events.data ?? []) as Record<string, string | null>[]).map((p) => ({
        id: p.id!,
        title_en: p.title_en!,
        title_am: p.title_am || p.title_en!,
        type: p.program_type as ProgramType,
        start_date: p.start_date!,
        start_time: (p.start_time ?? '').slice(0, 5),
        end_date: p.end_date,
        location: p.location ?? '',
        description: p.description ?? '',
      })),
      departments: ((units.data ?? []) as { id: string; name_en: string; name_am: string | null }[]).map((u) => ({ ...u, name_am: u.name_am || u.name_en })),
      bot,
      stats: { members: members.count ?? 0, students: students.count ?? 0 },
    };
  });
}

const cached = unstable_cache(load, ['public-site-v3'], { revalidate: 300, tags: [SITE_TAG] });

export async function publicSite(tenant: TenantInfo): Promise<PublicSite> {
  let data: SiteData;
  try {
    data = await cached(tenant.id, todayIso());
  } catch (e) {
    // The website keeps working (with less on it) when the database cannot be reached
    console.error('public site data failed', e);
    data = EMPTY;
  }
  if (!tenant.is_default && data.parish.parish_name_en === DEFAULT_PARISH_SETTINGS.parish_name_en) {
    data = {
      ...data,
      parish: { ...data.parish, parish_name_en: tenant.name_en, parish_name_am: tenant.name_am || tenant.name_en, diocese: '', foundation_year: '', motto: '' },
    };
  }
  const base = publicPath(tenant, '/').replace(/\/$/, '');
  const saved = await loadBranding(tenant.id).catch(() => EMPTY_BRANDING);
  return { ...data, base, brand: siteBrandOf(tenant, data.parish, saved) };
}

// ── News and gallery (migration 039) — published ones only ───────────────────

const NEWS_LIMIT = 60;

const cachedNews = unstable_cache(
  async (tenantId: string): Promise<SitePost[]> => {
    if (!isSupabaseEnabled()) return [];
    const { data } = await tenantClient(tenantId)
      .from('site_posts')
      .select(POST_COLUMNS)
      .eq('status', 'PUBLISHED')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(NEWS_LIMIT);
    return ((data ?? []) as Record<string, unknown>[]).map(toPost);
  },
  ['public-news-v2'],
  { revalidate: 300, tags: [SITE_TAG] }
);

const cachedAlbums = unstable_cache(
  async (tenantId: string): Promise<SiteAlbum[]> => {
    if (!isSupabaseEnabled()) return [];
    return (await albumList(tenantClient(tenantId), true)).filter((a) => a.photo_count > 0);
  },
  ['public-albums-v2'],
  { revalidate: 300, tags: [SITE_TAG] }
);

const cachedAlbumPhotos = unstable_cache(
  async (tenantId: string, albumId: string): Promise<SitePhoto[]> => (isSupabaseEnabled() ? albumPhotos(tenantClient(tenantId), albumId) : []),
  ['public-album-photos-v2'],
  { revalidate: 300, tags: [SITE_TAG] }
);

/** Published posts: pinned first, then newest. Empty before migration 039. */
export async function publicNews(tenant: TenantInfo): Promise<SitePost[]> {
  return cachedNews(tenant.id).catch(() => []);
}

const cachedPost = unstable_cache(
  async (tenantId: string, id: string): Promise<SitePost | null> => {
    if (!isSupabaseEnabled()) return null;
    const { data } = await tenantClient(tenantId).from('site_posts').select(POST_COLUMNS).eq('id', id).eq('status', 'PUBLISHED').maybeSingle();
    return data ? toPost(data as Record<string, unknown>) : null;
  },
  ['public-post-v2'],
  { revalidate: 300, tags: [SITE_TAG] }
);

/** One published post (also older ones beyond the list), or null */
export async function publicPost(tenant: TenantInfo, id: string): Promise<SitePost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await publicNews(tenant)).find((p) => p.id === id) ?? (await cachedPost(tenant.id, id).catch(() => null));
}

/** Published albums that have photos, newest first */
export async function publicAlbums(tenant: TenantInfo): Promise<SiteAlbum[]> {
  return cachedAlbums(tenant.id).catch(() => []);
}

/** A published album and its photos, or null */
export async function publicAlbum(tenant: TenantInfo, id: string): Promise<{ album: SiteAlbum; photos: SitePhoto[] } | null> {
  const album = (await publicAlbums(tenant)).find((a) => a.id === id);
  if (!album) return null;
  return { album, photos: await cachedAlbumPhotos(tenant.id, id).catch(() => []) };
}

// ── Event sign-up (migration 046) — read fresh on each visit ─────────────────

/** Public events open for sign-up today, with the places left (null = no limit). Empty before 046. */
export async function publicSignups(tenant: TenantInfo, eventIds: string[]): Promise<Record<string, { left: number | null }>> {
  if (!isSupabaseEnabled() || eventIds.length === 0) return {};
  try {
    const today = todayIso();
    const db = tenantClient(tenant.id);
    const { data, error } = await db.from('programs')
      .select('id, registration_capacity, registration_closes_on')
      .in('id', eventIds)
      .eq('is_public', true)
      .eq('registration_open', true);
    if (error) return {};
    const open = ((data ?? []) as { id: string; registration_capacity: number | null; registration_closes_on: string | null }[]).filter(
      (p) => !p.registration_closes_on || p.registration_closes_on >= today
    );
    if (open.length === 0) return {};
    const { data: regs } = await db.from('event_registrations')
      .select('program_id, seats')
      .in('program_id', open.filter((p) => p.registration_capacity !== null).map((p) => p.id))
      .eq('status', 'REGISTERED')
      .limit(20000);
    const taken = new Map<string, number>();
    for (const r of (regs ?? []) as { program_id: string; seats: number }[]) taken.set(r.program_id, (taken.get(r.program_id) ?? 0) + r.seats);
    return Object.fromEntries(
      open.map((p) => [p.id, { left: p.registration_capacity === null ? null : Math.max(p.registration_capacity - (taken.get(p.id) ?? 0), 0) }])
    );
  } catch (e) {
    console.error('public sign-up data failed', e);
    return {};
  }
}
