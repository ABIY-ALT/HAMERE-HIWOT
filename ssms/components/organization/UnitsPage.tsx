'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, Network, Pencil, Phone, Plus, Search, UserRound, Users, Wallet } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import { formatETB } from '@/lib/finance/types';
import { HEAD_ROLE, type UnitKind, type UnitSummary } from '@/lib/organization/types';
import type { LoadMode } from '@/lib/admin/types';
import { createUnit, loadUnits, setUnitActive, updateUnit } from '@/app/dashboard/organization/actions';

const COPY: Record<UnitKind, { title: [string, string]; subtitle: [string, string]; one: [string, string]; head: [string, string]; codeHint: string }> = {
  DEPARTMENT: {
    title: ['Operational Departments', 'የሥራ ክፍሎች'],
    subtitle: ['Departments that carry out the Sunday school’s ministries, education and services', 'የሰንበት ት/ቤቱን ትምህርት፣ አገልግሎትና አስተዳደራዊ ሥራዎች የሚያከናውኑ ክፍሎች'],
    one: ['Department', 'ክፍል'],
    head: ['Department head', 'የክፍል ኃላፊ'],
    codeHint: 'e.g. DEPT_MEDIA',
  },
  COORDINATION: {
    title: ['Coordinations', 'ቅንጅቶች'],
    subtitle: ['Coordination units that plan and follow up the work of the departments', 'የክፍሎችን ሥራ የሚያቅዱና የሚከታተሉ የቅንጅት አካላት'],
    one: ['Coordination', 'ቅንጅት'],
    head: ['Coordinator', 'አስተባባሪ'],
    codeHint: 'e.g. COORD_YOUTH',
  },
};

function demoUnits(kind: UnitKind): UnitSummary[] {
  return MOCK_ORG_UNITS.filter((u) => u.unit_type === kind).map((u) => ({
    id: u.id, code: u.code, name_en: u.name_en, name_am: u.name_am, description_en: u.description_en ?? '',
    description_am: u.description_am ?? '', is_active: u.is_active, sort_order: u.sort_order,
    heads: [], people: [], budget: null, openRequests: null,
  }));
}

