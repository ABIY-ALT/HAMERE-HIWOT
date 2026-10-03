'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Briefcase, Church, Edit3, Key, Landmark, Lock, Music, Save, Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { getInitials } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { changeMyPassword, loadMyProfile, updateMyContact, type ContactInput, type MyProfile } from './actions';
import { VOICE_PARTS, type VoicePart } from '@/lib/choir/types';
import type { MemberStatus, Person } from '@/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

const STATUS: Record<MemberStatus, { cls: string; label: [string, string] }> = {
  ACTIVE: { cls: 'badge badge-success', label: ['Active', 'ንቁ'] },
  INACTIVE: { cls: 'badge badge-warning', label: ['Inactive', 'የቦዘነ'] },
  SUSPENDED: { cls: 'badge badge-danger', label: ['Suspended', 'የታገደ'] },
  TRANSFERRED: { cls: 'badge badge-info', label: ['Transferred', 'የተዛወረ'] },
  DECEASED: { cls: 'badge bg-slate-200 text-slate-700', label: ['Deceased', 'ያረፈ'] },
};

type Tab = 'details' | 'service' | 'permissions' | 'password';
type Mode = 'loading' | 'demo' | 'live' | 'error';

const contactOf = (p: Person): ContactInput => ({
  phone_secondary: p.phone_secondary ?? '',
  email: p.email ?? '',
  address: p.address ?? '',
  father_of_confession: p.father_of_confession ?? '',
  emergency_contact_name: p.emergency_contact_name ?? '',
  emergency_contact_phone: p.emergency_contact_phone ?? '',
});

