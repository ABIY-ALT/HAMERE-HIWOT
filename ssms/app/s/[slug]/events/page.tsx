// /s/<slug>/events — a Sunday school's public Events page (components/site/pages/EventsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EventsPage } from '@/components/site/pages/EventsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `መርሐ ግብሮች · Events — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <EventsPage tenant={tenant} lang={langOf(sp.lang)} />;
}
