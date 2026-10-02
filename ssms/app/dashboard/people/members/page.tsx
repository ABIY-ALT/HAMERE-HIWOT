'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Search, Phone, MapPin, Church, Calendar, User, Mail, Pencil, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_PERSONS } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import type { MemberStatus, Person } from '@/types';
import { createMember, loadMembers, updateMember, type MemberInput } from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;

const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRANSFERRED', 'DECEASED'];

const STATUS_BADGE: Record<MemberStatus, string> = {
  ACTIVE: 'badge badge-success',
  INACTIVE: 'badge badge-warning',
  SUSPENDED: 'badge badge-danger',
  TRANSFERRED: 'badge badge-info',
  DECEASED: 'badge bg-slate-200 text-slate-700',
};

const EMPTY_FORM: MemberInput & { status: MemberStatus } = {
  full_name_en: '',
  full_name_am: '',
  baptismal_name: '',
  gender: 'MALE',
  date_of_birth: '',
  phone_primary: '',
  phone_secondary: '',
  email: '',
  address: '',
  father_of_confession: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  notes: '',
  status: 'ACTIVE',
};

function toForm(p: Person): typeof EMPTY_FORM {
  return {
    full_name_en: p.full_name_en,
    full_name_am: p.full_name_am ?? '',
    baptismal_name: p.baptismal_name ?? '',
    gender: p.gender,
    date_of_birth: p.date_of_birth ?? '',
    phone_primary: p.phone_primary ?? '',
    phone_secondary: p.phone_secondary ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    father_of_confession: p.father_of_confession ?? '',
    emergency_contact_name: p.emergency_contact_name ?? '',
    emergency_contact_phone: p.emergency_contact_phone ?? '',
    notes: p.notes ?? '',
    status: p.status,
  };
}

