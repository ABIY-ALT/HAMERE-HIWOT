// One public news post. Shared links show its title and picture (Open Graph).

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { publicNews, publicPost, publicSite } from '@/lib/site/public-data';
import { mediaUrl } from '@/lib/site/media';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { SiteShell, hrefFor, langOf, pick } from '@/components/site/SiteShell';
import { NewsCard, postBody, postTitle } from '@/components/site/NewsCard';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const post = await publicPost(id);
  if (!post) return {};
  const lang = langOf(sp.lang);
  const title = postTitle(post, lang);
  const description = postBody(post, lang).slice(0, 180);
  const images = post.cover_path ? [mediaUrl(post.cover_path)] : ['/images/hamere.jpg'];
  return { title: `${title} — ሐመረ ሕይወት Hamere Hiwot`, description, openGraph: { title, description, images, type: 'article' } };
}

export default async function NewsPostPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const lang = langOf(sp.lang);
  const [site, post, all] = await Promise.all([publicSite(), publicPost(id), publicNews()]);
  if (!post) notFound();
  const t = (am: string, en: string) => pick(lang, am, en);
  const more = all.filter((p) => p.id !== post.id).slice(0, 3);

  return (
    <SiteShell lang={lang} path="/news" site={site}>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <Link href={hrefFor('/news', lang)} className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <ArrowLeft size={15} /> {t('ሁሉም ዜናዎች', 'All news')}
        </Link>
        {post.published_at && <div className="mt-6 text-xs font-semibold text-amber-700">{formatEthiopianDate(post.published_at.slice(0, 10), lang)}</div>}
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">{postTitle(post, lang)}</h1>
        {post.cover_path && (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100">
            <Image src={mediaUrl(post.cover_path)} alt="" fill unoptimized priority className="object-cover" />
          </div>
        )}
        <div className="mt-6 text-slate-800 leading-relaxed whitespace-pre-line">{postBody(post, lang)}</div>
      </article>
      {more.length > 0 && (
        <section className="bg-slate-50 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="text-lg font-bold text-slate-900 mb-5">{t('ሌሎች ዜናዎች', 'More news')}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((p) => (
                <NewsCard key={p.id} post={p} lang={lang} />
              ))}
            </div>
          </div>
        </section>
      )}
    </SiteShell>
  );
}
