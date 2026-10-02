'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Search, CheckCircle2, Download, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_CLASSES } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';
import { addStudents, nextRegNos, type Student, type StudentGender } from '@/lib/students/store';
import { useStudents } from '@/lib/students/useStudents';
import { downloadXlsx, headerCell, cell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

export default function StudentsPage() {
  const { t, locale } = useLang();
  const students = useStudents();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Enroll Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [baptismal, setBaptismal] = useState('');
  const [gender, setGender] = useState<StudentGender>('MALE');
  const [studentClassId, setStudentClassId] = useState(MOCK_CLASSES[0].id);
  const [parent, setParent] = useState('');
  const [phone, setPhone] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    const cls = MOCK_CLASSES.find((c) => c.id === studentClassId) ?? MOCK_CLASSES[0];
    const [regNo] = nextRegNos(students, 1, new Date().getFullYear());
    const newStudent: Student = {
      id: `stu-${Date.now()}`,
      reg_no: regNo,
      name_en: nameEn.trim(),
      name_am: nameAm.trim() || nameEn.trim(),
      baptismal: baptismal.trim() || nameEn.trim().split(' ')[0],
      gender,
      class: cls.name_en,
      class_id: cls.id,
      grade_level: cls.grade_level,
      status: 'ACTIVE',
      enrollment_date: todayIso(),
      parent: parent.trim(),
      phone: phone.trim(),
    };

    if (!addStudents([newStudent])) {
      showToast(t('Could not save. Browser storage is unavailable or full.', 'ማስቀመጥ አልተቻለም። የአሳሽ ማከማቻ አይሰራም ወይም ሞልቷል።'));
      return;
    }
    setIsEnrollModalOpen(false);
    showToast(t(`Student ${nameEn} enrolled successfully!`, `ተማሪ ${nameAm || nameEn} ተመዝግቧል!`));

    setNameEn('');
    setNameAm('');
    setBaptismal('');
    setParent('');
    setPhone('');
  };

  const classes = Array.from(new Set(students.map((s) => s.class)));

  const exportExcel = async (rows: Student[]) => {
    const header = [
      'Reg. No', 'Name (English)', 'Name (Amharic)', 'Baptismal name', 'Gender', 'Class', 'Status',
      'Enrollment date (Gregorian)', 'Enrollment date (Ethiopian)', 'Parent / Guardian', 'Guardian phone',
    ].map(headerCell);
    const body = rows.map((s) => [
      s.reg_no, s.name_en, cell(s.name_am), cell(s.baptismal), s.gender === 'MALE' ? 'Male' : 'Female',
      s.class, s.status === 'ACTIVE' ? 'Active' : 'Inactive', s.enrollment_date,
      formatEthiopianDate(s.enrollment_date, 'en'), cell(s.parent), cell(s.phone),
    ]);
    try {
      await downloadXlsx(`students_${todayIso()}`, [header, ...body], {
        sheet: 'Students',
        widths: [16, 24, 24, 16, 8, 24, 10, 16, 20, 22, 16],
      });
    } catch {
      showToast(t('Could not create the Excel file.', 'የኤክሴል ፋይሉን መፍጠር አልተቻለም።'));
    }
  };

  const filtered = students.filter((s) => {
    const matchesSearch =
      (locale === 'am' ? s.name_am : s.name_en).toLowerCase().includes(search.toLowerCase()) ||
      s.reg_no.toLowerCase().includes(search.toLowerCase()) ||
      s.parent.toLowerCase().includes(search.toLowerCase());
    const matchesClass = classFilter === 'ALL' || s.class === classFilter;
    return matchesSearch && matchesClass;
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Sunday School Students Roster', 'የሰንበት ት/ቤት ተማሪዎች መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Enrolled Sunday school students across all grade levels and spiritual stages',
              'በሁሉም የክፍል ደረጃዎች ያሉ የሰንበት ት/ቤት ተማሪዎች ዝርዝር'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Link
            href="/dashboard/people/students/import"
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <Upload size={16} />
            {t('Import from Excel', 'ከኤክሴል አስገባ')}
          </Link>
          <button
            onClick={() => exportExcel(filtered)}
            disabled={filtered.length === 0}
            className="btn btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            {t('Export Excel', 'ወደ ኤክሴል ላክ')}
          </button>
          <button
            onClick={() => setIsEnrollModalOpen(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <UserPlus size={16} />
            {t('Enroll New Student', 'አዲስ ተማሪ መዝግብ')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{students.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Enrolled', 'አጠቃላይ ተማሪዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {students.filter((s) => s.status === 'ACTIVE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Attendance', 'ንቁ ክትትል')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">{classes.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Classes', 'ክፍሎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-600">
            {students.filter((s) => s.status !== 'ACTIVE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Inactive', 'የቦዘኑ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search by student or parent name...', 'በተማሪ ወይም በወላጅ ስም ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Classes', 'ሁሉም ክፍሎች')}</option>
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400 font-medium">
              {filtered.length} {t('students', 'ተማሪዎች')}
            </span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Reg No', 'የምዝገባ ቁጥር')}</th>
                <th>{t('Student Name', 'የተማሪ ስም')}</th>
                <th>{t('Baptismal Name', 'የክርስትና ስም')}</th>
                <th>{t('Assigned Class', 'የተመደበበት ክፍል')}</th>
                <th>{t('Parent / Guardian', 'ወላጅ / አሳዳጊ')}</th>
                <th>{t('Phone', 'ስልክ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Record', 'መዝገብ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{s.reg_no}</td>
                  <td className="font-medium text-slate-900">
                    <Link href={`/dashboard/people/students/${s.id}`} className="hover:text-blue-600 hover:underline">
                      {locale === 'am' ? s.name_am : s.name_en}
                    </Link>
                  </td>
                  <td className="text-slate-600">{s.baptismal}</td>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                      {s.class}
                    </span>
                  </td>
                  <td className="text-slate-700 text-xs">{s.parent}</td>
                  <td className="text-slate-500 text-xs font-mono">{s.phone}</td>
                  <td>
                    <span className={s.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-warning'}>
                      {s.status === 'ACTIVE' ? t('Active', 'ንቁ') : t('Inactive', 'የቦዘነ')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedStudent(s)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Academic Record', 'የትምህርት መዝገብ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enroll Student Modal */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title={t('Enroll New Sunday School Student', 'አዲስ ተማሪ መዝግብ')}
        subtitle={t('Assign academic class and guardian contact details', 'ክፍል እና የወላጅ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleEnroll} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Student Name (English)', 'የተማሪ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Samuel Bekele"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Student Name (Amharic)', 'የተማሪ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ሳሙኤል በቀለ"
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
                value={baptismal}
                onChange={(e) => setBaptismal(e.target.value)}
                placeholder="ለምሳሌ: ተክለ ሃይማኖት"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Class Enrollment', 'የሚመደብበት ክፍል')} *
              </label>
              <select
                value={studentClassId}
                onChange={(e) => setStudentClassId(e.target.value)}
                className="form-input text-sm"
              >
                {MOCK_CLASSES.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Gender', 'ፆታ')} *
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as StudentGender)}
              className="form-input text-sm"
            >
              <option value="MALE">{t('Male', 'ወንድ')}</option>
              <option value="FEMALE">{t('Female', 'ሴት')}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Parent / Guardian Name', 'የወላጅ / አሳዳጊ ስም')} *
              </label>
              <input
                type="text"
                required
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="e.g. Bekele Tadesse"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Guardian Phone', 'የወላጅ ስልክ')} *
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
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Enroll Student', 'ተማሪ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Student Academic Record Modal */}
      {selectedStudent && (
        <Modal
          isOpen={Boolean(selectedStudent)}
          onClose={() => setSelectedStudent(null)}
          title={locale === 'am' ? selectedStudent.name_am : selectedStudent.name_en}
          subtitle={`${selectedStudent.reg_no} • ${selectedStudent.class}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-blue-700 font-semibold uppercase tracking-wider block">
                  {t('Assigned Class', 'የተመደበበት ክፍል')}
                </span>
                <span className="font-bold text-slate-900 text-base">{selectedStudent.class}</span>
              </div>
              <span className="badge badge-success">{selectedStudent.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block">{t('Baptismal Name', 'የክርስትና ስም')}</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{selectedStudent.baptismal}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block">{t('Enrollment Date', 'የተመዘገበበት ቀን')}</span>
                <span className="font-mono text-slate-800 text-sm mt-0.5 block">{selectedStudent.enrollment_date}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block">{t('Parent / Guardian', 'ወላጅ')}</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{selectedStudent.parent}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block">{t('Guardian Phone', 'ስልክ')}</span>
                <span className="font-mono text-slate-800 text-sm mt-0.5 block">{selectedStudent.phone}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link
                href={`/dashboard/people/students/${selectedStudent.id}`}
                className="btn btn-primary text-xs"
              >
                {t('Open full profile', 'ሙሉ መገለጫ ክፈት')}
              </Link>
              <button
                onClick={() => setSelectedStudent(null)}
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
