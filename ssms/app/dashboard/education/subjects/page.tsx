'use client';

import React, { useState } from 'react';
import { Plus, Search, BookCheck, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { createSubject, useEducation } from '@/lib/education/client';
import type { Subject } from '@/lib/education/types';

type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function SubjectsPage() {
  const { t, locale } = useLang();
  const { subjects, mode } = useEducation();
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [minGrade, setMinGrade] = useState('1');
  const [credits, setCredits] = useState('2');
  const [instructor, setInstructor] = useState('');
  const [syllabus, setSyllabus] = useState('');

  const gradeLabel = (s: Subject) =>
    s.min_grade <= 1 ? t('All grades', 'ሁሉም ክፍሎች') : t(`Grade ${s.min_grade}+`, `ክፍል ${s.min_grade}+`);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const res = await createSubject({
      code: code.trim(),
      name_en: nameEn.trim(),
      name_am: nameAm.trim(),
      min_grade: Number(minGrade) || 1,
      credits: Number(credits) || 1,
      instructor: instructor.trim(),
      syllabus: syllabus.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    setIsAddModalOpen(false);
    showToast('success', t(`Subject "${nameEn}" added`, `የትምህርት ዓይነት "${nameAm || nameEn}" ተመዝግቧል`));
    setCode('');
    setNameEn('');
    setNameAm('');
    setInstructor('');
    setSyllabus('');
  };

  const filtered = subjects.filter((s) =>
    (locale === 'am' ? s.name_am : s.name_en).toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.instructor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Curriculum & Subjects', 'የትምህርት ዓይነቶች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Orthodox Sunday school syllabus: Bible studies, Church history, Liturgy, Patristics, and Hymnody',
              'የሰንበት ት/ቤት የትምህርት ሥርዓት: መጽሐፍ ቅዱስ፣ የቤተ ክርስቲያን ታሪክ፣ ቅዳሴ፣ ፓትሪስቲክስ እና ዜማ'
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
          {t('Add Subject', 'የትምህርት ዓይነት ጨምር')}
        </button>
      </div>

      <EducationNotice />

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search subjects...', 'የትምህርት ዓይነቶችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('subjects', 'የትምህርት ዓይነቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Course Code', 'የትምህርት ኮድ')}</th>
                <th>{t('Subject Title', 'የትምህርት ርዕስ')}</th>
                <th>{t('Target Grade Level', 'የክፍል ደረጃ')}</th>
                <th>{t('Credit Hours', 'ክሬዲት ሰዓት')}</th>
                <th>{t('Primary Instructor', 'ዋና አስተማሪ')}</th>
                <th className="text-right">{t('Syllabus', 'ሥርዓተ ትምህርት')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{s.code}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? s.name_am : s.name_en}
                  </td>
                  <td>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {gradeLabel(s)}
                    </span>
                  </td>
                  <td className="font-semibold text-slate-700">{s.credits} hrs/wk</td>
                  <td className="text-slate-600 text-xs">{s.instructor || '—'}</td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedSubject(s)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('View Syllabus', 'ሥርዓተ ትምህርት እይ')}
                    </button>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-8">
                    {t('No subjects yet', 'እስካሁን የትምህርት ዓይነት የለም')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Subject Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add New Curriculum Subject', 'አዲስ የትምህርት ዓይነት መዝግብ')}
        subtitle={t('Define subject specifications, grade level, and credit load', 'የትምህርቱን መረጃ፣ የክፍል ደረጃና የሰዓት ጫና ያስገቡ')}
      >
        <form onSubmit={handleAddSubject} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Course Code', 'የትምህርት ኮድ')} *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. BIB-101"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Credit Hours (per week)', 'ክሬዲት ሰዓት')} *
              </label>
              <input
                type="number"
                min="1"
                max="10"
                required
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Subject Title (English)', 'የትምህርት ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Introduction to Holy Scripture"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Subject Title (Amharic)', 'የትምህርት ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: የመጽሐፍ ቅዱስ መግቢያ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Grade Level', 'የክፍል ደረጃ')} *
              </label>
              <select
                value={minGrade}
                onChange={(e) => setMinGrade(e.target.value)}
                className="form-input text-sm"
              >
                <option value="1">{t('All grades (from Grade 1)', 'ሁሉም ክፍሎች (ከክፍል 1)')}</option>
                {[2, 3, 4, 5, 6, 7, 8].map((g) => (
                  <option key={g} value={g}>{t(`Grade ${g} and above`, `ከክፍል ${g} በላይ`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lead Instructor', 'ዋና አስተማሪ')}
              </label>
              <input
                type="text"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="መምህር..."
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Syllabus / Description', 'ሥርዓተ ትምህርት / መግለጫ')}
            </label>
            <textarea
              value={syllabus}
              onChange={(e) => setSyllabus(e.target.value)}
              rows={3}
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
            <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Subject', 'የትምህርት ዓይነት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Syllabus Modal */}
      {selectedSubject && (
        <Modal
          isOpen={Boolean(selectedSubject)}
          onClose={() => setSelectedSubject(null)}
          title={locale === 'am' ? selectedSubject.name_am : selectedSubject.name_en}
          subtitle={`${selectedSubject.code} • ${gradeLabel(selectedSubject)}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Weekly Commitment', 'ሳምንታዊ ሰዓት')}:</span>
                <span className="font-semibold text-slate-800">{selectedSubject.credits} hours per week</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Lead Instructor', 'ዋና አስተማሪ')}:</span>
                <span className="font-semibold text-slate-800">{selectedSubject.instructor || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Grade Bracket', 'የክፍል ደረጃ')}:</span>
                <span className="badge badge-info">{gradeLabel(selectedSubject)}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BookCheck size={14} className="text-blue-600" />
                {t('Syllabus Description & Theological Scope', 'ሥርዓተ ትምህርትና የመማሪያ ይዘት')}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-200 p-3.5 rounded-xl">
                {selectedSubject.syllabus ||
                  t(
                    'Comprehensive coverage of Ethiopian Orthodox Tewahedo Church sacred doctrine, canonical scriptures, patristic writings, and liturgical traditions.',
                    'የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን ቀኖናዊ ትምህርቶች፣ ቅዱሳት መጻሕፍት፣ የሊቃውንት አስተምህሮ እና ሥርዓተ አምልኮ አጠቃላይ ይዘት።'
                  )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSubject(null)}
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
