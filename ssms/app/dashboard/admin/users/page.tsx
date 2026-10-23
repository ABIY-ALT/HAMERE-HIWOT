'use client';

// Accounts that sign in: who they are, every role they hold (a role in a unit,
// some only until a date), what those roles let them do, their password, and
// on/off. Nobody can give a role with more rights than they hold (lib/auth/grant).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Search, Shield, CheckCircle2, KeyRound, AlertCircle, Send, Plus, X, Clock, ChevronDown } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { demoPermissions, demoRoles, demoUnits, demoUsers } from '@/lib/admin/demo';
import type { AdminPermissionRow, AdminRoleRow, AdminUnitRow, AdminUserRow, LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { addAssignment, createUser, issueTemporaryPassword, loadSelfLogin, loadUsers, removeAssignment, setSelfLogin, setUserActive, type PasswordOutcome } from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;
const SOON_DAYS = 30;

export default function AdminUsersPage() {
  const { t, locale } = useLang();
  const { user: me } = useAuth();

  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [units, setUnits] = useState<AdminUnitRow[]>([]);
  const [catalogue, setCatalogue] = useState<AdminPermissionRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED' | 'ENDING'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [phone, setPhone] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [roleId, setRoleId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [formError, setFormError] = useState('');

  // Details modal
  const [addRoleId, setAddRoleId] = useState('');
  const [addUnitId, setAddUnitId] = useState('');
  const [addUntil, setAddUntil] = useState('');
  /** How the last new / reset password reached the person (shown once) */
  const [issued, setIssued] = useState<{ name: string; outcome: Extract<PasswordOutcome, { ok: true }> } | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  /** null = not known (demo mode, or no right to change it) */
  const [selfLogin, setSelfLoginState] = useState<boolean | null>(null);
  // "Ending soon" is counted from when the page opened
  const [now] = useState(() => Date.now());

  const live = mode === 'live';
  const activeRoles = roles.filter((r) => r.is_active);
  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  const apply = useCallback((res: Awaited<ReturnType<typeof loadUsers>>) => {
    if (res.mode === 'demo') {
      setUsers(demoUsers());
      setRoles(demoRoles());
      setUnits(demoUnits());
      setCatalogue(demoPermissions());
    } else if (res.mode === 'live') {
      setUsers(res.data.users);
      setRoles(res.data.roles);
      setUnits(res.data.units);
      setCatalogue(res.data.permissions);
    } else {
      setLoadError(res.error);
    }
    setMode(res.mode);
  }, []);

  const refresh = useCallback(async () => apply(await loadUsers()), [apply]);

  useEffect(() => {
    loadUsers().then(apply);
    loadSelfLogin().then(setSelfLoginState);
  }, [apply]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const formatLastLogin = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === 'am' ? 'am-ET' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : t('Never', 'ገና አልገቡም');

  const roleName = (r: { role: string; role_am: string }) => (locale === 'am' ? r.role_am : r.role);
  const unitName = (u: { unit: string; unit_am: string }) => (locale === 'am' ? u.unit_am : u.unit);
  const soon = (iso: string | null) => Boolean(iso && Date.parse(iso) - now < SOON_DAYS * 86_400_000);

  const openCreate = () => {
    setFormError('');
    if (!roleId && activeRoles[0]) setRoleId(activeRoles[0].id);
    if (!unitId && units[0]) setUnitId(units[0].id);
    setIsAddModalOpen(true);
  };

  const openDetails = (u: AdminUserRow) => {
    setSelectedId(u.id);
    setAddRoleId(activeRoles[0]?.id ?? '');
    setAddUnitId(units[0]?.id ?? '');
    setAddUntil('');
    setOpenCats(new Set());
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const role = roles.find((r) => r.id === roleId);
    const unit = units.find((u) => u.id === unitId);

    if (live) {
      setBusy(true);
      const res = await createUser({ phone, nameEn, nameAm, gender, roleId, unitId });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setIssued({ name: nameAm || nameEn, outcome: res });
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
          assignments: role
            ? [{ id: `demo-a-${Date.now()}`, role_id: role.id, role: role.name_en, role_am: role.name_am, unit_id: unitId, unit: unit?.name_en ?? '—', unit_am: unit?.name_am ?? '—', expires_at: null }]
            : [],
        },
        ...prev,
      ]);
    }

    setIsAddModalOpen(false);
    showToast('success', t(`User ${phone.trim()} created`, `ተጠቃሚ ${phone.trim()} ተፈጥሯል`));
    setPhone('');
    setNameEn('');
    setNameAm('');
  };

  const handleAddRole = async () => {
    if (!selectedUser) return;
    if (!live) return showToast('error', t('Connect the database to change roles', 'ሚና ለመቀየር የመረጃ ቋቱን ያገናኙ'));
    setBusy(true);
    const res = await addAssignment({ userId: selectedUser.id, roleId: addRoleId, unitId: addUnitId, until: addUntil });
    setBusy(false);
    if (!res.ok) return showToast('error', res.error);
    await refresh();
    setAddUntil('');
    showToast('success', t('Role given', 'ሚና ተሰጥቷል'));
  };

  const handleRemoveRole = async (assignmentId: string) => {
    if (!live) return showToast('error', t('Connect the database to change roles', 'ሚና ለመቀየር የመረጃ ቋቱን ያገናኙ'));
    if (!window.confirm(t('Take this role away?', 'ይህ ሚና ይነሳ?'))) return;
    setBusy(true);
    const res = await removeAssignment(assignmentId);
    setBusy(false);
    if (!res.ok) return showToast('error', res.error);
    await refresh();
    showToast('success', t('Role taken away', 'ሚናው ተነስቷል'));
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
    setSelectedId(null);
    showToast('success', next ? t('Account enabled', 'መለያ ተከፍቷል') : t('Account disabled', 'መለያ ተዘግቷል'));
  };

  const handleIssue = async () => {
    if (!selectedUser) return;
    const name = locale === 'am' ? selectedUser.name_am : selectedUser.name;
    if (!window.confirm(t(
      `Give ${name} a new temporary password?\n\nTheir current one stops working. They choose their own when they sign in.`,
      `ለ${name} አዲስ ጊዜያዊ የይለፍ ቃል ይሰጥ?\n\nአሁን ያለው መሥራት ያቆማል። ሲገቡ የራሳቸውን ይመርጣሉ።`
    ))) return;
    setBusy(true);
    const res = await issueTemporaryPassword(selectedUser.id);
    setBusy(false);
    if (!res.ok) return showToast('error', res.error);
    setIssued({ name, outcome: res });
  };

  const q = search.toLowerCase();
  const filtered = users.filter(
    (u) =>
      ((locale === 'am' ? u.name_am : u.name).toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.assignments.some((a) => roleName(a).toLowerCase().includes(q) || unitName(a).toLowerCase().includes(q))) &&
      (roleFilter === 'ALL' || u.assignments.some((a) => a.role_id === roleFilter)) &&
      (unitFilter === 'ALL' || u.assignments.some((a) => a.unit_id === unitFilter)) &&
      (statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && u.is_active) ||
        (statusFilter === 'DISABLED' && !u.is_active) ||
        (statusFilter === 'ENDING' && u.assignments.some((a) => soon(a.expires_at))))
  );
  const ending = users.filter((u) => u.is_active && u.assignments.some((a) => soon(a.expires_at))).length;

  const isSelf = Boolean(selectedUser && me && me.systemUser.id === selectedUser.id);

  /** The account's permissions by area, with their names */
  const grouped = useMemo(() => {
    if (!selectedUser) return [] as [string, AdminPermissionRow[]][];
    const held = new Set(selectedUser.permissions);
    const by = new Map<string, AdminPermissionRow[]>();
    for (const p of catalogue) if (held.has(p.code)) by.set(p.category, [...(by.get(p.category) ?? []), p]);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedUser, catalogue]);

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Users', 'ተጠቃሚዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Who can sign in, the roles they hold in each unit, and what those roles allow', 'ማን መግባት እንደሚችል፣ በየክፍሉ የያዙት ሚናና ሚናው የሚፈቅደው')}
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <UserPlus size={16} />
          {t('Add user', 'ተጠቃሚ ጨምር')}
        </button>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      {selfLogin !== null && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold text-slate-800">{t('People make their own login', 'ሰዎች የራሳቸውን መግቢያ ይሠራሉ')}</div>
            <div className="text-xs text-slate-500">
              {t(
                'Members, teachers and servants in the records who have no login can get one on Telegram (bot 🔑, or “First time?” on the sign-in page). They get the Member role: their own pages only.',
                'በመዝገቡ ያሉና መግቢያ የሌላቸው አባላት፣ መምህራንና አገልጋዮች በቴሌግራም ያገኛሉ (በቦቱ 🔑፣ ወይም በመግቢያ ገጹ «የመጀመሪያ ጊዜ?»)። «አባል» ሚና ያገኛሉ፦ የራሳቸው ገጾች ብቻ።'
              )}
            </div>
          </div>
          <button
            onClick={async () => {
              const next = !selfLogin;
              const res = await setSelfLogin(next);
              if (!res.ok) return showToast('error', res.error);
              setSelfLoginState(next);
              showToast('success', next ? t('Self-made logins are on', 'የራስ መግቢያ ተከፍቷል') : t('Self-made logins are off', 'የራስ መግቢያ ተዘግቷል'));
            }}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${selfLogin ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
          >
            <span className={`w-8 h-4 rounded-full relative transition ${selfLogin ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selfLogin ? 'left-4' : 'left-0.5'}`} />
            </span>
            {selfLogin ? t('On', 'ተከፍቷል') : t('Off', 'ተዘግቷል')}
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={users.length} label={t('All accounts', 'ሁሉም መለያዎች')} onClick={() => setStatusFilter('ALL')} active={statusFilter === 'ALL'} />
        <Kpi value={users.filter((u) => u.is_active).length} label={t('Active', 'ንቁ')} tone="text-emerald-600" onClick={() => setStatusFilter('ACTIVE')} active={statusFilter === 'ACTIVE'} />
        <Kpi value={users.filter((u) => !u.is_active).length} label={t('Switched off', 'የተዘጉ')} tone="text-red-600" onClick={() => setStatusFilter('DISABLED')} active={statusFilter === 'DISABLED'} />
        <Kpi value={ending} label={t(`Roles ending within ${SOON_DAYS} days`, `በ${SOON_DAYS} ቀን የሚያልቁ ሚናዎች`)} tone="text-amber-600" onClick={() => setStatusFilter('ENDING')} active={statusFilter === 'ENDING'} />
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search name, phone, role…', 'ስም፣ ስልክ፣ ሚና ፈልግ…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All roles', 'ሁሉም ሚናዎች')}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{locale === 'am' ? r.name_am : r.name_en}</option>)}
            </select>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All units', 'ሁሉም ክፍሎች')}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
            </select>
            <span className="text-xs text-slate-400">{filtered.length} {t('users', 'ተጠቃሚዎች')}</span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Name', 'ስም')}</th>
                <th>{t('Phone / login', 'ስልክ / መግቢያ')}</th>
                <th>{t('Roles', 'ሚናዎች')}</th>
                <th>{t('Last sign-in', 'የመጨረሻ መግቢያ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="cursor-pointer" onClick={() => openDetails(u)}>
                  <td className="font-semibold text-slate-900">{locale === 'am' ? u.name_am : u.name}</td>
                  <td className="font-mono text-xs text-slate-600">{u.username}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.assignments.length === 0 && <span className="text-xs text-slate-400">{t('No role', 'ሚና የለም')}</span>}
                      {u.assignments.map((a) => (
                        <span key={a.id} className={`badge text-[11px] inline-flex items-center gap-1 ${soon(a.expires_at) ? 'badge-warning' : 'badge-info'}`} title={unitName(a)}>
                          {a.expires_at && <Clock size={10} />}
                          {roleName(a)} · <span className="opacity-75">{unitName(a)}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="font-mono text-[11px] text-slate-500">{formatLastLogin(u.last_login)}</td>
                  <td>
                    <span className={u.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                      {u.is_active ? t('Active', 'ንቁ') : t('Off', 'የተዘጋ')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                      {t('Manage', 'አስተዳድር')}
                    </button>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('No users found', 'ምንም ተጠቃሚ አልተገኘም')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add user', 'ተጠቃሚ ጨምር')}
        subtitle={t('They sign in with this phone number; the password comes to their Telegram. More roles can be added afterwards.', 'በዚህ ስልክ ቁጥር ይገባሉ፤ የይለፍ ቃሉ ወደ ቴሌግራማቸው ይመጣል። ተጨማሪ ሚናዎች በኋላ ሊሰጡ ይችላሉ።')}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Phone number (login)', 'ስልክ ቁጥር (መግቢያ)') + ' *'}>
              <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09..." className="form-input text-sm font-mono" />
            </Field>
            <div className="text-[11px] text-slate-500 self-end pb-1">
              {t(
                'No password to type: the system makes a temporary one and sends it to their Telegram (or shows it to you once). If this phone is already on a member’s record, that record gets the login.',
                'የይለፍ ቃል መጻፍ አያስፈልግም፦ ሥርዓቱ ጊዜያዊ ሠርቶ ወደ ቴሌግራማቸው ይልካል (ወይም አንድ ጊዜ ይታይዎታል)። ስልኩ በአባል መዝገብ ላይ ካለ መግቢያው ለዚያው መዝገብ ይሰጣል።'
              )}
            </div>
            <Field label={t('Full name (English)', 'ሙሉ ስም (እንግሊዝኛ)') + ' *'}>
              <input type="text" required value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Solomon Girma" className="form-input text-sm" />
            </Field>
            <Field label={t('Full name (Amharic)', 'ሙሉ ስም (አማርኛ)')}>
              <input type="text" value={nameAm} onChange={(e) => setNameAm(e.target.value)} placeholder="ለምሳሌ: ሰሎሞን ግርማ" className="form-input text-sm" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('Gender', 'ጾታ') + ' *'}>
              <select value={gender} onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE')} className="form-input text-sm">
                <option value="MALE">{t('Male', 'ወንድ')}</option>
                <option value="FEMALE">{t('Female', 'ሴት')}</option>
              </select>
            </Field>
            <Field label={t('Role', 'ሚና') + ' *'}>
              <select required value={roleId} onChange={(e) => setRoleId(e.target.value)} className="form-input text-sm">
                {activeRoles.map((r) => <option key={r.id} value={r.id}>{locale === 'am' ? r.name_am : r.name_en}</option>)}
              </select>
            </Field>
            <Field label={t('Unit', 'ክፍል') + ' *'}>
              <select required value={unitId} onChange={(e) => setUnitId(e.target.value)} className="form-input text-sm">
                {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-secondary text-xs py-2">{t('Cancel', 'ሰርዝ')}</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
              {busy ? t('Creating…', 'በመፍጠር ላይ…') : t('Add user', 'ተጠቃሚ ጨምር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage user */}
      {selectedUser && (
        <Modal
          isOpen
          onClose={() => setSelectedId(null)}
          title={locale === 'am' ? selectedUser.name_am : selectedUser.name}
          subtitle={`${selectedUser.username} · ${t('last sign-in', 'የመጨረሻ መግቢያ')} ${formatLastLogin(selectedUser.last_login)}`}
          maxWidth="2xl"
        >
          <div className="space-y-6 text-sm">
            {/* Roles */}
            <section className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('Roles', 'ሚናዎች')}</h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {selectedUser.assignments.length === 0 && <div className="p-3 text-xs text-slate-400">{t('No role — this account can do nothing yet.', 'ሚና የለም — ይህ መለያ ገና ምንም ማድረግ አይችልም።')}</div>}
                {selectedUser.assignments.map((a) => (
                  <div key={a.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{roleName(a)}</div>
                      <div className="text-xs text-slate-500">
                        {unitName(a)}
                        {a.expires_at && (
                          <span className={`ml-2 inline-flex items-center gap-1 ${soon(a.expires_at) ? 'text-amber-700' : 'text-slate-500'}`}>
                            <Clock size={11} /> {t('until', 'እስከ')} {formatEthiopianDate(a.expires_at.slice(0, 10), locale)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isSelf && (
                      <button onClick={() => handleRemoveRole(a.id)} disabled={busy} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title={t('Take away', 'አንሳ')}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isSelf ? (
                <p className="text-xs text-slate-400">{t('You cannot change your own roles or switch off your own account.', 'የራስዎን ሚና መቀየር ወይም መለያዎን መዝጋት አይችሉም።')}</p>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-700">{t('Give another role', 'ሌላ ሚና ስጥ')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)} className="form-input text-sm">
                      {activeRoles.map((r) => <option key={r.id} value={r.id}>{locale === 'am' ? r.name_am : r.name_en}</option>)}
                    </select>
                    <select value={addUnitId} onChange={(e) => setAddUnitId(e.target.value)} className="form-input text-sm">
                      {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
                    </select>
                    <input type="date" min={todayIso()} value={addUntil} onChange={(e) => setAddUntil(e.target.value)} className="form-input text-sm" title={t('Until (optional)', 'እስከ (ካለ)')} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">{t('Leave the date empty for no end (e.g. a temporary stand-in has an end date).', 'ማብቂያ ከሌለው ቀኑን ባዶ ይተዉ (ለምሳሌ ለጊዜያዊ ተተኪ የማብቂያ ቀን ይስጡ)።')}</span>
                    <button onClick={handleAddRole} disabled={busy || !addRoleId || !addUnitId} className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50 shrink-0">
                      <Plus size={13} /> {t('Give role', 'ሚና ስጥ')}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* What they can do */}
            <section>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={14} className="text-blue-600" />
                {t('What these roles allow', 'እነዚህ ሚናዎች የሚፈቅዱት')} ({selectedUser.permissions.length})
              </h4>
              {grouped.length === 0 ? (
                <p className="text-xs text-slate-400">{t('Nothing yet', 'ገና ምንም')}</p>
              ) : (
                <div className="space-y-1.5">
                  {grouped.map(([cat, perms]) => {
                    const open = openCats.has(cat);
                    return (
                      <div key={cat} className="border border-slate-200 rounded-lg">
                        <button
                          onClick={() => setOpenCats((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                          className="w-full px-3 py-2 flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-700">{cat} <span className="text-slate-400 font-normal">({perms.length})</span></span>
                          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="px-3 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {perms.map((p) => (
                              <div key={p.code} className="flex items-start gap-1.5 text-xs text-slate-700">
                                <CheckCircle2 size={12} className={`mt-0.5 shrink-0 ${p.unavailable ? 'text-slate-300' : 'text-emerald-500'}`} />
                                <span>{locale === 'am' ? p.name_am : p.name_en}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Password: never typed by the office */}
            {!isSelf && (
              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound size={14} className="text-blue-600" />
                  {t('Forgot their password?', 'የይለፍ ቃላቸውን ረሱ?')}
                </h4>
                <button onClick={handleIssue} disabled={busy || !live} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Send size={14} /> {t('Give a new temporary password', 'አዲስ ጊዜያዊ የይለፍ ቃል ስጥ')}
                </button>
                <p className="text-[11px] text-slate-500">
                  {t(
                    'Made by the system and sent to their own Telegram; if they are not on Telegram you see it once to give them. They choose their own when they next sign in.',
                    'ሥርዓቱ ይሠራዋል፤ ወደ ራሳቸው ቴሌግራም ይላካል፤ ቴሌግራም ከሌላቸው እንዲሰጧቸው አንድ ጊዜ ይታይዎታል። በሚቀጥለው ሲገቡ የራሳቸውን ይመርጣሉ።'
                  )}
                </p>
              </section>
            )}

            <div className="flex justify-between pt-2 border-t border-slate-100">
              <button
                onClick={handleToggleActive}
                disabled={busy || isSelf}
                className={`btn text-xs disabled:opacity-50 ${selectedUser.is_active ? 'btn-danger' : 'btn-primary'}`}
              >
                {selectedUser.is_active ? t('Switch account off', 'መለያ ዝጋ') : t('Switch account on', 'መለያ ክፈት')}
              </button>
              <button onClick={() => setSelectedId(null)} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* How the new password reached them — shown once */}
      {issued && (
        <Modal isOpen onClose={() => setIssued(null)} title={issued.name} subtitle={issued.outcome.login}>
          <div className="space-y-4 text-sm">
            {issued.outcome.reused && (
              <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
                {t('This phone was already on a member’s record — the login was given to that record (no second copy of the person).', 'ይህ ስልክ በአባል መዝገብ ላይ ነበር — መግቢያው ለዚያው መዝገብ ተሰጥቷል (የሰውየው ሁለተኛ መዝገብ አልተፈጠረም)።')}
              </p>
            )}
            {issued.outcome.via === 'telegram' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex gap-3">
                <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
                <div>
                  <div className="font-semibold">{t('Sent to their Telegram', 'ወደ ቴሌግራማቸው ተልኳል')}</div>
                  <div className="text-xs mt-0.5">{t('Only they can see it; it disappears from the chat after 30 minutes. They choose their own password when they sign in.', 'ማየት የሚችሉት እነሱ ብቻ ናቸው፤ ከ30 ደቂቃ በኋላ ከቻቱ ይጠፋል። ሲገቡ የራሳቸውን ይመርጣሉ።')}</div>
                </div>
              </div>
            )}
            {issued.outcome.via === 'existing' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                {t('This phone already signs in (for another Sunday school). They use the password they already have — nothing to send.', 'ይህ ስልክ ቀድሞ ይገባል (ለሌላ ሰንበት ትምህርት ቤት)። ያላቸውን የይለፍ ቃል ይጠቀማሉ — የሚላክ የለም።')}
              </div>
            )}
            {issued.outcome.via === 'shown' && (
              <>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {t('They are not connected to the Telegram bot, so give them this on paper. It is shown only now. At the first sign-in they must choose their own.', 'ከቴሌግራም ቦቱ ጋር አልተገናኙም፤ ስለዚህ ይህን በወረቀት ይስጧቸው። የሚታየው አሁን ብቻ ነው። መጀመሪያ ሲገቡ የራሳቸውን መምረጥ አለባቸው።')}
                </p>
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center space-y-1">
                  <div className="text-xs text-slate-500">{t('Login', 'መግቢያ')}</div>
                  <div className="font-mono text-lg font-bold text-slate-900">{issued.outcome.login}</div>
                  <div className="text-xs text-slate-500 pt-2">{issued.outcome.pin ? t('Temporary PIN', 'ጊዜያዊ ሚስጥር ቁጥር') : t('Temporary password', 'ጊዜያዊ የይለፍ ቃል')}</div>
                  <div className="font-mono text-2xl font-bold tracking-widest text-slate-900 select-all">{issued.outcome.secret}</div>
                </div>
                <p className="text-[11px] text-slate-500">
                  {t('Better next time: ask them to open the bot and share their phone — then it goes straight to them.', 'ለሚቀጥለው ጊዜ፦ ቦቱን ከፍተው ስልካቸውን እንዲያጋሩ ይንገሯቸው — ያኔ በቀጥታ ወደ እነሱ ይሄዳል።')}
                </p>
              </>
            )}
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setIssued(null)} className="btn btn-primary text-xs">{t('Done', 'ጨርሻለሁ')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ value, label, tone = 'text-slate-800', onClick, active }: { value: number; label: string; tone?: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`card p-5 text-left transition ${active ? 'ring-2 ring-blue-500/40' : 'hover:shadow-md'}`}>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
