// ─────────────────────────────────────────────────────────────────────────────
// The public website's frame: header (logo, pages, language), footer (parish,
// Telegram bot, staff sign-in). Server component. The language is the page's
// ?lang=en (Amharic without it), so every link carries it on.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import Link from 'next/link';
import type { PublicSite } from '@/lib/site/public-data';

export type SiteLang = 'am' | 'en';

export const langOf = (value: string | string[] | undefined): SiteLang => (value === 'en' ? 'en' : 'am');

/** A link to a public page in this language; `base` is the Sunday school's address (PublicSite.base) */
export const hrefFor = (path: string, lang: SiteLang, base = '') => {
  const p = base && path === '/' ? base : `${base}${path}`;
  return lang === 'en' ? `${p}?lang=en` : p;
};

/** Amharic or English */
export const pick = (lang: SiteLang, am: string, en: string) => (lang === 'am' ? am : en);

const PAGES: { path: string; am: string; en: string }[] = [
  { path: '/', am: 'መነሻ', en: 'Home' },
  { path: '/about', am: 'ስለ እኛ', en: 'About us' },
  { path: '/news', am: 'ዜና', en: 'News' },
  { path: '/events', am: 'መርሐ ግብሮች', en: 'Events' },
  { path: '/gallery', am: 'ፎቶዎች', en: 'Gallery' },
  { path: '/contact', am: 'ያግኙን', en: 'Contact' },
];

/** Is this page (or one under it, e.g. /news/<id>) the header link? */
const isCurrent = (path: string, page: string) => (page === '/' ? path === '/' : path === page || path.startsWith(`${page}/`));

export function SiteShell({ lang, path, site, children }: { lang: SiteLang; path: string; site: PublicSite; children: React.ReactNode }) {
  const t = (am: string, en: string) => pick(lang, am, en);
  const name = lang === 'am' ? site.parish.parish_name_am : site.parish.parish_name_en;
  return (
    <div lang={lang} className="min-h-screen flex flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-30 bg-[#1e2770] text-white shadow">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Link href={hrefFor('/', lang, site.base)} className="flex items-center gap-2.5 min-w-0">
            <span className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-amber-400 shrink-0 bg-slate-900 flex items-center justify-center">
              {site.brand.logo ? (
                <Image src={site.brand.logo} alt="" width={40} height={40} className="w-full h-full object-cover" priority />
              ) : (
                <span className="font-bold text-amber-300">{t(site.brand.name_am, site.brand.name_en).slice(0, 1)}</span>
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block font-bold text-sm sm:text-base truncate">{t(site.brand.name_am, site.brand.name_en)}</span>
              {(site.brand.church_am || site.brand.church_en) && (
                <span className="hidden sm:block text-[11px] text-indigo-200 truncate">{t(site.brand.church_am, site.brand.church_en)}</span>
              )}
            </span>
          </Link>
          <nav className="ml-auto hidden lg:flex items-center gap-1 text-sm">
            {PAGES.map((p) => (
              <Link
                key={p.path}
                href={hrefFor(p.path, lang, site.base)}
                className={`px-3 py-2 rounded-lg transition-colors ${isCurrent(path, p.path) ? 'bg-white/15 text-amber-300 font-semibold' : 'text-indigo-100 hover:bg-white/10'}`}
              >
                {t(p.am, p.en)}
              </Link>
            ))}
          </nav>
          <Link
            href={hrefFor(path, lang === 'am' ? 'en' : 'am', site.base)}
            className="ml-auto lg:ml-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/25 hover:bg-white/10 shrink-0"
            hrefLang={lang === 'am' ? 'en' : 'am'}
          >
            {lang === 'am' ? 'English' : 'አማርኛ'}
          </Link>
        </div>
        {/* Phones: the pages as a row under the header */}
        <nav className="lg:hidden border-t border-white/10">
          <div className="mx-auto max-w-6xl px-2 flex overflow-x-auto whitespace-nowrap text-[13px] [scrollbar-width:none]">
            {PAGES.map((p) => (
              <Link
                key={p.path}
                href={hrefFor(p.path, lang, site.base)}
                className={`flex-1 shrink-0 text-center px-3 py-2 ${isCurrent(path, p.path) ? 'text-amber-300 font-semibold border-b-2 border-amber-400' : 'text-indigo-100'}`}
              >
                {t(p.am, p.en)}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#161a4b] text-indigo-100">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div className="space-y-1.5">
            <div className="font-bold text-white">{name}</div>
            {site.parish.diocese && <div className="text-indigo-200 text-xs">{site.parish.diocese}</div>}
            {site.parish.foundation_year && <div className="text-indigo-200 text-xs">{t('የተመሠረተው', 'Founded')} {site.parish.foundation_year}</div>}
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-white">{t('ገጾች', 'Pages')}</div>
            <ul className="space-y-1">
              {PAGES.map((p) => (
                <li key={p.path}>
                  <Link href={hrefFor(p.path, lang, site.base)} className="hover:text-amber-300">{t(p.am, p.en)}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-white">{t('ይገናኙን', 'Stay connected')}</div>
            {site.bot && (
              <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-amber-300">
                ✈️ {t('የቴሌግራም ቦታችን', 'Our Telegram bot')} — @{site.bot}
              </a>
            )}
            <div>
              <Link href="/login" className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-white">
                🔐 {t('ለአገልጋዮችና ለአባላት መግቢያ', 'Sign in (servants & members)')}
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 text-center text-[11px] text-indigo-300 py-4 px-4">
          © {new Date().getFullYear()} {t(site.brand.name_am, site.brand.name_en)}
          {site.parish.motto && <> · {site.parish.motto}</>}
        </div>
      </footer>
    </div>
  );
}

/** A page's title band */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="bg-gradient-to-b from-[#1e2770] to-[#2937a2] text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-indigo-100 max-w-2xl text-sm sm:text-base">{subtitle}</p>}
      </div>
    </section>
  );
}
