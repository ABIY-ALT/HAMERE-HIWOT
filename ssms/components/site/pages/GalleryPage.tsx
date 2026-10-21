// The public Gallery page: published albums (Public website → Gallery).

import Image from 'next/image';
import Link from 'next/link';
import { publicAlbums, publicSite } from '@/lib/site/public-data';
import { mediaUrl } from '@/lib/site/media';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { TenantInfo } from '@/lib/tenant/context';
import { PageTitle, SiteShell, hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';

export async function GalleryPage({ tenant, lang }: { tenant: TenantInfo; lang: SiteLang }) {
  const [site, albums] = await Promise.all([publicSite(tenant), publicAlbums(tenant)]);
  const t = (am: string, en: string) => pick(lang, am, en);

  return (
    <SiteShell lang={lang} path="/gallery" site={site}>
      <PageTitle title={t('የፎቶ ማዕከል', 'Photo gallery')} subtitle={t('ከበዓላት፣ ከመርሐ ግብሮችና ከአገልግሎቶቻችን።', 'From our holy days, programs and services.')} />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {albums.length === 0 ? (
          <p className="text-sm text-slate-500">{t('ፎቶዎች በቅርቡ ይገባሉ።', 'Photos are coming soon.')}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => (
              <Link key={a.id} href={hrefFor(`/gallery/${a.id}`, lang, site.base)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition">
                <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                  {a.cover_thumb && (
                    <Image src={mediaUrl(a.cover_thumb)} alt="" fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />
                  )}
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                    {a.photo_count} {t('ፎቶዎች', 'photos')}
                  </span>
                </div>
                <div className="p-4">
                  <h2 className="font-bold text-slate-900 group-hover:text-[#2f43c8]">{(lang === 'en' && a.title_en) || a.title_am}</h2>
                  {a.event_date && <div className="text-xs text-slate-500 mt-0.5">{formatEthiopianDate(a.event_date, lang)}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
