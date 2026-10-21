// The public Events page: programs the office marked "Show on the public
// website" (Programs → edit), coming or still running, soonest first.

import type { Metadata } from 'next';
import { publicSite } from '@/lib/site/public-data';
import { PageTitle, SiteShell, langOf, pick } from '@/components/site/SiteShell';
import { EventCard } from '@/components/site/EventCard';

export const metadata: Metadata = {
  title: 'መርሐ ግብሮች · Events — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Coming programs, holy day celebrations and conferences of Hamere Hiwot Sunday School.',
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = langOf((await searchParams).lang);
  const site = await publicSite();
  const t = (am: string, en: string) => pick(lang, am, en);

  return (
    <SiteShell lang={lang} path="/events" site={site}>
      <PageTitle
        title={t('የሚመጡ መርሐ ግብሮች', 'Coming events')}
        subtitle={t('ጉባኤዎች፣ የበዓል አከባበሮችና ሌሎች ለሁሉም ክፍት የሆኑ መርሐ ግብሮች።', 'Conferences, holy day celebrations and other programs open to everyone.')}
      />
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-4">
        {site.events.length === 0 ? (
          <p className="text-sm text-slate-500">{t('ለጊዜው የተያዘ የሕዝብ መርሐ ግብር የለም።', 'No public programs are planned right now.')}</p>
        ) : (
          site.events.map((ev) => <EventCard key={ev.id} event={ev} lang={lang} full />)
        )}
        {site.bot && (
          <p className="pt-4 text-sm text-slate-600">
            {t('ስልካቸውን ለቴሌግራም ቦታችን ያጋሩ አባላትና ወላጆች ከመርሐ ግብሩ አንድ ቀን በፊት ማስታወሻ ይደርሳቸዋል፦ ', 'Members and parents who share their phone number with our Telegram bot get a reminder the day before: ')}
            <a href={`https://t.me/${site.bot}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2f43c8] hover:underline">@{site.bot}</a>
          </p>
        )}
      </div>
    </SiteShell>
  );
}
