'use client';

// "Export ▾" → Excel (.xlsx) or CSV. The page builds the table (lib/export/table).

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import type { ExportFormat } from '@/lib/export/table';

export function ExportButton({
  onExport,
  disabled = false,
  label,
  className = '',
}: {
  onExport: (format: ExportFormat) => Promise<void> | void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {label ?? t('Export', 'ላክ (Export)')}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm">
          <button type="button" onClick={() => run('xlsx')} className="w-full text-left px-3 py-2 hover:bg-slate-50 inline-flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-emerald-600" /> {t('Excel (.xlsx)', 'ኤክሴል (.xlsx)')}
          </button>
          <button type="button" onClick={() => run('csv')} className="w-full text-left px-3 py-2 hover:bg-slate-50 inline-flex items-center gap-2">
            <FileText size={15} className="text-slate-500" /> {t('CSV (.csv)', 'CSV (.csv)')}
          </button>
        </div>
      )}
    </div>
  );
}
