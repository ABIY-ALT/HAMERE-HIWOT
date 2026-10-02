'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Lock, Shield, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { MOCK_AUDIT_LOGS } from '@/lib/mock/data';
import { loadAudit } from './actions';
import {
  AUDIT_AREAS,
  HIDDEN_FIELDS,
  type AuditActionType,
  type AuditEntry,
  type AuditFilter,
} from '@/lib/audit/types';
import type { LoadMode } from '@/lib/admin/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const ACTION_STYLE: Record<AuditActionType, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-blue-50 text-blue-700',
  DELETE: 'bg-red-50 text-red-700',
  LOGIN: 'bg-slate-100 text-slate-700',
  LOGOUT: 'bg-slate-100 text-slate-500',
  APPROVE: 'bg-emerald-100 text-emerald-800',
  REJECT: 'bg-amber-50 text-amber-800',
  EXPORT: 'bg-violet-50 text-violet-700',
};

const DEMO_ENTRIES: AuditEntry[] = MOCK_AUDIT_LOGS.map((l) => ({
  id: l.id,
  created_at: l.created_at,
  action: l.action as AuditActionType,
  table_name: l.table_name,
  record_id: l.record_id,
  record_label: (l.new_values as Record<string, unknown> | null)?.full_name_en as string ?? '',
  actor_id: l.user_id,
  actor: 'Demo user',
  unit: '',
  ip: l.ip_address ?? '',
  user_agent: l.user_agent ?? '',
  old_values: (l.old_values as Record<string, unknown> | null) ?? null,
  new_values: (l.new_values as Record<string, unknown> | null) ?? null,
}));

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const fieldName = (key: string) => key.replace(/_/g, ' ');

