// One public gallery item of the default Sunday school (components/site/pages/AlbumPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlbumPage, albumMetadata } from '@/components/site/pages/AlbumPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, sp, tenant] = await Promise.all([params, searchParams, siteTenant()]);
  return tenant ? albumMetadata(tenant, id, langOf(sp.lang), siteName(tenant)) : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, sp, tenant] = await Promise.all([params, searchParams, siteTenant()]);
  if (!tenant) notFound();
  return <AlbumPage tenant={tenant} id={id} lang={langOf(sp.lang)} />;
}
