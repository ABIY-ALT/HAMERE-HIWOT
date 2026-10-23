'use client';

// Roles: what each one allows, who holds it, and custom roles of the Sunday
// school's own. System roles are locked (copy one to make a variant).
// Nobody can give a role more than they hold themselves (lib/auth/grant).

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, CheckCircle2, Lock, Key, AlertCircle, Copy, Users, Search, Pencil, Ban } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { demoPermissions, demoRoles } from '@/lib/admin/demo';
import type { AdminPermissionRow, AdminRoleRow, LoadMode } from '@/lib/admin/types';
import { copyRole, createRole, loadRoles, setRolePermissions, updateRole } from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;
type Tab = 'permissions' | 'people' | 'details';
type RoleForm = { sourceId: string | null; code: string; nameEn: string; nameAm: string; descEn: string; descAm: string };

const EMPTY_FORM: RoleForm = { sourceId: null, code: '', nameEn: '', nameAm: '', descEn: '', descAm: '' };

export default function RolesPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissionRow[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<RoleForm | null>(null);
  const [formError, setFormError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('permissions');
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set());
  const [permSearch, setPermSearch] = useState('');
  const [details, setDetails] = useState({ nameEn: '', nameAm: '', descEn: '', descAm: '', isActive: true });
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const live = mode === 'live';
  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;
  const name = (r: { name_en: string; name_am: string }) => (locale === 'am' ? r.name_am : r.name_en);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadRoles>>) => {
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

  const refresh = useCallback(async () => apply(await loadRoles()), [apply]);

  useEffect(() => {
    loadRoles().then(apply);
  }, [apply]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const openRole = (role: AdminRoleRow, start: Tab = 'permissions') => {
    setSelectedId(role.id);
    setTab(start);
    setCheckedCodes(new Set(role.permissions));
    setPermSearch('');
    setDetails({ nameEn: role.name_en, nameAm: role.name_am, descEn: role.description_en ?? '', descAm: role.description_am ?? '', isActive: role.is_active });
  };

  const toggleCode = (code: string) =>
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const setCategory = (codes: string[], on: boolean) =>
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError('');
    const input = { code: form.code, nameEn: form.nameEn, nameAm: form.nameAm, descEn: form.descEn, descAm: form.descAm };
    const normalized = form.code.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (live) {
      setBusy(true);
      const res = form.sourceId ? await copyRole(form.sourceId, input) : await createRole(input);
      setBusy(false);
      if (!res.ok) return setFormError(res.error);
      await refresh();
    } else {
      const source = roles.find((r) => r.id === form.sourceId);
      setRoles((prev) => [
        {
          id: `role-${Date.now()}`,
          code: normalized,
          name_en: form.nameEn,
          name_am: form.nameAm || form.nameEn,
          description_en: form.descEn || null,
          description_am: form.descAm || null,
          is_system_role: false,
          is_active: true,
          permissions: source?.permissions ?? [],
          holders: [],
        },
        ...prev,
      ]);
    }
    setForm(null);
    showToast('success', t(`Role ${normalized} created`, `ሚና ${normalized} ተፈጥሯል`));
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
    setSelectedId(null);
  };

  const handleSaveDetails = async () => {
    if (!selectedRole) return;
    if (live) {
      setBusy(true);
      const res = await updateRole(selectedRole.id, details);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      await refresh();
    } else {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id
            ? { ...r, name_en: details.nameEn, name_am: details.nameAm || details.nameEn, description_en: details.descEn || null, description_am: details.descAm || null, is_active: details.isActive }
            : r
        )
      );
    }
    showToast('success', t('Role saved', 'ሚናው ተቀምጧል'));
    setSelectedId(null);
  };

  const categories = Array.from(new Set(permissions.map((p) => p.category)));
  const visible = roles
    .filter((r) => showInactive || r.is_active)
    .filter((r) => name(r).toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

  const original = new Set(selectedRole?.permissions ?? []);
  const added = [...checkedCodes].filter((c) => !original.has(c)).length;
  const removed = [...original].filter((c) => !checkedCodes.has(c)).length;
  const pq = permSearch.toLowerCase();
  const permMatches = (p: AdminPermissionRow) => !pq || p.code.toLowerCase().includes(pq) || name(p).toLowerCase().includes(pq);

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Roles', 'ሚናዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('A role is a set of permissions given to people in a unit. Copy a system role to make your own variant.', 'ሚና በአንድ ክፍል ላሉ ሰዎች የሚሰጥ የፈቃዶች ስብስብ ነው። የራስዎን ለመሥራት የስርዓት ሚናን ይቅዱ።')}
          </p>
        </div>
        <button
          onClick={() => {
            setFormError('');
            setForm(EMPTY_FORM);
          }}
          disabled={mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          {t('New role', 'አዲስ ሚና')}
        </button>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder={t('Search roles…', 'ሚናዎችን ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
        </div>
        {roles.some((r) => !r.is_active) && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {t('Show switched-off roles', 'የተዘጉ ሚናዎችን አሳይ')}
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((role) => (
          <div key={role.id} className={`card p-5 flex flex-col justify-between ${role.is_active ? '' : 'opacity-60'}`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{role.code}</span>
                <div className="flex gap-1">
                  {!role.is_active && <span className="badge badge-danger text-[10px] inline-flex items-center gap-1"><Ban size={10} />{t('Off', 'የተዘጋ')}</span>}
                  {role.is_system_role && (
                    <span className="badge badge-warning inline-flex items-center gap-1 text-[10px]">
                      <Lock size={10} />
                      {t('System', 'የስርዓት')}
                    </span>
                  )}
                </div>
              </div>
              <h3 className="font-bold text-slate-900 text-base mb-1">{name(role)}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{locale === 'am' ? role.description_am : role.description_en}</p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <button onClick={() => openRole(role, 'permissions')} className="text-emerald-600 font-medium flex items-center gap-1 hover:underline">
                  <CheckCircle2 size={13} /> {role.permissions.length}
                </button>
                {role.holders && (
                  <button onClick={() => openRole(role, 'people')} className="text-slate-600 font-medium flex items-center gap-1 hover:underline" title={t('People holding it', 'የያዙት ሰዎች')}>
                    <Users size={13} /> {role.holders.length}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setFormError('');
                    setForm({ sourceId: role.id, code: `${role.code}_COPY`, nameEn: `${role.name_en} (copy)`, nameAm: role.name_am ? `${role.name_am} (ቅጂ)` : '', descEn: role.description_en ?? '', descAm: role.description_am ?? '' });
                  }}
                  className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  title={t('Copy into a new role', 'ወደ አዲስ ሚና ቅዳ')}
                >
                  <Copy size={14} />
                </button>
                <button onClick={() => openRole(role)} className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                  {role.is_system_role ? t('View →', 'ይመልከቱ →') : t('Edit →', 'አርትዕ →')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New / copied role */}
      <Modal
        isOpen={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.sourceId ? t('Copy role', 'ሚና ቅዳ') : t('New role', 'አዲስ ሚና')}
        subtitle={
          form?.sourceId
            ? t(`Starts with the permissions of ${roles.find((r) => r.id === form.sourceId)?.code ?? ''} — change them afterwards`, `በ${roles.find((r) => r.id === form.sourceId)?.code ?? ''} ፈቃዶች ይጀምራል — ከዚያ ይቀይሯቸው`)
            : t('Starts with no permissions — choose them afterwards', 'ያለ ፈቃድ ይጀምራል — ከዚያ ይምረጡ')
        }
      >
        {form && (
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={16} /> {formError}
              </div>
            )}
            <Field label={t('Code', 'ኮድ') + ' *'}>
              <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. OUTREACH_COORDINATOR" className="form-input text-sm font-mono" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Name (English)', 'ስም (እንግሊዝኛ)') + ' *'}>
                <input type="text" required value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Name (Amharic)', 'ስም (አማርኛ)')}>
                <input type="text" value={form.nameAm} onChange={(e) => setForm({ ...form, nameAm: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Description (English)', 'መግለጫ (እንግሊዝኛ)')}>
                <input type="text" value={form.descEn} onChange={(e) => setForm({ ...form, descEn: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Description (Amharic)', 'መግለጫ (አማርኛ)')}>
                <input type="text" value={form.descAm} onChange={(e) => setForm({ ...form, descAm: e.target.value })} className="form-input text-sm" />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="btn btn-secondary text-xs py-2">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
                {busy ? t('Creating…', 'በመፍጠር ላይ…') : t('Create role', 'ሚና ፍጠር')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* One role */}
      {selectedRole && (
        <Modal isOpen onClose={() => setSelectedId(null)} title={name(selectedRole)} subtitle={selectedRole.code} maxWidth="2xl">
          <div className="space-y-4 text-sm">
            <div className="flex gap-1 border-b border-slate-100">
              {(
                [
                  ['permissions', t('Permissions', 'ፈቃዶች'), checkedCodes.size],
                  ['people', t('People', 'ሰዎች'), selectedRole.holders?.length],
                  ...(selectedRole.is_system_role ? [] : [['details', t('Details', 'ዝርዝር'), undefined]]),
                ] as [Tab, string, number | undefined][]
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  {label}{n != null && <span className="ml-1 opacity-60">({n})</span>}
                </button>
              ))}
            </div>

            {tab === 'permissions' && (
              <>
                {selectedRole.is_system_role && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2">
                    <Lock size={13} />
                    {t('A system role is locked so nobody can lock the office out. Copy it to make a variant you can change.', 'የስርዓት ሚና ተቆልፏል። ሊቀየር የሚችል ለማድረግ ይቅዱት።')}
                  </p>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input value={permSearch} onChange={(e) => setPermSearch(e.target.value)} placeholder={t('Find a permission…', 'ፈቃድ ፈልግ…')} className="form-input pl-9 text-sm" />
                </div>
                <div className="space-y-4 max-h-[48vh] overflow-y-auto pr-1">
                  {categories.map((cat) => {
                    const inCat = permissions.filter((p) => p.category === cat);
                    const shown = inCat.filter(permMatches);
                    if (shown.length === 0) return null;
                    const on = inCat.filter((p) => checkedCodes.has(p.code)).length;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {cat} <span className="font-normal text-slate-400">{on}/{inCat.length}</span>
                          </div>
                          {!selectedRole.is_system_role && (
                            <div className="flex gap-2 text-[11px]">
                              <button onClick={() => setCategory(shown.map((p) => p.code), true)} className="text-blue-600 hover:underline">{t('All', 'ሁሉም')}</button>
                              <button onClick={() => setCategory(shown.map((p) => p.code), false)} className="text-slate-500 hover:underline">{t('None', 'ምንም')}</button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {shown.map((p) => (
                            <label
                              key={p.code}
                              className={`flex items-center gap-2.5 p-2 border rounded-lg text-xs ${
                                checkedCodes.has(p.code) !== original.has(p.code) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'
                              } ${selectedRole.is_system_role ? 'opacity-80' : 'cursor-pointer hover:bg-slate-50'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checkedCodes.has(p.code)}
                                onChange={() => toggleCode(p.code)}
                                disabled={selectedRole.is_system_role}
                                className="rounded text-blue-600"
                              />
                              <span className="flex flex-col min-w-0">
                                <span className="font-semibold text-slate-800">{name(p)}</span>
                                <span className="font-mono text-slate-400 text-[10px]">
                                  {p.code}
                                  {p.unavailable && <span className="ml-1 text-amber-600 font-sans">· {t('not in your plan', 'በዕቅድዎ የለም')}</span>}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!selectedRole.is_system_role && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">
                      {added || removed
                        ? t(`${added} added, ${removed} removed — applies to ${selectedRole.holders?.length ?? 0} people`, `${added} ተጨምሯል፣ ${removed} ተነስቷል — ለ${selectedRole.holders?.length ?? 0} ሰዎች ይሠራል`)
                        : t('No changes', 'ምንም ለውጥ የለም')}
                    </span>
                    <button onClick={handleSavePermissions} disabled={busy || (!added && !removed)} className="btn btn-primary text-xs py-2 px-3 disabled:opacity-50 inline-flex items-center gap-1.5">
                      <Key size={13} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save permissions', 'ፈቃዶችን መዝግብ')}
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === 'people' && (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-[55vh] overflow-y-auto">
                {(selectedRole.holders ?? []).length === 0 && <div className="p-4 text-xs text-slate-400">{t('Nobody holds this role now.', 'አሁን ይህን ሚና የያዘ የለም።')}</div>}
                {(selectedRole.holders ?? []).map((h, i) => (
                  <div key={`${h.user_id}-${i}`} className="p-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{locale === 'am' ? h.name_am : h.name}</span>
                    <span className="text-slate-500">{locale === 'am' ? h.unit_am : h.unit}</span>
                  </div>
                ))}
                <div className="p-3 text-[11px] text-slate-400">{t('Give or take roles under Administration → Users.', 'ሚና ለመስጠት ወይም ለማንሳት አስተዳደር → ተጠቃሚዎች።')}</div>
              </div>
            )}

            {tab === 'details' && !selectedRole.is_system_role && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('Name (English)', 'ስም (እንግሊዝኛ)')}>
                    <input value={details.nameEn} onChange={(e) => setDetails({ ...details, nameEn: e.target.value })} className="form-input text-sm" />
                  </Field>
                  <Field label={t('Name (Amharic)', 'ስም (አማርኛ)')}>
                    <input value={details.nameAm} onChange={(e) => setDetails({ ...details, nameAm: e.target.value })} className="form-input text-sm" />
                  </Field>
                  <Field label={t('Description (English)', 'መግለጫ (እንግሊዝኛ)')}>
                    <input value={details.descEn} onChange={(e) => setDetails({ ...details, descEn: e.target.value })} className="form-input text-sm" />
                  </Field>
                  <Field label={t('Description (Amharic)', 'መግለጫ (አማርኛ)')}>
                    <input value={details.descAm} onChange={(e) => setDetails({ ...details, descAm: e.target.value })} className="form-input text-sm" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={details.isActive} onChange={(e) => setDetails({ ...details, isActive: e.target.checked })} />
                  {t('In use (a role nobody holds can be switched off)', 'በሥራ ላይ (ማንም ያልያዘው ሚና ሊዘጋ ይችላል)')}
                </label>
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button onClick={handleSaveDetails} disabled={busy || details.nameEn.trim().length < 2} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                    <Pencil size={13} /> {t('Save', 'አስቀምጥ')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
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
