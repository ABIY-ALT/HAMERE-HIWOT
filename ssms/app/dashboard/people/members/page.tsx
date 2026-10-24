'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { UserPlus, Search, Phone, MapPin, Church, Calendar, User, Mail, Pencil, AlertCircle, Camera, Briefcase, Users, ClipboardCheck, Check, ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolName } from '@/components/branding/TenantLogo';
import { MOCK_ORG_UNITS, MOCK_PERSONS } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import type { MemberStatus, Person } from '@/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  declaration,
  MARITAL_STATUSES,
  MAX_PHOTO_BYTES,
  MEMBERSHIP_TYPES,
  PHOTO_TYPES,
  SERVICE_DEPARTMENTS,
  ageFrom,
  choiceLabel,
} from '@/lib/members/form';
import {
  createMember,
  enrollMemberAsStudent,
  loadMembers,
  updateMember,
  uploadMemberPhoto,
  type MemberClass,
  type MemberInput,
  type MemberStudent,
  type MemberUnit,
  type StudentPerson,
} from '../actions';

type Toast = { kind: 'success' | 'error'; text: string } | null;

const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRANSFERRED', 'DECEASED'];

const STATUS_BADGE: Record<MemberStatus, string> = {
  ACTIVE: 'badge badge-success',
  INACTIVE: 'badge badge-warning',
  SUSPENDED: 'badge badge-danger',
  TRANSFERRED: 'badge badge-info',
  DECEASED: 'badge bg-slate-200 text-slate-700',
};

type MemberForm = MemberInput & { status: MemberStatus };

/** The form is filled in five steps; the last one is office use. */
const LAST_STEP = 4;

/** Field order follows the paper form: header, ፩ personal, ፪ spiritual, ፫ emergency, ፬ declaration, ፭ office. */
const EMPTY_FORM: MemberForm = {
  registration_term: '',
  registered_on: '',
  membership_type: 'REGULAR',
  full_name_am: '',
  full_name_en: '',
  father_name: '',
  mother_name: '',
  baptismal_name: '',
  gender: 'MALE',
  date_of_birth: '',
  marital_status: '',
  education_level: '',
  profession: '',
  workplace: '',
  phone_primary: '',
  phone_secondary: '',
  email: '',
  address: '',
  woreda: '',
  house_no: '',
  father_of_confession: '',
  confession_father_phone: '',
  baptism_date: '',
  baptism_church: '',
  served_elsewhere: null,
  previous_school: '',
  previous_role: '',
  preferred_departments: [],
  preferred_department_other: '',
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  declaration_signed: false,
  assigned_unit_id: '',
  registered_by_name: '',
  approved_by_name: '',
  approved_on: '',
  notes: '',
  status: 'ACTIVE',
};

function toForm(p: Person): MemberForm {
  return {
    registration_term: p.registration_term ?? '',
    registered_on: p.registered_on ?? '',
    membership_type: p.membership_type ?? 'REGULAR',
    full_name_am: p.full_name_am ?? '',
    // The English name is a copy of the Amharic one when only that was given
    full_name_en: p.full_name_en === p.full_name_am ? '' : p.full_name_en,
    father_name: p.father_name ?? '',
    mother_name: p.mother_name ?? '',
    baptismal_name: p.baptismal_name ?? '',
    gender: p.gender,
    date_of_birth: p.date_of_birth ?? '',
    marital_status: p.marital_status ?? '',
    education_level: p.education_level ?? '',
    profession: p.profession ?? '',
    workplace: p.workplace ?? '',
    phone_primary: p.phone_primary ?? '',
    phone_secondary: p.phone_secondary ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    woreda: p.woreda ?? '',
    house_no: p.house_no ?? '',
    father_of_confession: p.father_of_confession ?? '',
    confession_father_phone: p.confession_father_phone ?? '',
    baptism_date: p.baptism_date ?? '',
    baptism_church: p.baptism_church ?? '',
    served_elsewhere: p.served_elsewhere ?? null,
    previous_school: p.previous_school ?? '',
    previous_role: p.previous_role ?? '',
    preferred_departments: p.preferred_departments ?? [],
    preferred_department_other: p.preferred_department_other ?? '',
    emergency_contact_name: p.emergency_contact_name ?? '',
    emergency_contact_relation: p.emergency_contact_relation ?? '',
    emergency_contact_phone: p.emergency_contact_phone ?? '',
    declaration_signed: p.declaration_signed ?? false,
    assigned_unit_id: p.assigned_unit_id ?? '',
    registered_by_name: p.registered_by_name ?? '',
    approved_by_name: p.approved_by_name ?? '',
    approved_on: p.approved_on ?? '',
    notes: p.notes ?? '',
    status: p.status,
  };
}

const DEMO_UNITS: MemberUnit[] = MOCK_ORG_UNITS.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am }));

