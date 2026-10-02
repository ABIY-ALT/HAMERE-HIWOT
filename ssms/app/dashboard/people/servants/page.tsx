'use client';

import React, { useState } from 'react';
import { UserPlus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

export default function ServantsPage() {
  const { t, locale } = useLang();
  const [servants, setServants] = useState(MOCK_PERSONNEL);
  const [search, setSearch] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedServant, setSelectedServant] = useState<typeof MOCK_PERSONNEL[0] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [role, setRole] = useState('Ministry Servant');
  const [dept, setDept] = useState('Programs & Assemblies');
  const [phone, setPhone] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const newServant = {
      id: `per-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      role,
      role_am: role,
      dept,
      dept_am: dept,
      phone,
      status: 'ACTIVE',
      joined: new Date().toISOString().slice(0, 10),
      classes: [],
    };

    setServants([...servants, newServant]);
    setIsAddModalOpen(false);
    showToast(t(`Servant ${nameEn} registered successfully!`, `አገልጋይ ${nameAm || nameEn} ተመዝግቧል!`));

    setNameEn('');
    setNameAm('');
    setPhone('');
  };

  const filtered = servants.filter((p) =>
    (locale === 'am' ? p.name_am : p.name_en).toLowerCase().includes(search.toLowerCase()) ||
    (locale === 'am' ? p.dept_am : p.dept).toLowerCase().includes(search.toLowerCase())
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
            {t('Sunday School Servants Registry', 'የሰንበት ት/ቤት አገልጋዮች መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Active servants deployed across departments, ministries, and liturgical support',
              'በተለያዩ የሥራ ክፍሎችና አገልግሎቶች የተመደቡ ንቁ አገልጋዮች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <UserPlus size={16} />
          {t('Register Servant', 'አገልጋይ መዝግብ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{servants.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Servants', 'አጠቃላይ አገልጋዮች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {servants.filter((p) => p.status === 'ACTIVE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Active in Ministry', 'በአገልግሎት ላይ ያሉ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">7</div>
          <div className="text-xs text-slate-500 mt-1">{t('Departments Staffed', 'የተደራጁ ክፍሎች')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search servants...', 'አገልጋዮችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('servants', 'አገልጋዮች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Servant Name', 'የአገልጋይ ስም')}</th>
                <th>{t('Role / Designation', 'የአገልግሎት ሚና')}</th>
                <th>{t('Department', 'የተመደበበት ክፍል')}</th>
                <th>{t('Phone', 'ስልክ')}</th>
                <th>{t('Service Start', 'የተጀመረበት ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? s.name_am : s.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? s.role_am : s.role}</span>
                  </td>
                  <td className="text-slate-700 text-xs">
                    {locale === 'am' ? s.dept_am : s.dept}
                  </td>
                  <td className="text-slate-500 font-mono text-xs">{s.phone}</td>
                  <td className="text-slate-500 text-xs">{s.joined}</td>
                  <td>
                    <span className="badge badge-success">
                      {s.status === 'ACTIVE' ? t('Active', 'ንቁ') : s.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedServant(s)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Evaluation', 'ግምገማ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Servant Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Register Ministry Servant', 'አገልጋይ መዝግብ')}
        subtitle={t('Assign department and volunteer service role', 'ክፍልና የአገልግሎት ሚና ያስገቡ')}
      >
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Servant Name (English)', 'የአገልጋዩ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Martha Tesfaye"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Servant Name (Amharic)', 'የአገልጋዩ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ማርታ ተስፋዬ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Service Role', 'የአገልግሎት ሚና')} *
              </label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Department', 'የተመደበበት ክፍል')} *
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Education & Training">Education & Training</option>
                <option value="Programs & Assemblies">Programs & Assemblies</option>
                <option value="Information & Internal Relations">Information & Internal Relations</option>
                <option value="Hymnody, Choir & Sacred Arts">Hymnody, Choir & Sacred Arts</option>
                <option value="Human Resources Administration">Human Resources Administration</option>
                <option value="Budget & Property Management">Budget & Property Management</option>
              </select>
            </div>
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
              className="form-input text-sm"
            />
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
              {t('Save Servant', 'አገልጋይ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Servant Evaluation Modal */}
      {selectedServant && (
        <Modal
          isOpen={Boolean(selectedServant)}
          onClose={() => setSelectedServant(null)}
          title={locale === 'am' ? selectedServant.name_am : selectedServant.name_en}
          subtitle={`${selectedServant.role} • ${selectedServant.dept}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-purple-50 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-purple-700 font-semibold block">{t('Ministry Performance', 'የአገልግሎት ግምገማ')}</span>
                <span className="text-base font-bold text-slate-900">Excellent Standing (A+)</span>
              </div>
              <span className="badge badge-success">{selectedServant.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Department', 'ክፍል')}</span>
                <span className="font-semibold text-slate-800">{selectedServant.dept}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Phone Number', 'ስልክ ቁጥር')}</span>
                <span className="font-mono text-slate-800">{selectedServant.phone}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Service Start', 'የተጀመረበት')}</span>
                <span className="font-mono text-slate-800">{selectedServant.joined}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Service Punctuality', 'ሰዓት ማክበር')}</span>
                <span className="font-bold text-emerald-600">98% Punctual</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedServant(null)}
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
