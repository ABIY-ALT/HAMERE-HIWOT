// /s/<slug>/contact — a Sunday school's public Contact page (components/site/pages/ContactPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactPage } from '@/components/site/pages/ContactPage';
import { langOf } from '@/components/site/SiteShell';
import { siteName, siteTenant } from '@/lib/site/tenant';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await siteTenant((await params).slug);
  return tenant ? { title: `ያግኙን · Contact — ${siteName(tenant)}` } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const tenant = await siteTenant(slug);
  if (!tenant) notFound();
  return <ContactPage tenant={tenant} lang={langOf(sp.lang)} />;
}
