// ─────────────────────────────────────────────────────────────────────────────
// News and gallery rows (migration 039) — server only. Shared by the editor
// pages (app/dashboard/website/actions) and the public website
// (lib/site/public-data).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/auth/authorize';
import type { SiteAlbum, SitePhoto, SitePost } from './media';

type Row = Record<string, unknown>;

export const CONTENT_MIGRATION = 'Run database migration 039 (website news & gallery) first';
export const contentMissing = (m: string) =>
  /site_posts|site_albums|site_photos|site-media|[Bb]ucket not found/.test(m) && /does not exist|schema cache|not found/i.test(m) ? CONTENT_MIGRATION : m;

export const POST_COLUMNS = 'id, title_am, title_en, body_am, body_en, cover_path, status, pinned, published_at, telegram_sent_at, created_at';

export function toPost(r: Row): SitePost {
  return {
    id: r.id as string,
    title_am: r.title_am as string,
    title_en: (r.title_en as string) ?? '',
    body_am: (r.body_am as string) ?? '',
    body_en: (r.body_en as string) ?? '',
    cover_path: (r.cover_path as string) ?? null,
    status: r.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    pinned: Boolean(r.pinned),
    published_at: (r.published_at as string) ?? null,
    telegram_sent_at: (r.telegram_sent_at as string) ?? null,
    created_at: r.created_at as string,
  };
}

export function toPhoto(r: Row): SitePhoto {
  return {
    id: r.id as string,
    album_id: r.album_id as string,
    path: r.path as string,
    thumb_path: r.thumb_path as string,
    width: Number(r.width),
    height: Number(r.height),
    caption_am: (r.caption_am as string) ?? '',
    caption_en: (r.caption_en as string) ?? '',
  };
}

/** Photos of an album, in the order they were added. */
export async function albumPhotos(db: SupabaseClient, albumId: string): Promise<SitePhoto[]> {
  const rows = await selectAll<Row>((a, b) =>
    db.from('site_photos')
      .select('id, album_id, path, thumb_path, width, height, caption_am, caption_en')
      .eq('album_id', albumId)
      .order('sort_order')
      .order('created_at')
      .order('id')
      .range(a, b)
  );
  return rows.map(toPhoto);
}

/** Albums, newest first, each with its photo count and cover thumbnail. */
export async function albumList(db: SupabaseClient, onlyPublished: boolean): Promise<SiteAlbum[]> {
  const albums = await selectAll<Row>((a, b) => {
    let q = db.from('site_albums').select('id, title_am, title_en, description_am, description_en, event_date, cover_photo_id, is_published, created_at');
    if (onlyPublished) q = q.eq('is_published', true);
    return q.order('event_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id').range(a, b);
  });
  if (albums.length === 0) return [];
  const photos = await selectAll<Row>((a, b) =>
    db.from('site_photos')
      .select('id, album_id, thumb_path')
      .in('album_id', albums.map((x) => x.id as string))
      .order('sort_order')
      .order('created_at')
      .order('id')
      .range(a, b)
  );
  const byAlbum = new Map<string, Row[]>();
  for (const p of photos) byAlbum.set(p.album_id as string, [...(byAlbum.get(p.album_id as string) ?? []), p]);
  return albums.map((r) => {
    const list = byAlbum.get(r.id as string) ?? [];
    const cover = list.find((p) => p.id === r.cover_photo_id) ?? list[0];
    return {
      id: r.id as string,
      title_am: r.title_am as string,
      title_en: (r.title_en as string) ?? '',
      description_am: (r.description_am as string) ?? '',
      description_en: (r.description_en as string) ?? '',
      event_date: (r.event_date as string) ?? null,
      cover_photo_id: (r.cover_photo_id as string) ?? null,
      is_published: Boolean(r.is_published),
      photo_count: list.length,
      cover_thumb: (cover?.thumb_path as string) ?? null,
    };
  });
}
