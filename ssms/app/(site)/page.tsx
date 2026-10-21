// ─────────────────────────────────────────────────────────────────────────────
// The public home page — no sign-in. Who we are, the next public programs,
// the latest news, the About topics, recent photo albums, and how to reach us
// (Telegram bot, contact form).
// Staff and members sign in from the header/footer link (/login → /dashboard).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MessageSquare, Send } from 'lucide-react';
import { publicAlbums, publicNews, publicSite } from '@/lib/site/public-data';
import { mediaUrl } from '@/lib/site/media';
import { SiteShell, hrefFor, langOf, pick } from '@/components/site/SiteShell';
import { EventCard } from '@/components/site/EventCard';
import { NewsCard } from '@/components/site/NewsCard';

export const metadata: Metadata = {
  description: 'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን ሐመረ ሕይወት ሰንበት ትምህርት ቤት — Sallo Debre Tsehay Saint George Church, Hamere Hiwot Sunday School: who we are, coming programs, and how to reach us.',
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = langOf((await searchParams).lang);
  const [site, news, albums] = await Promise.all([publicSite(), publicNews(), publicAlbums()]);
  const t = (am: string, en: string) => pick(lang, am, en);
  const next = site.events.slice(0, 3);

  return (
    <SiteShell lang={lang} path="/" site={site}>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden bg-[#161a4b] text-white">
        <Image src="/images/hamere.jpg" alt={t('ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን', 'Sallo Debre Tsehay Saint George Church')} fill priority sizes="100vw" className="-z-10 object-cover opacity-35" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#161a4b] via-[#161a4b]/70 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="text-amber-300 text-xs sm:text-sm font-semibold tracking-wide">{t('ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን', 'Sallo Debre Tsehay Saint George Church')}</p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">{t('ሐመረ ሕይወት ሰንበት ትምህርት ቤት', 'Hamere Hiwot Sunday School')}</h1>
          {site.parish.motto && <p className="mt-4 text-indigo-100 text-sm sm:text-base">{site.parish.motto}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={hrefFor('/events', lang)} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#161a4b] hover:bg-amber-300">
              <CalendarDays size={18} /> {t('መርሐ ግብሮች', 'Coming events')}
            </Link>
            <Link href={hrefFor('/about', lang)} className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold hover:bg-white/10">
              {t('ስለ እኛ', 'About us')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Latest news ── */}
      {news.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('ዜናና ማስታወቂያ', 'News & announcements')}</h2>
            {news.length > 3 && (
              <Link href={hrefFor('/news', lang)} className="text-sm font-semibold text-[#2f43c8] hover:underline shrink-0">
                {t('ሁሉንም ይመልከቱ', 'See all')} →
              </Link>
            )}
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {news.slice(0, 3).map((p) => (
              <NewsCard key={p.id} post={p} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {/* ── Coming events ── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('የሚመጡ መርሐ ግብሮች', 'Coming events')}</h2>
          {site.events.length > next.length && (
            <Link href={hrefFor('/events', lang)} className="text-sm font-semibold text-[#2f43c8] hover:underline shrink-0">
              {t('ሁሉንም ይመልከቱ', 'See all')} →
            </Link>
          )}
        </div>
        {next.length === 0 ? (
          <p className="text-sm text-slate-500">{t('ለጊዜው የተያዘ የሕዝብ መርሐ ግብር የለም።', 'No public programs are planned right now.')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {next.map((ev) => (
              <EventCard key={ev.id} event={ev} lang={lang} />
            ))}
          </div>
        )}
      </section>

      {/* ── About topics ── */}
      {site.topics.length > 0 && (
        <section className="bg-slate-50 border-y border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6">{t('ስለ እኛ', 'About us')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {site.topics.map((topic) => {
                const title = (lang === 'am' ? topic.title_am : topic.title_en) || topic.title_am || topic.title_en;
                const body = (lang === 'am' ? topic.body_am : topic.body_en) || topic.body_am || topic.body_en;
                return (
                  <Link key={topic.id} href={`${hrefFor('/about', lang)}#${topic.id}`} className="group rounded-2xl bg-white border border-slate-200 p-5 hover:border-[#2f43c8] hover:shadow-md transition">
                    <h3 className="font-bold text-slate-900 group-hover:text-[#2f43c8]">{title}</h3>
                    <p className="mt-2 text-sm text-slate-600 line-clamp-3 whitespace-pre-line">{body}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Recent albums ── */}
      {albums.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('የፎቶ ማዕከል', 'Photo gallery')}</h2>
            <Link href={hrefFor('/gallery', lang)} className="text-sm font-semibold text-[#2f43c8] hover:underline shrink-0">
              {t('ሁሉንም ይመልከቱ', 'See all')} →
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {albums.slice(0, 4).map((a) => (
              <Link key={a.id} href={hrefFor(`/gallery/${a.id}`, lang)} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                {a.cover_thumb && <Image src={mediaUrl(a.cover_thumb)} alt="" fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-sm font-semibold text-white">
                  {(lang === 'en' && a.title_en) || a.title_am}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Reach us ── */}
      <section className="mx-auto max-w-6xl px-4 py-14 grid gap-4 md:grid-cols-2">
        {site.bot && (
          <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-[#1e2770] text-white p-6 hover:bg-[#2937a2] transition">
            <Send className="text-amber-300" size={26} />
            <h3 className="mt-3 text-lg font-bold">{t('የቴሌግራም ቦታችን', 'Our Telegram bot')}</h3>
            <p className="mt-1 text-sm text-indigo-100">
              {t(
                'ስለ እኛ ያንብቡ፤ አባል ወይም ወላጅ ከሆኑ ስልክዎን አጋርተው መዋጮ፣ ውጤትና መርሐ ግብሮችን ይመልከቱ።',
                'Read about us; members and parents can share their phone number to see dues, results and programs.'
              )}
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-amber-300">@{site.bot} →</span>
          </a>
        )}
        <Link href={hrefFor('/contact', lang)} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-[#2f43c8] hover:shadow-md transition">
          <MessageSquare className="text-[#2f43c8]" size={26} />
          <h3 className="mt-3 text-lg font-bold text-slate-900">{t('ጥያቄ አለዎት?', 'Have a question?')}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('ለሚመለከተው ክፍል ይጻፉ፤ ስልክ ደውለን እንመልሳለን።', 'Write to the right department — we will call you back.')}
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[#2f43c8]">{t('ያግኙን', 'Contact us')} →</span>
        </Link>
      </section>
    </SiteShell>
  );
}
