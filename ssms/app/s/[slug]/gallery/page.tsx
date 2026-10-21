// /s/<slug>/gallery — a Sunday school's public Gallery page (components/site/pages/GalleryPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GalleryPage } from '@/components/site/pages/GalleryPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `ፎቶዎች · Gallery — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <GalleryPage tenant={tenant} lang={langOf(sp.lang)} />;
}