export default function ProfilePage() {
  const { user } = useAuth();
  const { t, locale } = useLang();

  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<ContactInput>(contactOf({} as Person));
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = React.useCallback(
    (res: Awaited<ReturnType<typeof loadMyProfile>>) => {
      setMode(res.mode);
      if (res.mode === 'live') setProfile(res.data);
      else if (res.mode === 'error') setError(res.error);
      else if (user) {
        // Demo mode: what the session already knows
        setProfile({
          person: user.person,
          username: user.systemUser.username,
          lastLogin: user.systemUser.last_login_at,
          access: user.assignments.map((a) => ({
            role: a.role?.name_en ?? '—', role_am: a.role?.name_am ?? a.role?.name_en ?? '—',
            unit: a.organization_unit?.name_en ?? '—', unit_am: a.organization_unit?.name_am ?? a.organization_unit?.name_en ?? '—',
          })),
          service: [],
          governance: [],
          choir: null,
          permissions: Array.from(user.permissions, (code) => ({ code: String(code), name_en: String(code), name_am: String(code), category: '' })),
        });
      }
    },
    [user]
  );

  useEffect(() => {
    loadMyProfile().then(apply);
  }, [apply]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const p = profile?.person;
  const name = p ? (locale === 'am' ? p.full_name_am || p.full_name_en : p.full_name_en) : '';

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const res = await updateMyContact(contact);
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setEditing(false);
    notify('success', t('Your details were saved', 'መረጃዎ ተቀምጧል'));
    loadMyProfile().then(apply);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (pw.next !== pw.confirm) return setFormError(t('The new passwords do not match', 'አዲሶቹ የይለፍ ቃሎች አይዛመዱም'));
    setBusy(true);
    const res = await changeMyPassword(pw.current, pw.next);
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setPw({ current: '', next: '', confirm: '' });
    notify('success', t('Your password was changed', 'የይለፍ ቃልዎ ተቀይሯል'));
  };

  const tabs: [Tab, string][] = [
    ['details', t('My details', 'የእኔ መረጃ')],
    ['service', t('Where I serve', 'የማገለግልበት')],
    ['permissions', `${t('Permissions', 'ፈቃዶች')} (${profile?.permissions.length ?? 0})`],
    ['password', t('Password', 'የይለፍ ቃል')],
  ];

  const byCategory = new Map<string, MyProfile['permissions']>();
  for (const perm of profile?.permissions ?? []) byCategory.set(perm.category, [...(byCategory.get(perm.category) ?? []), perm]);

  return (
    <div className="space-y-6 max-w-5xl">
      <AdminToast toast={toast} />
      {mode !== 'live' && <AdminModeNotice mode={mode} error={error} />}

      {/* Banner */}
      <div className="p-6 md:p-8 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl relative overflow-hidden shadow-lg">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl sm:text-4xl font-black text-white shadow-xl border-4 border-white/10 flex-shrink-0">
            {p ? getInitials(p.full_name_en) : '…'}
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{name || '…'}</h1>
                <p className="text-blue-200 text-sm mt-0.5">
                  {profile ? `${profile.username} • ${p?.membership_code ?? ''}` : ''}
                </p>
              </div>
              {p && (
                <button
                  onClick={() => {
                    setFormError('');
                    setContact(contactOf(p));
                    setEditing(true);
                  }}
                  className="btn btn-sm bg-white/10 hover:bg-white/20 text-white border-white/20 inline-flex items-center gap-2 self-center sm:self-auto shadow-sm backdrop-blur-md"
                >
                  <Edit3 size={14} />
                  {t('Edit my details', 'መረጃዬን አርትዕ')}
                </button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              {(profile?.access ?? []).filter((a) => a.role !== '—').map((a, i) => (
                <span key={i} className="badge bg-blue-500/20 text-blue-100 border border-blue-400/30 px-3 py-1">
                  <Shield size={12} className="inline mr-1" />
                  {locale === 'am' ? a.role_am : a.role}
                </span>
              ))}
              {(profile?.service.length ?? 0) > 0 && (
                <span className="badge bg-purple-500/20 text-purple-100 border border-purple-400/30 px-3 py-1">
                  <Briefcase size={12} className="inline mr-1" />
                  {t('Serving', 'በአገልግሎት ላይ')}
                </span>
              )}
              {profile?.choir && (
                <span className="badge bg-emerald-500/20 text-emerald-100 border border-emerald-400/30 px-3 py-1">
                  <Music size={12} className="inline mr-1" />
                  {t('Choir', 'መዘምራን')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-5 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setFormError('');
              setTab(key);
            }}
            className={`pb-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' && p && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card icon={<User size={18} className="text-blue-600" />} title={t('Contact', 'አድራሻ')}>
            <Row label={t('Sign-in phone', 'የመግቢያ ስልክ')} value={p.phone_primary} mono hint={t('Ask an administrator to change it', 'ለመቀየር አስተዳዳሪውን ይጠይቁ')} />
            <Row label={t('Other phone', 'ሌላ ስልክ')} value={p.phone_secondary} mono />
            <Row label={t('E-mail', 'ኢሜይል')} value={p.email} />
            <Row label={t('Address', 'አድራሻ')} value={p.address} />
            <Row
              label={t('Emergency contact', 'የአደጋ ጊዜ ተጠሪ')}
              value={[p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(' · ') || null}
            />
          </Card>
          <Card icon={<Church size={18} className="text-purple-600" />} title={t('Church & membership', 'መንፈሳዊና የአባልነት መረጃ')}>
            <Row label={t('Baptismal name', 'የክርስትና ስም')} value={p.baptismal_name} />
            <Row label={t('Father of confession', 'የንስሐ አባት')} value={p.father_of_confession} />
            <Row label={t('Membership code', 'የአባልነት ኮድ')} value={p.membership_code} mono />
            <Row label={t('Date of birth', 'የትውልድ ቀን')} value={p.date_of_birth ? formatEthiopianDate(p.date_of_birth, locale) : null} />
            <Row label={t('Gender', 'ጾታ')} value={p.gender === 'FEMALE' ? t('Female', 'ሴት') : t('Male', 'ወንድ')} />
            <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
              <span className="text-slate-500">{t('Membership status', 'የአባልነት ሁኔታ')}</span>
              <span className={STATUS[p.status].cls}>{t(...STATUS[p.status].label)}</span>
            </div>
            <Row label={t('Last sign-in', 'የመጨረሻ መግቢያ')} value={profile?.lastLogin ? formatEthiopianDate(profile.lastLogin.slice(0, 10), locale) : null} />
          </Card>
        </div>
      )}

      {tab === 'service' && profile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card icon={<Shield size={18} className="text-blue-600" />} title={t('System access', 'የስርዓት መዳረሻ')}>
            <List
              empty={t('No role assigned.', 'ሚና አልተሰጠም።')}
              items={profile.access.map((a) => [locale === 'am' ? a.role_am : a.role, locale === 'am' ? a.unit_am : a.unit])}
            />
          </Card>
          <Card icon={<Briefcase size={18} className="text-purple-600" />} title={t('Service assignments', 'የአገልግሎት ምደባዎች')}>
            <List
              empty={t('No current service assignment.', 'የአሁን የአገልግሎት ምደባ የለም።')}
              items={profile.service.map((s) => [
                `${locale === 'am' ? s.role_am : s.role}${s.class_name ? ` · ${s.class_name}` : ''}`,
                `${locale === 'am' ? s.unit_am : s.unit} · ${t('since', 'ከ')} ${formatEthiopianDate(s.since, locale)}`,
              ])}
            />
          </Card>
          <Card icon={<Landmark size={18} className="text-amber-600" />} title={t('Governance', 'የአስተዳደር አካላት')}>
            <List
              empty={t('Not a member of a governing body.', 'የአስተዳደር አካል አባል አይደሉም።')}
              items={profile.governance.map((g) => [
                locale === 'am' ? g.position_am : g.position,
                `${locale === 'am' ? g.body_am : g.body} · ${t('since', 'ከ')} ${formatEthiopianDate(g.since, locale)}`,
              ])}
            />
          </Card>
          <Card icon={<Music size={18} className="text-emerald-600" />} title={t('Choir', 'መዘምራን')}>
            <List
              empty={t('Not in the choir.', 'የመዘምራን አባል አይደሉም።')}
              items={
                profile.choir
                  ? [[
                      t(...(VOICE_PARTS[profile.choir.voice as VoicePart] ?? [profile.choir.voice, profile.choir.voice])),
                      profile.choir.since ? `${t('since', 'ከ')} ${formatEthiopianDate(profile.choir.since, locale)}` : '',
                    ]]
                  : []
              }
            />
          </Card>
        </div>
      )}

      {tab === 'permissions' && profile && (
        <div className="card p-6 space-y-5">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Key size={14} className="text-amber-600" />
            {t('What your roles allow you to do. An administrator changes roles under Administration → Users.', 'ሚናዎችዎ የሚፈቅዱልዎት። ሚና የሚቀየረው በአስተዳደር → ተጠቃሚዎች ነው።')}
          </p>
          {[...byCategory.entries()].map(([category, perms]) => (
            <div key={category || 'all'}>
              {category && <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{category}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {perms.map((perm) => (
                  <div key={perm.code} className="px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-lg">
                    <div className="text-xs font-medium text-slate-800">{locale === 'am' ? perm.name_am || perm.name_en : perm.name_en}</div>
                    <div className="text-[10px] font-mono text-slate-400">{perm.code}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {profile.permissions.length === 0 && <p className="text-sm text-slate-400">{t('No permissions yet.', 'እስካሁን ፈቃድ የለም።')}</p>}
        </div>
      )}

      {tab === 'password' && (
        <div className="card p-6 max-w-xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <Lock size={18} className="text-red-600" />
            {t('Change password', 'የይለፍ ቃል ቀይር')}
          </h2>
          <form onSubmit={savePassword} className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            {(
              [
                ['current', t('Current password', 'የአሁኑ የይለፍ ቃል'), 'current-password'],
                ['next', t('New password (at least 8 characters)', 'አዲስ የይለፍ ቃል (ቢያንስ 8 ፊደል)'), 'new-password'],
                ['confirm', t('Repeat the new password', 'አዲሱን የይለፍ ቃል ይድገሙ'), 'new-password'],
              ] as const
            ).map(([key, label, auto]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
                <input
                  type="password"
                  required
                  minLength={key === 'current' ? undefined : 8}
                  autoComplete={auto}
                  value={pw[key]}
                  onChange={(e) => setPw((s) => ({ ...s, [key]: e.target.value }))}
                  className="form-input text-sm"
                />
              </div>
            ))}
            <button type="submit" disabled={busy} className="btn btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-60">
              <Save size={15} />
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Change password', 'የይለፍ ቃል ቀይር')}
            </button>
          </form>
        </div>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(false)} title={t('Edit my details', 'መረጃዬን አርትዕ')} subtitle={t('Your name and sign-in phone are changed by an administrator.', 'ስምዎና የመግቢያ ስልክዎ የሚቀየሩት በአስተዳዳሪ ነው።')}>
          <form onSubmit={saveContact} className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            {(
              [
                ['phone_secondary', t('Other phone', 'ሌላ ስልክ'), 'tel'],
                ['email', t('E-mail', 'ኢሜይል'), 'email'],
                ['address', t('Address', 'አድራሻ'), 'text'],
                ['father_of_confession', t('Father of confession', 'የንስሐ አባት'), 'text'],
                ['emergency_contact_name', t('Emergency contact — name', 'የአደጋ ጊዜ ተጠሪ — ስም'), 'text'],
                ['emergency_contact_phone', t('Emergency contact — phone', 'የአደጋ ጊዜ ተጠሪ — ስልክ'), 'tel'],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
                <input
                  type={type}
                  value={contact[key] ?? ''}
                  onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                  className="form-input text-sm"
                />
              </div>
            ))}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 space-y-3">
      <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, mono = false, hint }: { label: string; value: string | null; mono?: boolean; hint?: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-500 shrink-0">
        {label}
        {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
      </span>
      <span className={`text-right text-slate-900 font-medium break-words min-w-0 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function List({ items, empty }: { items: [string, string][]; empty: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-50">
      {items.map(([main, sub], i) => (
        <li key={i} className="py-2">
          <div className="font-medium text-slate-900">{main}</div>
          {sub && <div className="text-xs text-slate-500">{sub}</div>}
        </li>
      ))}
    </ul>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} /> {text}
    </div>
  );
}