export default function MembersPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Person | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const live = mode === 'live';

  const statusLabel = (s: MemberStatus) =>
    ({
      ACTIVE: t('Active', 'ንቁ'),
      INACTIVE: t('Inactive', 'የቦዘነ'),
      SUSPENDED: t('Suspended', 'የታገደ'),
      TRANSFERRED: t('Transferred', 'የተዛወረ'),
      DECEASED: t('Deceased', 'ያረፈ'),
    })[s];

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMembers>>) => {
    if (res.mode === 'demo') setMembers(MOCK_PERSONS);
    else if (res.mode === 'live') setMembers(res.data);
    else setLoadError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadMembers().then(apply);
  }, [apply]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const set = (key: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (p: Person) => {
    setSelectedMember(null);
    setEditingId(p.id);
    setForm(toForm(p));
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const { status, ...fields } = form;

    if (live) {
      setBusy(true);
      const res = editingId ? await updateMember(editingId, { ...fields, status }) : await createMember(fields);
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadMembers());
    } else {
      // Demo mode: change the list on screen only
      const now = new Date().toISOString();
      const clean = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
      ) as unknown as Partial<Person>;
      if (editingId) {
        setMembers((prev) => prev.map((p) => (p.id === editingId ? { ...p, ...clean, status, updated_at: now } : p)));
      } else {
        setMembers((prev) => [
          {
            ...(clean as Person),
            id: `person-${Date.now()}`,
            membership_code: `MBR-${new Date().getFullYear()}-${String(prev.length + 1).padStart(4, '0')}`,
            full_name_en: fields.full_name_en,
            gender: fields.gender,
            profile_photo_url: null,
            status: 'ACTIVE',
            created_at: now,
            updated_at: now,
          },
          ...prev,
        ]);
      }
    }

    setFormOpen(false);
    showToast(
      'success',
      editingId
        ? t('Member updated', 'የአባሉ መረጃ ተቀይሯል')
        : t(`New member ${form.full_name_en} registered`, `አዲስ አባል ${form.full_name_am || form.full_name_en} ተመዝግቧል`)
    );
  };

  const needle = search.toLowerCase();
  const filtered = members.filter((p) => {
    const name = (locale === 'am' ? p.full_name_am || p.full_name_en : p.full_name_en) || '';
    const matchesSearch =
      name.toLowerCase().includes(needle) ||
      p.membership_code.toLowerCase().includes(needle) ||
      (p.phone_primary ?? '').includes(search) ||
      (p.baptismal_name ?? '').toLowerCase().includes(needle);
    return (
      matchesSearch &&
      (genderFilter === 'ALL' || p.gender === genderFilter) &&
      (statusFilter === 'ALL' || p.status === statusFilter)
    );
  });

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Sunday School Members Registry', 'የሰንበት ትምህርት ቤት አባላት መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Unified parish master directory of registered Sunday school members',
              'የተመዘገቡ የሰንበት ት/ቤት አባላት አጠቃላይ ማውጫ'
            )}
          </p>
        </div>
        {can('MEMBER_CREATE') && (
          <button
            onClick={openCreate}
            disabled={mode === 'loading' || mode === 'error'}
            className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
          >
            <UserPlus size={16} />
            {t('Register New Member', 'አዲስ አባል መዝግብ')}
          </button>
        )}
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{members.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Members', 'አጠቃላይ አባላት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {members.filter((p) => p.status === 'ACTIVE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Members', 'ንቁ አባላት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {members.filter((p) => p.gender === 'MALE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Male Members', 'ወንድ አባላት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">
            {members.filter((p) => p.gender === 'FEMALE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Female Members', 'ሴት አባላት')}</div>
        </div>
      </div>

      {/* Table Container */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search by name, ID or phone...', 'በስም፣ በመለያ ወይም ስልክ ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Genders', 'ሁሉም ጾታ')}</option>
              <option value="MALE">{t('Male', 'ወንድ')}</option>
              <option value="FEMALE">{t('Female', 'ሴት')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Statuses', 'ሁሉም ሁኔታ')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              {filtered.length} {t('records', 'መዝገቦች')}
            </span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Member Code', 'የአባልነት ቁጥር')}</th>
                <th>{t('Full Name', 'ሙሉ ስም')}</th>
                <th>{t('Baptismal Name', 'የክርስትና ስም')}</th>
                <th>{t('Gender', 'ጾታ')}</th>
                <th>{t('Phone', 'ስልክ')}</th>
                <th>{t('Confession Father', 'የንስሐ አባት')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{m.membership_code}</td>
                  <td className="font-medium text-slate-900">
                    {locale === 'am' ? m.full_name_am || m.full_name_en : m.full_name_en}
                  </td>
                  <td className="text-slate-600">{m.baptismal_name || '—'}</td>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {m.gender === 'MALE' ? t('Male', 'ወንድ') : t('Female', 'ሴት')}
                    </span>
                  </td>
                  <td className="text-slate-600 text-xs font-mono">{m.phone_primary || '—'}</td>
                  <td className="text-slate-600 text-xs">{m.father_of_confession || '—'}</td>
                  <td>
                    <span className={STATUS_BADGE[m.status]}>{statusLabel(m.status)}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedMember(m)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Profile', 'መገለጫ')}
                    </button>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-slate-400 py-8">
                    {t('No members found', 'ምንም አባል አልተገኘም')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register / Edit Member Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? t('Edit Member', 'አባል አርትዕ') : t('Register New Member', 'አዲስ አባል መዝግብ')}
        subtitle={t('Personal and spiritual registration details', 'የግልና መንፈሳዊ ምዝገባ መረጃ')}
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Full Name (English)', 'ሙሉ ስም (እንግሊዝኛ)') + ' *'}>
              <input type="text" required value={form.full_name_en} onChange={set('full_name_en')} placeholder="e.g. Solomon Girma" className="form-input text-sm" />
            </Field>
            <Field label={t('Full Name (Amharic)', 'ሙሉ ስም (አማርኛ)')}>
              <input type="text" value={form.full_name_am ?? ''} onChange={set('full_name_am')} placeholder="ለምሳሌ: ሰሎሞን ግርማ" className="form-input text-sm" />
            </Field>
            <Field label={t('Baptismal Name', 'የክርስትና ስም')}>
              <input type="text" value={form.baptismal_name ?? ''} onChange={set('baptismal_name')} placeholder="ለምሳሌ: ወልደ ገብርኤል" className="form-input text-sm" />
            </Field>
            <Field label={t('Gender', 'ጾታ') + ' *'}>
              <select value={form.gender} onChange={set('gender')} className="form-input text-sm">
                <option value="MALE">{t('Male', 'ወንድ')}</option>
                <option value="FEMALE">{t('Female', 'ሴት')}</option>
              </select>
            </Field>
            <Field label={t('Date of Birth', 'የትውልድ ቀን')}>
              <input type="date" value={form.date_of_birth ?? ''} onChange={set('date_of_birth')} className="form-input text-sm" />
            </Field>
            <Field label={t('Father of Confession', 'የንስሐ አባት')}>
              <input type="text" value={form.father_of_confession ?? ''} onChange={set('father_of_confession')} placeholder="መምህር / ቄስ..." className="form-input text-sm" />
            </Field>
            <Field label={t('Primary Phone', 'ስልክ ቁጥር') + ' *'}>
              <input type="tel" required value={form.phone_primary ?? ''} onChange={set('phone_primary')} placeholder="09..." className="form-input text-sm" />
            </Field>
            <Field label={t('Second Phone', 'ተጨማሪ ስልክ')}>
              <input type="tel" value={form.phone_secondary ?? ''} onChange={set('phone_secondary')} className="form-input text-sm" />
            </Field>
            <Field label={t('E-mail', 'ኢሜይል')}>
              <input type="email" value={form.email ?? ''} onChange={set('email')} className="form-input text-sm" />
            </Field>
            <Field label={t('Residence Address', 'የመኖሪያ አድራሻ')}>
              <input type="text" value={form.address ?? ''} onChange={set('address')} placeholder="Addis Ababa..." className="form-input text-sm" />
            </Field>
            <Field label={t('Emergency Contact Name', 'የአደጋ ጊዜ ተጠሪ')}>
              <input type="text" value={form.emergency_contact_name ?? ''} onChange={set('emergency_contact_name')} className="form-input text-sm" />
            </Field>
            <Field label={t('Emergency Contact Phone', 'የአደጋ ጊዜ ስልክ')}>
              <input type="tel" value={form.emergency_contact_phone ?? ''} onChange={set('emergency_contact_phone')} className="form-input text-sm" />
            </Field>
            {editingId && (
              <Field label={t('Membership Status', 'የአባልነት ሁኔታ')}>
                <select value={form.status} onChange={set('status')} className="form-input text-sm">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label={t('Notes', 'ማስታወሻ')}>
            <textarea value={form.notes ?? ''} onChange={set('notes')} rows={2} className="form-input text-sm" />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs py-2">
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : editingId ? t('Save Changes', 'ለውጦችን አስቀምጥ') : t('Save Member', 'አባል መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Member Profile Modal */}
      {selectedMember && (
        <Modal
          isOpen
          onClose={() => setSelectedMember(null)}
          title={locale === 'am' ? selectedMember.full_name_am || selectedMember.full_name_en : selectedMember.full_name_en}
          subtitle={`${selectedMember.membership_code} • ${statusLabel(selectedMember.status)}`}
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="w-16 h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl flex-shrink-0">
                {selectedMember.full_name_en.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-900">
                  {locale === 'am' ? selectedMember.full_name_am || selectedMember.full_name_en : selectedMember.full_name_en}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedMember.membership_code}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={STATUS_BADGE[selectedMember.status]}>{statusLabel(selectedMember.status)}</span>
                  <span className="badge badge-info">
                    {selectedMember.gender === 'MALE' ? t('Male', 'ወንድ') : t('Female', 'ሴት')}
                  </span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100">
              <ProfileRow icon={<Church size={15} />} label={t('Baptismal Name', 'የክርስትና ስም')} value={selectedMember.baptismal_name} />
              <ProfileRow icon={<User size={15} />} label={t('Father of Confession', 'የንስሐ አባት')} value={selectedMember.father_of_confession} />
              <ProfileRow icon={<Phone size={15} />} label={t('Phone', 'ስልክ')} value={[selectedMember.phone_primary, selectedMember.phone_secondary].filter(Boolean).join(' · ')} mono />
              <ProfileRow icon={<Mail size={15} />} label={t('E-mail', 'ኢሜይል')} value={selectedMember.email} />
              <ProfileRow icon={<MapPin size={15} />} label={t('Address', 'አድራሻ')} value={selectedMember.address} />
              <ProfileRow icon={<Calendar size={15} />} label={t('Date of Birth', 'የትውልድ ቀን')} value={selectedMember.date_of_birth} mono />
              <ProfileRow
                icon={<Phone size={15} />}
                label={t('Emergency Contact', 'የአደጋ ጊዜ ተጠሪ')}
                value={[selectedMember.emergency_contact_name, selectedMember.emergency_contact_phone].filter(Boolean).join(' · ')}
              />
              <ProfileRow icon={<Calendar size={15} />} label={t('Registration Date', 'የተመዘገበበት ቀን')} value={selectedMember.created_at.slice(0, 10)} mono />
            </div>

            {selectedMember.notes && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{selectedMember.notes}</p>
            )}

            <div className="flex justify-between pt-2">
              {can('MEMBER_UPDATE') ? (
                <button onClick={() => openEdit(selectedMember)} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
                  <Pencil size={13} />
                  {t('Edit', 'አርትዕ')}
                </button>
              ) : (
                <span />
              )}
              <button onClick={() => setSelectedMember(null)} className="btn btn-secondary text-xs">
                {t('Close', 'ዝጋ')}
              </button>
            </div>
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

function ProfileRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="py-2.5 flex justify-between gap-3">
      <span className="text-slate-500 flex items-center gap-2 shrink-0">
        {icon} {label}
      </span>
      <span className={`text-slate-900 text-right ${mono ? 'font-mono' : 'font-medium'}`}>{value || '—'}</span>
    </div>
  );
}
