// The public Events page of the default Sunday school (components/site/pages/EventsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EventsPage } from '@/components/site/pages/EventsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'መርሐ ግብሮች · Events — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Coming programs, holy day celebrations and conferences of Hamere Hiwot Sunday School.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <EventsPage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
