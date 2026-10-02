'use client';

import React from 'react';
import { Shield, Crown, Building2, Network } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';

export default function OrgStructurePage() {
  const { t, locale } = useLang();

  const governanceUnits = MOCK_ORG_UNITS.filter(
    (u) => ['GENERAL_ASSEMBLY', 'AUDIT_COMMITTEE', 'MANAGEMENT_BOARD', 'MANAGEMENT_SECRETARIAT', 'ADVISORY_COUNCIL', 'EXECUTIVE_COMMITTEE', 'EXECUTIVE_SECRETARIAT'].includes(u.unit_type)
  );
  const coordinations = MOCK_ORG_UNITS.filter((u) => u.unit_type === 'COORDINATION');
  const departments = MOCK_ORG_UNITS.filter((u) => u.unit_type === 'DEPARTMENT');

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
                  {t('Seven Coordinations', 'ሰባቱ ቅንጅቶች')}
                </h3>
              </div>
              <div className="space-y-2">
                {coordinations.map((c) => (
                  <div key={c.id} className="bg-white p-3 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {locale === 'am' ? c.name_am : c.name_en}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">{c.code}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 7 Departments Column */}
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                <Building2 className="text-amber-600" size={18} />
                <h3 className="font-bold text-sm text-slate-800">
                  {t('Seven Operational Departments', 'ሰባቱ የሥራ ክፍሎች')}
                </h3>
              </div>
              <div className="space-y-2">
                {departments.map((d) => (
                  <div key={d.id} className="bg-white p-3 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {locale === 'am' ? d.name_am : d.name_en}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">{d.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
