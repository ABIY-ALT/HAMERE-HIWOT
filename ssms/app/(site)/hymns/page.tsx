// The public Hymns page of the default Sunday school (components/site/pages/HymnsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HymnsPage } from '@/components/site/pages/HymnsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'መዝሙራት · Hymns — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Hymns of the Hamere Hiwot Sunday School choir, with their lyrics.',
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  const sp = await searchParams;
  return <HymnsPage tenant={tenant} lang={langOf(sp.lang)} q={one(sp.q)} type={one(sp.type)} />;
}
