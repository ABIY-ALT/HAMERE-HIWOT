'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2, Lock, Key } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ROLES } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import type { Role } from '@/types';

export default function RolesPage() {
  const { t, locale } = useLang();
  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descAm, setDescAm] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    const newRole: Role = {
      id: `role-${Date.now()}`,
      code: code.toUpperCase().replace(/\s+/g, '_'),
      name_en: nameEn,
      name_am: nameAm || nameEn,
      description_en: descEn || nameEn,
      description_am: descAm || nameAm || nameEn,
      is_system_role: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setRoles([newRole, ...roles]);
    setIsAddModalOpen(false);
    showToast(t(`Custom role ${newRole.code} created!`, `አዲስ ሚና ${newRole.code} ተፈጥሯል!`));

    // Reset
    setCode('');
    setNameEn('');
    setNameAm('');
    setDescEn('');
    setDescAm('');
  };

  const filtered = roles.filter((r) =>
    (locale === 'am' ? r.name_am : r.name_en).toLowerCase().includes(search.toLowerCase()) ||
    r.code.toLowerCase().includes(search.toLowerCase())
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Role-Based Access Control (RBAC)', 'የስርዓት ሚናዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school governance, committee, officer, and ministry roles',
              'የአመራር፣ የክትትል፣ የአስተማሪና የአስተዳደር ሚናዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Create Custom Role', 'አዲስ ሚና ፍጠር')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((role) => (
          <div key={role.id} className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {role.code}
                </span>
                {role.is_system_role && (
                  <span className="badge badge-warning inline-flex items-center gap-1 text-[10px]">
                    <Lock size={10} />
                    {t('System Protected', 'የስርዓት ሚና')}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 text-base mb-1">
                {locale === 'am' ? role.name_am : role.name_en}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {locale === 'am' ? role.description_am : role.description_en}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} />
                {t('Active', 'ንቁ')}
              </span>
              <button
                onClick={() => setSelectedRole(role)}
                className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                {t('Edit Permissions →', 'ፈቃዶችን አርትዕ →')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Role Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Create Custom RBAC Role', 'አዲስ ሚና ፍጠር')}
        subtitle={t('Define specialized role code and mandate description', 'የሚናውን ኮድና መግለጫ ያስገቡ')}
      >
        <form onSubmit={handleCreateRole} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Role System Code', 'የሚና ኮድ')} *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. OUTREACH_COORDINATOR"
              className="form-input text-sm font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Name (English)', 'የሚና ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Outreach Coordinator"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Name (Amharic)', 'የሚና ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: የስብከተ ወንጌል አስተባባሪ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Description (English)', 'መግለጫ (እንግሊዝኛ)')}
            </label>
            <input
              type="text"
              value={descEn}
              onChange={(e) => setDescEn(e.target.value)}
              placeholder="Mandate and scope of this role..."
              className="form-input text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs py-2 px-4">
              {t('Create Role', 'ሚና ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Permissions Modal */}
      {selectedRole && (
        <Modal
          isOpen={Boolean(selectedRole)}
          onClose={() => setSelectedRole(null)}
          title={`${selectedRole.code}`}
          subtitle={locale === 'am' ? selectedRole.name_am : selectedRole.name_en}
        >
          <div className="space-y-4 text-sm">
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-xl">
              {locale === 'am' ? selectedRole.description_am : selectedRole.description_en}
            </p>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Key size={14} className="text-blue-600" />
                {t('Configured Permissions Matrix', 'የተፈቀዱ ፈቃዶች ማትሪክስ')}
              </h4>
              <div className="space-y-2">
                {[
                  { key: 'PEOPLE_MANAGE', label: 'Manage Member & Student Directory' },
                  { key: 'FINANCE_APPROVE', label: 'Financial Authorizations & Ledger View' },
                  { key: 'CURRICULUM_WRITE', label: 'Modify Curriculum & Assign Grades' },
                  { key: 'PROPERTY_MANAGE', label: 'Asset Custody & Stocktake Audits' },
                  { key: 'GOVERNANCE_VIEW', label: 'View Statutory Assemblies & Audit Records' },
                ].map((p, idx) => (
                  <label key={p.key} className="flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-lg text-xs cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" defaultChecked={idx % 2 === 0 || selectedRole.is_system_role} className="rounded text-blue-600" />
                    <span className="font-mono font-semibold text-slate-800">{p.key}</span>
                    <span className="text-slate-400 text-[11px] ml-auto">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  showToast(t(`Permissions updated for ${selectedRole.code}!`, `ለ${selectedRole.code} ፈቃዶች ተስተካክለዋል!`));
                  setSelectedRole(null);
                }}
                className="btn btn-primary text-xs py-2 px-3"
              >
                {t('Save Permissions', 'ፈቃዶችን መዝግብ')}
              </button>
              <button
                onClick={() => setSelectedRole(null)}
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
