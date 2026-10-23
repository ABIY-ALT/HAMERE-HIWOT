// The public Contact page: a question to a department (they call back), the
// Telegram bot, and the "Address & contact" About topic if the office wrote one.

import { Send } from 'lucide-react';
import { publicSite } from '@/lib/site/public-data';
import type { TenantInfo } from '@/lib/tenant/context';
import { PageTitle, SiteShell, pick, type SiteLang } from '@/components/site/SiteShell';
import { ContactForm } from '@/components/site/ContactForm';

/** The About topic about address and phone, by its usual titles */
const CONTACT_TOPIC = /አድራሻ|ስልክ|contact|address/i;

export async function ContactPage({ tenant, lang }: { tenant: TenantInfo; lang: SiteLang }) {
  const site = await publicSite(tenant);
  const t = (am: string, en: string) => pick(lang, am, en);
  const where = site.topics.find((x) => CONTACT_TOPIC.test(`${x.title_am} ${x.title_en}`));

  return (
    <SiteShell lang={lang} path="/contact" site={site}>
      <PageTitle title={t('ያግኙን', 'Contact us')} subtitle={t('ጥያቄዎን ለሚመለከተው ክፍል ይላኩ፤ ስልክ ደውለን እንመልሳለን።', 'Send your question to the right department — we will call you back.')} />
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="relative rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          {site.departments.length === 0 ? (
            <p className="text-sm text-slate-500">{t('የመልእክት መላኪያው በቅርቡ ይከፈታል።', 'Messages will open soon.')}</p>
          ) : (
            <ContactForm lang={lang} departments={site.departments} site={tenant.is_default ? '' : tenant.slug} />
          )}
        </div>
        <aside className="space-y-4">
          {where && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
              <h2 className="font-bold text-slate-900">{(lang === 'am' ? where.title_am : where.title_en) || where.title_am || where.title_en}</h2>
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{(lang === 'am' ? where.body_am : where.body_en) || where.body_am || where.body_en}</p>
            </div>
          )}
          {site.bot && (
            <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-[var(--site-main)] text-white p-5 hover:bg-[var(--site-light)] transition">
              <Send className="text-amber-300" size={22} />
              <h2 className="mt-2 font-bold">{t('በቴሌግራም', 'On Telegram')}</h2>
              <p className="mt-1 text-sm text-white/80">
                {t('አባላትና ወላጆች በቦቱ «✉️ ጥያቄ» በኩል መጠየቅ ይችላሉ፤ መልሱ እዚያው ይደርሳል።', 'Members and parents can also ask through “✉️ Ask a department” in the bot — the answer comes back there.')}
              </p>
              <span className="mt-2 inline-block text-sm font-semibold text-amber-300">@{site.bot} →</span>
            </a>
          )}
        </aside>
      </div>
    </SiteShell>
  );
}
