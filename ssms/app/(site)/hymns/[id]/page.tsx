// One hymn with its lyrics, on the default Sunday school's website (components/site/pages/HymnsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HymnPage } from '@/components/site/pages/HymnsPage';
import { langOf } from '@/components/site/SiteShell';
import { publicHymns } from '@/lib/site/public-data';
import { siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [tenant, { id }] = await Promise.all([siteTenant(), params]);
  const hymn = tenant ? (await publicHymns(tenant)).find((h) => h.id === id) : null;
  return hymn ? { title: `${hymn.title_am} — ሐመረ ሕይወት Hamere Hiwot` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <HymnPage tenant={tenant} lang={langOf(sp.lang)} id={id} />;
}
