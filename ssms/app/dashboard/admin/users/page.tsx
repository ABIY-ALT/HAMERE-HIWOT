'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Search, Shield, CheckCircle2, KeyRound, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { demoRoles, demoUnits, demoUsers } from '@/lib/admin/demo';
import type { AdminRoleRow, AdminUnitRow, AdminUserRow, LoadMode } from '@/lib/admin/types';
import { changeUserRole, createUser, loadUsers, resetUserPassword, setUserActive } from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function AdminUsersPage() {
  const { t, locale } = useLang();
  const { user: me } = useAuth();

  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [units, setUnits] = useState<AdminUnitRow[]>([]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [roleId, setRoleId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [formError, setFormError] = useState('');

  // Details modal
  const [editRoleId, setEditRoleId] = useState('');
  const [editUnitId, setEditUnitId] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const live = mode === 'live';

  const refresh = useCallback(async () => {
    const res = await loadUsers();
    if (res.mode === 'demo') {
      setUsers(demoUsers());
      setRoles(demoRoles());
      setUnits(demoUnits());
    } else if (res.mode === 'live') {
      setUsers(res.data.users);
      setRoles(res.data.roles);
      setUnits(res.data.units);
    } else {
      setLoadError(res.error);
    }
    setMode(res.mode);
    return res.mode;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const formatLastLogin = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === 'am' ? 'am-ET' : 'en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : t('Never', 'ገና አልገቡም');

  const openCreate = () => {
    setFormError('');
    if (!roleId && roles[0]) setRoleId(roles[0].id);
    if (!unitId && units[0]) setUnitId(units[0].id);
    setIsAddModalOpen(true);
  };

  const openDetails = (u: AdminUserRow) => {
    setSelectedUser(u);
    setEditRoleId(u.role_id ?? roles[0]?.id ?? '');
    setEditUnitId(u.org_id ?? units[0]?.id ?? '');
    setNewPassword('');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const role = roles.find((r) => r.id === roleId);
    const unit = units.find((u) => u.id === unitId);

    if (live) {
      setBusy(true);
      const res = await createUser({ phone, password, nameEn, nameAm, gender, roleId, unitId });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      await refresh();
    } else {
      setUsers((prev) => [
        {
          id: `demo-${Date.now()}`,
          username: phone.trim(),
          name: nameEn,
          name_am: nameAm || nameEn,
          role_id: roleId,
          role: role?.name_en ?? '—',
          role_am: role?.name_am ?? '—',
          org_id: unitId,
          org: unit?.name_en ?? '—',
          org_am: unit?.name_am ?? '—',
          last_login: null,
          is_active: true,
          permissions: role?.permissions ?? [],
        },
        ...prev,
      ]);
    }

    setIsAddModalOpen(false);
    showToast('success', t(`User ${phone.trim()} created`, `ተጠቃሚ ${phone.trim()} ተፈጥሯል`));
    setPhone('');
    setPassword('');
    setNameEn('');
    setNameAm('');
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return;
    const role = roles.find((r) => r.id === editRoleId);
    const unit = units.find((u) => u.id === editUnitId);

    if (live) {
      setBusy(true);
      const res = await changeUserRole(selectedUser.id, editRoleId, editUnitId);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      await refresh();
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                role_id: editRoleId,
                role: role?.name_en ?? u.role,
                role_am: role?.name_am ?? u.role_am,
                org_id: editUnitId,
                org: unit?.name_en ?? u.org,
                org_am: unit?.name_am ?? u.org_am,
                permissions: role?.permissions ?? [],
              }
            : u
        )
      );
    }
    setSelectedUser(null);
    showToast('success', t('Role updated', 'ሚና ተቀይሯል'));
  };

  const handleToggleActive = async () => {
    if (!selectedUser) return;
    const next = !selectedUser.is_active;
    if (live) {
      setBusy(true);
      const res = await setUserActive(selectedUser.id, next);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      await refresh();
    } else {
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, is_active: next } : u)));
    }
    setSelectedUser(null);
    showToast('success', next ? t('Account enabled', 'መለያ ተከፍቷል') : t('Account disabled', 'መለያ ተዘግቷል'));
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (newPassword.length < 8) {
      return showToast('error', t('Password must be at least 8 characters', 'የይለፍ ቃል ቢያንስ 8 ፊደል መሆን አለበት'));
    }
    if (live) {
      setBusy(true);
      const res = await resetUserPassword(selectedUser.id, newPassword);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
    }
    setNewPassword('');
    showToast('success', t('Password changed', 'የይለፍ ቃል ተቀይሯል'));
  };

  const q = search.toLowerCase();
  const filtered = users.filter(
    (u) =>
      (locale === 'am' ? u.name_am : u.name).toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (locale === 'am' ? u.role_am : u.role).toLowerCase().includes(q)
  );

  const isSelf = Boolean(selectedUser && me && me.systemUser.id === selectedUser.id);

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('System User Accounts', 'የስርዓት ተጠቃሚዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school authentication accounts, role assignments, and access control',
              'የተጠቃሚዎች መለያ፣ የተሰጣቸው ሚና እና የመዳረሻ ፈቃዶች'
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <UserPlus size={16} />
          {t('Create System User', 'አዲስ ተጠቃሚ ፍጠር')}
        </button>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{users.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total System Accounts', 'አጠቃላይ ተጠቃሚዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {users.filter((u) => u.is_active).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Accounts', 'ንቁ መለያዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-red-600">
            {users.filter((u) => !u.is_active).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Disabled Accounts', 'የተዘጉ መለያዎች')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search users...', 'ተጠቃሚዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('users', 'ተጠቃሚዎች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Phone / Login', 'ስልክ / መግቢያ')}</th>
                <th>{t('User Full Name', 'ሙሉ ስም')}</th>
                <th>{t('Assigned Role', 'የተሰጠው ሚና')}</th>
                <th>{t('Unit Affiliation', 'ክፍል / ተቋም')}</th>
                <th>{t('Last Active', 'የመጨረሻ እንቅስቃሴ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{u.username}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? u.name_am : u.name}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? u.role_am : u.role}</span>
                  </td>
                  <td className="text-slate-600 text-xs">{locale === 'am' ? u.org_am : u.org}</td>
                  <td className="font-mono text-[11px] text-slate-500">{formatLastLogin(u.last_login)}</td>
                  <td>
                    <span className={u.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                      {u.is_active ? t('Active', 'ንቁ') : t('Disabled', 'የተዘጋ')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => openDetails(u)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Manage', 'አስተዳድር')}
                    </button>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-sm text-slate-400 py-8">
                    {t('No users found', 'ምንም ተጠቃሚ አልተገኘም')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create System User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Create Sunday School System User', 'አዲስ የስርዓት ተጠቃሚ ፍጠር')}
        subtitle={t('The user signs in with this phone number and password', 'ተጠቃሚው በዚህ ስልክ ቁጥርና የይለፍ ቃል ይገባል')}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Phone Number (login)', 'ስልክ ቁጥር (መግቢያ)')} *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09..."
                className="form-input text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Initial Password', 'የመጀመሪያ የይለፍ ቃል')} *
              </label>
              <input
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('At least 8 characters', 'ቢያንስ 8 ፊደል')}
                className="form-input text-sm font-mono"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Full Name (English)', 'ሙሉ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Solomon Girma"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Full Name (Amharic)', 'ሙሉ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ሰሎሞን ግርማ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Gender', 'ጾታ')} *
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE')}
                className="form-input text-sm"
              >
                <option value="MALE">{t('Male', 'ወንድ')}</option>
                <option value="FEMALE">{t('Female', 'ሴት')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role', 'ሚና')} *
              </label>
              <select
                required
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="form-input text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {locale === 'am' ? r.name_am : r.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Unit', 'ክፍል')} *
              </label>
              <select
                required
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="form-input text-sm"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {locale === 'am' ? u.name_am : u.name_en}
                  </option>
                ))}
              </select>
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
              {busy ? t('Creating…', 'በመፍጠር ላይ…') : t('Create User Account', 'ተጠቃሚ ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage User Modal */}
      {selectedUser && (
        <Modal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title={`${locale === 'am' ? selectedUser.name_am : selectedUser.name} — ${selectedUser.username}`}
          subtitle={`${locale === 'am' ? selectedUser.role_am : selectedUser.role} • ${
            locale === 'am' ? selectedUser.org_am : selectedUser.org
          }`}
        >
          <div className="space-y-5 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t('Account Status', 'የመለያ ሁኔታ')}:</span>
                <span className={selectedUser.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                  {selectedUser.is_active ? t('Active', 'ንቁ') : t('Disabled', 'የተዘጋ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Last System Login', 'የመጨረሻ እንቅስቃሴ')}:</span>
                <span className="font-mono text-slate-700">{formatLastLogin(selectedUser.last_login)}</span>
              </div>
            </div>

            {/* Role assignment */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {t('Role & Unit', 'ሚና እና ክፍል')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={editRoleId}
                  onChange={(e) => setEditRoleId(e.target.value)}
                  disabled={isSelf}
                  className="form-input text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {locale === 'am' ? r.name_am : r.name_en}
                    </option>
                  ))}
                </select>
                <select
                  value={editUnitId}
                  onChange={(e) => setEditUnitId(e.target.value)}
                  disabled={isSelf}
                  className="form-input text-sm"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {locale === 'am' ? u.name_am : u.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSaveRole}
                disabled={busy || isSelf || !editRoleId || !editUnitId}
                className="btn btn-primary text-xs py-2 px-3 disabled:opacity-50"
              >
                {t('Save Role', 'ሚና መዝግብ')}
              </button>
              {isSelf && (
                <p className="text-xs text-slate-400">
                  {t('You cannot change your own role or disable your own account.', 'የራስዎን ሚና መቀየር ወይም መለያዎን መዝጋት አይችሉም።')}
                </p>
              )}
            </div>

            {/* Password reset */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound size={14} className="text-blue-600" />
                {t('Set New Password', 'አዲስ የይለፍ ቃል')}
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('At least 8 characters', 'ቢያንስ 8 ፊደል')}
                  className="form-input text-sm font-mono flex-1"
                  autoComplete="new-password"
                />
                <button
                  onClick={handleResetPassword}
                  disabled={busy || !newPassword}
                  className="btn btn-secondary text-xs disabled:opacity-50"
                >
                  {t('Change', 'ቀይር')}
                </button>
              </div>
            </div>

            {/* Permissions from the assigned role */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={14} className="text-blue-600" />
                {t('Permissions from Role', 'ከሚናው የተገኙ ፈቃዶች')} ({selectedUser.permissions.length})
              </h4>
              {selectedUser.permissions.length === 0 ? (
                <p className="text-xs text-slate-400">{t('No permissions', 'ምንም ፈቃድ የለም')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {selectedUser.permissions.map((perm) => (
                    <div
                      key={perm}
                      className="p-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center gap-2 text-xs font-mono text-slate-700"
                    >
                      <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                      <span>{perm}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2 border-t border-slate-100">
              <button
                onClick={handleToggleActive}
                disabled={busy || isSelf}
                className={`btn text-xs disabled:opacity-50 ${
                  selectedUser.is_active ? 'btn-danger' : 'btn-primary'
                }`}
              >
                {selectedUser.is_active
                  ? t('Disable Account', 'መለያ ዝጋ')
                  : t('Enable Account', 'መለያ ክፈት')}
              </button>
              <button onClick={() => setSelectedUser(null)} className="btn btn-secondary text-xs">
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
