'use client';

// Pieces the accounting pages share: the section tabs, the period picker and
// the heading a printed report carries.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, BookOpen, FileSpreadsheet, ListTree, NotebookPen, Printer } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { periodPresets, type Bilingual } from '@/lib/finance/gl';

const TABS = [
  { href: '/dashboard/finance/accounting/chart', icon: ListTree, label: ['Chart of accounts', 'የሂሳብ መደብ'] },
  { href: '/dashboard/finance/accounting/journal', icon: NotebookPen, label: ['Journal entries', 'የሂሳብ መዝገብ'] },
  { href: '/dashboard/finance/accounting/ledger', icon: BookOpen, label: ['General ledger', 'ጠቅላላ መዝገብ'] },
  { href: '/dashboard/finance/accounting/statements', icon: FileSpreadsheet, label: ['Financial statements', 'የሂሳብ መግለጫዎች'] },
] as const;

export function GlNav() {
  const { locale } = useLang();
  const path = usePathname();
  return (
    <nav className="no-print flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
      {TABS.map((tab) => {
        const active = path?.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${
              active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon size={14} /> {locale === 'am' ? tab.label[1] : tab.label[0]}
          </Link>
        );
      })}
    </nav>
  );
}

export function PeriodBar({
  from,
  to,
  fyStart,
  onChange,
  single = false,
  children,
}: {
  from: string;
  to: string;
  /** gl_settings.fiscal_year_start */
  fyStart: string;
  onChange: (from: string, to: string) => void;
  /** Only an "as of" date (balance sheet) */
  single?: boolean;
  children?: React.ReactNode;
}) {
  const { t, locale } = useLang();
  const presets = periodPresets(todayIso(), fyStart);
  return (
    <div className="no-print card p-3 flex flex-wrap items-end gap-3">
      {!single && (
        <label className="text-xs font-semibold text-slate-600">
          {t('From', 'ከ')}
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} className="form-input text-sm mt-1 block" />
        </label>
      )}
      <label className="text-xs font-semibold text-slate-600">
        {single ? t('As of', 'እስከ') : t('To', 'እስከ')}
        <input type="date" value={to} min={single ? undefined : from} onChange={(e) => e.target.value && onChange(from, e.target.value)} className="form-input text-sm mt-1 block" />
      </label>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.from, p.to)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
              (single ? to === p.to : from === p.from && to === p.to) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
          >
            {locale === 'am' ? p.label[1] : p.label[0]}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Heading of a report: on screen a title, on paper the Sunday school's name too. */
export function ReportHeading({
  tenant,
  title,
  period,
  onPrint,
}: {
  tenant: Bilingual;
  title: Bilingual;
  period: string;
  onPrint?: () => void;
}) {
  const { t, locale } = useLang();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="hidden print:block text-sm font-bold text-slate-900">{tenant[1]} · {tenant[0]}</div>
        <h2 className="text-lg font-bold text-slate-900">{locale === 'am' ? `${title[1]} · ${title[0]}` : title[0]}</h2>
        <div className="text-xs text-slate-500">{period}</div>
        <div className="hidden print:block text-[10px] text-slate-400 mt-1">
          {t('Printed', 'የታተመው')} {formatEthiopianDate(todayIso(), locale)} ({todayIso()})
        </div>
      </div>
      {onPrint && (
        <button type="button" onClick={onPrint} className="no-print btn btn-secondary text-xs inline-flex items-center gap-1.5">
          <Printer size={14} /> {t('Print / PDF', 'አትም / PDF')}
        </button>
      )}
    </div>
  );
}

/** "Meskerem 1, 2019 – Tir 30, 2019 (2026-09-11 – 2027-02-07)" */
export function periodText(from: string | null, to: string, locale: string): string {
  const et = (d: string) => formatEthiopianDate(d, locale as 'en' | 'am');
  return from ? `${et(from)} – ${et(to)} (${from} – ${to})` : `${et(to)} (${to})`;
}

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} className="shrink-0" /> {text}
    </div>
  );
}
