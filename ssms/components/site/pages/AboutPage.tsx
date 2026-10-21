// The public About page: the same topics the office writes for "ℹ️ About us"
// in the Telegram bot (Administration → Telegram bot), so they are kept once.

import { publicSite } from '@/lib/site/public-data';
import type { TenantInfo } from '@/lib/tenant/context';
import { PageTitle, SiteShell, pick, type SiteLang } from '@/components/site/SiteShell';

export async function AboutPage({ tenant, lang }: { tenant: TenantInfo; lang: SiteLang }) {
  const site = await publicSite(tenant);
  const t = (am: string, en: string) => pick(lang, am, en);

  return (
    <SiteShell lang={lang} path="/about" site={site}>
      <PageTitle title={t('ስለ እኛ', 'About us')} subtitle={lang === 'am' ? site.parish.parish_name_am : site.parish.parish_name_en} />
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 lg:grid-cols-[220px_1fr]">
        {site.topics.length === 0 ? (
          <p className="text-sm text-slate-500 lg:col-span-2">{t('መረጃው በቅርቡ ይገባል።', 'This information is coming soon.')}</p>
        ) : (
          <>
            <nav className="hidden lg:block">
              <ul className="sticky top-24 space-y-1 text-sm">
                {site.topics.map((topic) => (
                  <li key={topic.id}>
                    <a href={`#${topic.id}`} className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                      {(lang === 'am' ? topic.title_am : topic.title_en) || topic.title_am || topic.title_en}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="space-y-10 max-w-3xl">
              {site.topics.map((topic) => {
                const title = (lang === 'am' ? topic.title_am : topic.title_en) || topic.title_am || topic.title_en;
                const body = (lang === 'am' ? topic.body_am : topic.body_en) || topic.body_am || topic.body_en;
                return (
                  <section key={topic.id} id={topic.id} className="scroll-mt-28">
                    <h2 className="text-xl font-bold text-slate-900 border-l-4 border-amber-400 pl-3">{title}</h2>
                    <p className="mt-3 text-slate-700 leading-relaxed whitespace-pre-line">{body}</p>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
