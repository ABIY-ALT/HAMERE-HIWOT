'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface StaffAttendance {
  id: string;
  name_en: string;
  name_am: string;
  role: string;
  role_am: string;
  dept: string;
  dept_am: string;
  checkIn: string;
  status: 'On Time' | 'Late' | 'Excused';
}

export default function HRAttendancePage() {
  const { t, locale } = useLang();
  const [logs, setLogs] = useState<StaffAttendance[]>(
    MOCK_PERSONNEL.map((p, idx) => ({
      id: p.id,
      name_en: p.name_en,
      name_am: p.name_am,
      role: p.role,
      role_am: p.role_am,
      dept: p.dept,
      dept_am: p.dept_am,
      checkIn: `07:${45 + idx * 2} AM`,
      status: 'On Time',
    }))
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [role, setRole] = useState('Sunday School Instructor');
  const [dept, setDept] = useState('Education Department');
  const [checkIn, setCheckIn] = useState('08:00 AM');
  const [status, setStatus] = useState<'On Time' | 'Late' | 'Excused'>('On Time');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    const newLog: StaffAttendance = {
      id: `att-staff-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      role,
      role_am: role,
      dept,
      dept_am: dept,
      checkIn,
      status,
    };

    setLogs([newLog, ...logs]);
    setIsAddModalOpen(false);
    showToast(t(`Service attendance recorded for ${nameEn}!`, `የ${nameAm || nameEn} የአገልግሎት ተገኝነት ተመዝግቧል!`));

    // Reset
    setNameEn('');
    setNameAm('');
  };

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
            {t('Staff & Servant Attendance Monitoring', 'የአገልጋዮችና ሠራተኞች የሥራ ክትትል')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Weekly Sunday school service attendance, punctuality tracking, and leave management',
              'የሳምንታዊ አገልግሎት ተገኝነት፣ ሰዓት ማክበር እና ፈቃድ ክትትል'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Log Daily Service Attendance', 'የዕለቱን ክትትል መዝግብ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">96.4%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Staff Punctuality Rate', 'ሰዓት የማክበር ምጣኔ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{logs.length} / {logs.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Present on Last Sunday', 'ባለፈው እሁድ የተገኙ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">0</div>
          <div className="text-xs text-slate-500 mt-1">{t('Unexcused Absences', 'ያለፈቃድ የቀሩ')}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Staff Member', 'ሠራተኛ')}</th>
                <th>{t('Role', 'የሥራ ሚና')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Check-in Time', 'የተገኘበት ሰዓት')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? p.name_am : p.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? p.role_am : p.role}</span>
                  </td>
                  <td className="text-slate-700 text-xs">{locale === 'am' ? p.dept_am : p.dept}</td>
                  <td className="font-mono text-xs text-slate-600">{p.checkIn}</td>
                  <td>
                    <span
                      className={`badge inline-flex items-center gap-1 ${
                        p.status === 'On Time'
                          ? 'badge-success'
                          : p.status === 'Late'
                          ? 'badge-warning'
                          : 'badge-info'
                      }`}
                    >
                      <CheckCircle2 size={12} />
                      {p.status === 'On Time'
                        ? t('On Time', 'በሰዓቱ')
                        : p.status === 'Late'
                        ? t('Late', 'የዘገየ')
                        : t('Excused', 'ፈቃድ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Attendance Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Log Servant Service Attendance', 'የአገልጋይ ተገኝነት መዝግብ')}
        subtitle={t('Record check-in time and punctuality status for Sunday ministry', 'የሳምንታዊ አገልግሎት መግቢያ ሰዓትና ሁኔታ ያስገቡ')}
      >
        <form onSubmit={handleLogAttendance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Servant Name (English)', 'የአገልጋይ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Deacon Michael"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Servant Name (Amharic)', 'የአገልጋይ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ዲ/ን ሚካኤል"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Department', 'ክፍል')} *
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
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
                {t('Check-in Time', 'የተገኘበት ሰዓት')} *
              </label>
              <input
                type="text"
                required
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                placeholder="07:30 AM"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Punctuality Status', 'ሁኔታ')}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'On Time' | 'Late' | 'Excused')}
              className="form-input text-sm"
            >
              <option value="On Time">On Time (በሰዓቱ)</option>
              <option value="Late">Late (የዘገየ)</option>
              <option value="Excused">Excused (ፈቃድ)</option>
            </select>
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
              {t('Log Attendance', 'ተገኝነት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
