// The public Gallery page of the default Sunday school (components/site/pages/GalleryPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GalleryPage } from '@/components/site/pages/GalleryPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'ፎቶዎች · Gallery — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Photos of holy days, programs and services of Hamere Hiwot Sunday School.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <GalleryPage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
