// The public News page of the default Sunday school (components/site/pages/NewsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsPage } from '@/components/site/pages/NewsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'ዜና · News — ሐመረ ሕይወት Hamere Hiwot',
  description: 'News and announcements of Hamere Hiwot Sunday School.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <NewsPage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
