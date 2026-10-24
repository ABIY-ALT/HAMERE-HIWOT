// /s/<slug>/hymns — a Sunday school's public Hymns page (components/site/pages/HymnsPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HymnsPage } from '@/components/site/pages/HymnsPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Search = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Search> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `መዝሙራት · Hymns — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <HymnsPage tenant={tenant} lang={langOf(sp.lang)} q={one(sp.q)} type={one(sp.type)} />;
}