export default function AuditTrailPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<AuditFilter>({});
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const actionLabel = (a: AuditActionType) =>
    ({
      INSERT: t('Created', 'ተፈጠረ'),
      UPDATE: t('Changed', 'ተቀየረ'),
      DELETE: t('Deleted', 'ተሰረዘ'),
      LOGIN: t('Sign-in', 'መግቢያ'),
      LOGOUT: t('Sign-out', 'መውጫ'),
      APPROVE: t('Approved', 'ጸደቀ'),
      REJECT: t('Rejected / returned', 'ውድቅ / ተመለሰ'),
      EXPORT: t('Exported', 'ተላከ'),
    })[a];
  const areaLabel = (table: string) => {
    const area = AUDIT_AREAS[table];
    return area ? (locale === 'am' ? area[1] : area[0]) : table;
  };
  const actorLabel = (e: AuditEntry) => e.actor || t('System / database', 'ስርዓት / ዳታቤዝ');

  const apply = useCallback((res: Awaited<ReturnType<typeof loadAudit>>, append: boolean) => {
    if (res.mode === 'live') {
      setEntries((prev) => (append ? [...prev, ...res.data.entries] : res.data.entries));
      setActors(res.data.actors);
      setHasMore(res.data.hasMore);
    } else if (res.mode === 'demo') {
      setEntries(DEMO_ENTRIES);
      setHasMore(false);
    } else {
      setError(res.error);
    }
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadAudit().then((res) => apply(res, false));
  }, [apply]);

  const changeFilter = async (patch: Partial<AuditFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    setMode('loading');
    apply(await loadAudit(next), false);
  };

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    apply(await loadAudit({ ...filter, before: { created_at: last.created_at, id: last.id } }), true);
    setLoadingMore(false);
  };

  /** One-line summary of what changed. */
  const summary = (e: AuditEntry): string => {
    if (e.action === 'LOGIN' || e.action === 'LOGOUT') {
      const result = String(e.new_values?.result ?? '');
      return result === 'FAILED'
        ? t('Wrong password', 'የተሳሳተ የይለፍ ቃል')
        : result === 'DISABLED'
          ? t('Account disabled', 'መለያው ተዘግቷል')
          : t('Successful', 'ተሳክቷል');
    }
    if (e.action === 'INSERT' || e.action === 'DELETE') return '';
    const keys = Object.keys(e.new_values ?? {}).filter((k) => !HIDDEN_FIELDS.has(k));
    return keys
      .slice(0, 3)
      .map((k) => `${fieldName(k)}: ${show(e.old_values?.[k])} → ${show(e.new_values?.[k])}`)
      .join('; ') + (keys.length > 3 ? ` (+${keys.length - 3})` : '');
  };

  const exportExcel = async () => {
    const header = [
      t('Date & time', 'ቀንና ሰዓት'), t('Ethiopian date', 'የኢትዮጵያ ቀን'), t('User', 'ተጠቃሚ'), t('Action', 'ተግባር'),
      t('Area', 'ዘርፍ'), t('Record', 'መዝገብ'), t('Changes', 'ለውጦች'), t('Department', 'ክፍል'), t('IP address', 'IP አድራሻ'),
    ].map(headerCell);
    const body = entries.map((e) => [
      new Date(e.created_at).toLocaleString('en-GB'), formatEthiopianDate(e.created_at.slice(0, 10), 'en'), cell(actorLabel(e)),
      actionLabel(e.action), areaLabel(e.table_name), cell(e.record_label || e.record_id), cell(summary(e)), e.unit, e.ip,
    ]);
    await downloadXlsx(`audit_trail_${todayIso()}`, [header, ...body], {
      sheet: 'Audit trail',
      widths: [20, 20, 22, 14, 24, 32, 60, 24, 16],
    });
  };

  const hasFilter = Boolean(filter.table || filter.action || filter.actorId || filter.from || filter.to);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('System Audit Trail', 'የስርዓት ኦዲት ታሪክ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Lock size={13} />
            {t(
              'Every change and sign-in, recorded automatically. Entries cannot be edited or deleted.',
              'እያንዳንዱ ለውጥና መግቢያ በራሱ ይመዘገባል። መዝገቦቹ ሊቀየሩ ወይም ሊሰረዙ አይችሉም።'
            )}
          </p>
        </div>
        <button onClick={exportExcel} disabled={entries.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50">
          <Download size={14} /> {t('Export shown entries', 'የሚታዩትን ላክ')}
        </button>
      </div>

      <AdminModeNotice mode={mode === 'loading' && entries.length ? 'live' : mode} error={error} />

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <select value={filter.table ?? ''} onChange={(e) => changeFilter({ table: e.target.value || undefined })} className="form-input text-xs">
          <option value="">{t('All areas', 'ሁሉም ዘርፎች')}</option>
          {Object.keys(AUDIT_AREAS).map((k) => (
            <option key={k} value={k}>{areaLabel(k)}</option>
          ))}
        </select>
        <select value={filter.action ?? ''} onChange={(e) => changeFilter({ action: e.target.value || undefined })} className="form-input text-xs">
          <option value="">{t('All actions', 'ሁሉም ተግባራት')}</option>
          {(Object.keys(ACTION_STYLE) as AuditActionType[]).filter((a) => a !== 'EXPORT').map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <select value={filter.actorId ?? ''} onChange={(e) => changeFilter({ actorId: e.target.value || undefined })} className="form-input text-xs">
          <option value="">{t('All users', 'ሁሉም ተጠቃሚዎች')}</option>
          <option value="SYSTEM">{t('System / database', 'ስርዓት / ዳታቤዝ')}</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input type="date" value={filter.from ?? ''} max={filter.to || undefined} onChange={(e) => changeFilter({ from: e.target.value || undefined })} className="form-input text-xs" title={t('From', 'ከ')} />
        <div className="flex gap-2">
          <input type="date" value={filter.to ?? ''} min={filter.from || undefined} onChange={(e) => changeFilter({ to: e.target.value || undefined })} className="form-input text-xs flex-1" title={t('To', 'እስከ')} />
          {hasFilter && (
            <button onClick={() => changeFilter({ table: undefined, action: undefined, actorId: undefined, from: undefined, to: undefined })} className="btn btn-ghost btn-sm" title={t('Clear filters', 'ማጣሪያ አጽዳ')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('When', 'መቼ')}</th>
                <th>{t('User', 'ተጠቃሚ')}</th>
                <th>{t('Action', 'ተግባር')}</th>
                <th>{t('Area', 'ዘርፍ')}</th>
                <th>{t('Record', 'መዝገብ')}</th>
                <th>{t('What changed', 'የተቀየረው')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap">
                    <div className="text-xs font-medium text-slate-800">{formatEthiopianDate(e.created_at.slice(0, 10), locale)}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {e.created_at.slice(0, 10)}
                    </div>
                  </td>
                  <td className={`text-xs ${e.actor ? 'text-slate-800 font-medium' : 'text-slate-400 italic'}`}>{actorLabel(e)}</td>
                  <td>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${ACTION_STYLE[e.action]}`}>{actionLabel(e.action)}</span>
                  </td>
                  <td className="text-xs text-slate-600">{areaLabel(e.table_name)}</td>
                  <td className="text-xs text-slate-800 max-w-[220px] truncate">{e.record_label || <span className="font-mono text-slate-400">{e.record_id.slice(0, 8)}</span>}</td>
                  <td className={`text-xs max-w-[360px] truncate ${e.new_values?.result === 'FAILED' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{summary(e)}</td>
                </tr>
              ))}
              {mode !== 'loading' && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-10">
                    {hasFilter ? t('No entries match these filters.', 'ከማጣሪያው ጋር የሚዛመድ የለም።') : t('No audit entries yet.', 'እስካሁን የኦዲት መዝገብ የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-4 border-t border-slate-100 text-center">
            <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary text-xs disabled:opacity-50">
              {loadingMore ? t('Loading…', 'በመጫን ላይ…') : t('Load older entries', 'የቆዩትን ጫን')}
            </button>
          </div>
        )}
      </div>

      {selected && (
        <Modal
          isOpen
          onClose={() => setSelected(null)}
          title={`${actionLabel(selected.action)} — ${areaLabel(selected.table_name)}`}
          subtitle={selected.record_label || selected.record_id}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <Info label={t('When', 'መቼ')} value={`${formatEthiopianDate(selected.created_at.slice(0, 10), locale)} · ${new Date(selected.created_at).toLocaleString('en-GB')}`} />
              <Info label={t('User', 'ተጠቃሚ')} value={actorLabel(selected)} />
              {selected.unit && <Info label={t('Department', 'ክፍል')} value={selected.unit} />}
              {selected.ip && <Info label={t('IP address', 'IP አድራሻ')} value={selected.ip} />}
              {selected.user_agent && <Info label={t('Device / browser', 'መሣሪያ / አሳሽ')} value={selected.user_agent} />}
              <Info label={t('Record ID', 'የመዝገብ መለያ')} value={selected.record_id} />
            </dl>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-left">{t('Field', 'መስክ')}</th>
                    {selected.old_values && <th className="p-2 text-left">{t('Before', 'በፊት')}</th>}
                    {selected.new_values && <th className="p-2 text-left">{t('After', 'በኋላ')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...new Set([...Object.keys(selected.old_values ?? {}), ...Object.keys(selected.new_values ?? {})])]
                    .filter((k) => !HIDDEN_FIELDS.has(k))
                    .map((k) => (
                      <tr key={k}>
                        <td className="p-2 font-medium text-slate-700 align-top whitespace-nowrap">{fieldName(k)}</td>
                        {selected.old_values && <td className="p-2 text-red-700 align-top break-all">{show(selected.old_values[k])}</td>}
                        {selected.new_values && <td className="p-2 text-emerald-700 align-top break-all">{show(selected.new_values[k])}</td>}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield size={12} />
              {t('This entry is permanent and cannot be changed.', 'ይህ መዝገብ ቋሚ ነው፤ ሊቀየር አይችልም።')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1 flex justify-between gap-3 border-b border-slate-100">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-800 text-right break-all">{value}</dd>
    </div>
  );
}
