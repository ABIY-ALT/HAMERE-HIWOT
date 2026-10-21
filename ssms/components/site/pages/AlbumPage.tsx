// One public photo album: thumbnails; tapping one opens it full screen (PhotoGrid).

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { publicAlbum, publicSite } from '@/lib/site/public-data';
import { mediaUrl } from '@/lib/site/media';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { TenantInfo } from '@/lib/tenant/context';
import { SiteShell, hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';
import { PhotoGrid } from '@/components/site/PhotoGrid';

export async function albumMetadata(tenant: TenantInfo, id: string, lang: SiteLang, siteName: string): Promise<Metadata> {
  const found = await publicAlbum(tenant, id);
  if (!found) return {};
  const title = (lang === 'en' && found.album.title_en) || found.album.title_am;
  const images = found.album.cover_thumb ? [mediaUrl(found.album.cover_thumb)] : [];
  return { title: `${title} — ${siteName}`, openGraph: { title, images } };
}

export async function AlbumPage({ tenant, id, lang }: { tenant: TenantInfo; id: string; lang: SiteLang }) {
  const [site, found] = await Promise.all([publicSite(tenant), publicAlbum(tenant, id)]);
  if (!found) notFound();
  const { album, photos } = found;
  const t = (am: string, en: string) => pick(lang, am, en);
  const description = (lang === 'en' && album.description_en) || album.description_am;

  return (
    <SiteShell lang={lang} path="/gallery" site={site}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Link href={hrefFor('/gallery', lang, site.base)} className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <ArrowLeft size={15} /> {t('ሁሉም አልበሞች', 'All albums')}
        </Link>
        <h1 className="mt-5 text-2xl sm:text-3xl font-bold text-slate-900">{(lang === 'en' && album.title_en) || album.title_am}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {album.event_date ? `${formatEthiopianDate(album.event_date, lang)} · ` : ''}
          {photos.length} {t('ፎቶዎች', 'photos')}
        </p>
        {description && <p className="mt-3 max-w-3xl text-slate-700 whitespace-pre-line">{description}</p>}
        <div className="mt-8">
          <PhotoGrid
            lang={lang}
            photos={photos.map((p) => ({
              id: p.id,
              thumb: mediaUrl(p.thumb_path),
              full: mediaUrl(p.path),
              width: p.width,
              height: p.height,
              caption: (lang === 'en' && p.caption_en) || p.caption_am,
            }))}
          />
        </div>
      </div>
    </SiteShell>
  );
}
