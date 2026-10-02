'use client';

import React, { useState } from 'react';
import { UserPlus, Search, Phone, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

export default function TeachersPage() {
  const { t, locale } = useLang();
  const [teachers, setTeachers] = useState(
    MOCK_PERSONNEL.filter((p) => p.role === 'Teacher' || p.classes.length > 0)
  );
  const [search, setSearch] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<typeof MOCK_PERSONNEL[0] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedClass, setAssignedClass] = useState('Grade 1 — Angels');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    const newTeacher = {
      id: `per-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      role: 'Teacher',
      role_am: 'አስተማሪ',
      dept: 'Education & Training',
      dept_am: 'ትምህርትና ስልጠና',
      phone,
      status: 'ACTIVE',
      joined: new Date().toISOString().slice(0, 10),
      classes: [assignedClass],
    };

    setTeachers([...teachers, newTeacher]);
    setIsAddModalOpen(false);
    showToast(t(`Teacher ${nameEn} assigned successfully!`, `መምህር ${nameAm || nameEn} ተመድቧል!`));

    setNameEn('');
    setNameAm('');
    setPhone('');
  };

  const filtered = teachers.filter((tch) =>
    (locale === 'am' ? tch.name_am : tch.name_en).toLowerCase().includes(search.toLowerCase()) ||
    tch.phone.includes(search)
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
            {t('Sunday School Teaching Staff', 'የሰንበት ት/ቤት መምህራን')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Spiritual educators, deacons, and teachers leading classes and doctrine',
              'ክፍሎችን እና የትምህርት ዘርፎችን የሚያስተምሩ መምህራን'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <UserPlus size={16} />
          {t('Assign Teacher', 'አስተማሪ መድብ')}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{teachers.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Teachers', 'ንቁ መምህራን')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">8</div>
          <div className="text-xs text-slate-500 mt-1">{t('Classes Covered', 'የተሸፈኑ ክፍሎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Teacher Qualification Met', 'የመምህራን ብቃት ተሟልቷል')}</div>
        </div>
      </div>

      {/* Teachers Grid */}
      <div className="card p-5 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={t('Search teachers...', 'መምህራንን ፈልግ...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filtered.map((tch) => (
            <div key={tch.id} className="border border-slate-200/80 rounded-xl p-5 bg-white hover:shadow-sm transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="badge badge-primary">{t(tch.role, tch.role_am)}</span>
                  <span className="badge badge-success">{t('Active', 'ንቁ')}</span>
                </div>
                <h3 className="font-bold text-slate-800 text-base">
                  {locale === 'am' ? tch.name_am : tch.name_en}
                </h3>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" />
                  <span>{tch.phone}</span>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    {t('Assigned Classes', 'የተመደቡባቸው ክፍሎች')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tch.classes.length > 0 ? (
                      tch.classes.map((cls, idx) => (
                        <span key={idx} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {cls}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">{t('General Assignment', 'ጠቅላላ ምደባ')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>{t('Joined', 'የተቀላቀሉበት')}: {tch.joined}</span>
                <button
                  onClick={() => setSelectedTeacher(tch)}
                  className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                >
                  {t('Schedules →', 'መርሐ ግብር →')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assign Teacher Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Assign Sunday School Teacher', 'አስተማሪ መድብ')}
        subtitle={t('Select course and classroom allocation', 'ክፍልና የትምህርት ዓይነት ምረጥ')}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Teacher Name (English)', 'የመምህሩ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Deacon Daniel Bekele"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Teacher Name (Amharic)', 'የመምህሩ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ዲ/ን ዳንኤል በቀለ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Phone Number', 'ስልክ ቁጥር')} *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2519..."
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assigned Class', 'የሚመደብበት ክፍል')} *
              </label>
              <select
                value={assignedClass}
                onChange={(e) => setAssignedClass(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Grade 1 — Angels">Grade 1 — Angels</option>
                <option value="Grade 2 — Cherubs">Grade 2 — Cherubs</option>
                <option value="Grade 3 — Seraphim">Grade 3 — Seraphim</option>
                <option value="Grade 4 — Apostles">Grade 4 — Apostles</option>
                <option value="Youth — Daniel">Youth — Daniel</option>
                <option value="Senior — Solomon">Senior — Solomon</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Confirm Assignment', 'ምደባ አጽድቅ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Teacher Schedule Modal */}
      {selectedTeacher && (
        <Modal
          isOpen={Boolean(selectedTeacher)}
          onClose={() => setSelectedTeacher(null)}
          title={locale === 'am' ? selectedTeacher.name_am : selectedTeacher.name_en}
          subtitle={`${selectedTeacher.phone} • ${selectedTeacher.role}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                {t('Weekly Teaching Schedule', 'የሳምንቱ የማስተማር መርሐ ግብር')}
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-800 block">Sunday 08:30 — 10:00 AM</span>
                    <span className="text-slate-500">{selectedTeacher.classes[0] || 'Grade 3'} &bull; Holy Bible Studies</span>
                  </div>
                  <span className="badge badge-success">{t('Weekly', 'ሳምንታዊ')}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-800 block">Sunday 10:30 — 12:00 PM</span>
                    <span className="text-slate-500">Youth Class &bull; Ethiopian Liturgy (ቅዳሴ)</span>
                  </div>
                  <span className="badge badge-info">{t('Weekly', 'ሳምንታዊ')}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTeacher(null)}
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
