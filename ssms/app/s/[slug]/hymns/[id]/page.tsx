// /s/<slug>/hymns/<id> — one hymn with its lyrics (components/site/pages/HymnsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HymnPage } from '@/components/site/pages/HymnsPage';
import { langOf } from '@/components/site/SiteShell';
import { publicHymns } from '@/lib/site/public-data';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const tenant = await siteTenant(slug);
  const hymn = tenant ? (await publicHymns(tenant)).find((h) => h.id === id) : null;
  return tenant && hymn ? { title: `${hymn.title_am} — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <HymnPage tenant={tenant} lang={langOf(sp.lang)} id={id} />;
}
