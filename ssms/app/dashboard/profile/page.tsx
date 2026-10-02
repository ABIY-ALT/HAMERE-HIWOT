'use client';

import React, { useState } from 'react';
import {
  User,
  Shield,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Lock,
  Key,
  CheckCircle2,
  Edit3,
  Church,
  Save,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { getInitials } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

export default function ProfilePage() {
  const { user } = useAuth();
  const { t, locale } = useLang();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'permissions'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Editable fields in state
  const [phone, setPhone] = useState(user?.person.phone_primary ?? '+251911000005');
  const [email, setEmail] = useState(user?.person.email ?? 'yohannes.tesfaye@ssms.local');
  const [confessionFather, setConfessionFather] = useState(user?.person.father_of_confession ?? 'Memhir Girma');
  const [address, setAddress] = useState(user?.person.address ?? 'Addis Ababa, Bole Sub-city');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditModalOpen(false);
    showToast(t('Profile updated successfully!', 'መገለጫው በሚገባ ተዘምኗል!'));
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      alert(t('Passwords do not match!', 'የይለፍ ቃሎች አይዛመዱም!'));
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showToast(t('Password changed successfully!', 'የይለፍ ቃል በሚገባ ተቀይሯል!'));
  };

  const permissionsList = user ? Array.from(user.permissions) : [
    'GOVERNANCE_VIEW', 'GOVERNANCE_MANAGE', 'MEMBER_VIEW', 'STUDENT_VIEW',
    'HR_VIEW', 'FINANCE_VIEW', 'ASSET_VIEW', 'AUDIT_VIEW_ALL', 'USER_MANAGE'
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header Profile Banner */}
      <div className="card p-6 md:p-8 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl relative overflow-hidden shadow-lg border-0">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl sm:text-4xl font-black text-white shadow-xl border-4 border-white/10 flex-shrink-0">
            {user ? getInitials(user.person.full_name_en) : 'YT'}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {locale === 'am'
                    ? (user?.person.full_name_am || user?.person.full_name_en || 'ዮሐንስ ተስፋዬ')
                    : (user?.person.full_name_en || 'Yohannes Tesfaye')}
                </h1>
                <p className="text-blue-200 text-sm mt-0.5">
                  @{user?.systemUser.username ?? 'admin'} &bull; {user?.person.membership_code ?? 'MBR-2024-0005'}
                </p>
              </div>

              <button
                onClick={() => setIsEditModalOpen(true)}
                className="btn btn-sm bg-white/10 hover:bg-white/20 text-white border-white/20 inline-flex items-center gap-2 self-center sm:self-auto shadow-sm backdrop-blur-md"
              >
                <Edit3 size={14} />
                {t('Edit Profile', 'መገለጫ አርትዕ')}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <span className="badge bg-blue-500/20 text-blue-200 border border-blue-400/30 px-3 py-1">
                <Shield size={12} className="inline mr-1" />
                {user?.assignments?.[0]?.role?.name_en ?? 'Super Administrator'}
              </span>
              <span className="badge bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-3 py-1">
                <Church size={12} className="inline mr-1" />
                {t('Category 2 Parish', 'ምድብ ሁለት አጥቢያ')}
              </span>
              <span className="badge bg-purple-500/20 text-purple-200 border border-purple-400/30 px-3 py-1">
                {t('Active Servant', 'ንቁ አገልጋይ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'profile'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('Personal & Church Details', 'የግልና የቤተ ክርስቲያን መረጃ')}
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'permissions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('Roles & Permissions', 'ሚናዎችና ፈቃዶች')} ({permissionsList.length})
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'security'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('Security & Password', 'ደህንነትና ይለፍ ቃል')}
        </button>
      </div>

      {/* Tab 1: Profile & Church Details */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
              <User size={18} className="text-blue-600" />
              {t('Contact & Personal Information', 'የግል መረጃና አድራሻ')}
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Phone size={14} /> {t('Primary Phone', 'ዋና ስልክ')}
                </span>
                <span className="font-mono font-medium text-slate-900">{phone}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Mail size={14} /> {t('Email Address', 'ኢሜይል')}
                </span>
                <span className="font-medium text-slate-900">{email}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <MapPin size={14} /> {t('Residence Address', 'የመኖሪያ አድራሻ')}
                </span>
                <span className="font-medium text-slate-900">{address}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Calendar size={14} /> {t('Date of Birth', 'የትውልድ ቀን')}
                </span>
                <span className="font-mono text-slate-900">1985-04-12</span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">{t('Gender', 'ጾታ')}</span>
                <span className="font-medium text-slate-900">
                  {user?.person.gender === 'FEMALE' ? t('Female', 'ሴት') : t('Male', 'ወንድ')}
                </span>
              </div>
            </div>
          </div>

          {/* Spiritual Information */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Church size={18} className="text-purple-600" />
              {t('Ecclesiastical & Spiritual Details', 'መንፈሳዊና የክርስትና መረጃ')}
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">{t('Baptismal Name', 'የክርስትና ስም')}</span>
                <span className="font-semibold text-purple-700">
                  {user?.person.baptismal_name || 'Haile Maryam (ኃይለ ማርያም)'}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">{t('Father of Confession', 'የንስሐ አባት')}</span>
                <span className="font-semibold text-slate-900">{confessionFather}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">{t('Parish Sunday School', 'ሰንበት ት/ቤት')}</span>
                <span className="font-medium text-slate-900">{t('Sallo Debre Tsehay Hamere Hiwot', 'ሳሎ ደብረ ፀሐይ ሐመረ ሕይወት')}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">{t('Assigned Org Unit', 'የተመደበበት ክፍል')}</span>
                <span className="font-medium text-slate-900">General Assembly / Administration</span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">{t('Service Status', 'የአገልግሎት ሁኔታ')}</span>
                <span className="badge badge-success">{t('Active in Good Standing', 'በንቃት በማገልገል ላይ')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Permissions Matrix */}
      {activeTab === 'permissions' && (
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <Key size={18} className="text-amber-600" />
            {t('Authorized System Capabilities', 'የተፈቀዱ የስርዓት መዳረሻዎች')}
          </h2>
          <p className="text-xs text-slate-500">
            {t(
              'These permissions are determined by your assigned statutory role and organizational unit.',
              'እነዚህ ፈቃዶች በተሰጡዎት ሕጋዊ ሚና እና ክፍል መሠረት የተሰጡ ናቸው።'
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {permissionsList.map((perm, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center gap-2.5 text-xs font-mono text-slate-800"
              >
                <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
                <span className="truncate">{perm}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Security & Password */}
      {activeTab === 'security' && (
        <div className="card p-6 max-w-xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <Lock size={18} className="text-red-600" />
            {t('Change Password', 'የይለፍ ቃል ቀይር')}
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Current Password', 'የአሁኑ የይለፍ ቃል')}
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('New Password', 'አዲስ የይለፍ ቃል')}
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Confirm New Password', 'አዲሱን የይለፍ ቃል ያረጋግጡ')}
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input text-sm"
              />
            </div>

            <button type="submit" className="btn btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
              <Save size={15} />
              {t('Update Password', 'የይለፍ ቃል አዘምን')}
            </button>
          </form>
        </div>
      )}

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('Edit Personal Profile', 'የግል መገለጫ አርትዕ')}
        subtitle={t('Update your contact info and ecclesiastical details', 'የመገናኛ አድራሻና መንፈሳዊ መረጃ ያዘምኑ')}
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Primary Phone', 'ዋና ስልክ')}
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Email Address', 'ኢሜይል')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Father of Confession', 'የንስሐ አባት')}
            </label>
            <input
              type="text"
              required
              value={confessionFather}
              onChange={(e) => setConfessionFather(e.target.value)}
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Residence Address', 'የመኖሪያ አድራሻ')}
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="form-input text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Save Changes', 'ለውጦችን መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
