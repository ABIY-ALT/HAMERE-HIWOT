// /start — the product page for Sunday schools thinking of using the system (components/product/ProductPage).

import type { Metadata } from 'next';
import { ProductPage } from '@/components/product/ProductPage';
import { langOf } from '@/components/site/SiteShell';
import { productInfo } from '@/lib/platform/marketing';

export const metadata: Metadata = {
  title: 'Sunday School Management System · የሰንበት ትምህርት ቤት አስተዳደር ሥርዓት',
  description:
    'Members, students, attendance, exams, finance, programs, a public website and a Telegram bot for Ethiopian Orthodox Sunday schools — in Amharic and English, on the Ethiopian calendar.',
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [info, sp] = await Promise.all([productInfo(), searchParams]);
  return <ProductPage info={info} lang={langOf(sp.lang)} />;
}
