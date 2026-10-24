// The public Hymns page: the hymns the choir put on the website (Sacred Arts
// → Hymn Library → "Show on the public website"), searchable by words of the
// title or the lyrics and by kind (?q=…&type=…); and one hymn with its lyrics
// (HymnPage).

import Link from 'next/link';
import { ArrowLeft, Music, Search } from 'lucide-react';
import { notFound } from 'next/navigation';
import { publicHymns, publicSite } from '@/lib/site/public-data';
import type { TenantInfo } from '@/lib/tenant/context';
import { HYMN_CATEGORIES } from '@/lib/choir/types';
import { PageTitle, SiteShell, hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';

const typeLabel = (category: string, lang: SiteLang) => {
  const l = HYMN_CATEGORIES[category as keyof typeof HYMN_CATEGORIES];
  return l ? (lang === 'am' ? l[1] : l[0]) : category;
};

/** Search words: both scripts as typed, no case */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function HymnsPage({ tenant, lang, q = '', type = '' }: { tenant: TenantInfo; lang: SiteLang; q?: string; type?: string }) {
  const [site, hymns] = await Promise.all([publicSite(tenant), publicHymns(tenant)]);
  const t = (am: string, en: string) => pick(lang, am, en);
  const words = norm(q).slice(0, 60);
  const kinds = [...new Set(hymns.map((h) => h.category))];
  const shown = hymns.filter(
    (h) => (!type || h.category === type) && (!words || norm(`${h.title_am} ${h.title_en} ${h.feast} ${h.lyrics}`).includes(words))
  );
  const base = hrefFor('/hymns', lang, site.base);
  const withParams = (params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...(lang === 'en' ? { lang: 'en' } : {}), ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) }).toString();
    return `${base.split('?')[0]}${qs ? `?${qs}` : ''}`;
  };

  return (
    <SiteShell lang={lang} path="/hymns" site={site}>
      <PageTitle title={t('መዝሙራት', 'Hymns')} subtitle={t('የመዘምራን ክፍላችን መዝሙራት ከግጥማቸው ጋር።', 'Hymns of our choir, with their lyrics.')} />
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
        {hymns.length === 0 ? (
          <p className="text-sm text-slate-500">{t('ለጊዜው በድረ-ገጹ ላይ የተቀመጠ መዝሙር የለም።', 'No hymns have been put on the website yet.')}</p>
        ) : (
          <>
            <form action={base.split('?')[0]} className="flex flex-col sm:flex-row gap-2">
              {lang === 'en' && <input type="hidden" name="lang" value="en" />}
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="q" defaultValue={q} placeholder={t('ከርዕሱ ወይም ከግጥሙ ቃል ይፈልጉ…', 'Search words of the title or lyrics…')} className="form-input pl-9" />
              </div>
              <select name="type" defaultValue={type} className="form-input sm:w-48">
                <option value="">{t('ሁሉም ዓይነት', 'All kinds')}</option>
                {kinds.map((k) => <option key={k} value={k}>{typeLabel(k, lang)}</option>)}
              </select>
              <button type="submit" className="btn btn-primary">{t('ፈልግ', 'Search')}</button>
            </form>

            <p className="text-xs text-slate-500">{t(`${shown.length} መዝሙራት`, `${shown.length} hymn(s)`)}{words || type ? <> · <Link href={withParams({})} className="text-[var(--site-main)] hover:underline">{t('ሁሉንም አሳይ', 'Show all')}</Link></> : null}</p>

            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((h) => (
                <li key={h.id}>
                  <Link href={`${base.split('?')[0]}/${h.id}${lang === 'en' ? '?lang=en' : ''}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[var(--site-main)]">
                    <div className="flex items-start gap-3">
                      <Music size={18} className="mt-0.5 text-[var(--site-main)] shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 leading-snug">{h.title_am}</div>
                        {h.title_en && h.title_en !== h.title_am && <div className="text-xs text-slate-500">{h.title_en}</div>}
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          {typeLabel(h.category, lang)}{h.feast ? ` · ${h.feast}` : ''}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2 whitespace-pre-line">{h.lyrics}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {site.bot && (
          <p className="pt-2 text-sm text-slate-600">
            {t('መዝሙራቱን በቴሌግራም ቦታችንም ያገኛሉ (🎶 መዝሙራት)፦ ', 'The hymns are also in our Telegram bot (🎶 Hymns): ')}
            <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--site-main)] hover:underline">@{site.bot}</a>
          </p>
        )}
      </div>
    </SiteShell>
  );
}

export async function HymnPage({ tenant, lang, id }: { tenant: TenantInfo; lang: SiteLang; id: string }) {
  const [site, hymns] = await Promise.all([publicSite(tenant), publicHymns(tenant)]);
  const hymn = hymns.find((h) => h.id === id);
  if (!hymn) notFound();
  const t = (am: string, en: string) => pick(lang, am, en);
  return (
    <SiteShell lang={lang} path="/hymns" site={site}>
      <PageTitle title={hymn.title_am} subtitle={[hymn.title_en !== hymn.title_am ? hymn.title_en : '', typeLabel(hymn.category, lang), hymn.feast].filter(Boolean).join(' · ')} />
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <Link href={hrefFor('/hymns', lang, site.base)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--site-main)] hover:underline">
          <ArrowLeft size={15} /> {t('ወደ መዝሙራት', 'Back to the hymns')}
        </Link>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="whitespace-pre-line text-lg leading-9 text-slate-800">{hymn.lyrics}</div>
        </article>
      </div>
    </SiteShell>
  );
}
