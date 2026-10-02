'use client';

import React, { useState } from 'react';
import { UserPlus, Search, Phone, MapPin, CheckCircle2, Church, Calendar, User } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONS } from '@/lib/mock/data';
import { Modal } from '@/components/ui/Modal';
import type { Person } from '@/types';

export default function MembersPage() {
  const { t, locale } = useLang();
  const [members, setMembers] = useState<Person[]>(MOCK_PERSONS);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Person | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Member Form State
  const [fullNameEn, setFullNameEn] = useState('');
  const [fullNameAm, setFullNameAm] = useState('');
  const [baptismalName, setBaptismalName] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [confessionFather, setConfessionFather] = useState('');
  const [address, setAddress] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const newMember: Person = {
      id: `person-${Date.now()}`,
      membership_code: `MBR-2026-${String(members.length + 1).padStart(4, '0')}`,
      full_name_en: fullNameEn,
      full_name_am: fullNameAm || fullNameEn,
      baptismal_name: baptismalName,
      gender,
      date_of_birth: '1995-01-01',
      phone_primary: phonePrimary,
      phone_secondary: null,
      email: null,
      address,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      father_of_confession: confessionFather,
      profile_photo_url: null,
      status: 'ACTIVE',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setMembers([newMember, ...members]);
    setIsAddModalOpen(false);
    showToast(t(`New member ${fullNameEn} registered successfully!`, `አዲስ አባል ${fullNameAm || fullNameEn} ተመዝግቧል!`));

    // Reset form
    setFullNameEn('');
    setFullNameAm('');
    setBaptismalName('');
    setPhonePrimary('');
    setConfessionFather('');
    setAddress('');
  };

  const filtered = members.filter((p) => {
    const name = (locale === 'am' ? (p.full_name_am || p.full_name_en) : p.full_name_en) || '';
    const matchesSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      p.membership_code.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone_primary ? p.phone_primary.includes(search) : false);
    const matchesGender = genderFilter === 'ALL' || p.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

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
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <UserPlus size={16} />
          {t('Register New Member', 'አዲስ አባል መዝግብ')}
        </button>
      </div>

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
        {/* Controls */}
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
          <div className="flex items-center gap-2">
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Genders', 'ሁሉም ጾታ')}</option>
              <option value="MALE">{t('Male', 'ወንድ')}</option>
              <option value="FEMALE">{t('Female', 'ሴት')}</option>
            </select>
            <span className="text-xs text-slate-400">
              {filtered.length} {t('records', 'መዝገቦች')}
            </span>
          </div>
        </div>

        {/* Responsive Table */}
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
                  <td className="font-mono text-xs font-semibold text-blue-600">
                    {m.membership_code}
                  </td>
                  <td className="font-medium text-slate-900">
                    {locale === 'am' ? (m.full_name_am || m.full_name_en) : m.full_name_en}
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
                    <span className="badge badge-success">
                      {m.status === 'ACTIVE' ? t('Active', 'ንቁ') : m.status}
                    </span>
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Register New Member', 'አዲስ አባል መዝግብ')}
        subtitle={t('Enter personal and spiritual registration details', 'የግልና መንፈሳዊ ምዝገባ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Full Name (English)', 'ሙሉ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={fullNameEn}
                onChange={(e) => setFullNameEn(e.target.value)}
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
                value={fullNameAm}
                onChange={(e) => setFullNameAm(e.target.value)}
                placeholder="ለምሳሌ: ሰሎሞን ግርማ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Baptismal Name', 'የክርስትና ስም')}
              </label>
              <input
                type="text"
                value={baptismalName}
                onChange={(e) => setBaptismalName(e.target.value)}
                placeholder="ለምሳሌ: ወልደ ገብርኤል"
                className="form-input text-sm"
              />
            </div>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Primary Phone', 'ስልክ ቁጥር')} *
              </label>
              <input
                type="tel"
                required
                value={phonePrimary}
                onChange={(e) => setPhonePrimary(e.target.value)}
                placeholder="+2519..."
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Father of Confession', 'የንስሐ አባት')}
              </label>
              <input
                type="text"
                value={confessionFather}
                onChange={(e) => setConfessionFather(e.target.value)}
                placeholder="መምህር / ቄስ..."
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Residence Address', 'የመኖሪያ አድራሻ')}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Addis Ababa..."
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
              {t('Save Member', 'አባል መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Member Profile Modal */}
      {selectedMember && (
        <Modal
          isOpen={Boolean(selectedMember)}
          onClose={() => setSelectedMember(null)}
          title={locale === 'am' ? (selectedMember.full_name_am || selectedMember.full_name_en) : selectedMember.full_name_en}
          subtitle={`${selectedMember.membership_code} • ${selectedMember.status}`}
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="w-16 h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl flex-shrink-0">
                {selectedMember.full_name_en.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-900">
                  {locale === 'am' ? (selectedMember.full_name_am || selectedMember.full_name_en) : selectedMember.full_name_en}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedMember.membership_code}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="badge badge-success">{selectedMember.status}</span>
                  <span className="badge badge-info">
                    {selectedMember.gender === 'MALE' ? t('Male', 'ወንድ') : t('Female', 'ሴት')}
                  </span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 flex items-center gap-2">
                  <Church size={15} /> {t('Baptismal Name', 'የክርስትና ስም')}
                </span>
                <span className="font-semibold text-purple-700">{selectedMember.baptismal_name || '—'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 flex items-center gap-2">
                  <User size={15} /> {t('Father of Confession', 'የንስሐ አባት')}
                </span>
                <span className="font-medium text-slate-900">{selectedMember.father_of_confession || '—'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 flex items-center gap-2">
                  <Phone size={15} /> {t('Primary Phone', 'ስልክ ቁጥር')}
                </span>
                <span className="font-mono text-slate-900">{selectedMember.phone_primary || '—'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 flex items-center gap-2">
                  <MapPin size={15} /> {t('Address', 'አድራሻ')}
                </span>
                <span className="text-slate-900">{selectedMember.address || '—'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 flex items-center gap-2">
                  <Calendar size={15} /> {t('Registration Date', 'የተመዘገበበት ቀን')}
                </span>
                <span className="font-mono text-slate-700">{selectedMember.created_at.slice(0, 10)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedMember(null)}
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
