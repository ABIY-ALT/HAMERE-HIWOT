'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import type { LoadMode } from '@/lib/admin/types';

/** Banner at the top of admin pages: loading, demo mode (nothing saved), or load error. */
export function AdminModeNotice({ mode, error }: { mode: LoadMode; error?: string }) {
  const { t } = useLang();

  if (mode === 'loading') {
    return (
      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" />
        {t('Loading…', 'በመጫን ላይ…')}
      </div>
    );
  }

  if (mode === 'demo') {
    return (
      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-2 text-sm text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          {t(
            'Demo mode — the database is not connected, so changes on this page are not saved.',
            'የሙከራ ሁኔታ — ዳታቤዝ ስላልተገናኘ በዚህ ገጽ ላይ የሚደረጉ ለውጦች አይቀመጡም።'
          )}
        </span>
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="p-3 rounded-xl border border-red-200 bg-red-50 flex items-start gap-2 text-sm text-red-700">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>
          {t('Could not load data: ', 'መረጃውን መጫን አልተቻለም: ')}
          {error}
        </span>
      </div>
    );
  }

  return null;
}

/** Bottom-right toast used by the admin pages. */
export function AdminToast({ toast }: { toast: { kind: 'success' | 'error'; text: string } | null }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
      {toast.kind === 'success' ? (
        <CheckCircle2 size={18} className="text-emerald-400" />
      ) : (
        <AlertCircle size={18} className="text-red-400" />
      )}
      <span className="text-sm font-medium">{toast.text}</span>
    </div>
  );
}
