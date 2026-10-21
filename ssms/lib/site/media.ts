// ─────────────────────────────────────────────────────────────────────────────
// Public website news and gallery (migration 039) — shapes, limits and the
// public link of a file, with no server code, so client pages can use them.
// Files live in the PUBLIC storage bucket "site-media": anyone with the link
// can open them, so only pictures meant for the website go there.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '@/lib/env';

export const MEDIA_BUCKET = 'site-media';

/** The large copy of a photo: its longer side, in pixels */
export const PHOTO_MAX_SIDE = 1600;
/** The thumbnail: its longer side, in pixels */
export const THUMB_MAX_SIDE = 480;
/** Per uploaded file, after shrinking (the bucket refuses more than 3 MB) */
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
/** Photos added to an album in one go */
export const MAX_PHOTOS_AT_ONCE = 40;

/** The public link of a file in the bucket ('' when there is none). */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  const base = (env.supabaseUrl() ?? '').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export type PostStatus = 'DRAFT' | 'PUBLISHED';

export interface SitePost {
  id: string;
  title_am: string;
  title_en: string;
  body_am: string;
  body_en: string;
  cover_path: string | null;
  status: PostStatus;
  pinned: boolean;
  published_at: string | null;
  telegram_sent_at: string | null;
  created_at: string;
}

export interface SitePhoto {
  id: string;
  album_id: string;
  path: string;
  thumb_path: string;
  width: number;
  height: number;
  caption_am: string;
  caption_en: string;
}

export interface SiteAlbum {
  id: string;
  title_am: string;
  title_en: string;
  description_am: string;
  description_en: string;
  event_date: string | null;
  cover_photo_id: string | null;
  is_published: boolean;
  photo_count: number;
  /** The cover's thumbnail (the chosen cover, else the first photo) */
  cover_thumb: string | null;
}
