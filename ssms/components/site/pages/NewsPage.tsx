// The public News page: published posts (Public website → News), notices first.

import { publicNews, publicSite } from '@/lib/site/public-data';
import type { TenantInfo } from '@/lib/tenant/context';
import { PageTitle, SiteShell, pick, type SiteLang } from '@/components/site/SiteShell';
import { NewsCard } from '@/components/site/NewsCard';

export async function NewsPage({ tenant, lang }: { tenant: TenantInfo; lang: SiteLang }) {
  const [site, posts] = await Promise.all([publicSite(tenant), publicNews(tenant)]);
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
              <NewsCard key={p.id} post={p} lang={lang} base={site.base} />
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
