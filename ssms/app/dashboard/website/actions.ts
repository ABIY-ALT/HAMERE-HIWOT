'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Public website → News and Gallery (migration 039). Everything needs
// WEBSITE_MANAGE (role WEBSITE_EDITOR, the secretariat, the super admin).
// Pictures go to the PUBLIC bucket "site-media", already made smaller in the
// browser (lib/site/shrink). Every change refreshes the public website.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { escapeHtml, siteUrl, telegramConfigured, telegramLater, telegramToChats } from '@/lib/telegram/bot';
import { refreshPublicSite } from '@/lib/site/cache';
import { MAX_MEDIA_BYTES, MEDIA_BUCKET, type SiteAlbum, type SitePhoto, type SitePost } from '@/lib/site/media';
import { POST_COLUMNS, albumList, albumPhotos, contentMissing, toPost } from '@/lib/site/content';

type Db = Awaited<ReturnType<typeof authorize>>['db'];
type Row = Record<string, unknown>;

const id = z.string().regex(/^[0-9a-f-]{36}$/i, 'Not found — reload the page');
const fail = (e: unknown) => ({ ok: false as const, error: contentMissing(errorMessage(e)) });

/** A shrunk JPEG from the browser (lib/site/shrink) */
function picture(form: FormData, field: string): File {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo');
  if (file.type !== 'image/jpeg') throw new Error('The photo was not prepared — please try again');
  if (file.size > MAX_MEDIA_BYTES) throw new Error('The photo is too large');
  return file;
}

async function put(db: Db, path: string, file: File) {
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(contentMissing(error.message));
}

async function removeFiles(db: Db, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  for (let i = 0; i < list.length; i += 100) await db.storage.from(MEDIA_BUCKET).remove(list.slice(i, i + 100));
}

// ── News ─────────────────────────────────────────────────────────────────────

export async function loadPosts(): Promise<Loaded<{ posts: SitePost[]; telegram: boolean }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const rows = await selectAll<Row>((a, b) => db.from('site_posts').select(POST_COLUMNS).order('created_at', { ascending: false }).order('id').range(a, b));
    return { mode: 'live', data: { posts: rows.map(toPost), telegram: telegramConfigured() } };
  } catch (e) {
    return { mode: 'error', error: contentMissing(errorMessage(e)) };
  }
}

const PostSchema = z.object({
  title_am: z.string().trim().min(3, 'Write the title in Amharic').max(200),
  title_en: z.string().trim().max(200),
  body_am: z.string().trim().min(10, 'Write the text in Amharic').max(20_000),
  body_en: z.string().trim().max(20_000),
  pinned: z.boolean(),
});
export type PostInput = z.input<typeof PostSchema>;

export async function savePost(postId: string | null, input: PostInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('WEBSITE_MANAGE');
    const p = PostSchema.parse(input);
    const values = { ...p, title_en: p.title_en || null, body_en: p.body_en || null, updated_by: me.systemUser.id };
    if (postId) {
      await db.from('site_posts').update(values).eq('id', id.parse(postId)).then(check);
      refreshPublicSite();
      return { ok: true, id: postId };
    }
    const row = (await db.from('site_posts').insert({ ...values, created_by: me.systemUser.id }).select('id').single().then(check)) as { id: string };
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Publish (or take back to draft). Publishing with `toTelegram` also sends it
 * to everyone connected to the bot — only the first time.
 */
export async function setPostStatus(postId: string, publish: boolean, toTelegram: boolean): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const post = (await db.from('site_posts').select(POST_COLUMNS).eq('id', id.parse(postId)).maybeSingle().then(check)) as Row | null;
    if (!post) throw new Error('Not found — reload the page');
    const now = new Date().toISOString();
    const sendNow = publish && toTelegram && !post.telegram_sent_at && telegramConfigured();
    await db.from('site_posts')
      .update({
        status: publish ? 'PUBLISHED' : 'DRAFT',
        ...(publish && !post.published_at ? { published_at: now } : {}),
        ...(sendNow ? { telegram_sent_at: now } : {}),
      })
      .eq('id', post.id as string)
      .then(check);
    if (sendNow) {
      const p = toPost(post);
      const excerpt = p.body_am.length > 350 ? `${p.body_am.slice(0, 350).trimEnd()}…` : p.body_am;
      const html = `📰 <b>${escapeHtml(p.title_am)}</b>${p.title_en ? `\n<i>${escapeHtml(p.title_en)}</i>` : ''}\n\n${escapeHtml(excerpt)}\n\n${siteUrl()}/news/${p.id}`;
      telegramLater(async (bg) => {
        const links = await selectAll<{ chat_id: number }>((a, b) => bg.from('telegram_links').select('chat_id').order('chat_id').range(a, b));
        await telegramToChats(bg, new Set(links.map((l) => Number(l.chat_id))), html);
      });
    }
    refreshPublicSite();
    return { ok: true, sent: sendNow };
  } catch (e) {
    return fail(e);
  }
}

