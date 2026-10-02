'use client';

import React, { useState } from 'react';
import { Plus, Home, User, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { createClass, useEducation } from '@/lib/education/client';
import type { SchoolClass } from '@/lib/education/types';

type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function ClassesPage() {
  const { t, locale } = useLang();
  const { classes, students, teachers, mode, activeYearId } = useEducation();
  const [search, setSearch] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // New Class Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [gradeLevel, setGradeLevel] = useState(1);
  const [teacher, setTeacher] = useState(''); // demo: free text
  const [teacherPersonId, setTeacherPersonId] = useState(''); // live: chosen staff member
  const [capacity, setCapacity] = useState(30);
  const [room, setRoom] = useState('Room G');

  const live = mode === 'live';
  const canCreate = mode === 'demo' || (live && Boolean(activeYearId));

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const res = await createClass({
      name_en: nameEn.trim(),
      name_am: nameAm.trim(),
      grade_level: Number(gradeLevel),
      capacity: Number(capacity),
      room: room.trim(),
      teacher_person_id: teacherPersonId,
      teacher_name: teacher.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    setIsAddModalOpen(false);
    showToast('success', t(`Class ${nameEn} created`, `ክፍል ${nameAm || nameEn} ተፈጥሯል`));
    setNameEn('');
    setNameAm('');
    setTeacher('');
    setTeacherPersonId('');
  };

  const roster = selectedClass
    ? students
        .filter((s) => s.class_id === selectedClass.id)
        .sort((a, b) => a.name_en.localeCompare(b.name_en))
    : [];

  const filtered = classes.filter((c) =>
    (locale === 'am' ? c.name_am : c.name_en).toLowerCase().includes(search.toLowerCase()) ||
    c.teacher.toLowerCase().includes(search.toLowerCase()) ||
    c.room.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Sunday School Classes', 'የሰንበት ትምህርት ቤት ክፍሎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Roster of classes, grade levels, assigned teachers, and classroom capacities',
              'የክፍሎች ዝርዝር፣ የተመደቡ መምህራን እና የተማሪዎች አቅም'
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setFormError('');
            setIsAddModalOpen(true);
          }}
          disabled={!canCreate}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          {t('Create New Class', 'አዲስ ክፍል ፍጠር')}
        </button>
      </div>

      <EducationNotice needs="year" />

      <div className="relative max-w-sm">
        <input
          type="text"
          placeholder={t('Search classes...', 'ክፍሎችን ፈልግ...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input text-sm"
        />
      </div>

      {live && activeYearId && classes.length === 0 && (
        <p className="card p-8 text-sm text-slate-500 text-center">
          {t('No classes yet for this academic year. Create the first one.', 'ለዚህ የትምህርት ዓመት እስካሁን ክፍል የለም። የመጀመሪያውን ይፍጠሩ።')}
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((cls) => {
          const fillPct = cls.capacity ? Math.min(100, Math.round((cls.enrolled / cls.capacity) * 100)) : 0;
          return (
            <div key={cls.id} className="card p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Level {cls.grade_level}
                  </span>
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                    <Home size={12} />
                    {cls.room}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-2">
                  {locale === 'am' ? cls.name_am : cls.name_en}
                </h3>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-4">
                  <User size={13} className="text-slate-400" />
                  <span>{t('Teacher', 'አስተማሪ')}: <strong>{cls.teacher}</strong></span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                  <span>{t('Enrolled', 'የተመዘገቡ')}: {cls.enrolled}/{cls.capacity}</span>
                  <span>{fillPct}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${fillPct > 90 ? 'bg-amber-500' : 'bg-blue-600'}`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedClass(cls)}
                    className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                  >
                    {t('Students List →', 'የተማሪዎች ዝርዝር →')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Class Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Create New Sunday School Class', 'አዲስ ክፍል ፍጠር')}
        subtitle={t('Set class name, assigned homeroom teacher, and room capacity', 'የክፍሉን ስም፣ መምህር እና አቅም ያስገቡ')}
      >
        <form onSubmit={handleAddClass} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Class Name (English)', 'የክፍል ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Grade 7 — Apostles"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Class Name (Amharic)', 'የክፍል ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ክፍል 7 — ሐዋርያት"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Grade Level', 'ደረጃ')} *
              </label>
              <input
                type="number"
                min="1"
                max="12"
                required
                value={gradeLevel}
                onChange={(e) => setGradeLevel(Number(e.target.value))}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Room / Hall', 'አዳራሽ / ክፍል')} *
              </label>
              <input
                type="text"
                required
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Max Capacity', 'ከፍተኛ አቅም')} *
              </label>
              <input
                type="number"
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Assigned Homeroom Teacher', 'የተመደበ መምህር')}
            </label>
            {live ? (
              <>
                <select
                  value={teacherPersonId}
                  onChange={(e) => setTeacherPersonId(e.target.value)}
                  className="form-input text-sm"
                >
                  <option value="">{t('— Not assigned yet —', '— ገና አልተመደበም —')}</option>
                  {teachers.map((tc) => (
                    <option key={tc.person_id} value={tc.person_id}>{tc.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t(
                    'Teachers are people with a system account (Administration → System Users).',
                    'መምህራን የስርዓት መለያ ያላቸው ሰዎች ናቸው (አስተዳደር → የስርዓት ተጠቃሚዎች)።'
                  )}
                </p>
              </>
            ) : (
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="e.g. Tigist Haile"
                className="form-input text-sm"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Class', 'ክፍል ፍጠር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Class Students Roster Modal */}
      {selectedClass && (
        <Modal
          isOpen={Boolean(selectedClass)}
          onClose={() => setSelectedClass(null)}
          title={locale === 'am' ? selectedClass.name_am : selectedClass.name_en}
          subtitle={`${selectedClass.room} • ${t('Teacher', 'አስተማሪ')}: ${selectedClass.teacher} • ${selectedClass.enrolled}/${selectedClass.capacity} ${t('Enrolled', 'ተማሪዎች')}`}
        >
          <div className="space-y-4">
            <div className="table-container border border-slate-100 rounded-xl overflow-hidden">
              <table>
                <thead>
                  <tr>
                    <th>{t('Reg No', 'የምዝገባ ቁጥር')}</th>
                    <th>{t('Student Name', 'የተማሪ ስም')}</th>
                    <th>{t('Baptismal Name', 'የክርስትና ስም')}</th>
                    <th>{t('Parent Phone', 'የወላጅ ስልክ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs text-blue-600 font-semibold">{s.reg_no}</td>
                      <td className="font-medium text-slate-900">{locale === 'am' ? s.name_am : s.name_en}</td>
                      <td className="text-slate-600 text-xs">{s.baptismal}</td>
                      <td className="font-mono text-xs text-slate-500">{s.phone}</td>
                    </tr>
                  ))}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-xs text-slate-400 py-6">
                        {t('No students in this class yet.', 'በዚህ ክፍል እስካሁን ተማሪ የለም።')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedClass(null)}
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
