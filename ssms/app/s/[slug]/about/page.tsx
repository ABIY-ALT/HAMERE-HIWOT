// /s/<slug>/about — a Sunday school's public About page (components/site/pages/AboutPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AboutPage } from '@/components/site/pages/AboutPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `ስለ እኛ · About us — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <AboutPage tenant={tenant} lang={langOf(sp.lang)} />;
}
