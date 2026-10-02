'use client';

import React, { useState } from 'react';
import { Plus, Home, User, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_CLASSES, MOCK_STUDENTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

export default function ClassesPage() {
  const { t, locale } = useLang();
  const [classes, setClasses] = useState(MOCK_CLASSES);
  const [search, setSearch] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<typeof MOCK_CLASSES[0] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Class Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [gradeLevel, setGradeLevel] = useState(1);
  const [teacher, setTeacher] = useState('');
  const [capacity, setCapacity] = useState(30);
  const [room, setRoom] = useState('Room G');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    const newClass = {
      id: `cls-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      grade_level: Number(gradeLevel),
      academic_year_id: 'ay-001',
      teacher,
      capacity: Number(capacity),
      enrolled: 0,
      room,
    };

    setClasses([...classes, newClass]);
    setIsAddModalOpen(false);
    showToast(t(`Class ${nameEn} created successfully!`, `ክፍል ${nameAm || nameEn} ተፈጥሯል!`));

    setNameEn('');
    setNameAm('');
    setTeacher('');
  };

  const filtered = classes.filter((c) =>
    (locale === 'am' ? c.name_am : c.name_en).toLowerCase().includes(search.toLowerCase()) ||
    c.teacher.toLowerCase().includes(search.toLowerCase()) ||
    c.room.toLowerCase().includes(search.toLowerCase())
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
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Create New Class', 'አዲስ ክፍል ፍጠር')}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((cls) => {
          const fillPct = Math.round((cls.enrolled / cls.capacity) * 100);
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
              {t('Assigned Homeroom Teacher', 'የተመደበ መምህር')} *
            </label>
            <input
              type="text"
              required
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="e.g. Tigist Haile"
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
              {t('Save Class', 'ክፍል ፍጠር')}
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
                  {MOCK_STUDENTS.slice(0, 4).map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs text-blue-600 font-semibold">{s.reg_no}</td>
                      <td className="font-medium text-slate-900">{locale === 'am' ? s.name_am : s.name_en}</td>
                      <td className="text-slate-600 text-xs">{s.baptismal}</td>
                      <td className="font-mono text-xs text-slate-500">{s.phone}</td>
                    </tr>
                  ))}
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
