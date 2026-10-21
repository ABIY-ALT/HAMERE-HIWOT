// The public Contact page of the default Sunday school (components/site/pages/ContactPage).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactPage } from '@/components/site/pages/ContactPage';
import { langOf } from '@/components/site/SiteShell';
import { siteTenant } from '@/lib/site/tenant';

export const metadata: Metadata = {
  title: 'ያግኙን · Contact — ሐመረ ሕይወት Hamere Hiwot',
  description: 'Send a question to a department of Hamere Hiwot Sunday School.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await siteTenant();
  if (!tenant) notFound();
  return <ContactPage tenant={tenant} lang={langOf((await searchParams).lang)} />;
}
