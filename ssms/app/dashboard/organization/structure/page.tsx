'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Crown, Building2, Network } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import type { StructureView, UnitSummary } from '@/lib/organization/types';
import { loadStructure } from '../actions';

const demoUnit = (u: (typeof MOCK_ORG_UNITS)[number]): UnitSummary => ({
  id: u.id, code: u.code, name_en: u.name_en, name_am: u.name_am, description_en: '', description_am: '',
  is_active: true, sort_order: u.sort_order, heads: [], people: [], budget: null, openRequests: null,
});

export default function OrgStructurePage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [view, setView] = useState<StructureView | null>(null);

  useEffect(() => {
    loadStructure().then((res) => {
      if (res.mode === 'live') setView(res.data);
      else if (res.mode === 'demo')
        setView({
          coordinations: MOCK_ORG_UNITS.filter((u) => u.unit_type === 'COORDINATION').map(demoUnit),
          departments: MOCK_ORG_UNITS.filter((u) => u.unit_type === 'DEPARTMENT').map(demoUnit),
          bodies: {},
        });
      else setError(res.error);
      setMode(res.mode);
    });
  }, []);

  const coordinations = view?.coordinations ?? [];
  const departments = view?.departments ?? [];
  const seats = (code: string) => {
    const b = view?.bodies[code];
    if (!b) return '';
    return b.seats !== null ? t(` — ${b.active} of ${b.seats} seats filled`, ` — ከ${b.seats} ${b.active} ተይዘዋል`) : t(` — ${b.active} members`, ` — ${b.active} አባላት`);
  };
  const headOf = (u: UnitSummary) =>
    u.heads.length ? u.heads.map((h) => (locale === 'am' ? h.name_am : h.name)).join(', ') : '';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Category 2 Parish Organizational Hierarchy', 'የምድብ ሁለት አጥቢያ ሰንበት ት/ቤት ድርጅታዊ መዋቅር')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Hierarchical visualization of Governance, Coordinations, and Operational Departments',
              'የአስተዳደር፣ የቅንጅቶች እና የሥራ ክፍሎች ተዋረድ ገላጭ መዋቅር'
            )}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
          <Shield size={14} />
          {t('Statutory Model — Exactly Mandated', 'ሕጋዊ ሞዴል — በትክክል የተደነገገ')}
        </div>
      </div>

      <AdminModeNotice mode={mode === 'live' ? 'live' : mode} error={error} />

      {/* Visual Hierarchy Diagram */}
      <div className="card p-6 space-y-8 overflow-x-auto">
        {/* Tier 1: General Assembly */}
        <div className="flex flex-col items-center">
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm text-center w-72 border border-slate-800">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
              {t('Supreme Authority', 'ጠቅላይ አካል')}
            </div>
            <div className="font-bold text-base">
              {locale === 'am' ? 'ጠቅላላ ጉባኤ' : 'General Assembly'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {t('All eligible parish Sunday school members', 'ሁሉም የሰንበት ት/ቤቱ አባላት')}
            </div>
          </div>
          <div className="w-0.5 h-6 bg-slate-300 my-1" />

          {/* Tier 2: Audit Committee & Management Board Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
            {/* Audit Committee (Autonomous) */}
            <div className="border-2 border-dashed border-red-200 bg-red-50/50 rounded-xl p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 uppercase tracking-wider mb-1">
                <Shield size={14} />
                {t('Supervisory & Audit (Autonomous)', 'የክትትልና ኦዲት (ራሱን የቻለ)')}
              </div>
              <div className="font-bold text-slate-800 text-sm">
                {locale === 'am' ? 'የአፈጻጸም ክትትል ጉባኤ' : 'Performance Audit Committee'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t('Read-only cross-organizational audit authority', 'ሁሉን አቀፍ የቁጥጥር ስልጣን ያለው')}
              </div>
            </div>

            {/* Management Board (9 members) */}
            <div className="border border-blue-200 bg-blue-50/60 rounded-xl p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
                <Crown size={14} />
                {t('Strategic Governance (9 Members)', 'ስልታዊ አመራር (9 አባላት)')}
                {seats('MANAGEMENT_BOARD')}
              </div>
              <div className="font-bold text-slate-800 text-sm">
                {locale === 'am' ? 'የሥራ አመራር ጉባኤ' : 'Board of Management'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t('Includes Management Secretariat & Advisory Council', 'የሥራ አመራር ጽሕፈት ቤት እና አማካሪዎች ይገኙበታል')}
              </div>
            </div>
          </div>

          <div className="w-0.5 h-6 bg-slate-300 my-1" />

          {/* Tier 3: Executive Committee */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center w-80 shadow-sm">
            <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">
              {t('Executive Operational Body (9 Members)', 'የሥራ አስፈጻሚ አካል (9 አባላት)')}
              {seats('EXECUTIVE_COMMITTEE')}
            </div>
            <div className="font-bold text-slate-800 text-base">
              {locale === 'am' ? 'የሥራ አስፈጻሚ ጉባኤ' : 'Executive Committee'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Oversees Coordinations & Departments', 'ቅንጅቶችንና ክፍሎችን ይመራል')}
            </div>
          </div>

          <div className="w-0.5 h-6 bg-slate-300 my-1" />

          {/* Tier 4: Coordinations & Departments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mt-2">
            {/* 7 Coordinations Column */}
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                <Network className="text-blue-600" size={18} />
                <h3 className="font-bold text-sm text-slate-800">
                  {t(`Coordinations (${coordinations.length})`, `ቅንጅቶች (${coordinations.length})`)}
                </h3>
              </div>
              <div className="space-y-2">
                {coordinations.map((c) => (
                  <Link key={c.id} href="/dashboard/organization/coordinations" className="bg-white p-3 rounded-lg border border-slate-200/80 flex items-center justify-between gap-3 text-xs hover:border-blue-200">
                    <span>
                      <span className="font-medium text-slate-800 block">{locale === 'am' ? c.name_am : c.name_en}</span>
                      <span className={headOf(c) ? 'text-slate-500' : 'text-amber-700'}>
                        {headOf(c) || t('No head assigned', 'ኃላፊ አልተመደበም')}
                      </span>
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">{c.code}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* 7 Departments Column */}
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                <Building2 className="text-amber-600" size={18} />
                <h3 className="font-bold text-sm text-slate-800">
                  {t(`Operational Departments (${departments.length})`, `የሥራ ክፍሎች (${departments.length})`)}
                </h3>
              </div>
              <div className="space-y-2">
                {departments.map((d) => (
                  <Link key={d.id} href="/dashboard/organization/departments" className="bg-white p-3 rounded-lg border border-slate-200/80 flex items-center justify-between gap-3 text-xs hover:border-blue-200">
                    <span>
                      <span className="font-medium text-slate-800 block">{locale === 'am' ? d.name_am : d.name_en}</span>
                      <span className={headOf(d) ? 'text-slate-500' : 'text-amber-700'}>
                        {headOf(d) || t('No head assigned', 'ኃላፊ አልተመደበም')}
                      </span>
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">{d.code}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
