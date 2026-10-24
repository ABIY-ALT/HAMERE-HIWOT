// /s/<slug>/calendar — a Sunday school's public Calendar page (components/site/pages/CalendarPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPage } from '@/components/site/pages/CalendarPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Search = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Search> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `ቀን መቁጠሪያ · Calendar — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <CalendarPage tenant={tenant} lang={langOf(sp.lang)} y={one(sp.y)} m={one(sp.m)} />;
}
