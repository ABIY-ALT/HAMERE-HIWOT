// The public News page: published posts (Public website → News), notices first.

import type { Metadata } from 'next';
import { publicNews, publicSite } from '@/lib/site/public-data';
import { PageTitle, SiteShell, langOf, pick } from '@/components/site/SiteShell';
import { NewsCard } from '@/components/site/NewsCard';

export const metadata: Metadata = {
  title: 'ዜና · News — ሐመረ ሕይወት Hamere Hiwot',
  description: 'News and announcements of Hamere Hiwot Sunday School.',
};

export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = langOf((await searchParams).lang);
  const [site, posts] = await Promise.all([publicSite(), publicNews()]);
  const t = (am: string, en: string) => pick(lang, am, en);

  return (
    <SiteShell lang={lang} path="/news" site={site}>
      <PageTitle title={t('ዜናና ማስታወቂያ', 'News & announcements')} />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500">{t('እስካሁን ዜና አልወጣም።', 'No news yet.')}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <NewsCard key={p.id} post={p} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
