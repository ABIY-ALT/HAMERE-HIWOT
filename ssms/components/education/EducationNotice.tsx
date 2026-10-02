'use client';

import React from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { useEducation } from '@/lib/education/client';

/**
 * Status banner for Education pages: loading / demo / error, plus a pointer to
 * the setup step that is missing (an academic year, or classes) in live mode.
 */
export function EducationNotice({
  needs,
  demoSavedInBrowser = false,
}: {
  needs?: 'year' | 'classes';
  /** Demo mode keeps students and roll calls in this browser — say so instead of "not saved". */
  demoSavedInBrowser?: boolean;
}) {
  const { t } = useLang();
  const edu = useEducation();

  if (edu.mode === 'demo' && demoSavedInBrowser) {
    return (
      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-2 text-sm text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          {t(
            'Demo mode — the database is not connected. Changes are kept only in this browser.',
            'የሙከራ ሁኔታ — ዳታቤዝ አልተገናኘም። ለውጦች የሚቀመጡት በዚህ አሳሽ ውስጥ ብቻ ነው።'
          )}
        </span>
      </div>
    );
  }

  if (edu.mode !== 'live') return <AdminModeNotice mode={edu.mode} error={edu.error} />;

  if (needs && !edu.activeYearId) {
    return (
      <SetupHint
        text={t('Open an academic year first.', 'በመጀመሪያ የትምህርት ዓመት ይክፈቱ።')}
        href="/dashboard/education/academic-years"
        link={t('Go to Academic Years', 'ወደ የትምህርት ዓመታት')}
      />
    );
  }
  if (needs === 'classes' && edu.classes.length === 0) {
    return (
      <SetupHint
        text={t('No classes exist for this academic year yet.', 'ለዚህ የትምህርት ዓመት እስካሁን ክፍል የለም።')}
        href="/dashboard/education/classes"
        link={t('Create classes', 'ክፍሎችን ፍጠር')}
      />
    );
  }
  return null;
}

function SetupHint({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 flex flex-wrap items-center gap-2 text-sm text-blue-800">
      <Info size={16} className="shrink-0" />
      <span>{text}</span>
      <Link href={href} className="font-semibold underline">
        {link}
      </Link>
    </div>
  );
}
