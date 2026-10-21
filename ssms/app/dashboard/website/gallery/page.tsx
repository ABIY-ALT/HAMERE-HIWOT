'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Eye, EyeOff, ExternalLink, ImagePlus, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { MAX_PHOTOS_AT_ONCE, mediaUrl, type SiteAlbum, type SitePhoto } from '@/lib/site/media';
import { shrinkPhoto } from '@/lib/site/shrink';
import {
  deleteAlbum,
  deletePhoto,
  loadAlbumPhotos,
  loadAlbums,
  saveAlbum,
  savePhotoCaption,
  setAlbumCover,
  setAlbumPublished,
  uploadPhoto,
  type AlbumInput,
} from '../actions';

const EMPTY: AlbumInput = { title_am: '', title_en: '', description_am: '', description_en: '', event_date: '' };

/** Public website → Gallery: albums of photos; published albums show under /gallery. */
export default function WebsiteGalleryPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [albums, setAlbums] = useState<SiteAlbum[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SiteAlbum | 'new' | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    loadAlbums().then((res) => {
      if (res.mode === 'live') setAlbums(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const notify = useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const open = albums.find((a) => a.id === openId) ?? null;

  return (
    <div className="space-y-6 max-w-6xl">
      <AdminToast toast={toast} />
      {open ? (
        <AlbumView album={open} onBack={() => { setOpenId(null); reload(); }} onEdit={() => setEditing(open)} onChanged={reload} notify={notify} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Photo gallery', 'የፎቶ ማዕከል')}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {t('Published albums appear on the public website under Gallery.', 'የታተሙ አልበሞች በሕዝብ ድረ-ገጹ «ፎቶዎች» ስር ይታያሉ።')}
              </p>
            </div>
            <button onClick={() => setEditing('new')} disabled={mode !== 'live'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
              <Plus size={14} /> {t('New album', 'አዲስ አልበም')}
            </button>
          </div>
          <AdminModeNotice mode={mode} error={error} />
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
            {t(
              'Children’s privacy: prefer group photos, do not write children’s names in captions, and remove a photo at once if a parent asks.',
              'የልጆች ግላዊነት፦ የቡድን ፎቶዎችን ይምረጡ፤ የልጆችን ስም በመግለጫ አይጻፉ፤ ወላጅ ከጠየቀ ፎቶውን ወዲያው ያስወግዱ።'
            )}
          </div>
          {mode === 'live' && albums.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">{t('No albums yet.', 'እስካሁን አልበም የለም።')}</div>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card overflow-hidden text-left hover:shadow-md transition">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {a.cover_thumb && <Image src={mediaUrl(a.cover_thumb)} alt="" fill unoptimized className="object-cover" />}
                  <span className={`absolute top-2 left-2 badge ${a.is_published ? 'badge-success' : 'badge-warning'}`}>
                    {a.is_published ? t('Published', 'ታትሟል') : t('Not published', 'አልታተመም')}
                  </span>
                </div>
                <div className="p-3">
                  <div className="font-bold text-slate-900 truncate">{a.title_am}</div>
                  <div className="text-xs text-slate-500">
                    {a.photo_count} {t('photos', 'ፎቶዎች')}{a.event_date ? ` · ${formatEthiopianDate(a.event_date, locale)}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {editing && (
        <AlbumEditor
          album={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(newId) => {
            setEditing(null);
            notify('success', t('Saved', 'ተቀምጧል'));
            reload();
            setOpenId(newId);
          }}
          onDeleted={() => {
            setEditing(null);
            setOpenId(null);
            notify('success', t('Album deleted', 'አልበሙ ተሰርዟል'));
            reload();
          }}
        />
      )}
    </div>
  );
}

function AlbumView({ album, onBack, onEdit, onChanged, notify }: {
  album: SiteAlbum;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  notify: (kind: 'success' | 'error', text: string) => void;
}) {
  const { t, locale } = useLang();
  const [photos, setPhotos] = useState<SitePhoto[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [caption, setCaption] = useState<SitePhoto | null>(null);

  useEffect(() => {
    loadAlbumPhotos(album.id).then((res) => {
      if (res.ok) setPhotos(res.photos);
      else notify('error', res.error);
    });
  }, [album.id, notify]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, MAX_PHOTOS_AT_ONCE);
    if (files.length > MAX_PHOTOS_AT_ONCE) notify('error', t(`Only the first ${MAX_PHOTOS_AT_ONCE} are added — add the rest after`, `የመጀመሪያዎቹ ${MAX_PHOTOS_AT_ONCE} ብቻ ይጨመራሉ — ቀሪዎቹን ከዚያ በኋላ ይጨምሩ`));
    let failed = 0;
    setProgress({ done: 0, total: list.length, failed: 0 });
    // One at a time: phones have little memory, and each finished photo shows at once
    for (let i = 0; i < list.length; i++) {
      try {
        const s = await shrinkPhoto(list[i]);
        const fd = new FormData();
        fd.set('album_id', album.id);
        fd.set('full', new File([s.full], 'photo.jpg', { type: 'image/jpeg' }));
        fd.set('thumb', new File([s.thumb], 'thumb.jpg', { type: 'image/jpeg' }));
        fd.set('width', String(s.width));
        fd.set('height', String(s.height));
        const res = await uploadPhoto(fd);
        if (res.ok) setPhotos((p) => [...(p ?? []), res.photo]);
        else {
          failed += 1;
          if (failed === 1) notify('error', res.error);
        }
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: list.length, failed });
    }
    setProgress(null);
    onChanged();
    notify(failed ? 'error' : 'success', failed
      ? t(`${list.length - failed} added, ${failed} could not be read (try JPG or PNG)`, `${list.length - failed} ተጨምረዋል፤ ${failed} ሊነበቡ አልቻሉም (JPG ወይም PNG ይሞክሩ)`)
      : t(`${list.length} photos added`, `${list.length} ፎቶዎች ተጨምረዋል`));
  };

  const publish = async () => {
    const res = await setAlbumPublished(album.id, !album.is_published);
    if (!res.ok) return notify('error', res.error);
    notify('success', album.is_published ? t('Taken off the website', 'ከድረ-ገጹ ተነሥቷል') : t('Published on the website', 'በድረ-ገጹ ላይ ታትሟል'));
    onChanged();
  };
  const makeCover = async (p: SitePhoto) => {
    const res = await setAlbumCover(album.id, p.id);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Cover changed', 'የሽፋን ፎቶ ተቀይሯል'));
    onChanged();
  };
  const remove = async (p: SitePhoto) => {
    if (!window.confirm(t('Delete this photo?', 'ይህ ፎቶ ይሰረዝ?'))) return;
    const res = await deletePhoto(p.id);
    if (!res.ok) return notify('error', res.error);
    setPhotos((list) => (list ?? []).filter((x) => x.id !== p.id));
    onChanged();
  };

  const coverId = album.cover_photo_id ?? photos?.[0]?.id;
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"><ArrowLeft size={15} /> {t('All albums', 'ሁሉም አልበሞች')}</button>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{album.title_am}</h1>
          {album.title_en && <p className="text-sm text-slate-500">{album.title_en}</p>}
          <p className="text-xs text-slate-500 mt-1">
            {photos?.length ?? album.photo_count} {t('photos', 'ፎቶዎች')}{album.event_date ? ` · ${formatEthiopianDate(album.event_date, locale)}` : ''} ·{' '}
            {album.is_published ? <span className="text-emerald-700 font-semibold">{t('published', 'ታትሟል')}</span> : <span className="text-amber-700 font-semibold">{t('not published', 'አልታተመም')}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-primary text-xs inline-flex items-center gap-1.5 cursor-pointer ${progress ? 'opacity-60 pointer-events-none' : ''}`}>
            <ImagePlus size={14} /> {t('Add photos', 'ፎቶዎች ጨምር')}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
          <button onClick={publish} disabled={!album.is_published && !(photos?.length)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            {album.is_published ? <><EyeOff size={14} /> {t('Take down', 'አንሣ')}</> : <><Eye size={14} /> {t('Publish', 'አትም')}</>}
          </button>
          {album.is_published && (
            <a href={`/gallery/${album.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><ExternalLink size={14} /> {t('View', 'ይመልከቱ')}</a>
          )}
          <button onClick={onEdit} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Pencil size={14} /> {t('Edit album', 'አልበሙን አስተካክል')}</button>
        </div>
      </div>

      {progress && (
        <div className="card p-3 text-sm">
          <div className="flex justify-between text-xs text-slate-600 mb-1.5">
            <span>{t('Preparing and uploading…', 'በማዘጋጀትና በመጫን ላይ…')}</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-[#3d57e3] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {photos === null ? (
        <p className="text-sm text-slate-500">{t('Loading…', 'በመጫን ላይ…')}</p>
      ) : photos.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t('No photos yet — press “Add photos”. You can pick many at once.', 'እስካሁን ፎቶ የለም — «ፎቶዎች ጨምር» ይጫኑ። ብዙ በአንድ ጊዜ መምረጥ ይቻላል።')}</div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="card overflow-hidden">
              <div className="relative aspect-square bg-slate-100">
                <Image src={mediaUrl(p.thumb_path)} alt={p.caption_am} fill unoptimized className="object-cover" />
                {p.id === coverId && <span className="absolute top-1.5 left-1.5 badge badge-primary inline-flex items-center gap-1"><Star size={10} /> {t('Cover', 'ሽፋን')}</span>}
              </div>
              <div className="p-2 space-y-1">
                <p className="text-[11px] text-slate-600 truncate min-h-[1rem]">{p.caption_am || p.caption_en}</p>
                <div className="flex justify-between text-[11px] font-semibold">
                  <button onClick={() => setCaption(p)} className="text-blue-600 hover:text-blue-800">{t('Caption', 'መግለጫ')}</button>
                  {p.id !== coverId && <button onClick={() => makeCover(p)} className="text-slate-600 hover:text-slate-900">{t('Cover', 'ሽፋን')}</button>}
                  <button onClick={() => remove(p)} className="text-red-600 hover:text-red-800" aria-label={t('Delete', 'ሰርዝ')}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {caption && (
        <CaptionDialog
          photo={caption}
          onClose={() => setCaption(null)}
          onSaved={(am, en) => {
            setPhotos((list) => (list ?? []).map((x) => (x.id === caption.id ? { ...x, caption_am: am, caption_en: en } : x)));
            setCaption(null);
          }}
          onError={(text) => notify('error', text)}
        />
      )}
    </div>
  );
}

function CaptionDialog({ photo, onClose, onSaved, onError }: { photo: SitePhoto; onClose: () => void; onSaved: (am: string, en: string) => void; onError: (text: string) => void }) {
  const { t } = useLang();
  const [am, setAm] = useState(photo.caption_am);
  const [en, setEn] = useState(photo.caption_en);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await savePhotoCaption(photo.id, am, en);
    setBusy(false);
    if (!res.ok) return onError(res.error);
    onSaved(am.trim(), en.trim());
  };
  return (
    <Modal isOpen onClose={onClose} title={t('Photo caption', 'የፎቶ መግለጫ')} maxWidth="md">
      <form onSubmit={save} className="space-y-3">
        <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
          <Image src={mediaUrl(photo.thumb_path)} alt="" fill unoptimized className="object-contain" />
        </div>
        <input value={am} onChange={(e) => setAm(e.target.value)} maxLength={300} placeholder={t('Caption (Amharic)', 'መግለጫ (አማርኛ)')} className="form-input text-sm" />
        <input value={en} onChange={(e) => setEn(e.target.value)} maxLength={300} placeholder={t('Caption (English, optional)', 'መግለጫ (እንግሊዝኛ፣ ካለ)')} className="form-input text-sm" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{t('Save', 'መዝግብ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function AlbumEditor({ album, onClose, onSaved, onDeleted }: { album: SiteAlbum | null; onClose: () => void; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState<AlbumInput>(
    album
      ? { title_am: album.title_am, title_en: album.title_en, description_am: album.description_am, description_en: album.description_en, event_date: album.event_date ?? '' }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (key: keyof AlbumInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveAlbum(album?.id ?? null, form);
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    onSaved(res.id);
  };
  const remove = async () => {
    if (!album) return;
    if (!window.confirm(t(`Delete the album “${album.title_am}” and all ${album.photo_count} photos?`, `«${album.title_am}» አልበምና ${album.photo_count} ፎቶዎቹ ይሰረዙ?`))) return;
    setBusy(true);
    const res = await deleteAlbum(album.id);
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    onDeleted();
  };

  const label = 'text-xs font-semibold text-slate-700 block mb-1';
  return (
    <Modal isOpen onClose={onClose} title={album ? t('Edit album', 'አልበሙን አስተካክል') : t('New album', 'አዲስ አልበም')} maxWidth="lg">
      <form onSubmit={save} className="space-y-4">
        {formError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>{t('Name (Amharic)', 'ስም (አማርኛ)')} *</label>
            <input value={form.title_am} onChange={set('title_am')} required maxLength={200} placeholder="ጥምቀት 2018" className="form-input text-sm" />
          </div>
          <div>
            <label className={label}>{t('Name (English, optional)', 'ስም (እንግሊዝኛ፣ ካለ)')}</label>
            <input value={form.title_en} onChange={set('title_en')} maxLength={200} placeholder="Timket 2018" className="form-input text-sm" />
          </div>
        </div>
        <div>
          <span className={label}>{t('When were they taken? (optional)', 'መቼ ተነሡ? (ካለ)')}</span>
          <EthiopianDateInput value={form.event_date} onChange={(d) => setForm((f) => ({ ...f, event_date: d }))} optional />
        </div>
        <div>
          <label className={label}>{t('Description (Amharic, optional)', 'መግለጫ (አማርኛ፣ ካለ)')}</label>
          <textarea value={form.description_am} onChange={set('description_am')} rows={3} maxLength={2000} className="form-input text-sm" />
        </div>
        <div>
          <label className={label}>{t('Description (English, optional)', 'መግለጫ (እንግሊዝኛ፣ ካለ)')}</label>
          <textarea value={form.description_en} onChange={set('description_en')} rows={2} maxLength={2000} className="form-input text-sm" />
        </div>
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
          {album ? (
            <button type="button" onClick={remove} disabled={busy} className="text-xs font-semibold text-red-600 hover:text-red-800 inline-flex items-center gap-1"><Trash2 size={13} /> {t('Delete album', 'አልበሙን ሰርዝ')}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
