// ─────────────────────────────────────────────────────────────────────────────
// /exam — where students sit an online exam with the ticket their teacher gave
// them. Public (no sign-in); Amharic first.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { LangProvider } from '@/contexts/LangContext';

export const metadata: Metadata = {
  description: 'ፈተና — የሐመረ ሕይወት ሰንበት ትምህርት ቤት · Online exam, Hamere Hiwot Sunday School',
};

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <LangProvider defaultLocale="am">{children}</LangProvider>;
}
