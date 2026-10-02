'use client';
import React from 'react';
import { Search } from 'lucide-react';
import { cn, statusColor } from '@/lib/utils';
import { useLang } from '@/contexts/LangContext';

// ─── PageShell ────────────────────────────────────────────────────────────────
export function PageShell({
  titleEn, titleAm, subtitleEn, subtitleAm, actions, children,
  stats,
}: {
  titleEn: string; titleAm: string;
  subtitleEn?: string; subtitleAm?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  stats?: { label: string; labelAm: string; value: string | number; color?: string }[];
}) {
  const { t } = useLang();
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t(titleEn, titleAm)}</h1>
          {(subtitleEn || subtitleAm) && (
            <p className="page-subtitle">{t(subtitleEn ?? '', subtitleAm ?? '')}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="card p-4">
              <div className={cn('text-2xl font-bold', s.color ?? 'text-slate-800')}>{s.value}</div>
              <div className="text-sm text-slate-500 mt-0.5">{t(s.label, s.labelAm)}</div>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────
export function DataTable<T extends Record<string, unknown>>({
  columns, data, searchable = true, searchPlaceholderEn = 'Search...', searchPlaceholderAm = 'ፈልግ...',
  emptyEn = 'No records found', emptyAm = 'ምንም መዝገብ አልተገኘም',
}: {
  columns: { key: string; headerEn: string; headerAm: string; render?: (row: T) => React.ReactNode }[];
  data: T[];
  searchable?: boolean;
  searchPlaceholderEn?: string;
  searchPlaceholderAm?: string;
  emptyEn?: string; emptyAm?: string;
}) {
  const { t } = useLang();
  const [q, setQ] = React.useState('');

  const filtered = q
    ? data.filter((row) =>
        Object.values(row).some((v) =>
          String(v ?? '').toLowerCase().includes(q.toLowerCase())
        )
      )
    : data;

  return (
    <div className="card">
      {searchable && (
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="form-input pl-9 py-2 text-sm"
              placeholder={t(searchPlaceholderEn, searchPlaceholderAm)}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="text-xs text-slate-400 ml-auto">
            {filtered.length} {t('records', 'መዝገቦች')}
          </div>
        </div>
      )}
      <div className="table-container rounded-none border-0">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{t(c.headerEn, c.headerAm)}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-12 text-slate-400">{t(emptyEn, emptyAm)}</td></tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, map }: { status: string; map?: Record<string, string> }) {
  const { t } = useLang();
  const label = map?.[status] ?? status;
  return <span className={cn('badge', statusColor(status))}>{label}</span>;
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', onClick, icon: Icon, sm }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: () => void; icon?: React.ElementType; sm?: boolean;
}) {
  return (
    <button onClick={onClick} className={cn('btn', `btn-${variant}`, sm && 'btn-sm')}>
      {Icon && <Icon size={15} />}{children}
    </button>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = '#3d57e3' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{value.toLocaleString()}</span><span>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── InfoCard ─────────────────────────────────────────────────────────────────
export function InfoCard({ label, value, icon: Icon, color = 'bg-blue-50', iconColor = 'text-blue-600' }: {
  label: string; value: string | number; icon?: React.ElementType; color?: string; iconColor?: string;
}) {
  return (
    <div className="stat-card">
      {Icon && <div className={cn('stat-icon', color)}><Icon size={20} className={iconColor} /></div>}
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
