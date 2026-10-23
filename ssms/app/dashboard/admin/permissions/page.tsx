'use client';

// Who can do what: every permission (rows, by area) against every role
// (columns), with how many people hold each permission through their roles.
// Read-only — roles are changed under Administration → Roles.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Check, Lock } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { demoPermissions, demoRoles } from '@/lib/admin/demo';
import type { AdminPermissionRow, AdminRoleRow, LoadMode } from '@/lib/admin/types';
import { loadPermissions } from '../actions';

export default function PermissionsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [permissions, setPermissions] = useState<AdminPermissionRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [onlyUsed, setOnlyUsed] = useState(false);

  useEffect(() => {
    loadPermissions().then((res) => {
      if (res.mode === 'demo') {
        setPermissions(demoPermissions());
        setRoles(demoRoles());
      } else if (res.mode === 'live') {
        setPermissions(res.data.permissions);
        setRoles(res.data.roles);
      } else setLoadError(res.error);
      setMode(res.mode);
    });
  }, []);

  const name = (x: { name_en: string; name_am: string }) => (locale === 'am' ? x.name_am : x.name_en);
  const columns = roles.filter((r) => r.is_active);
  const categories = Array.from(new Set(permissions.map((p) => p.category)));

  /** permission code → roles granting it, and the people holding it through them */
  const reach = useMemo(() => {
    const out = new Map<string, { roles: number; people: Set<string> }>();
    for (const r of columns) {
      for (const code of r.permissions) {
        const entry = out.get(code) ?? { roles: 0, people: new Set<string>() };
        entry.roles++;
        for (const h of r.holders ?? []) entry.people.add(h.user_id);
        out.set(code, entry);
      }
    }
    return out;
  }, [columns]);

  const q = search.toLowerCase();
  const rows = permissions.filter(
    (p) =>
      (catFilter === 'ALL' || p.category === catFilter) &&
      (!q || p.code.toLowerCase().includes(q) || name(p).toLowerCase().includes(q)) &&
      (!onlyUsed || (reach.get(p.code)?.roles ?? 0) > 0)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Who can do what', 'ማን ምን ማድረግ ይችላል')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Every permission against every role. To change a role, open it under ', 'እያንዳንዱ ፈቃድ ከእያንዳንዱ ሚና ጋር። ሚናን ለመቀየር ')}
          <Link href="/dashboard/admin/roles" className="text-blue-600 hover:underline">{t('Roles', 'ሚናዎች')}</Link>.
        </p>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search permissions…', 'ፈቃዶችን ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All areas', 'ሁሉም ዘርፎች')}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
              {t('Only those given to a role', 'ለሚና የተሰጡት ብቻ')}
            </label>
            <span className="text-xs text-slate-400">{rows.length} {t('permissions', 'ፈቃዶች')}</span>
          </div>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <table className="text-xs border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-slate-50 border-b border-r border-slate-200 text-left px-3 py-2 min-w-[16rem]">{t('Permission', 'ፈቃድ')}</th>
                <th className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-2 py-2 text-center whitespace-nowrap">{t('People', 'ሰዎች')}</th>
                {columns.map((r) => (
                  <th key={r.id} className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-1 py-2 align-bottom">
                    <div className="h-44 flex items-end justify-center">
                      <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap font-semibold text-slate-700" title={r.code}>
                        {r.is_system_role && <Lock size={10} className="inline mb-1 text-amber-500" />} {name(r)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const inCat = rows.filter((p) => p.category === cat);
                if (inCat.length === 0) return null;
                return (
                  <React.Fragment key={cat}>
                    <tr>
                      <td colSpan={columns.length + 2} className="sticky left-0 bg-white px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{cat}</td>
                    </tr>
                    {inCat.map((p) => {
                      const r = reach.get(p.code);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80">
                          <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-100 px-3 py-1.5">
                            <div className="font-medium text-slate-800">{name(p)}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {p.code}
                              {p.unavailable && <span className="ml-1 font-sans text-amber-600">· {t('not in your plan', 'በዕቅድዎ የለም')}</span>}
                              {!p.is_active && <span className="ml-1 font-sans text-red-500">· {t('switched off', 'የተዘጋ')}</span>}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 text-center font-mono text-slate-600">{r?.people.size ?? 0}</td>
                          {columns.map((role) => (
                            <td key={role.id} className="border-b border-slate-100 text-center">
                              {role.permissions.includes(p.code) && <Check size={14} className="inline text-emerald-600" />}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
