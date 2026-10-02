'use client';

import React, { useState } from 'react';
import { UserPlus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface PersonnelItem {
  id: string;
  name_en: string;
  name_am: string;
  role: string;
  role_am: string;
  dept: string;
  dept_am: string;
  phone: string;
  joined: string;
  status: string;
}

export default function PersonnelPage() {
  const { t, locale } = useLang();
  const [personnel, setPersonnel] = useState<PersonnelItem[]>(MOCK_PERSONNEL as PersonnelItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [roleEn, setRoleEn] = useState('Sunday School Instructor');
  const [roleAm, setRoleAm] = useState('የሰንበት ት/ቤት አስተማሪ');
  const [deptEn, setDeptEn] = useState('Education Department');
  const [deptAm, setDeptAm] = useState('የትምህርት ክፍል');
  const [phone, setPhone] = useState('');
  const [joined, setJoined] = useState(new Date().toISOString().slice(0, 10));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddPersonnel = (e: React.FormEvent) => {
    e.preventDefault();
    const newStaff: PersonnelItem = {
      id: `pers-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      role: roleEn,
      role_am: roleAm || roleEn,
      dept: deptEn,
      dept_am: deptAm || deptEn,
      phone,
      joined,
      status: 'ACTIVE',
    };

    setPersonnel([newStaff, ...personnel]);
    setIsAddModalOpen(false);
    showToast(t(`Personnel ${nameEn} added successfully!`, `ሠራተኛ ${nameAm || nameEn} ተመዝግቧል!`));

    // Reset
    setNameEn('');
    setNameAm('');
    setPhone('');
  };

  const filtered = personnel.filter((p) =>
    (locale === 'am' ? p.name_am : p.name_en).toLowerCase().includes(search.toLowerCase()) ||
    (locale === 'am' ? p.dept_am : p.dept).toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
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
            {t('Human Resources & Personnel', 'የሰው ሀብት አስተዳደር')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school active staff, officers, teachers, and ministry personnel directory',
              'የሰንበት ት/ቤት ሠራተኞች፣ ኃላፊዎች፣ አስተማሪዎችና አገልጋዮች ማውጫ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <UserPlus size={16} />
          {t('Add Personnel', 'አዲስ ሠራተኛ ጨምር')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{personnel.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Personnel', 'አጠቃላይ ሠራተኞች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {personnel.filter((p) => p.status === 'ACTIVE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Service', 'በአገልግሎት ላይ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">7</div>
          <div className="text-xs text-slate-500 mt-1">{t('Operational Departments', 'ክፍሎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Compliance Verified', 'ተገዢነት የተረጋገጠ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search personnel...', 'ሠራተኞችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('staff', 'ሠራተኞች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Name', 'ስም')}</th>
                <th>{t('Role', 'የሥራ ሚና')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Phone', 'ስልክ')}</th>
                <th>{t('Joined Date', 'የተቀጠሩበት ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? p.name_am : p.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? p.role_am : p.role}</span>
                  </td>
                  <td className="text-slate-700 text-xs">
                    {locale === 'am' ? p.dept_am : p.dept}
                  </td>
                  <td className="font-mono text-xs text-slate-600">{p.phone}</td>
                  <td className="font-mono text-xs text-slate-500">{p.joined}</td>
                  <td>
                    <span className="badge badge-success">{p.status}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedPersonnel(p)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Dossier', 'መዝገብ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Personnel Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add Sunday School Personnel', 'አዲስ ሠራተኛ / አገልጋይ መዝግብ')}
        subtitle={t('Register active Sunday school servant, teacher, or officer', 'የሰንበት ት/ቤት አስተማሪ ወይም አገልጋይ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddPersonnel} className="space-y-4">
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
                placeholder="e.g. Deacon Michael Tadesse"
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
                placeholder="ለምሳሌ: ዲ/ን ሚካኤል ታደሰ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Title (English)', 'የሥራ ሚና (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={roleEn}
                onChange={(e) => setRoleEn(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Title (Amharic)', 'የሥራ ሚና (አማርኛ)')}
              </label>
              <input
                type="text"
                value={roleAm}
                onChange={(e) => setRoleAm(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Department / Unit', 'ክፍል')} *
              </label>
              <select
                value={deptEn}
                onChange={(e) => {
                  setDeptEn(e.target.value);
                  if (e.target.value === 'Education Department') setDeptAm('የትምህርት ክፍል');
                  if (e.target.value === 'Choir Department') setDeptAm('የዝማሬ ክፍል');
                  if (e.target.value === 'Property Department') setDeptAm('የንብረት ክፍል');
                  if (e.target.value === 'Finance Department') setDeptAm('የፋይናንስ ክፍል');
                }}
                className="form-input text-sm"
              >
                <option value="Education Department">Education Department</option>
                <option value="Choir Department">Choir Department</option>
                <option value="Property Department">Property Department</option>
                <option value="Finance Department">Finance Department</option>
              </select>
            </div>
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
                className="form-input text-sm font-mono"
              />
            </div>
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
              {t('Save Personnel', 'ሠራተኛ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Personnel Dossier Modal */}
      {selectedPersonnel && (
        <Modal
          isOpen={Boolean(selectedPersonnel)}
          onClose={() => setSelectedPersonnel(null)}
          title={locale === 'am' ? selectedPersonnel.name_am : selectedPersonnel.name_en}
          subtitle={`${locale === 'am' ? selectedPersonnel.role_am : selectedPersonnel.role} • ${selectedPersonnel.status}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Department', 'ክፍል')}:</span>
                <span className="font-semibold text-slate-900">{locale === 'am' ? selectedPersonnel.dept_am : selectedPersonnel.dept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Phone Number', 'ስልክ ቁጥር')}:</span>
                <span className="font-mono text-slate-900">{selectedPersonnel.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Service Start Date', 'የተመደበበት ቀን')}:</span>
                <span className="font-mono text-slate-700">{selectedPersonnel.joined}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Statutory Standing', 'ህጋዊ ሁኔታ')}:</span>
                <span className="badge badge-success">Good Standing / ንቁ አገልጋይ</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedPersonnel(null)}
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