export default function MembersPage() {
  const { t, locale } = useLang();
  const { can, user } = useAuth();
  const [schoolEn, schoolAm] = useSchoolName('Hamere Hiwot Sunday School · Salo Debre Tsehay St. George Church', 'የሐመረ ሕይወት ሰንበት ትምህርት ቤት · ሳሎ ደብረ ጸሐይ ቅዱስ ጊዮርጊስ ቤተ ክርስቲያን');
  const isDefaultSchool = !user?.tenant || user.tenant.is_default;
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [units, setUnits] = useState<MemberUnit[]>([]);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState(0);
  /** Furthest step that may be opened from the step bar */
  const [reached, setReached] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Person | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  // Members who are also students
  const [studentOf, setStudentOf] = useState<Record<string, MemberStudent>>({});
  const [classes, setClasses] = useState<MemberClass[]>([]);
  const [studentsOnly, setStudentsOnly] = useState<StudentPerson[]>([]);
  /** "Already a student?": registering this student's own record as a member */
  const [fromStudent, setFromStudent] = useState<string | null>(null);

  const live = mode === 'live';
  const editing = editingId ? members.find((m) => m.id === editingId) : undefined;

  const statusLabel = (s: MemberStatus) =>
    ({
      ACTIVE: t('Active', 'ንቁ'),
      INACTIVE: t('Inactive', 'የቦዘነ'),
      SUSPENDED: t('Suspended', 'የታገደ'),
      TRANSFERRED: t('Transferred', 'የተዛወረ'),
      DECEASED: t('Deceased', 'ያረፈ'),
    })[s];
  const nameOf = (p: Person) => (locale === 'am' ? p.full_name_am || p.full_name_en : p.full_name_en);
  const unitName = (id: string | null | undefined) => {
    const u = units.find((x) => x.id === id);
    return u ? (locale === 'am' ? u.name_am || u.name_en : u.name_en) : '';
  };
  const ethDate = (iso: string | null | undefined) => (iso ? `${formatEthiopianDate(iso, locale)} ${t('E.C.', 'ዓ.ም')}` : '');
  /** Live photos come through the route that checks permissions; demo photos are local previews. */
  const photoSrc = (p: Person) =>
    !p.profile_photo_url ? null : live ? `/dashboard/people/members/photo/${p.id}?v=${encodeURIComponent(p.updated_at)}` : p.profile_photo_url;

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMembers>>) => {
    if (res.mode === 'demo') {
      setMembers(MOCK_PERSONS);
      setUnits(DEMO_UNITS);
    } else if (res.mode === 'live') {
      setMembers(res.data.members);
      setUnits(res.data.units);
      setStudentOf(res.data.student_of);
      setClasses(res.data.classes);
      setStudentsOnly(res.data.students_only);
    } else setLoadError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadMembers().then(apply);
  }, [apply]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const set = (key: keyof MemberForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setValue = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!PHOTO_TYPES[file.type]) return setFormError(t('The photo must be a JPG, PNG or WebP image.', 'ፎቶው JPG፣ PNG ወይም WebP መሆን አለበት።'));
    if (file.size > MAX_PHOTO_BYTES) return setFormError(t('The photo is larger than 2 MB.', 'ፎቶው ከ2 ሜባ በላይ ነው።'));
    setFormError('');
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const closeForm = () => {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    setFormOpen(false);
  };

  const steps = [
    t('Registration', 'ምዝገባ'),
    t('Personal & family', 'የግልና የቤተሰብ መረጃ'),
    t('Spiritual & service', 'መንፈሳዊ ሕይወትና አገልግሎት'),
    t('Contact & declaration', 'ተጠሪና ቃል ኪዳን'),
    t('Office use', 'ለጽ/ቤት ብቻ'),
  ];

  const goTo = (next: number) => {
    setFormError('');
    setStep(next);
    setReached((r) => Math.max(r, next));
    // The modal body scrolls; start each step at its top
    formRef.current?.parentElement?.scrollTo({ top: 0 });
  };

  /** Next only when the fields of this step are filled in correctly (the browser shows what is missing). */
  const goNext = () => {
    if (formRef.current?.reportValidity()) goTo(Math.min(step + 1, LAST_STEP));
  };

  const openCreate = () => {
    setEditingId(null);
    setFromStudent(null);
    setForm({ ...EMPTY_FORM, registered_on: todayIso() });
    setPhoto(null);
    setFormError('');
    setStep(0);
    setReached(0);
    setFormOpen(true);
  };

  const openEdit = (p: Person) => {
    setSelectedMember(null);
    setEditingId(p.id);
    setForm(toForm(p));
    setPhoto(null);
    setFormError('');
    setStep(0);
    // Every step of an existing member can be opened, and saved from any step
    setReached(LAST_STEP);
    setFormOpen(true);
  };

  /** Start the form from a student's own record: their details are filled in, and saving makes that same person a member. */
  const chooseStudent = (personId: string) => {
    const p = studentsOnly.find((s) => s.id === personId);
    setFromStudent(p ? p.id : null);
    setForm(p ? { ...toForm(p), registered_on: todayIso(), membership_type: 'REGULAR', status: 'ACTIVE' } : { ...EMPTY_FORM, registered_on: todayIso() });
  };

  const toggleDepartment = (code: string) =>
    setForm((f) => ({
      ...f,
      preferred_departments: f.preferred_departments.includes(code)
        ? f.preferred_departments.filter((c) => c !== code)
        : [...f.preferred_departments, code],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter on an earlier step of a new registration moves on instead of saving
    if (!editingId && step < LAST_STEP) return goNext();
    setFormError('');
    if (!(form.full_name_am || form.full_name_en || '').trim() || !(form.phone_primary || '').trim()) {
      goTo(1);
      setFormError(t('Fill in the full name and the main phone number.', 'ሙሉ ስምና ዋና ስልክ ቁጥር ይሙሉ።'));
      return;
    }
    const { status, ...fields } = form;
    const displayName = form.full_name_am || form.full_name_en;
    let photoError = '';

    if (live) {
      setBusy(true);
      let personId = editingId;
      if (editingId) {
        const res = await updateMember(editingId, { ...fields, status });
        if (!res.ok) {
          setBusy(false);
          return setFormError(res.error);
        }
      } else {
        const res = await createMember(fields, fromStudent ?? undefined);
        if (!res.ok) {
          setBusy(false);
          return setFormError(res.error);
        }
        personId = res.id;
      }
      if (photo && personId) {
        const data = new FormData();
        data.append('person_id', personId);
        data.append('file', photo.file);
        const res = await uploadMemberPhoto(data);
        if (!res.ok) photoError = res.error;
        URL.revokeObjectURL(photo.preview);
      }
      setBusy(false);
      apply(await loadMembers());
    } else {
      // Demo mode: change the list on screen only
      const now = new Date().toISOString();
      const clean = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
      ) as unknown as Partial<Person>;
      const extra = { full_name_en: fields.full_name_en || displayName || '', ...(photo ? { profile_photo_url: photo.preview } : {}) };
      if (editingId) {
        setMembers((prev) => prev.map((p) => (p.id === editingId ? { ...p, ...clean, ...extra, status, updated_at: now } : p)));
      } else {
        setMembers((prev) => [
          {
            ...(clean as Person),
            ...extra,
            id: `person-${Date.now()}`,
            membership_code: `MBR-${new Date().getFullYear()}-${String(prev.length + 1).padStart(4, '0')}`,
            gender: fields.gender,
            profile_photo_url: photo?.preview ?? null,
            status: 'ACTIVE',
            created_at: now,
            updated_at: now,
          },
          ...prev,
        ]);
      }
    }

    setPhoto(null);
    setFormOpen(false);
    if (photoError) {
      showToast('error', t(`Saved, but the photo was not uploaded: ${photoError}`, `ተመዝግቧል፤ ፎቶው ግን አልገባም፦ ${photoError}`));
      return;
    }
    showToast(
      'success',
      editingId
        ? t('Member updated', 'የአባሉ መረጃ ተቀይሯል')
        : fromStudent
          ? t(`${displayName} is now a member as well as a student`, `${displayName} ከተማሪነት በተጨማሪ አባል ሆኗል/ለች`)
          : t(`New member ${displayName} registered`, `አዲስ አባል ${displayName} ተመዝግቧል`)
    );
  };

  const needle = search.toLowerCase();
  const filtered = members.filter((p) => {
    const names = `${p.full_name_en} ${p.full_name_am ?? ''}`.toLowerCase();
    const matchesSearch =
      names.includes(needle) ||
      p.membership_code.toLowerCase().includes(needle) ||
      (studentOf[p.id]?.reg_no ?? '').toLowerCase().includes(needle) ||
      (p.phone_primary ?? '').includes(search) ||
      (p.baptismal_name ?? '').toLowerCase().includes(needle);
    return (
      matchesSearch &&
      (genderFilter === 'ALL' || p.gender === genderFilter) &&
      (statusFilter === 'ALL' || p.status === statusFilter)
    );
  });

  const formAge = ageFrom(form.date_of_birth);
  const formPhoto = photo?.preview ?? (editing ? photoSrc(editing) : null);

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
              className="form-input text-xs py-1.5 px-3 w-auto"
            >
              <option value="ALL">{t('All Genders', 'ሁሉም ጾታ')}</option>
              <option value="MALE">{t('Male', 'ወንድ')}</option>
              <option value="FEMALE">{t('Female', 'ሴት')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3 w-auto"
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
                    {nameOf(m)}
                    {studentOf[m.id] && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 align-middle" title={t('Also a student', 'ተማሪም ነው')}>
                        <GraduationCap size={11} /> {studentOf[m.id].reg_no}
                      </span>
                    )}
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

      {/* Register / Edit Member Modal — the paper registration form */}
      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingId ? t('Edit Member', 'አባል አርትዕ') : t('Member Registration Form', 'የአባላት መመዝገቢያ ቅጽ')}
        subtitle={t(schoolEn, schoolAm)}
        maxWidth="2xl"
      >
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          <ol className="flex items-center gap-1">
            {steps.map((label, i) => (
              <li key={label} className={`flex items-center gap-1 min-w-0 ${i < LAST_STEP ? 'flex-1' : ''}`}>
                <button
                  type="button"
                  disabled={i > reached}
                  onClick={() => goTo(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className="flex items-center gap-1.5 min-w-0 disabled:cursor-default"
                >
                  <span
                    className={`w-6 h-6 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      i === step ? 'bg-rose-900 text-white' : i <= reached ? 'bg-rose-100 text-rose-900' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {i < step ? <Check size={12} /> : i + 1}
                  </span>
                  <span className={`hidden md:block truncate text-[11px] ${i === step ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
                </button>
                {i < LAST_STEP && <span className="flex-1 h-px bg-slate-200 min-w-2" />}
              </li>
            ))}
          </ol>
          <p className="md:hidden -mt-3 text-xs text-slate-500">
            {t(`Step ${step + 1} of ${LAST_STEP + 1}`, `ደረጃ ${step + 1} ከ${LAST_STEP + 1}`)} · {steps[step]}
          </p>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          {/* Step 1 — form header: term, ID, date, photo, membership type */}
          {step === 0 && (
            <>
              {!editingId && studentsOnly.length > 0 && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2.5 space-y-1.5">
                  <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                    <GraduationCap size={14} /> {t('Already registered as a student? (optional)', 'ቀድሞ በተማሪነት ተመዝግቧል/ለች? (ካለ)')}
                  </label>
                  <select value={fromStudent ?? ''} onChange={(e) => chooseStudent(e.target.value)} className="form-input text-sm">
                    <option value="">{t('— No, a new person —', '— አይ፣ አዲስ ሰው ነው —')}</option>
                    {studentsOnly.map((s) => (
                      <option key={s.id} value={s.id}>{nameOf(s)} · {s.reg_no}</option>
                    ))}
                  </select>
                  {fromStudent && (
                    <p className="text-[11px] text-indigo-800">
                      {t(
                        'Their details are filled in. Saving makes the same person a member too — results, attendance and logins stay with them.',
                        'መረጃቸው ተሞልቷል። ሲያስቀምጡ ያው ሰው አባልም ይሆናል — ውጤት፣ ክትትልና መግቢያ አብረውት ይቆያሉ።'
                      )}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-4">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('Registration term (E.C.)', 'የምዝገባ ዘመን (ዓ.ም.)')}>
                    <input type="text" value={form.registration_term ?? ''} onChange={set('registration_term')} placeholder="20__/20__" className="form-input text-sm" />
                  </Field>
                  <Field label={t('Member ID', 'የአባልነት መለያ ቁጥር (ID)')}>
                    <div className="form-input text-sm font-mono bg-slate-50 text-slate-500 select-all">
                      {editing?.membership_code ?? t('Given automatically', 'በራሱ ይሰጣል')}
                    </div>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t('Registration date', 'የምዝገባ ቀን')}>
                      <EthiopianDateInput value={form.registered_on ?? ''} onChange={(d) => setValue('registered_on', d)} yearsBack={50} optional />
                    </Field>
                  </div>
                </div>
                <label className="self-center sm:self-start shrink-0 w-28 h-32 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center cursor-pointer overflow-hidden hover:border-blue-300 hover:bg-blue-50/30 transition-colors relative">
                  {formPhoto ? (
                    <Image src={formPhoto} alt={t('Photo', 'ፎቶግራፍ')} fill unoptimized className="object-cover" />
                  ) : (
                    <>
                      <Camera size={22} className="text-slate-400" />
                      <span className="text-[11px] text-slate-500 mt-1">{t('Photo', 'ፎቶግራፍ')}</span>
                      <span className="text-[10px] text-slate-400">JPG/PNG · 2 MB</span>
                    </>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 px-3 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-xs font-semibold text-slate-700">{t('Membership type', 'የአባልነት ዓይነት')}:</span>
                {MEMBERSHIP_TYPES.map(([code, en, am], i) => (
                  <Radio key={code} name="membership_type" checked={form.membership_type === code} onChange={() => setValue('membership_type', code)}>
                    {`${'፩፪፫'[i]}. ${locale === 'am' ? am : en}`}
                  </Radio>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <Section title={t('1. Personal & Family Information', '፩. የአባሉ/ዋ የግል እና የቤተሰብ መረጃ')}>
              <div className="sm:col-span-2">
                <Field label={t("Full name (with grandfather's name, Amharic)", 'ሙሉ ስም (ከነ አያት)') + ' *'}>
                  <input type="text" required={!form.full_name_en} value={form.full_name_am ?? ''} onChange={set('full_name_am')} placeholder="ለምሳሌ: ሰሎሞን ግርማ ተሰማ" className="form-input text-sm" />
                </Field>
              </div>
              <Field label={t('Full name in English (optional)', 'ሙሉ ስም በእንግሊዝኛ (ካለ)')}>
                <input type="text" value={form.full_name_en ?? ''} onChange={set('full_name_en')} placeholder="e.g. Solomon Girma Tessema" className="form-input text-sm" />
              </Field>
              <Field label={t('Baptismal name', 'የክርስትና ስም')}>
                <input type="text" value={form.baptismal_name ?? ''} onChange={set('baptismal_name')} placeholder="ለምሳሌ: ወልደ ገብርኤል" className="form-input text-sm" />
              </Field>
              <Field label={t("Father's full name", 'የአባት ሙሉ ስም')}>
                <input type="text" value={form.father_name ?? ''} onChange={set('father_name')} className="form-input text-sm" />
              </Field>
              <Field label={t("Mother's full name", 'የእናት ሙሉ ስም')}>
                <input type="text" value={form.mother_name ?? ''} onChange={set('mother_name')} className="form-input text-sm" />
              </Field>
              <Field label={t('Gender', 'ጾታ') + ' *'}>
                <div className="flex gap-5 py-2">
                  <Radio name="gender" checked={form.gender === 'MALE'} onChange={() => setValue('gender', 'MALE')}>{t('Male', 'ወንድ')}</Radio>
                  <Radio name="gender" checked={form.gender === 'FEMALE'} onChange={() => setValue('gender', 'FEMALE')}>{t('Female', 'ሴት')}</Radio>
                </div>
              </Field>
              <Field label={t('Marital status', 'የጋብቻ ሁኔታ')}>
                <div className="flex gap-5 py-2">
                  {MARITAL_STATUSES.map(([code, en, am]) => (
                    <Radio key={code} name="marital_status" checked={form.marital_status === code} onChange={() => setValue('marital_status', code)}>
                      {locale === 'am' ? am : en}
                    </Radio>
                  ))}
                </div>
              </Field>
              <Field label={t('Date of birth (day/month/year E.C.)', 'የትውልድ ቀን (ቀ/ወ/ዓ)')}>
                <EthiopianDateInput value={form.date_of_birth ?? ''} onChange={(d) => setValue('date_of_birth', d)} yearsBack={100} optional />
              </Field>
              <Field label={t('Age', 'ዕድሜ')}>
                <input type="text" readOnly value={formAge ?? ''} placeholder={t('From the date of birth', 'ከትውልድ ቀን ይሰላል')} className="form-input text-sm bg-slate-50 text-slate-600" />
              </Field>
              <Field label={t('Education level / grade', 'የትምህርት ደረጃ / ክፍል')}>
                <input type="text" value={form.education_level ?? ''} onChange={set('education_level')} className="form-input text-sm" />
              </Field>
              <Field label={t('Profession', 'የሙያ መስክ')}>
                <input type="text" value={form.profession ?? ''} onChange={set('profession')} className="form-input text-sm" />
              </Field>
              <Field label={t('Workplace / employer', 'የስራ ቦታ / መስሪያ ቤት')}>
                <input type="text" value={form.workplace ?? ''} onChange={set('workplace')} className="form-input text-sm" />
              </Field>
              <Field label={t('Phone (main)', 'ስልክ (ዋና)') + ' *'}>
                <input type="tel" required value={form.phone_primary ?? ''} onChange={set('phone_primary')} placeholder="09..." className="form-input text-sm" />
              </Field>
              <Field label={t('Second phone', 'ተጨማሪ ስልክ')}>
                <input type="tel" value={form.phone_secondary ?? ''} onChange={set('phone_secondary')} className="form-input text-sm" />
              </Field>
              <Field label={t('E-mail', 'ኢሜይል')}>
                <input type="email" value={form.email ?? ''} onChange={set('email')} className="form-input text-sm" />
              </Field>
              <Field label={t('Residence (sub-city)', 'የመኖሪያ አድራሻ (ክ/ከተማ)')}>
                <input type="text" value={form.address ?? ''} onChange={set('address')} className="form-input text-sm" />
              </Field>
              <Field label={t('Woreda / house no.', 'ወረዳ / የቤት ቁ.')}>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={form.woreda ?? ''} onChange={set('woreda')} placeholder={t('Woreda', 'ወረዳ')} className="form-input text-sm" />
                  <input type="text" value={form.house_no ?? ''} onChange={set('house_no')} placeholder={t('House no.', 'የቤት ቁ.')} className="form-input text-sm" />
                </div>
              </Field>
            </Section>
          )}

          {step === 2 && (
            <Section title={t('2. Spiritual Life & Service Department', '፪. መንፈሳዊ ሕይወት እና የአገልግሎት ክፍል ምርጫ')}>
              <Field label={t('Father of confession', 'የንስሐ አባት ስም')}>
                <input type="text" value={form.father_of_confession ?? ''} onChange={set('father_of_confession')} placeholder="መምህር / ቄስ..." className="form-input text-sm" />
              </Field>
              <Field label={t("Confession father's phone", 'የንስሐ አባት ስልክ')}>
                <input type="tel" value={form.confession_father_phone ?? ''} onChange={set('confession_father_phone')} placeholder="09…" className="form-input text-sm" />
              </Field>
              <Field label={t('Baptism date', 'የተጠመቁበት ቀን')}>
                <input type="date" value={form.baptism_date ?? ''} onChange={set('baptism_date')} className="form-input text-sm" />
              </Field>
              <Field label={t('Church of baptism', 'የተጠመቁበት ቤተ ክርስቲያን')}>
                <input type="text" value={form.baptism_church ?? ''} onChange={set('baptism_church')} className="form-input text-sm" />
              </Field>
              <Field label={t('Served in another Sunday school before?', 'ቀደም ሲል በሌላ ሰ/ት/ቤት አገልግለው ያውቃሉ?')}>
                <div className="flex gap-5 py-2">
                  <Radio name="served_elsewhere" checked={form.served_elsewhere === true} onChange={() => setValue('served_elsewhere', true)}>{t('Yes', 'አዎ')}</Radio>
                  <Radio name="served_elsewhere" checked={form.served_elsewhere === false} onChange={() => setValue('served_elsewhere', false)}>{t('No', 'አላውቅም')}</Radio>
                </div>
              </Field>
              {form.served_elsewhere && (
                <>
                  <Field label={t('If yes: Sunday school name (where)', 'አዎ ከሆነ፤ የሰንበት ት/ቤቱ ስም (የት)')}>
                    <input type="text" value={form.previous_school ?? ''} onChange={set('previous_school')} className="form-input text-sm" />
                  </Field>
                  <Field label={t('Department / responsibility served', 'ያገለገሉበት ክፍል/ኃላፊነት')}>
                    <input type="text" value={form.previous_role ?? ''} onChange={set('previous_role')} className="form-input text-sm" />
                  </Field>
                </>
              )}
              <div className="sm:col-span-2">
                <Field label={t('Department they want to serve in (choice)', 'ማገልገል የሚፈልጉበት ክፍል (ምርጫ)')}>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
                    {SERVICE_DEPARTMENTS.map(([code, en, am]) => (
                      <label key={code} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                        <input type="checkbox" checked={form.preferred_departments.includes(code)} onChange={() => toggleDepartment(code)} />
                        {locale === 'am' ? am : en}
                      </label>
                    ))}
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                      {t('Other', 'ሌላ')}:
                      <input type="text" value={form.preferred_department_other ?? ''} onChange={set('preferred_department_other')} className="form-input text-sm py-1 w-36" />
                    </span>
                  </div>
                </Field>
              </div>
            </Section>
          )}

          {step === 3 && (
            <>
              <Section title={t('3. Emergency Contact', '፫. የአስቸኳይ ጊዜ ተጠሪ መረጃ')}>
                <Field label={t('Contact person name', 'ተጠሪ ሰው ስም')}>
                  <input type="text" value={form.emergency_contact_name ?? ''} onChange={set('emergency_contact_name')} className="form-input text-sm" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('Relationship', 'ዝምድና')}>
                    <input type="text" value={form.emergency_contact_relation ?? ''} onChange={set('emergency_contact_relation')} className="form-input text-sm" />
                  </Field>
                  <Field label={t('Phone', 'ስልክ')}>
                    <input type="tel" value={form.emergency_contact_phone ?? ''} onChange={set('emergency_contact_phone')} className="form-input text-sm" />
                  </Field>
                </div>
              </Section>

              <Section title={t("4. Member's Declaration & Signature", '፬. የአባሉ/ዋ ቃል ኪዳንና ፊርማ')}>
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-xs italic text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {declaration(locale, isDefaultSchool ? null : [schoolEn, schoolAm])}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.declaration_signed} onChange={(e) => setValue('declaration_signed', e.target.checked)} />
                    {t('The member signed this declaration on the paper form', 'አባሉ/ዋ ቃል ኪዳኑን በቅጹ ላይ ፈርሟል/ፈርማለች')}
                  </label>
                </div>
              </Section>
            </>
          )}

          {step === 4 && (
            <Section title={t('5. For Office Use Only', '፭. ለሰንበት ት/ቤቱ ሥራ አስፈፃሚ / አስተዳደር ብቻ')}>
              <Field label={t('Assigned department', 'የተመደበበት/ችበት ክፍል (ምድብ)')}>
                <select value={form.assigned_unit_id} onChange={set('assigned_unit_id')} className="form-input text-sm">
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am || u.name_en : u.name_en}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Registered by (secretary)', 'የመዘገበው/ችው ጸሐፊ ስም')}>
                <input type="text" value={form.registered_by_name ?? ''} onChange={set('registered_by_name')} placeholder={editingId ? '' : t('Your name if left empty', 'ባዶ ከሆነ የእርስዎ ስም ይገባል')} className="form-input text-sm" />
              </Field>
              <Field label={t('Approved by (chairperson / general secretary)', 'የሊቀመንበር / ዋና ጸሐፊ ማረጋገጫ')}>
                <input type="text" value={form.approved_by_name ?? ''} onChange={set('approved_by_name')} className="form-input text-sm" />
              </Field>
              <Field label={t('Approval date (and seal)', 'ቀንና ማህተም')}>
                <EthiopianDateInput value={form.approved_on ?? ''} onChange={(d) => setValue('approved_on', d)} optional />
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
              <div className="sm:col-span-2">
                <Field label={t('Notes', 'ማስታወሻ')}>
                  <textarea value={form.notes ?? ''} onChange={set('notes')} rows={2} className="form-input text-sm" />
                </Field>
              </div>
            </Section>
          )}

          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} className="btn btn-secondary text-xs py-2 inline-flex items-center gap-1">
                <ChevronLeft size={14} /> {t('Back', 'ተመለስ')}
              </button>
            ) : (
              <button type="button" onClick={closeForm} className="btn btn-secondary text-xs py-2">
                {t('Cancel', 'ሰርዝ')}
              </button>
            )}
            <div className="flex items-center gap-2">
              {step < LAST_STEP && (
                <button type="button" onClick={goNext} className={`btn text-xs py-2 px-4 inline-flex items-center gap-1 ${editingId ? 'btn-secondary' : 'btn-primary'}`}>
                  {t('Next', 'ቀጣይ')} <ChevronRight size={14} />
                </button>
              )}
              {(editingId || step === LAST_STEP) && (
                <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
                  {busy ? t('Saving…', 'በመመዝገብ ላይ…') : editingId ? t('Save Changes', 'ለውጦችን አስቀምጥ') : t('Save Member', 'አባል መዝግብ')}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Member Profile Modal */}
      {selectedMember && (
        <Modal
          isOpen
          onClose={() => setSelectedMember(null)}
          title={nameOf(selectedMember)}
          subtitle={`${selectedMember.membership_code} • ${statusLabel(selectedMember.status)}`}
          maxWidth="xl"
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              {photoSrc(selectedMember) ? (
                <div className="relative w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
                  <Image src={photoSrc(selectedMember)!} alt={nameOf(selectedMember)} fill unoptimized className="object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl flex-shrink-0">
                  {selectedMember.full_name_en.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="font-bold text-base text-slate-900">{nameOf(selectedMember)}</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedMember.membership_code}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={STATUS_BADGE[selectedMember.status]}>{statusLabel(selectedMember.status)}</span>
                  <span className="badge badge-info">
                    {selectedMember.gender === 'MALE' ? t('Male', 'ወንድ') : t('Female', 'ሴት')}
                  </span>
                  {selectedMember.membership_type && (
                    <span className="badge bg-slate-100 text-slate-700">{choiceLabel(MEMBERSHIP_TYPES, selectedMember.membership_type, locale)}</span>
                  )}
                </div>
              </div>
            </div>

            <ProfileGroup title={t('Personal & family', 'የግል እና የቤተሰብ መረጃ')}>
              <ProfileRow icon={<Church size={15} />} label={t('Baptismal Name', 'የክርስትና ስም')} value={selectedMember.baptismal_name} />
              <ProfileRow icon={<User size={15} />} label={t("Father's name", 'የአባት ሙሉ ስም')} value={selectedMember.father_name} />
              <ProfileRow icon={<User size={15} />} label={t("Mother's name", 'የእናት ሙሉ ስም')} value={selectedMember.mother_name} />
              <ProfileRow
                icon={<Calendar size={15} />}
                label={t('Date of Birth', 'የትውልድ ቀን')}
                value={[ethDate(selectedMember.date_of_birth), ageFrom(selectedMember.date_of_birth) !== null ? t(`age ${ageFrom(selectedMember.date_of_birth)}`, `ዕድሜ ${ageFrom(selectedMember.date_of_birth)}`) : ''].filter(Boolean).join(' · ')}
              />
              <ProfileRow icon={<Users size={15} />} label={t('Marital status', 'የጋብቻ ሁኔታ')} value={choiceLabel(MARITAL_STATUSES, selectedMember.marital_status, locale)} />
              <ProfileRow icon={<Briefcase size={15} />} label={t('Education', 'የትምህርት ደረጃ')} value={selectedMember.education_level} />
              <ProfileRow icon={<Briefcase size={15} />} label={t('Profession · workplace', 'ሙያ · የስራ ቦታ')} value={[selectedMember.profession, selectedMember.workplace].filter(Boolean).join(' · ')} />
              <ProfileRow icon={<Phone size={15} />} label={t('Phone', 'ስልክ')} value={[selectedMember.phone_primary, selectedMember.phone_secondary].filter(Boolean).join(' · ')} mono />
              <ProfileRow icon={<Mail size={15} />} label={t('E-mail', 'ኢሜይል')} value={selectedMember.email} />
              <ProfileRow
                icon={<MapPin size={15} />}
                label={t('Address', 'አድራሻ')}
                value={[selectedMember.address, selectedMember.woreda && `${t('Woreda', 'ወረዳ')} ${selectedMember.woreda}`, selectedMember.house_no && `${t('House', 'የቤት ቁ.')} ${selectedMember.house_no}`].filter(Boolean).join(' · ')}
              />
            </ProfileGroup>

            <ProfileGroup title={t('Spiritual life & service', 'መንፈሳዊ ሕይወት እና አገልግሎት')}>
              <ProfileRow
                icon={<User size={15} />}
                label={t('Father of Confession', 'የንስሐ አባት')}
                value={[selectedMember.father_of_confession, selectedMember.confession_father_phone].filter(Boolean).join(' · ')}
              />
              <ProfileRow
                icon={<Church size={15} />}
                label={t('Baptism', 'ጥምቀት')}
                value={[selectedMember.baptism_date && formatEthiopianDate(selectedMember.baptism_date, locale), selectedMember.baptism_church].filter(Boolean).join(' · ')}
              />
              <ProfileRow
                icon={<Church size={15} />}
                label={t('Served elsewhere', 'በሌላ ሰ/ት/ቤት')}
                value={
                  selectedMember.served_elsewhere === true
                    ? [t('Yes', 'አዎ'), selectedMember.previous_school, selectedMember.previous_role].filter(Boolean).join(' · ')
                    : selectedMember.served_elsewhere === false
                      ? t('No', 'አላገለገለም')
                      : ''
                }
              />
              <ProfileRow
                icon={<Users size={15} />}
                label={t('Wants to serve in', 'ማገልገል የሚፈልገው ክፍል')}
                value={[...(selectedMember.preferred_departments ?? []).map((c) => choiceLabel(SERVICE_DEPARTMENTS, c, locale)), selectedMember.preferred_department_other].filter(Boolean).join(', ')}
              />
            </ProfileGroup>

            <ProfileGroup title={t('Emergency contact', 'የአስቸኳይ ጊዜ ተጠሪ')}>
              <ProfileRow
                icon={<Phone size={15} />}
                label={t('Contact', 'ተጠሪ')}
                value={[selectedMember.emergency_contact_name, selectedMember.emergency_contact_relation, selectedMember.emergency_contact_phone].filter(Boolean).join(' · ')}
              />
            </ProfileGroup>

            {(studentOf[selectedMember.id] || (live && can('STUDENT_CREATE'))) && (
              <ProfileGroup title={t('Student', 'ተማሪነት')}>
                {studentOf[selectedMember.id] ? (
                  <>
                    <ProfileRow icon={<GraduationCap size={15} />} label={t('Registration No.', 'የምዝገባ ቁጥር')} value={studentOf[selectedMember.id].reg_no} mono />
                    <ProfileRow
                      icon={<GraduationCap size={15} />}
                      label={t('Class', 'ክፍል')}
                      value={[locale === 'am' ? studentOf[selectedMember.id].class_am : studentOf[selectedMember.id].class_en, studentOf[selectedMember.id].status !== 'ACTIVE' ? studentOf[selectedMember.id].status : ''].filter(Boolean).join(' · ')}
                    />
                  </>
                ) : (
                  <EnrollAsStudent
                    key={selectedMember.id}
                    classes={classes}
                    onEnroll={async (classId, date) => {
                      const res = await enrollMemberAsStudent(selectedMember.id, classId, date);
                      if (!res.ok) return res.error;
                      showToast('success', t(`Enrolled — registration number ${res.reg_no}`, `ተመዝግቧል — የምዝገባ ቁጥር ${res.reg_no}`));
                      apply(await loadMembers());
                      return null;
                    }}
                  />
                )}
              </ProfileGroup>
            )}

            <ProfileGroup title={t('Registration & office use', 'ምዝገባ እና የጽ/ቤት አገልግሎት')}>
              <ProfileRow icon={<Calendar size={15} />} label={t('Registration', 'ምዝገባ')} value={[selectedMember.registration_term && `${selectedMember.registration_term} ${t('E.C.', 'ዓ.ም')}`, ethDate(selectedMember.registered_on ?? selectedMember.created_at.slice(0, 10))].filter(Boolean).join(' · ')} />
              <ProfileRow icon={<ClipboardCheck size={15} />} label={t('Declaration signed', 'ቃል ኪዳን ፈርሟል')} value={selectedMember.declaration_signed ? t('Yes', 'አዎ') : t('No', 'አልፈረመም')} />
              <ProfileRow icon={<Users size={15} />} label={t('Assigned department', 'የተመደበበት ክፍል')} value={unitName(selectedMember.assigned_unit_id)} />
              <ProfileRow icon={<User size={15} />} label={t('Registered by', 'የመዘገበው ጸሐፊ')} value={selectedMember.registered_by_name} />
              <ProfileRow icon={<ClipboardCheck size={15} />} label={t('Approved by', 'ያረጋገጠው')} value={[selectedMember.approved_by_name, ethDate(selectedMember.approved_on)].filter(Boolean).join(' · ')} />
            </ProfileGroup>

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

/** "Enroll in a class": a member who also attends classes becomes a student (same person, new registration number). */
function EnrollAsStudent({ classes, onEnroll }: { classes: MemberClass[]; onEnroll: (classId: string, date: string) => Promise<string | null> }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <div className="py-2.5 flex items-center justify-between gap-3">
        <span className="text-slate-500 text-xs">{t('Not a student. Attends classes too?', 'ተማሪ አይደለም። ትምህርትም ይከታተላል?')}</span>
        <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
          <GraduationCap size={13} /> {t('Enroll in a class', 'በክፍል መዝግብ')}
        </button>
      </div>
    );
  }
  const save = async () => {
    setBusy(true);
    setError('');
    const problem = await onEnroll(classId, date);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <div className="py-3 space-y-3">
      {error && <p className="p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">{error}</p>}
      {classes.length === 0 ? (
        <p className="text-xs text-amber-700">{t('No classes this year yet — add them under Education first.', 'በዚህ ዓመት ገና ክፍል የለም — መጀመሪያ በትምህርት ክፍል ይጨምሩ።')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Class', 'ክፍል')} *</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am || c.name_en : c.name_en}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Enrollment date', 'የተመዘገበበት ቀን')}</label>
            <EthiopianDateInput value={date} onChange={setDate} />
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {t('The same person gets a registration number: they stay a member (dues, departments) and also get results and attendance.', 'ያው ሰው የምዝገባ ቁጥር ያገኛል፤ አባል ሆኖ ይቀጥላል (መዋጮ፣ ክፍሎች) እና ውጤትና ክትትልም ይኖረዋል።')}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
        <button type="button" disabled={busy || !classId} onClick={save} className="btn btn-primary text-xs disabled:opacity-50">
          {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Enroll', 'መዝግብ')}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 overflow-hidden">
      <legend className="sr-only">{title}</legend>
      <div className="px-4 py-2 bg-rose-50/60 border-b border-slate-200 border-l-4 border-l-rose-900 text-sm font-bold text-rose-950">{title}</div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
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

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

function ProfileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">{title}</h5>
      <div className="divide-y divide-slate-100 border-y border-slate-100">{children}</div>
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
