// /s/<slug>/news/<id> — one public news item of a Sunday school (components/site/pages/NewsPostPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NewsPostPage, newsPostMetadata } from '@/components/site/pages/NewsPostPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  return tenant ? newsPostMetadata(tenant, id, langOf(sp.lang), siteName(tenant)) : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <NewsPostPage tenant={tenant} id={id} lang={langOf(sp.lang)} />;
}
