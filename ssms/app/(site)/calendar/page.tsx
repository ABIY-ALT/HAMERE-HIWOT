// The public Calendar page of the default Sunday school (components/site/pages/CalendarPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPage } from '@/components/site/pages/CalendarPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'ቀን መቁጠሪያ · Calendar — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Feasts and fasts of the Ethiopian Orthodox Tewahedo Church, with the programs of Hamere Hiwot Sunday School.',
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  const sp = await searchParams;
  return <CalendarPage tenant={tenant} lang={langOf(sp.lang)} y={one(sp.y)} m={one(sp.m)} />;
}
