'use client';

import React, { useState } from 'react';
import { Building2, Search, Plus, CheckCircle2, Briefcase } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import type { OrganizationUnit } from '@/types';

export default function DepartmentsPage() {
  const { t, locale } = useLang();
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState<OrganizationUnit[]>(
    MOCK_ORG_UNITS.filter((u) => u.unit_type === 'DEPARTMENT')
  );

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<OrganizationUnit | null>(null);
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
    const newDept: OrganizationUnit = {
      id: `org-d-${Date.now()}`,
      code: code.toUpperCase() || `DEPT_${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      unit_type: 'DEPARTMENT',
      ltree_path: `general_assembly.management_board.executive_committee.${code.toLowerCase()}`,
      parent_id: 'org-006',
      description_en: 'Operational department',
      description_am: 'የሥራ ክፍል',
      is_active: true,
      sort_order: departments.length + 20,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setDepartments([...departments, newDept]);
    setIsAddModalOpen(false);
    showToast(t(`Department ${nameEn} added successfully!`, `ክፍል ${nameAm || nameEn} ተጨምሯል!`));

    setNameEn('');
    setNameAm('');
    setCode('');
  };

  const filtered = departments.filter((d) =>
    (locale === 'am' ? d.name_am : d.name_en).toLowerCase().includes(search.toLowerCase()) ||
    d.code.toLowerCase().includes(search.toLowerCase())
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
            {t('Operational Departments', 'ክፍሎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Seven operational departments executing Sunday school ministries, education, and services',
              'የሰንበት ት/ቤቱን ትምህርት፣ አገልግሎት እና አስተዳደራዊ ሥራዎችን የሚመሩ 7 የሥራ ክፍሎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Add Department', 'ክፍል ጨምር')}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Building2 size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{departments.length}</div>
            <div className="text-sm text-slate-500">{t('Total Departments', 'አጠቃላይ ክፍሎች')}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">
              {departments.filter((d) => d.is_active).length}
            </div>
            <div className="text-sm text-slate-500">{t('Active Departments', 'ንቁ ክፍሎች')}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Briefcase size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{departments.length} / 7</div>
            <div className="text-sm text-slate-500">{t('Mandated Quotas Filled', 'የተሟሉ ክፍሎች')}</div>
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
              placeholder={t('Search departments...', 'ክፍሎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {filtered.length} {t('Departments', 'ክፍሎች')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="border border-slate-100 rounded-xl p-5 hover:border-amber-200 hover:shadow-sm transition-all bg-white flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md">
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
                  onClick={() => setSelectedDept(item)}
                  className="text-amber-600 font-semibold hover:underline"
                >
                  {t('Manage Units →', 'አስተዳድር →')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Department Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add Operational Department', 'አዲስ የሥራ ክፍል ጨምር')}
        subtitle={t('Category 2 Parish operational structure', 'የምድብ ሁለት አጥቢያ የሥራ ክፍል')}
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Department Name (English)', 'የክፍል ስም (እንግሊዝኛ)')} *
            </label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Publications & Translation Department"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Department Name (Amharic)', 'የክፍል ስም (አማርኛ)')}
            </label>
            <input
              type="text"
              value={nameAm}
              onChange={(e) => setNameAm(e.target.value)}
              placeholder="ለምሳሌ: ህትመትና ትርጉም ክፍል"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Department Code', 'የክፍል መለያ ኮድ')} *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="DEPT_PUB"
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
              {t('Create Department', 'ክፍል ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage Department Units Modal */}
      {selectedDept && (
        <Modal
          isOpen={Boolean(selectedDept)}
          onClose={() => setSelectedDept(null)}
          title={locale === 'am' ? selectedDept.name_am : selectedDept.name_en}
          subtitle={`${selectedDept.code} • ${selectedDept.ltree_path}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-amber-50 rounded-xl">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1">
                {t('Operational Department Profile', 'የሥራ ክፍል መገለጫ')}
              </span>
              <p className="text-slate-800 text-xs leading-relaxed">
                {locale === 'am'
                  ? 'ይህ ክፍል በምድብ ሁለት አጥቢያ ሰንበት ትምህርት ቤት የተደነገጉትን የዕለት ተዕለት ተግባራት፣ መርሃ ግብሮች እና አገልግሎቶች የሚያከናውን ራሱን የቻለ የሥራ ክፍል ነው።'
                  : 'This department executes daily ministerial activities, liturgical services, and operations mandated by the Category 2 Parish constitution.'}
              </p>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Parent Body', 'ተጠሪ አካል')}</span>
                <span className="font-semibold text-slate-800">Executive Committee (የሥራ አስፈጻሚ ጉባኤ)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Active Staff / Servants Assigned', 'የተመደቡ አገልጋዮች')}</span>
                <span className="font-bold text-blue-600">8 Servants</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Status', 'ሁኔታ')}</span>
                <span className="badge badge-success">{t('Active', 'ንቁ')}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDept(null)}
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
