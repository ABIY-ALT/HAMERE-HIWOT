// /s/<slug>/news — a Sunday school's public News page (components/site/pages/NewsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsPage } from '@/components/site/pages/NewsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `ዜና · News — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <NewsPage tenant={tenant} lang={langOf(sp.lang)} />;
}
