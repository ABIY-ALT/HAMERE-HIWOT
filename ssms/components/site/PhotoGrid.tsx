'use client';

// An album's thumbnails; tapping one opens it full screen. Next / previous by
// the arrows, the arrow keys or a swipe; Esc or ✕ closes. Only the photo on
// screen loads its large copy, so phones on mobile data are spared.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { SiteLang } from './SiteShell';

export interface GridPhoto {
  id: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  caption: string;
}

export function PhotoGrid({ photos, lang }: { photos: GridPhoto[]; lang: SiteLang }) {
  const [open, setOpen] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((step: number) => setOpen((i) => (i === null ? i : (i + step + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, go]);

  if (photos.length === 0) return <p className="text-sm text-slate-500">{lang === 'am' ? 'በዚህ አልበም ፎቶ የለም።' : 'This album has no photos.'}</p>;
  const current = open === null ? null : photos[open];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {photos.map((p, i) => (
          <button key={p.id} onClick={() => setOpen(i)} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 focus-visible:ring-2 focus-visible:ring-[var(--site-main)]">
            <Image src={p.thumb} alt={p.caption} fill unoptimized loading="lazy" className="object-cover transition-transform duration-300 group-hover:scale-105" />
          </button>
        ))}
      </div>

      {current && open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || (lang === 'am' ? 'ፎቶ' : 'Photo')}
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setOpen(null)}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
            <span>{open + 1} / {photos.length}</span>
            <button onClick={() => setOpen(null)} className="rounded-full p-2 hover:bg-white/10" aria-label={lang === 'am' ? 'ዝጋ' : 'Close'}>
              <X size={22} />
            </button>
          </div>
          <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
            <Image key={current.id} src={current.full} alt={current.caption} fill unoptimized priority sizes="100vw" className="object-contain" />
            {photos.length > 1 && (
              <>
                <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70" aria-label={lang === 'am' ? 'ያለፈው' : 'Previous'}>
                  <ChevronLeft size={28} />
                </button>
                <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70" aria-label={lang === 'am' ? 'ቀጣዩ' : 'Next'}>
                  <ChevronRight size={28} />
                </button>
              </>
            )}
          </div>
          <div className="min-h-[3rem] px-4 py-3 text-center text-sm text-white/90" onClick={(e) => e.stopPropagation()}>
            {current.caption}
          </div>
        </div>
      )}
    </>
  );
}
