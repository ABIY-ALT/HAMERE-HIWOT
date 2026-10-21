// The public home page of the default Sunday school (components/site/pages/HomePage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomePage } from '@/components/site/pages/HomePage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  description: 'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን ሐመረ ሕይወት ሰንበት ትምህርት ቤት — Sallo Debre Tsehay Saint George Church, Hamere Hiwot Sunday School: who we are, coming programs, and how to reach us.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <HomePage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
