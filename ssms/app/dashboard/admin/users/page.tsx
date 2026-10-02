'use client';

import React, { useState } from 'react';
import { UserPlus, Search, Shield, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_SYSTEM_USERS_FULL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface SystemUserItem {
  id: string;
  username: string;
  name: string;
  name_am: string;
  role: string;
  role_am: string;
  org: string;
  last_login: string;
  is_active: boolean;
  permissions?: string[];
}

export default function AdminUsersPage() {
  const { t, locale } = useLang();
  const [users, setUsers] = useState<SystemUserItem[]>(MOCK_SYSTEM_USERS_FULL as SystemUserItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SystemUserItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [username, setUsername] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [role, setRole] = useState('EDUCATION_OFFICER');
  const [roleAm, setRoleAm] = useState('የትምህርት ኃላፊ');
  const [org, setOrg] = useState('Education Department');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: SystemUserItem = {
      id: `usr-${Date.now()}`,
      username: username.toLowerCase().replace(/\s+/g, ''),
      name: nameEn,
      name_am: nameAm || nameEn,
      role,
      role_am: roleAm || role,
      org,
      last_login: 'Never',
      is_active: true,
      permissions: ['VIEW_DASHBOARD', 'MODULE_OPERATOR'],
    };

    setUsers([newUser, ...users]);
    setIsAddModalOpen(false);
    showToast(t(`User @${newUser.username} created successfully!`, `ተጠቃሚ @${newUser.username} ተፈጥሯል!`));

    // Reset
    setUsername('');
    setNameEn('');
    setNameAm('');
  };

  const filtered = users.filter((u) =>
    (locale === 'am' ? u.name_am : u.name).toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
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
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <UserPlus size={16} />
          {t('Create System User', 'አዲስ ተጠቃሚ ፍጠር')}
        </button>
      </div>

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
          <div className="text-xs text-slate-500 mt-1">{t('Active Logins', 'ንቁ መለያዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Role Enforced Access', 'ሚና ተኮር ጥበቃ')}</div>
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
                <th>{t('Username', 'የመለያ ስም')}</th>
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
                  <td className="font-mono text-xs font-bold text-blue-600">@{u.username}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? u.name_am : u.name}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? u.role_am : u.role}</span>
                  </td>
                  <td className="text-slate-600 text-xs">{u.org}</td>
                  <td className="font-mono text-[11px] text-slate-500">{u.last_login}</td>
                  <td>
                    <span className={u.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                      {u.is_active ? t('Active', 'ንቁ') : t('Disabled', 'የተዘጋ')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Permissions', 'ፈቃዶች')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create System User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Create Sunday School System User', 'አዲስ የስርዓት ተጠቃሚ ፍጠር')}
        subtitle={t('Provision credentialed login account for parish officer', 'ለአጥቢያ አመራር ወይም ሠራተኛ የመግቢያ መለያ ያዘጋጁ')}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Username / Login ID', 'የመለያ ስም')} *
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. solomon.g"
                className="form-input text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Unit Affiliation', 'ክፍል / ተቋም')} *
              </label>
              <input
                type="text"
                required
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                className="form-input text-sm"
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

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Assigned Statutory Role', 'የተሰጠው ሚና')} *
            </label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                if (e.target.value === 'SUPER_ADMIN') setRoleAm('ዋና የበላይ አስተዳዳሪ');
                if (e.target.value === 'MANAGEMENT_BOARD_CHAIR') setRoleAm('የሥራ አመራር ጉባኤ ሰብሳቢ');
                if (e.target.value === 'EDUCATION_OFFICER') setRoleAm('የትምህርት ኃላፊ');
                if (e.target.value === 'FINANCE_OFFICER') setRoleAm('የፋይናንስ ኃላፊ');
              }}
              className="form-input text-sm"
            >
              <option value="EDUCATION_OFFICER">Education Officer (የትምህርት ኃላፊ)</option>
              <option value="FINANCE_OFFICER">Finance Officer (የፋይናንስ ኃላፊ)</option>
              <option value="MANAGEMENT_BOARD_CHAIR">Board Chair (የሥራ አመራር ሰብሳቢ)</option>
              <option value="SUPER_ADMIN">System Administrator (ስርዓት አስተዳዳሪ)</option>
            </select>
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
              {t('Create User Account', 'ተጠቃሚ ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View User Permissions Modal */}
      {selectedUser && (
        <Modal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title={`@${selectedUser.username} — ${locale === 'am' ? selectedUser.name_am : selectedUser.name}`}
          subtitle={`${locale === 'am' ? selectedUser.role_am : selectedUser.role} • ${selectedUser.org}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('User ID', 'መለያ ቁጥር')}:</span>
                <span className="font-mono text-blue-600 font-semibold">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Account Status', 'የመለያ ሁኔታ')}:</span>
                <span className={selectedUser.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                  {selectedUser.is_active ? 'Active Login' : 'Suspended'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Last System Login', 'የመጨረሻ እንቅስቃሴ')}:</span>
                <span className="font-mono text-slate-700">{selectedUser.last_login}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={14} className="text-blue-600" />
                {t('RBAC Enforced System Entitlements', 'የተፈቀዱ የስርዓት ፈቃዶች')}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'VIEW_DASHBOARD',
                  'READ_DIRECTORY',
                  'WRITE_STUDENT_GRADES',
                  'MANAGE_ATTENDANCE',
                  'EXECUTE_REPORTS',
                  'INTERNAL_COMMUNICATIONS',
                ].map((perm) => (
                  <div key={perm} className="p-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center gap-2 text-xs font-mono text-slate-700">
                    <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedUser(null)}
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
