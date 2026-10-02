'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Shown on pages that still use sample data while the rest of the system is
 * connected to the database, so nobody mistakes the figures for real ones.
 */
export function SampleDataNotice() {
  const { t } = useLang();
  if (!isSupabaseEnabled()) return null;
  return (
    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-2 text-sm text-amber-800">
      <Info size={16} className="mt-0.5 shrink-0" />
      <span>
        {t(
          'This page is not connected to the database yet — the figures below are sample data and changes are not saved.',
          'ይህ ገጽ ገና ከዳታቤዝ ጋር አልተገናኘም — ከታች ያሉት አሃዞች ናሙና ናቸው፤ ለውጦች አይቀመጡም።'
        )}
      </span>
    </div>
  );
}
