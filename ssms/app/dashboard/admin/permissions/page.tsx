'use client';

import React, { useState } from 'react';
import { Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERMISSIONS } from '@/lib/mock/data';

export default function PermissionsPage() {
  const { t, locale } = useLang();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');

  const categories = Array.from(new Set(MOCK_PERMISSIONS.map((p) => p.category)));

  const filtered = MOCK_PERMISSIONS.filter((p) => {
    const matchesSearch =
      (locale === 'am' ? p.name_am : p.name_en).toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase());
    const matchesCat = catFilter === 'ALL' || p.category === catFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Granular System Permissions Matrix', 'የፈቃዶች ዝርዝር ማውጫ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Atomic operation access tokens: Academic, Finance, Assets, HR, and Governance',
              'የትምህርት፣ የፋይናንስ፣ የንብረትና የአመራር መዳረሻ ፈቃዶች'
            )}
          </p>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search permissions...', 'ፈቃዶችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Categories', 'ሁሉም ምድቦች')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              {filtered.length} {t('permissions', 'ፈቃዶች')}
            </span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Permission Code', 'የፈቃድ ኮድ')}</th>
                <th>{t('Permission Label', 'ስም')}</th>
                <th>{t('Category', 'ምድብ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{p.code}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? p.name_am : p.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{p.category}</span>
                  </td>
                  <td>
                    <span className="badge badge-success inline-flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      {t('Active', 'ንቁ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