export function UnitsPage({ kind }: { kind: UnitKind }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const copy = COPY[kind];
  const canManage = can('GOVERNANCE_MANAGE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name_en: '', name_am: '', description_en: '', description_am: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (res: Awaited<ReturnType<typeof loadUnits>>) => {
      if (res.mode === 'live') setUnits(res.data);
      else if (res.mode === 'demo') setUnits((u) => (u.length ? u : demoUnits(kind)));
      else setError(res.error);
      setMode(res.mode);
    },
    [kind]
  );

  useEffect(() => {
    loadUnits(kind).then(apply);
  }, [kind, apply]);

  const tt = (pair: [string, string]) => t(pair[0], pair[1]);
  const showToast = (k: 'success' | 'error', text: string) => {
    setToast({ kind: k, text });
    setTimeout(() => setToast(null), 3500);
  };

  const selected = units.find((u) => u.id === selectedId) ?? null;
  const active = units.filter((u) => u.is_active);
  const needle = search.toLowerCase();
  const filtered = units.filter(
    (u) =>
      (locale === 'am' ? u.name_am : u.name_en).toLowerCase().includes(needle) ||
      u.code.toLowerCase().includes(needle) ||
      u.heads.some((h) => h.name.toLowerCase().includes(needle))
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ code: '', name_en: '', name_am: '', description_en: '', description_am: '' });
    setFormError('');
    setFormOpen(true);
  };
  const openEdit = (u: UnitSummary) => {
    setSelectedId(null);
    setEditingId(u.id);
    setForm({ code: u.code, name_en: u.name_en, name_am: u.name_am, description_en: u.description_en, description_am: u.description_am });
    setFormError('');
    setFormOpen(true);
  };
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (mode === 'live') {
      setBusy(true);
      const { code, ...fields } = form;
      const res = editingId ? await updateUnit(editingId, fields) : await createUnit(kind, { ...fields, code });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadUnits(kind));
    } else {
      setUnits((list) =>
        editingId
          ? list.map((u) => (u.id === editingId ? { ...u, ...form, name_am: form.name_am || form.name_en } : u))
          : [...list, { id: `u-${Date.now()}`, ...form, code: form.code.toUpperCase(), name_am: form.name_am || form.name_en, is_active: true, sort_order: 99, heads: [], people: [], budget: null, openRequests: null }]
      );
    }
    setFormOpen(false);
    showToast('success', editingId ? t('Saved', 'ተቀምጧል') : t(`${copy.one[0]} added`, `${copy.one[1]} ተጨምሯል`));
  };

  const toggleActive = async (u: UnitSummary) => {
    if (mode === 'live') {
      setBusy(true);
      const res = await setUnitActive(u.id, !u.is_active);
      setBusy(false);
      if (!res.ok) return showToast('error', res.error);
      apply(await loadUnits(kind));
    } else {
      setUnits((list) => list.map((x) => (x.id === u.id ? { ...x, is_active: !x.is_active } : x)));
    }
    setSelectedId(null);
    showToast('success', u.is_active ? t('Deactivated', 'ተዘግቷል') : t('Reactivated', 'እንደገና ተከፍቷል'));
  };

  const Icon = kind === 'DEPARTMENT' ? Building2 : Network;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{tt(copy.title)}</h1>
          <p className="text-sm text-slate-500 mt-1">{tt(copy.subtitle)}</p>
        </div>
        {canManage && (
          <button onClick={openCreate} disabled={mode === 'loading' || mode === 'error'} className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50">
            <Plus size={16} /> {t(`Add ${copy.one[0]}`, `${copy.one[1]} ጨምር`)}
          </button>
        )}
      </div>

      <AdminModeNotice mode={mode} error={error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={<Icon size={22} />} value={active.length} label={t(`Active ${copy.title[0].toLowerCase()}`, `ንቁ ${copy.title[1]}`)} />
        <Kpi icon={<UserRound size={22} />} value={`${active.filter((u) => u.heads.length).length} / ${active.length}`} label={t(`With a ${copy.head[0].toLowerCase()}`, `${copy.head[1]} ያላቸው`)} />
        <Kpi icon={<Users size={22} />} value={active.reduce((s, u) => s + u.people.length, 0)} label={t('People assigned', 'የተመደቡ ሰዎች')} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input type="text" placeholder={t('Search name, code or head…', 'ስም፣ ኮድ ወይም ኃላፊ ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((u) => {
          const usedPct = u.budget?.allocated ? Math.round((u.budget.used / u.budget.allocated) * 100) : null;
          return (
            <button
              key={u.id}
              onClick={() => setSelectedId(u.id)}
              className={`card p-5 text-left hover:shadow-md hover:border-blue-200 transition-all flex flex-col gap-3 ${u.is_active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{u.code}</span>
                {!u.is_active && <span className="badge bg-slate-100 text-slate-500 text-[10px]">{t('Inactive', 'የተዘጋ')}</span>}
              </div>
              <h3 className="font-semibold text-slate-900 leading-snug">{locale === 'am' ? u.name_am : u.name_en}</h3>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <UserRound size={13} className="text-slate-400" />
                {u.heads.length ? (
                  <span className="font-medium">{u.heads.map((h) => (locale === 'am' ? h.name_am : h.name)).join(', ')}</span>
                ) : (
                  <span className="text-amber-700">{t(`No ${copy.head[0].toLowerCase()} assigned`, `${copy.head[1]} አልተመደበም`)}</span>
                )}
              </div>
              <div className="mt-auto pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><Users size={12} /> {u.people.length}</span>
                {u.budget && (
                  <span className="inline-flex items-center gap-1">
                    <Wallet size={12} />
                    {u.budget.allocated === null ? t('no budget set', 'በጀት የለም') : `${usedPct}% ${t('of budget used', 'በጀት ጥቅም ላይ')}`}
                  </span>
                )}
                {u.openRequests ? <span className="text-amber-700">{u.openRequests} {t('open requests', 'ክፍት ጥያቄዎች')}</span> : null}
              </div>
            </button>
          );
        })}
        {mode !== 'loading' && filtered.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full text-center py-8">{t('Nothing found.', 'ምንም አልተገኘም።')}</p>
        )}
      </div>

      {/* Details */}
      {selected && (
        <Modal isOpen onClose={() => setSelectedId(null)} title={locale === 'am' ? selected.name_am : selected.name_en} subtitle={selected.code} maxWidth="xl">
          <div className="space-y-4 text-sm">
            {(selected.description_en || selected.description_am) && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                {locale === 'am' ? selected.description_am || selected.description_en : selected.description_en || selected.description_am}
              </p>
            )}

            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{t('People assigned', 'የተመደቡ ሰዎች')}</h4>
              {selected.people.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t(
                    `Nobody is assigned yet. Assign a ${copy.head[0].toLowerCase()} in Administration → System Users (role "${HEAD_ROLE[kind] === 'DEPT_HEAD' ? 'Department Head' : 'Coordinator'}", unit "${selected.name_en}").`,
                    `እስካሁን የተመደበ የለም። በአስተዳደር → የስርዓት ተጠቃሚዎች ውስጥ ${copy.head[1]} ይመድቡ።`
                  )}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {selected.people.map((p, i) => (
                    <li key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                      <span>
                        <span className="font-medium text-slate-900">{locale === 'am' ? p.name_am : p.name}</span>
                        <span className={`ml-2 ${p.role_code === HEAD_ROLE[kind] ? 'badge badge-warning' : 'text-slate-500'}`}>{locale === 'am' ? p.role_am : p.role}</span>
                      </span>
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="font-mono text-blue-600 hover:underline inline-flex items-center gap-1">
                          <Phone size={11} /> {p.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected.budget && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg p-3">
                <span className="inline-flex items-center gap-1.5 text-slate-600"><Wallet size={13} /> {t(`Budget ${selected.budget.year}`, `በጀት ${selected.budget.year}`)}</span>
                <span className="font-mono text-slate-900">
                  {selected.budget.allocated === null
                    ? t('not set', 'አልተመደበም')
                    : `${formatETB(selected.budget.used)} / ${formatETB(selected.budget.allocated)}`}
                </span>
                <span className="flex gap-3">
                  <Link href="/dashboard/finance/budget" className="text-blue-600 hover:underline">{t('Budget →', 'በጀት →')}</Link>
                  <Link href="/dashboard/finance/requests" className="text-blue-600 hover:underline">{t('Requests →', 'ጥያቄዎች →')}</Link>
                </span>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => openEdit(selected)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                  <Pencil size={13} /> {t('Edit name & description', 'ስምና መግለጫ አርትዕ')}
                </button>
                <button disabled={busy} onClick={() => toggleActive(selected)} className={`btn text-xs disabled:opacity-50 ${selected.is_active ? 'btn-danger' : 'btn-primary'}`}>
                  {selected.is_active ? t('Deactivate', 'ዝጋ') : t('Reactivate', 'እንደገና ክፈት')}
                </button>
              </div>
            )}
            {canManage && selected.is_active && (
              <p className="text-[11px] text-slate-400">
                {t('A deactivated unit disappears from request forms and budgets; its history is kept.', 'የተዘጋ ክፍል ከጥያቄ ቅጾችና ከበጀት ይወገዳል፤ ታሪኩ ይቀመጣል።')}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Add / edit */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? t(`Edit ${copy.one[0]}`, `${copy.one[1]} አርትዕ`) : t(`Add ${copy.one[0]}`, `${copy.one[1]} ጨምር`)}
        subtitle={t('Placed under the Executive Committee', 'በሥራ አስፈጻሚ ጉባኤ ሥር ይቀመጣል')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          <Field label={t('Code', 'ኮድ') + (editingId ? '' : ' *')}>
            <input type="text" required={!editingId} disabled={Boolean(editingId)} value={form.code} onChange={set('code')} placeholder={copy.codeHint} className="form-input text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500" />
            {editingId && <p className="text-[11px] text-slate-400 mt-1">{t('The code cannot be changed.', 'ኮዱ ሊቀየር አይችልም።')}</p>}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Name (English)', 'ስም (እንግሊዝኛ)') + ' *'}>
              <input type="text" required value={form.name_en} onChange={set('name_en')} className="form-input text-sm" />
            </Field>
            <Field label={t('Name (Amharic)', 'ስም (አማርኛ)')}>
              <input type="text" value={form.name_am} onChange={set('name_am')} className="form-input text-sm" />
            </Field>
          </div>
          <Field label={t('Description (English)', 'መግለጫ (እንግሊዝኛ)')}>
            <textarea rows={2} value={form.description_en} onChange={set('description_en')} className="form-input text-sm" />
          </Field>
          <Field label={t('Description (Amharic)', 'መግለጫ (አማርኛ)')}>
            <textarea rows={2} value={form.description_am} onChange={set('description_am')} className="form-input text-sm" />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Kpi({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
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
