'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ExternalLink, ImagePlus, Pencil, Pin, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { Modal } from '@/components/ui/Modal';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { mediaUrl, type SitePost } from '@/lib/site/media';
import { shrinkPhoto } from '@/lib/site/shrink';
import { deletePost, loadPosts, removePostCover, savePost, setPostStatus, uploadPostCover, type PostInput } from '../actions';

const EMPTY: PostInput = { title_am: '', title_en: '', body_am: '', body_en: '', pinned: false };

/** Public website → News: write, publish (optionally to the Telegram bot too), take down. */
export default function WebsiteNewsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<SitePost[]>([]);
  const [telegram, setTelegram] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<SitePost | 'new' | null>(null);
  const [publishing, setPublishing] = useState<SitePost | null>(null);

  const reload = useCallback(() => {
    loadPosts().then((res) => {
      if (res.mode === 'live') {
        setPosts(res.data.posts);
        setTelegram(res.data.telegram);
      }
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const unpublish = async (p: SitePost) => {
    const res = await setPostStatus(p.id, false, false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Taken off the website (kept as a draft)', 'ከድረ-ገጹ ተነሥቷል (እንደ ረቂቅ ተቀምጧል)'));
    reload();
  };
  const remove = async (p: SitePost) => {
    if (!window.confirm(t(`Delete “${p.title_am}” for good?`, `«${p.title_am}» ለዘለቄታው ይሰረዝ?`))) return;
    const res = await deletePost(p.id);
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Deleted', 'ተሰርዟል'));
    reload();
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('News & announcements', 'ዜናና ማስታወቂያ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Published posts appear on the public website under News.', 'የታተሙ ጽሑፎች በሕዝብ ድረ-ገጹ «ዜና» ስር ይታያሉ።')}
          </p>
        </div>
        <button onClick={() => setEditing('new')} disabled={mode !== 'live'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
          <Plus size={14} /> {t('New post', 'አዲስ ጽሑፍ')}
        </button>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && posts.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">{t('No posts yet.', 'እስካሁን ጽሑፍ የለም።')}</div>}

      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="card p-4 flex gap-4">
            <div className="w-24 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0 relative">
              {p.cover_path && <Image src={mediaUrl(p.cover_path)} alt="" fill unoptimized className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {p.status === 'PUBLISHED' ? <span className="badge badge-success">{t('Published', 'ታትሟል')}</span> : <span className="badge badge-warning">{t('Draft', 'ረቂቅ')}</span>}
                {p.pinned && <span className="badge badge-primary inline-flex items-center gap-1"><Pin size={10} /> {t('Pinned', 'ከላይ የተያዘ')}</span>}
                {p.telegram_sent_at && <span className="badge badge-info">{t('Sent on Telegram', 'በቴሌግራም ተልኳል')}</span>}
                <span className="text-slate-400">{formatEthiopianDate((p.published_at ?? p.created_at).slice(0, 10), locale)}</span>
              </div>
              <h2 className="font-bold text-slate-900 truncate">{p.title_am}</h2>
              <p className="text-xs text-slate-500 line-clamp-2">{p.body_am}</p>
              <div className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
                <button onClick={() => setEditing(p)} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"><Pencil size={12} /> {t('Edit', 'አስተካክል')}</button>
                {p.status === 'DRAFT' ? (
                  <button onClick={() => setPublishing(p)} className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"><Send size={12} /> {t('Publish', 'አትም')}</button>
                ) : (
                  <>
                    <a href={`/news/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"><ExternalLink size={12} /> {t('View', 'ይመልከቱ')}</a>
                    <button onClick={() => unpublish(p)} className="text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"><Undo2 size={12} /> {t('Take down', 'አንሣ')}</button>
                  </>
                )}
                <button onClick={() => remove(p)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"><Trash2 size={12} /> {t('Delete', 'ሰርዝ')}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PostEditor
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            notify('success', text);
            reload();
          }}
          onError={(text) => notify('error', text)}
        />
      )}
      {publishing && (
        <PublishDialog
          post={publishing}
          telegram={telegram}
          onClose={() => setPublishing(null)}
          onDone={(kind, text) => {
            setPublishing(null);
            notify(kind, text);
            reload();
          }}
        />
      )}
    </div>
  );
}

function PostEditor({ post, onClose, onSaved, onError }: { post: SitePost | null; onClose: () => void; onSaved: (text: string) => void; onError: (text: string) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState<PostInput>(post ? { title_am: post.title_am, title_en: post.title_en, body_am: post.body_am, body_en: post.body_en, pinned: post.pinned } : EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [dropCover, setDropCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // The chosen picture, shown before it is uploaded
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const choose = (file: File | null) => {
    setCover(file);
    setPreview(file ? URL.createObjectURL(file) : '');
    setDropCover(false);
  };

  const set = (key: 'title_am' | 'title_en' | 'body_am' | 'body_en') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const res = await savePost(post?.id ?? null, form);
    if (!res.ok) {
      setBusy(false);
      return setFormError(res.error);
    }
    if (cover) {
      try {
        const shrunk = await shrinkPhoto(cover);
        const fd = new FormData();
        fd.set('post_id', res.id);
        fd.set('file', new File([shrunk.full], 'cover.jpg', { type: 'image/jpeg' }));
        const up = await uploadPostCover(fd);
        if (!up.ok) onError(up.error);
      } catch {
        onError(t('The text was saved, but this picture could not be read — try a JPG or PNG', 'ጽሑፉ ተቀምጧል፤ ሥዕሉ ግን ሊነበብ አልቻለም — JPG ወይም PNG ይሞክሩ'));
      }
    } else if (dropCover && post?.cover_path) {
      const rm = await removePostCover(post.id);
      if (!rm.ok) onError(rm.error);
    }
    setBusy(false);
    onSaved(post ? t('Saved', 'ተቀምጧል') : t('Saved as a draft — press “Publish” when it is ready', 'እንደ ረቂቅ ተቀምጧል — ሲዘጋጅ «አትም» ይጫኑ'));
  };

  const current = preview || (!dropCover && post?.cover_path ? mediaUrl(post.cover_path) : '');
  const label = 'text-xs font-semibold text-slate-700 block mb-1';
  return (
    <Modal isOpen onClose={onClose} title={post ? t('Edit post', 'ጽሑፉን አስተካክል') : t('New post', 'አዲስ ጽሑፍ')} maxWidth="2xl">
      <form onSubmit={save} className="space-y-4">
        {formError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>{t('Title (Amharic)', 'ርዕስ (አማርኛ)')} *</label>
            <input value={form.title_am} onChange={set('title_am')} required maxLength={200} className="form-input text-sm" />
          </div>
          <div>
            <label className={label}>{t('Title (English, optional)', 'ርዕስ (እንግሊዝኛ፣ ካለ)')}</label>
            <input value={form.title_en} onChange={set('title_en')} maxLength={200} className="form-input text-sm" />
          </div>
        </div>
        <div>
          <label className={label}>{t('Text (Amharic)', 'ጽሑፍ (አማርኛ)')} *</label>
          <textarea value={form.body_am} onChange={set('body_am')} required rows={7} maxLength={20000} className="form-input text-sm" />
        </div>
        <div>
          <label className={label}>{t('Text (English, optional)', 'ጽሑፍ (እንግሊዝኛ፣ ካለ)')}</label>
          <textarea value={form.body_en} onChange={set('body_en')} rows={4} maxLength={20000} className="form-input text-sm" />
        </div>
        <div>
          <span className={label}>{t('Picture (optional)', 'ሥዕል (ካለ)')}</span>
          <div className="flex items-center gap-3">
            <div className="w-32 h-20 rounded-lg bg-slate-100 overflow-hidden relative shrink-0">
              {current && <Image src={current} alt="" fill unoptimized className="object-cover" />}
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <label className="btn btn-secondary text-xs inline-flex items-center gap-1.5 cursor-pointer">
                <ImagePlus size={14} /> {current ? t('Change picture', 'ሥዕሉን ቀይር') : t('Choose picture', 'ሥዕል ምረጥ')}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
              </label>
              {current && (
                <button type="button" onClick={() => { choose(null); setDropCover(true); }} className="text-red-600 hover:text-red-800 text-left">
                  {t('Remove picture', 'ሥዕሉን አስወግድ')}
                </button>
              )}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} className="h-4 w-4" />
          {t('Keep at the top of the news (e.g. an important announcement)', 'ከዜናዎቹ በላይ ይቆይ (ለምሳሌ አስፈላጊ ማስታወቂያ)')}
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function PublishDialog({ post, telegram, onClose, onDone }: { post: SitePost; telegram: boolean; onClose: () => void; onDone: (kind: 'success' | 'error', text: string) => void }) {
  const { t } = useLang();
  const canSend = telegram && !post.telegram_sent_at;
  const [send, setSend] = useState(canSend);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    const res = await setPostStatus(post.id, true, send && canSend);
    setBusy(false);
    if (!res.ok) return onDone('error', res.error);
    onDone('success', res.sent ? t('Published — and being sent on Telegram', 'ታትሟል — በቴሌግራምም እየተላከ ነው') : t('Published on the website', 'በድረ-ገጹ ላይ ታትሟል'));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Publish', 'አትም')} subtitle={post.title_am} maxWidth="md">
      <div className="space-y-4 text-sm">
        <p className="text-slate-700">{t('Anyone will be able to read this post on the public website.', 'ይህን ጽሑፍ ማንም ሰው በሕዝብ ድረ-ገጹ ላይ ማንበብ ይችላል።')}</p>
        {canSend ? (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <b>{t('Also send it on Telegram', 'በቴሌግራምም ላክ')}</b>
              <span className="block text-xs text-slate-500">{t('To everyone connected to the bot, with a link to the post. Only once.', 'ቦቱን ላገናኙ ሁሉ፣ ከጽሑፉ ማገናኛ ጋር። አንድ ጊዜ ብቻ።')}</span>
            </span>
          </label>
        ) : post.telegram_sent_at ? (
          <p className="text-xs text-slate-500">{t('Already sent on Telegram before — it is not sent again.', 'ቀደም ሲል በቴሌግራም ተልኳል — ዳግም አይላክም።')}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={go} disabled={busy} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
            <Send size={14} /> {busy ? t('Publishing…', 'በማተም ላይ…') : t('Publish', 'አትም')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
