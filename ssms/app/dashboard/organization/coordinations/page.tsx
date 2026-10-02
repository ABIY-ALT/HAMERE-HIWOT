'use client';

import React, { useState } from 'react';
import { Network, Search, Layers, Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import type { OrganizationUnit } from '@/types';

export default function CoordinationsPage() {
  const { t, locale } = useLang();
  const [search, setSearch] = useState('');
  const [coordinations, setCoordinations] = useState<OrganizationUnit[]>(
    MOCK_ORG_UNITS.filter((u) => u.unit_type === 'COORDINATION')
  );

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<OrganizationUnit | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [code, setCode] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newCoord: OrganizationUnit = {
      id: `org-c-${Date.now()}`,
      code: code.toUpperCase() || `COORD_${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      unit_type: 'COORDINATION',
      ltree_path: `general_assembly.management_board.executive_committee.${code.toLowerCase()}`,
      parent_id: 'org-006',
      description_en: 'Strategic coordination unit',
      description_am: 'ስልታዊ ቅንጅት አካል',
      is_active: true,
      sort_order: coordinations.length + 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setCoordinations([...coordinations, newCoord]);
    setIsAddModalOpen(false);
    showToast(t(`Coordination ${nameEn} added successfully!`, `ቅንጅት ${nameAm || nameEn} ተጨምሯል!`));

    setNameEn('');
    setNameAm('');
    setCode('');
  };

  const filtered = coordinations.filter((c) =>
    (locale === 'am' ? c.name_am : c.name_en).toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Seven Coordinations', 'ሰባቱ ቅንጅቶች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Coordinating bodies under the Executive Committee responsible for strategic alignment',
              'በሥራ አስፈጻሚ ጉባኤ ሥር ያሉ ስልታዊ ቅንጅትን የሚመሩ አካላት'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Add Coordination', 'ቅንጅት ጨምር')}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Network size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{coordinations.length}</div>
            <div className="text-sm text-slate-500">{t('Total Coordinations', 'አጠቃላይ ቅንጅቶች')}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">
              {coordinations.filter((c) => c.is_active).length}
            </div>
            <div className="text-sm text-slate-500">{t('Active Status', 'ንቁ ሁኔታ')}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">100%</div>
            <div className="text-sm text-slate-500">{t('Category 2 Compliance', 'ምድብ ሁለት ተገዢነት')}</div>
          </div>
        </div>
      </div>

      {/* Search & Grid */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search coordinations...', 'ቅንጅቶችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {filtered.length} {t('Coordinations', 'ቅንጅቶች')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="border border-slate-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all bg-white flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                    {item.code}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {t('Active', 'ንቁ')}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 text-base mb-1">
                  {locale === 'am' ? item.name_am : item.name_en}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {item.ltree_path}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500">
                <span>{t('Sort Order', 'ቅደም ተከተል')}: #{item.sort_order}</span>
                <button
                  onClick={() => setSelectedCoord(item)}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  {t('View Mandate →', 'ዝርዝር እይ →')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Coordination Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add New Strategic Coordination', 'አዲስ ቅንጅት ጨምር')}
        subtitle={t('Subordinate under Executive Committee', 'በሥራ አስፈጻሚ ጉባኤ ሥር የሚመደብ ቅንጅት')}
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Coordination Name (English)', 'የቅንጅቱ ስም (እንግሊዝኛ)')} *
            </label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Technology & Digital Ministry Coordination"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Coordination Name (Amharic)', 'የቅንጅቱ ስም (አማርኛ)')}
            </label>
            <input
              type="text"
              value={nameAm}
              onChange={(e) => setNameAm(e.target.value)}
              placeholder="ለምሳሌ: ቴክኖሎጂና ዲጂታል አገልግሎት ቅንጅት"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Coordination Code', 'የቅንጅት መለያ ኮድ')} *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="COORD_TECH"
              className="form-input text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Create Coordination', 'ቅንጅት ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Mandate Modal */}
      {selectedCoord && (
        <Modal
          isOpen={Boolean(selectedCoord)}
          onClose={() => setSelectedCoord(null)}
          title={locale === 'am' ? selectedCoord.name_am : selectedCoord.name_en}
          subtitle={`${selectedCoord.code} • ${t('Hierarchical Path', 'የመዋቅር ተዋረድ')}: ${selectedCoord.ltree_path}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-blue-50 rounded-xl">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-1">
                {t('Statutory Mandate & Scope', 'ሕጋዊ ሥልጣንና ኃላፊነት')}
              </span>
              <p className="text-slate-800 text-xs leading-relaxed">
                {locale === 'am'
                  ? 'ይህ ቅንጅት በምድብ ሁለት አጥቢያ ሰንበት ትምህርት ቤት መመሪያ መሠረት በሥራ አስፈጻሚ ጉባኤ ሥር ያሉትን ተዛማጅ የሥራ ክፍሎች እቅድ፣ ክትትል እና የተቀናጀ አፈጻጸም የመምራት ኃላፊነት አለበት።'
                  : 'This coordination is mandated under the Category 2 Parish Sunday School framework to align, supervise, and coordinate related operational departments under the Executive Committee.'}
              </p>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Reporting Body', 'ተጠሪነቱ')}</span>
                <span className="font-semibold text-slate-800">Executive Committee (የሥራ አስፈጻሚ ጉባኤ)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Subordination Level', 'ደረጃ')}</span>
                <span className="font-mono text-slate-800">Level 3 (Coordinating Layer)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Status', 'ሁኔታ')}</span>
                <span className="badge badge-success">{t('Active', 'ንቁ')}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCoord(null)}
                className="btn btn-secondary text-xs"
              >
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
