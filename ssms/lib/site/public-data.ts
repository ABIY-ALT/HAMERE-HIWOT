// ─────────────────────────────────────────────────────────────────────────────
// What the public website shows (server only). Read with the service key, so
// every query here names its columns: only what the office chose to publish
// — the parish profile, the About topics written for the bot, programs marked
// "Show on the public website", the department names for the contact form,
// and published news posts and photo albums (039). Never people, students,
// finance or anything else.
// Cached for 5 minutes; saving any of these refreshes it (lib/site/cache).
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { DEFAULT_PARISH_SETTINGS, PARISH_SETTINGS_KEY, type ParishSettings } from '@/lib/admin/types';
import { loadAbout, type AboutTopic } from '@/lib/telegram/about';
import { botUsername, telegramConfigured } from '@/lib/telegram/bot';
import type { ProgramType } from '@/lib/programs/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
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

export interface PublicSite {
  parish: ParishSettings;
  topics: AboutTopic[];
  /** Coming (or still running) public programs, soonest first */
  events: PublicEvent[];
  /** For the contact form: the same departments as "✉️ Ask a department" in the bot */
  departments: { id: string; name_en: string; name_am: string }[];
  /** The bot's @username, for t.me links */
  bot: string | null;
}

const EMPTY: PublicSite = { parish: DEFAULT_PARISH_SETTINGS, topics: [], events: [], departments: [], bot: null };

async function load(today: string): Promise<PublicSite> {
  if (!isSupabaseEnabled()) return EMPTY;
  const db = createAdminClient();
  const [parish, topics, events, units, bot] = await Promise.all([
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
    telegramConfigured() ? botUsername() : Promise.resolve(null),
  ]);
  return {
    parish: { ...DEFAULT_PARISH_SETTINGS, ...((parish.data as { value?: Partial<ParishSettings> } | null)?.value ?? {}) },
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
  };
}

const cached = unstable_cache(load, ['public-site-v1'], { revalidate: 300, tags: [SITE_TAG] });

export async function publicSite(): Promise<PublicSite> {
  try {
    return await cached(todayIso());
  } catch (e) {
    // The website keeps working (with less on it) when the database cannot be reached
    console.error('public site data failed', e);
    return EMPTY;
  }
}

// ── News and gallery (migration 039) — published ones only ───────────────────

const NEWS_LIMIT = 60;

const cachedNews = unstable_cache(
  async (): Promise<SitePost[]> => {
    if (!isSupabaseEnabled()) return [];
    const { data } = await createAdminClient()
      .from('site_posts')
      .select(POST_COLUMNS)
      .eq('status', 'PUBLISHED')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(NEWS_LIMIT);
    return ((data ?? []) as Record<string, unknown>[]).map(toPost);
  },
  ['public-news-v1'],
  { revalidate: 300, tags: [SITE_TAG] }
);

const cachedAlbums = unstable_cache(
  async (): Promise<SiteAlbum[]> => {
    if (!isSupabaseEnabled()) return [];
    return (await albumList(createAdminClient(), true)).filter((a) => a.photo_count > 0);
  },
  ['public-albums-v1'],
  { revalidate: 300, tags: [SITE_TAG] }
);

const cachedAlbumPhotos = unstable_cache(
  async (albumId: string): Promise<SitePhoto[]> => (isSupabaseEnabled() ? albumPhotos(createAdminClient(), albumId) : []),
  ['public-album-photos-v1'],
  { revalidate: 300, tags: [SITE_TAG] }
);

/** Published posts: pinned first, then newest. Empty before migration 039. */
export async function publicNews(): Promise<SitePost[]> {
  return cachedNews().catch(() => []);
}

const cachedPost = unstable_cache(
  async (id: string): Promise<SitePost | null> => {
    if (!isSupabaseEnabled()) return null;
    const { data } = await createAdminClient().from('site_posts').select(POST_COLUMNS).eq('id', id).eq('status', 'PUBLISHED').maybeSingle();
    return data ? toPost(data as Record<string, unknown>) : null;
  },
  ['public-post-v1'],
  { revalidate: 300, tags: [SITE_TAG] }
);

/** One published post (also older ones beyond the list), or null */
export async function publicPost(id: string): Promise<SitePost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await publicNews()).find((p) => p.id === id) ?? (await cachedPost(id).catch(() => null));
}

/** Published albums that have photos, newest first */
export async function publicAlbums(): Promise<SiteAlbum[]> {
  return cachedAlbums().catch(() => []);
}

/** A published album and its photos, or null */
export async function publicAlbum(id: string): Promise<{ album: SiteAlbum; photos: SitePhoto[] } | null> {
  const album = (await publicAlbums()).find((a) => a.id === id);
  if (!album) return null;
  return { album, photos: await cachedAlbumPhotos(id).catch(() => []) };
}
