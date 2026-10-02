'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, CheckCircle2, Lock, Key, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { demoPermissions, demoRoles } from '@/lib/admin/demo';
import type { AdminPermissionRow, AdminRoleRow, LoadMode } from '@/lib/admin/types';
import { createRole, loadRoles, setRolePermissions } from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function RolesPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissionRow[]>([]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AdminRoleRow | null>(null);
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descAm, setDescAm] = useState('');
  const [formError, setFormError] = useState('');

  const live = mode === 'live';

  const refresh = useCallback(async () => {
    const res = await loadRoles();
    if (res.mode === 'demo') {
      setRoles(demoRoles());
      setPermissions(demoPermissions());
    } else if (res.mode === 'live') {
      setRoles(res.data.roles);
      setPermissions(res.data.permissions);
    } else {
      setLoadError(res.error);
    }
    setMode(res.mode);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const openRole = (role: AdminRoleRow) => {
    setSelectedRole(role);
    setCheckedCodes(new Set(role.permissions));
  };

  const toggleCode = (permCode: string) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(permCode)) next.delete(permCode);
      else next.add(permCode);
      return next;
    });
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const normalizedCode = code.trim().toUpperCase().replace(/[\s-]+/g, '_');

    if (live) {
      setBusy(true);
      const res = await createRole({ code, nameEn, nameAm, descEn, descAm });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      await refresh();
    } else {
      setRoles((prev) => [
        {
          id: `role-${Date.now()}`,
          code: normalizedCode,
          name_en: nameEn,
          name_am: nameAm || nameEn,
          description_en: descEn || null,
          description_am: descAm || null,
          is_system_role: false,
          is_active: true,
          permissions: [],
        },
        ...prev,
      ]);
    }

    setIsAddModalOpen(false);
    showToast('success', t(`Role ${normalizedCode} created`, `ሚና ${normalizedCode} ተፈጥሯል`));
    setCode('');
    setNameEn('');
    setNameAm('');
    setDescEn('');
    setDescAm('');
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    const codes = Array.from(checkedCodes);
    if (live) {
      setBusy(true);
      const res = await setRolePermissions(selectedRole.id, codes);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      await refresh();
    } else {
      setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? { ...r, permissions: codes } : r)));
    }
    showToast('success', t(`Permissions saved for ${selectedRole.code}`, `ለ${selectedRole.code} ፈቃዶች ተመዝግበዋል`));
    setSelectedRole(null);
  };

  const categories = Array.from(new Set(permissions.map((p) => p.category)));

  const filtered = roles.filter((r) =>
    (locale === 'am' ? r.name_am : r.name_en).toLowerCase().includes(search.toLowerCase()) ||
    r.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

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
          onClick={() => {
            setFormError('');
            setIsAddModalOpen(true);
          }}
          disabled={mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          {t('Create Custom Role', 'አዲስ ሚና ፍጠር')}
        </button>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      <div className="relative max-w-sm">
        <input
          type="text"
          placeholder={t('Search roles...', 'ሚናዎችን ፈልግ...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input text-sm"
        />
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
                {role.permissions.length} {t('permissions', 'ፈቃዶች')}
              </span>
              <button
                onClick={() => openRole(role)}
                className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                {role.is_system_role
                  ? t('View Permissions →', 'ፈቃዶችን ይመልከቱ →')
                  : t('Edit Permissions →', 'ፈቃዶችን አርትዕ →')}
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
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Description (Amharic)', 'መግለጫ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={descAm}
                onChange={(e) => setDescAm(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
              {busy ? t('Creating…', 'በመፍጠር ላይ…') : t('Create Role', 'ሚና ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Role Permissions Modal */}
      {selectedRole && (
        <Modal
          isOpen={Boolean(selectedRole)}
          onClose={() => setSelectedRole(null)}
          title={`${selectedRole.code}`}
          subtitle={locale === 'am' ? selectedRole.name_am : selectedRole.name_en}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-sm">
            {(selectedRole.description_en || selectedRole.description_am) && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                {locale === 'am' ? selectedRole.description_am : selectedRole.description_en}
              </p>
            )}

            {selectedRole.is_system_role && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2">
                <Lock size={13} />
                {t(
                  'This is a system role. Its permissions are locked so administrators cannot lock themselves out.',
                  'ይህ የስርዓት ሚና ነው። ፈቃዶቹ ተቆልፈዋል።'
                )}
              </p>
            )}

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Key size={14} className="text-blue-600" />
                {t('Permissions', 'ፈቃዶች')} ({checkedCodes.size}/{permissions.length})
              </h4>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{cat}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {permissions
                        .filter((p) => p.category === cat)
                        .map((p) => (
                          <label
                            key={p.code}
                            className={`flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-lg text-xs ${
                              selectedRole.is_system_role ? 'opacity-70' : 'cursor-pointer hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checkedCodes.has(p.code)}
                              onChange={() => toggleCode(p.code)}
                              disabled={selectedRole.is_system_role}
                              className="rounded text-blue-600"
                            />
                            <span className="flex flex-col">
                              <span className="font-mono font-semibold text-slate-800">{p.code}</span>
                              <span className="text-slate-400 text-[11px]">
                                {locale === 'am' ? p.name_am : p.name_en}
                              </span>
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {!selectedRole.is_system_role ? (
                <button
                  onClick={handleSavePermissions}
                  disabled={busy}
                  className="btn btn-primary text-xs py-2 px-3 disabled:opacity-60"
                >
                  {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Permissions', 'ፈቃዶችን መዝግብ')}
                </button>
              ) : (
                <span />
              )}
              <button onClick={() => setSelectedRole(null)} className="btn btn-secondary text-xs">
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