/** The post's picture (replaces the one it had). */
export async function uploadPostCover(form: FormData): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const postId = id.parse(String(form.get('post_id') ?? ''));
    const file = picture(form, 'file');
    const post = (await db.from('site_posts').select('id, cover_path').eq('id', postId).maybeSingle().then(check)) as { id: string; cover_path: string | null } | null;
    if (!post) throw new Error('Not found — reload the page');
    const path = `posts/${postId}/${crypto.randomUUID()}.jpg`;
    await put(db, path, file);
    const { error } = await db.from('site_posts').update({ cover_path: path }).eq('id', postId);
    if (error) {
      await removeFiles(db, [path]);
      throw new Error(error.message);
    }
    await removeFiles(db, [post.cover_path]);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePostCover(postId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const post = (await db.from('site_posts').select('id, cover_path').eq('id', id.parse(postId)).maybeSingle().then(check)) as { id: string; cover_path: string | null } | null;
    if (!post) throw new Error('Not found — reload the page');
    await db.from('site_posts').update({ cover_path: null }).eq('id', post.id).then(check);
    await removeFiles(db, [post.cover_path]);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const post = (await db.from('site_posts').select('id, cover_path').eq('id', id.parse(postId)).maybeSingle().then(check)) as { id: string; cover_path: string | null } | null;
    if (!post) return { ok: true };
    await db.from('site_posts').delete().eq('id', post.id).then(check);
    await removeFiles(db, [post.cover_path]);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export async function loadAlbums(): Promise<Loaded<SiteAlbum[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    return { mode: 'live', data: await albumList(db, false) };
  } catch (e) {
    return { mode: 'error', error: contentMissing(errorMessage(e)) };
  }
}

export async function loadAlbumPhotos(albumId: string): Promise<{ ok: true; photos: SitePhoto[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    return { ok: true, photos: await albumPhotos(db, id.parse(albumId)) };
  } catch (e) {
    return fail(e);
  }
}

const AlbumSchema = z.object({
  title_am: z.string().trim().min(2, 'Write the album name in Amharic').max(200),
  title_en: z.string().trim().max(200),
  description_am: z.string().trim().max(2000),
  description_en: z.string().trim().max(2000),
  event_date: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
});
export type AlbumInput = z.input<typeof AlbumSchema>;

export async function saveAlbum(albumId: string | null, input: AlbumInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('WEBSITE_MANAGE');
    const a = AlbumSchema.parse(input);
    const values = {
      title_am: a.title_am,
      title_en: a.title_en || null,
      description_am: a.description_am || null,
      description_en: a.description_en || null,
      event_date: a.event_date || null,
    };
    if (albumId) {
      await db.from('site_albums').update(values).eq('id', id.parse(albumId)).then(check);
      refreshPublicSite();
      return { ok: true, id: albumId };
    }
    const row = (await db.from('site_albums').insert({ ...values, created_by: me.systemUser.id }).select('id').single().then(check)) as { id: string };
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setAlbumPublished(albumId: string, published: boolean): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    await db.from('site_albums').update({ is_published: published }).eq('id', id.parse(albumId)).then(check);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** One photo (its large copy and thumbnail, both made in the browser). */
export async function uploadPhoto(form: FormData): Promise<{ ok: true; photo: SitePhoto } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('WEBSITE_MANAGE');
    const albumId = id.parse(String(form.get('album_id') ?? ''));
    const full = picture(form, 'full');
    const thumb = picture(form, 'thumb');
    const width = z.coerce.number().int().min(1).max(10_000).parse(form.get('width'));
    const height = z.coerce.number().int().min(1).max(10_000).parse(form.get('height'));
    const { data: album } = await db.from('site_albums').select('id').eq('id', albumId).maybeSingle();
    if (!album) throw new Error('This album was not found — reload the page');
    const { count } = await db.from('site_photos').select('id', { count: 'exact', head: true }).eq('album_id', albumId);

    const name = crypto.randomUUID();
    const path = `albums/${albumId}/${name}.jpg`;
    const thumbPath = `albums/${albumId}/${name}_t.jpg`;
    await put(db, path, full);
    try {
      await put(db, thumbPath, thumb);
    } catch (e) {
      await removeFiles(db, [path]);
      throw e;
    }
    const { data, error } = await db.from('site_photos')
      .insert({ album_id: albumId, path, thumb_path: thumbPath, width, height, size_bytes: full.size + thumb.size, sort_order: count ?? 0, created_by: me.systemUser.id })
      .select('id, album_id, path, thumb_path, width, height, caption_am, caption_en')
      .single();
    if (error || !data) {
      await removeFiles(db, [path, thumbPath]);
      throw new Error(error?.message ?? 'The photo was not saved');
    }
    refreshPublicSite();
    const r = data as Row;
    return {
      ok: true,
      photo: { id: r.id as string, album_id: albumId, path, thumb_path: thumbPath, width, height, caption_am: '', caption_en: '' },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function savePhotoCaption(photoId: string, captionAm: string, captionEn: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    await db.from('site_photos')
      .update({ caption_am: captionAm.trim().slice(0, 300) || null, caption_en: captionEn.trim().slice(0, 300) || null })
      .eq('id', id.parse(photoId))
      .then(check);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setAlbumCover(albumId: string, photoId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const { data: photo } = await db.from('site_photos').select('id').eq('id', id.parse(photoId)).eq('album_id', id.parse(albumId)).maybeSingle();
    if (!photo) throw new Error('This photo is not in the album');
    await db.from('site_albums').update({ cover_photo_id: photoId }).eq('id', albumId).then(check);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const photo = (await db.from('site_photos').select('id, path, thumb_path').eq('id', id.parse(photoId)).maybeSingle().then(check)) as Row | null;
    if (!photo) return { ok: true };
    await db.from('site_photos').delete().eq('id', photo.id as string).then(check);
    await removeFiles(db, [photo.path as string, photo.thumb_path as string]);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The album and all its photos (the files too). */
export async function deleteAlbum(albumId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const photos = await albumPhotos(db, id.parse(albumId));
    await db.from('site_albums').delete().eq('id', albumId).then(check);
    await removeFiles(db, photos.flatMap((p) => [p.path, p.thumb_path]));
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
