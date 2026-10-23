// ─────────────────────────────────────────────────────────────────────────────
// The public home page — no sign-in. Who we are, the Sunday school in
// numbers, the latest news, the next public programs, the About topics,
// recent photo albums, common questions, and how to reach us (Telegram bot,
// contact form).
// Staff and members sign in from the header/footer link (/login → /dashboard).
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ChevronDown, MessageSquare, Send, UserPlus } from 'lucide-react';
import { publicAlbums, publicNews, publicSite, type PublicSite } from '@/lib/site/public-data';
import { mediaUrl } from '@/lib/site/media';
import type { TenantInfo } from '@/lib/tenant/context';
import { isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';
import { SiteShell, hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';
import { EventCard } from '@/components/site/EventCard';
import { NewsCard } from '@/components/site/NewsCard';

/** Fewer members or students than this are not shown (a Sunday school still entering its records) */
const MIN_COUNT = 20;

/** The numbers band: only what is known and worth showing */
function numbers(site: PublicSite, lang: SiteLang): { label: string; value: string }[] {
  const t = (am: string, en: string) => pick(lang, am, en);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const out: { label: string; value: string }[] = [];
  if (site.stats.members >= MIN_COUNT) out.push({ label: t('አባላት', 'Members'), value: fmt(site.stats.members) });
  if (site.stats.students >= MIN_COUNT) out.push({ label: t('ተማሪዎች', 'Students'), value: fmt(site.stats.students) });
  if (site.departments.length > 0) out.push({ label: t('ክፍሎችና ማስተባበሪያዎች', 'Departments'), value: fmt(site.departments.length) });
  // foundation_year is free text such as "፲፱፻፺፪ ዓ.ም (1992 E.C.)": its Ethiopian year
  const founded = Number(site.parish.foundation_year.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]);
  const now = isoToEthiopian(todayIso())?.year;
  if (founded && now && now > founded) out.push({ label: t('የአገልግሎት ዓመታት', 'Years of service'), value: `${now - founded}+` });
  return out;
}

/** Questions visitors ask — answered by what every Sunday school's site and bot already offer */
function faq(site: PublicSite, lang: SiteLang): { q: string; a: string }[] {
  const t = (am: string, en: string) => pick(lang, am, en);
  return [
    {
      q: t('እንዴት አባል መሆን ወይም ልጄን ማስመዝገብ እችላለሁ?', 'How do I become a member or register my child?'),
      a: t('ከ“ያግኙን” ገጽ መልእክት ይላኩልን፤ ጽሕፈት ቤቱ ስልክ ደውሎ ቀጣዩን ደረጃ ያሳውቅዎታል።', 'Send us a message from the Contact page — the office will call you back and tell you the next step.'),
    },
    ...(site.bot
      ? [{
          q: t('ወላጆች ውጤትና መዋጮን የት ያያሉ?', 'Where can parents see results and dues?'),
          a: t(`በቴሌግራም ቦታችን @${site.bot}፦ ስልክ ቁጥርዎን ሲያጋሩ የልጅዎን ውጤት፣ መዋጮና መርሐ ግብሮች ያያሉ።`, `On our Telegram bot @${site.bot}: share your phone number and you will see your child’s results, dues and programs.`),
        }]
      : []),
    {
      q: t('መርሐ ግብሮች መቼና የት ናቸው?', 'When and where are the programs?'),
      a: t('የሕዝብ መርሐ ግብሮች በ“መርሐ ግብሮች” ገጽ ላይ ከቀን፣ ሰዓትና ቦታ ጋር ይገኛሉ።', 'Public programs are on the Events page with their date, time and place.'),
    },
    {
      q: t('አገልጋዮችና አባላት እንዴት ይገባሉ?', 'How do servants and members sign in?'),
      a: t('ከገጹ ግርጌ “መግቢያ”ን ይጫኑና በስልክ ቁጥርዎ ይግቡ። የይለፍ ቃል ከሌለዎት ጽሕፈት ቤቱን ይጠይቁ።', 'Use “Sign in” at the bottom of the page and sign in with your phone number. No password yet? Ask the office.'),
    },
  ];
}

export async function HomePage({ tenant, lang }: { tenant: TenantInfo; lang: SiteLang }) {
  const [site, news, albums] = await Promise.all([publicSite(tenant), publicNews(tenant), publicAlbums(tenant)]);
  const t = (am: string, en: string) => pick(lang, am, en);
  const next = site.events.slice(0, 3);
  const church = t(site.brand.church_am, site.brand.church_en);
  // The first About topic says in a few lines who we are
  const first = site.topics[0];
  const lead = first ? (lang === 'am' ? first.body_am : first.body_en) || first.body_am || first.body_en : '';
  const stats = numbers(site, lang);

  return (
    <SiteShell lang={lang} path="/" site={site}>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden bg-[var(--site-dark)] text-white">
        {site.brand.image && <Image src={site.brand.image} alt={church} fill priority unoptimized sizes="100vw" className="-z-10 object-cover opacity-35" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--site-dark)] via-[color-mix(in_srgb,var(--site-dark)_70%,transparent)] to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          {church && <p className="text-amber-300 text-xs sm:text-sm font-semibold tracking-wide">{church}</p>}
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">{t(site.brand.name_am, site.brand.name_en)}</h1>
          {lead && <p className="mt-5 max-w-2xl text-white/85 text-base sm:text-lg leading-relaxed line-clamp-3 whitespace-pre-line">{lead}</p>}
          {site.parish.motto && <p className="mt-4 text-amber-200/90 text-sm">{site.parish.motto}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={hrefFor('/contact', lang, site.base)} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[var(--site-dark)] hover:bg-amber-300">
              <UserPlus size={18} /> {t('ይቀላቀሉን', 'Join us')}
            </Link>
            <Link href={hrefFor('/events', lang, site.base)} className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold hover:bg-white/10">
              <CalendarDays size={18} /> {t('መርሐ ግብሮች', 'Coming events')}
            </Link>
            <Link href={hrefFor('/about', lang, site.base)} className="inline-flex items-center gap-2 px-3 py-3 text-sm font-semibold text-white/85 hover:text-white">
              {t('ስለ እኛ', 'About us')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── In numbers ── */}
      {stats.length >= 2 && (
        <section className="border-b border-slate-200 bg-white">
          <dl className={`mx-auto max-w-6xl px-4 py-8 grid grid-cols-2 gap-y-6 ${stats.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-3xl sm:text-4xl font-bold text-[var(--site-main)] tabular-nums">{s.value}</dd>
                <dd className="mt-1 text-xs sm:text-sm font-medium text-slate-500">{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── Latest news ── */}
      {news.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('ዜናና ማስታወቂያ', 'News & announcements')}</h2>
            {news.length > 3 && (
              <Link href={hrefFor('/news', lang, site.base)} className="text-sm font-semibold text-[var(--site-main)] hover:underline shrink-0">
                {t('ሁሉንም ይመልከቱ', 'See all')} →
              </Link>
            )}
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {news.slice(0, 3).map((p) => (
              <NewsCard key={p.id} post={p} lang={lang} base={site.base} />
            ))}
          </div>
        </section>
      )}

      {/* ── Coming events ── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('የሚመጡ መርሐ ግብሮች', 'Coming events')}</h2>
          {site.events.length > next.length && (
            <Link href={hrefFor('/events', lang, site.base)} className="text-sm font-semibold text-[var(--site-main)] hover:underline shrink-0">
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
                  <Link key={topic.id} href={`${hrefFor('/about', lang, site.base)}#${topic.id}`} className="group rounded-2xl bg-white border border-slate-200 p-5 hover:border-[var(--site-main)] hover:shadow-md transition">
                    <h3 className="font-bold text-slate-900 group-hover:text-[var(--site-main)]">{title}</h3>
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
            <Link href={hrefFor('/gallery', lang, site.base)} className="text-sm font-semibold text-[var(--site-main)] hover:underline shrink-0">
              {t('ሁሉንም ይመልከቱ', 'See all')} →
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {albums.slice(0, 4).map((a) => (
              <Link key={a.id} href={hrefFor(`/gallery/${a.id}`, lang, site.base)} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                {a.cover_thumb && <Image src={mediaUrl(a.cover_thumb)} alt="" fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-sm font-semibold text-white">
                  {(lang === 'en' && a.title_en) || a.title_am}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Common questions ── */}
      <section className="mx-auto max-w-3xl px-4 pt-14">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 text-center">{t('ተደጋጋሚ ጥያቄዎች', 'Common questions')}</h2>
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faq(site, lang).map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">
                {f.q}
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Reach us ── */}
      <section className="mx-auto max-w-6xl px-4 py-14 grid gap-4 md:grid-cols-2">
        {site.bot && (
          <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-[var(--site-main)] text-white p-6 hover:bg-[var(--site-light)] transition">
            <Send className="text-amber-300" size={26} />
            <h3 className="mt-3 text-lg font-bold">{t('የቴሌግራም ቦታችን', 'Our Telegram bot')}</h3>
            <p className="mt-1 text-sm text-white/80">
              {t(
                'ስለ እኛ ያንብቡ፤ አባል ወይም ወላጅ ከሆኑ ስልክዎን አጋርተው መዋጮ፣ ውጤትና መርሐ ግብሮችን ይመልከቱ።',
                'Read about us; members and parents can share their phone number to see dues, results and programs.'
              )}
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-amber-300">@{site.bot} →</span>
          </a>
        )}
        <Link href={hrefFor('/contact', lang, site.base)} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-[var(--site-main)] hover:shadow-md transition">
          <MessageSquare className="text-[var(--site-main)]" size={26} />
          <h3 className="mt-3 text-lg font-bold text-slate-900">{t('ጥያቄ አለዎት?', 'Have a question?')}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('ለሚመለከተው ክፍል ይጻፉ፤ ስልክ ደውለን እንመልሳለን።', 'Write to the right department — we will call you back.')}
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--site-main)]">{t('ያግኙን', 'Contact us')} →</span>
        </Link>
      </section>
    </SiteShell>
  );
}
