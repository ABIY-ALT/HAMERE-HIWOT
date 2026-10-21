// The public About page of the default Sunday school (components/site/pages/AboutPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AboutPage } from '@/components/site/pages/AboutPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'ስለ እኛ · About us — ሐመረ ሕይወት Hamere Hiwot',
  description: 'History, class times, departments, membership and contact of Hamere Hiwot Sunday School.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <AboutPage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
