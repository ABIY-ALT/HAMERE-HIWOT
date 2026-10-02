'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Calendar, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { createAcademicYear, setCurrentAcademicYear, useEducation } from '@/lib/education/client';

type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function AcademicYearsPage() {
  const { t } = useLang();
  const { years, mode } = useEducation();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [yearName, setYearName] = useState('2026/2027');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2027-06-30');

  const current = years.find((y) => y.is_current);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const res = await createAcademicYear({ name: yearName.trim(), name_am: yearName.trim(), start_date: startDate, end_date: endDate });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setIsAddModalOpen(false);
    showToast('success', t(`Academic year ${yearName} opened`, `የትምህርት ዓመት ${yearName} ተከፍቷል`));
  };

  const handleMakeCurrent = async (id: string, name: string) => {
    setBusy(true);
    const res = await setCurrentAcademicYear(id);
    setBusy(false);
    if (!res.ok) return showToast('error', res.error);
    showToast('success', t(`${name} is now the current academic year`, `${name} አሁን ወቅታዊ የትምህርት ዓመት ነው`));
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Academic Years Management', 'የትምህርት ዓመታት አስተዳደር')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Manage academic cycles, terms, and current active school calendar',
              'የትምህርት ዘመናት፣ ሩብ ዓመታት እና ንቁ የትምህርት ካላንደር'
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setFormError('');
            setIsAddModalOpen(true);
          }}
          disabled={mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          {t('Open New Academic Year', 'አዲስ የትምህርት ዓመት ክፈት')}
        </button>
      </div>

      <EducationNotice />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{current?.name ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Current Active Year', 'ወቅታዊ ንቁ ዓመት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{current?.students_enrolled ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Enrolled Students', 'የተመዘገቡ ተማሪዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">{years.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Academic Cycles', 'አጠቃላይ የትምህርት ዘመናት')}</div>
        </div>
      </div>

      {/* Years List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-800">{t('Academic Calendars', 'የትምህርት ካላንደሮች')}</h2>
          <span className="text-xs text-slate-400">{years.length} {t('Cycles', 'ዘመናት')}</span>
        </div>

        {mode !== 'loading' && years.length === 0 && (
          <p className="p-8 text-sm text-slate-500 text-center">
            {t(
              'No academic years yet. Open the first one — it becomes the current year automatically.',
              'እስካሁን የትምህርት ዓመት የለም። የመጀመሪያውን ይክፈቱ — በራሱ ወቅታዊ ዓመት ይሆናል።'
            )}
          </p>
        )}

        <div className="divide-y divide-slate-100">
          {years.map((ay) => (
            <div key={ay.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  ay.is_current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Calendar size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{ay.name}</h3>
                    {ay.is_current ? (
                      <span className="badge badge-success inline-flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        {t('Current Active', 'ወቅታዊ ንቁ')}
                      </span>
                    ) : (
                      <span className="badge badge-info">
                        {ay.status === 'COMPLETED' ? t('Completed', 'የተጠናቀቀ') : t('Planned', 'የታቀደ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-4">
                    <span>
                      {t('Period', 'ጊዜ')}: {ay.start_date} → {ay.end_date}
                    </span>
                    <span>
                      {t('Enrolled', 'ተማሪዎች')}: <strong>{ay.students_enrolled}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                {!ay.is_current && (
                  <button
                    onClick={() => handleMakeCurrent(ay.id, ay.name)}
                    disabled={busy}
                    className="btn btn-primary text-xs py-1.5 disabled:opacity-50"
                  >
                    {t('Make Current', 'ወቅታዊ አድርግ')}
                  </button>
                )}
                {ay.is_current && (
                  <Link href="/dashboard/education/classes" className="btn btn-secondary text-xs py-1.5">
                    {t('View Classes', 'ክፍሎችን እይ')}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Open Academic Year Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Open New Academic Cycle', 'አዲስ የትምህርት ዘመን ክፈት')}
        subtitle={t('Set start and completion dates for the parish school calendar', 'የትምህርት ዓመት መጀመሪያና መጨረሻ ቀን ያስገቡ')}
      >
        <form onSubmit={handleAdd} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Academic Year Title', 'የትምህርት ዓመት መጠሪያ')} *
            </label>
            <input
              type="text"
              required
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              placeholder="e.g. 2026/2027"
              className="form-input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Term Commencement Date', 'የመጀመሪያ ቀን')} *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Term Concluding Date', 'የማብቂያ ቀን')} *
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          {years.length === 0 && (
            <p className="text-xs text-slate-500">
              {t('This will be the current academic year.', 'ይህ ወቅታዊ የትምህርት ዓመት ይሆናል።')}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Ratify Calendar', 'ካላንደር አጽድቅ')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
