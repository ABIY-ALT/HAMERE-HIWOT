'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Palette, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { DEFAULT_BRAND_COLOR, LOGO_MAX_SIDE, isHexColor, shade, tooLight } from '@/lib/branding';
import { shrinkPhoto } from '@/lib/site/shrink';
import { loadBrandingPage, removeBrandPicture, saveBrandColor, uploadHero, uploadLogo, type BrandingPage } from './actions';

/** Dark colours that read well under white writing */
const SWATCHES = ['#1e2770', '#0c2248', '#14532d', '#065f46', '#7f1d1d', '#9a3412', '#581c87', '#831843', '#1f2937', '#0f766e'];

/** A logo made small in the browser: at most LOGO_MAX_SIDE pixels, PNG (keeps a transparent background). */
async function shrinkLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the picture'))), 'image/png'));
}

/** The Sunday school's logo, main colour and website front-page photo. */
export default function BrandingAdminPage() {
  const { t } = useLang();
  const router = useRouter();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState<BrandingPage | null>(null);
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => {
    loadBrandingPage().then((res) => {
      if (res.mode === 'live') {
        setPage(res.data);
        setColor(res.data.brand.color);
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

  const run = async (key: string, work: () => Promise<{ ok: boolean; error?: string }>) => {
    if (mode !== 'live') return notify('success', t('Demo mode — not saved', 'የሙከራ ሁኔታ — አልተቀመጠም'));
    setBusy(key);
    const res = await work().catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : 'Failed' }));
    setBusy('');
    if (!res.ok) return notify('error', res.error ?? 'Failed');
    notify('success', t('Saved', 'ተቀምጧል'));
    reload();
    router.refresh(); // the sidebar and printed pages pick it up
  };

  const pickLogo = (file: File | undefined) =>
    file &&
    run('logo', async () => {
      const form = new FormData();
      form.set('logo', new File([await shrinkLogo(file)], 'logo.png', { type: 'image/png' }));
      return uploadLogo(form);
    });

  const pickHero = (file: File | undefined) =>
    file &&
    run('hero', async () => {
      const form = new FormData();
      form.set('hero', new File([(await shrinkPhoto(file)).full], 'hero.jpg', { type: 'image/jpeg' }));
      return uploadHero(form);
    });

  const light = isHexColor(color) && tooLight(color);

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Branding', 'መለያ ገጽታ')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Your logo and colour appear in the menu, on receipts, report cards and results, and on your public website. Names and motto are under System Settings.',
            'አርማዎና ቀለምዎ በምናሌው፣ በደረሰኞች፣ በውጤት ካርዶችና በሕዝብ ድረ-ገጽዎ ይታያሉ። ስሞችና መሪ ቃል በስርዓት ቅንብሮች ውስጥ ናቸው።'
          )}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {page && (
        <>
          {/* ── Logo ── */}
          <div className="card p-5 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-28 h-28 rounded-2xl border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px] flex items-center justify-center shrink-0 overflow-hidden">
              {page.brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.brand.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <ImageIcon className="text-slate-300" size={32} />
              )}
            </div>
            <div className="space-y-2 flex-1">
              <h2 className="font-bold text-slate-800">{t('Logo', 'አርማ')}</h2>
              <p className="text-sm text-slate-600">
                {t('A square picture works best (PNG with a transparent background is ideal). It is made small automatically.', 'ካሬ ምስል ጥሩ ነው (ጀርባው ግልጽ የሆነ PNG ይመረጣል)። መጠኑ በራሱ ይስተካከላል።')}
              </p>
              <div className="flex flex-wrap gap-2">
                <label className={`btn btn-primary btn-sm inline-flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload size={14} /> {busy === 'logo' ? t('Uploading…', 'በመጫን ላይ…') : t('Upload a logo', 'አርማ ይጫኑ')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
                </label>
                {page.branding.logo_path && (
                  <button disabled={busy !== ''} onClick={() => run('logo-x', () => removeBrandPicture('logo'))} className="btn btn-ghost btn-sm inline-flex items-center gap-1 text-red-600">
                    <Trash2 size={14} /> {t('Remove', 'አስወግድ')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Colour ── */}
          <div className="card p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Palette size={16} /> {t('Main colour', 'ዋና ቀለም')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-full border-2 ${color === c ? 'border-slate-900 scale-110' : 'border-white shadow'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <label className="flex items-center gap-2 text-sm text-slate-600 ml-2">
                {t('Other:', 'ሌላ፦')}
                <input type="color" value={isHexColor(color) ? color : DEFAULT_BRAND_COLOR} onChange={(e) => setColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer" />
              </label>
            </div>
            {/* Preview: a piece of the menu and of the website header */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl overflow-hidden text-white text-sm" style={{ background: color }}>
                <div className="px-4 py-3 font-semibold">{t('Menu', 'ምናሌ')}</div>
                <div className="px-4 py-2" style={{ background: shade(color, 0.25) }}>{t('Dashboard (selected)', 'ዳሽቦርድ (የተመረጠ)')}</div>
                <div className="px-4 py-2">{t('People', 'ሰዎች')}</div>
              </div>
              <div className="rounded-xl overflow-hidden text-white text-sm">
                <div className="px-4 py-3 font-semibold" style={{ background: color }}>{t('Website header', 'የድረ-ገጽ ራስጌ')}</div>
                <div className="px-4 py-6" style={{ background: shade(color, -0.3) }}>{t('Front page', 'የፊት ገጽ')}</div>
              </div>
            </div>
            {light && <p className="text-sm text-amber-700">{t('This colour is too light for white writing — choose a darker one.', 'ይህ ቀለም ለነጭ ጽሑፍ በጣም ፈዛዛ ነው — ጠቆር ያለ ይምረጡ።')}</p>}
            <div className="flex gap-2">
              <button disabled={busy !== '' || light || color === page.brand.color} onClick={() => run('color', () => saveBrandColor(color))} className="btn btn-primary btn-sm disabled:opacity-50">
                {t('Save colour', 'ቀለሙን አስቀምጥ')}
              </button>
              {page.branding.color && (
                <button disabled={busy !== ''} onClick={() => run('color-x', () => saveBrandColor(null))} className="btn btn-ghost btn-sm">
                  {t('Back to the default', 'ወደ መደበኛው መልስ')}
                </button>
              )}
            </div>
          </div>

          {/* ── Website front-page photo ── */}
          <div className="card p-5 space-y-3">
            <h2 className="font-bold text-slate-800">{t('Website front-page photo', 'የድረ-ገጹ የፊት ገጽ ፎቶ')}</h2>
            {!page.website ? (
              <p className="text-sm text-slate-600">
                {t('The public website is not part of your plan. See Billing & plan to add it.', 'የሕዝብ ድረ-ገጹ በዕቅድዎ ውስጥ የለም። ለመጨመር «ክፍያና ዕቅድ» ይመልከቱ።')}
              </p>
            ) : (
              <>
                {page.brand.heroUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.brand.heroUrl} alt="" className="w-full max-h-56 object-cover rounded-xl" />
                )}
                <p className="text-sm text-slate-600">
                  {t('A wide photo of your church or Sunday school. It is shown darkened behind your name.', 'የቤተክርስቲያንዎ ወይም የሰንበት ትምህርት ቤትዎ ሰፊ ፎቶ። ከስምዎ በስተጀርባ ደብዝዞ ይታያል።')}{' '}
                  <a href={page.sitePath} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 hover:underline">{t('Open the website', 'ድረ-ገጹን ክፈት')}</a>
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className={`btn btn-primary btn-sm inline-flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                    <Upload size={14} /> {busy === 'hero' ? t('Uploading…', 'በመጫን ላይ…') : t('Upload a photo', 'ፎቶ ይጫኑ')}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => pickHero(e.target.files?.[0])} />
                  </label>
                  {page.branding.hero_path && (
                    <button disabled={busy !== ''} onClick={() => run('hero-x', () => removeBrandPicture('hero'))} className="btn btn-ghost btn-sm inline-flex items-center gap-1 text-red-600">
                      <Trash2 size={14} /> {t('Remove', 'አስወግድ')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
