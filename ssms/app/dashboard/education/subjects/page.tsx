'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2, BookCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_SUBJECTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface SubjectItem {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  grade_level: string;
  credits: number;
  teacher: string;
  syllabus?: string;
}

export default function SubjectsPage() {
  const { t, locale } = useLang();
  const [subjects, setSubjects] = useState<SubjectItem[]>(MOCK_SUBJECTS as SubjectItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [gradeLevel, setGradeLevel] = useState('Grade 1');
  const [credits, setCredits] = useState('2');
  const [teacher, setTeacher] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const newSub: SubjectItem = {
      id: `subj-${Date.now()}`,
      code: code.toUpperCase(),
      name_en: nameEn,
      name_am: nameAm || nameEn,
      grade_level: gradeLevel,
      credits: Number(credits) || 2,
      teacher: teacher || 'TBD',
      syllabus: 'Standard Orthodox Sunday School Syllabus covering foundational theological principles and practical spiritual life.',
    };

    setSubjects([newSub, ...subjects]);
    setIsAddModalOpen(false);
    showToast(t(`Subject "${nameEn}" added successfully!`, `የትምህርት ዓይነት "${nameAm || nameEn}" በሚገባ ተመዝግቧል!`));

    // Reset
    setCode('');
    setNameEn('');
    setNameAm('');
    setTeacher('');
  };

  const filtered = subjects.filter((s) =>
    (locale === 'am' ? s.name_am : s.name_en).toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.teacher.toLowerCase().includes(search.toLowerCase())
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
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Add Subject', 'የትምህርት ዓይነት ጨምር')}
        </button>
      </div>

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
                      {s.grade_level}
                    </span>
                  </td>
                  <td className="font-semibold text-slate-700">{s.credits} hrs/wk</td>
                  <td className="text-slate-600 text-xs">{s.teacher}</td>
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
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Grade 1">Grade 1 (ክፍል 1)</option>
                <option value="Grade 2">Grade 2 (ክፍል 2)</option>
                <option value="Grade 3">Grade 3 (ክፍል 3)</option>
                <option value="Grade 4">Grade 4 (ክፍል 4)</option>
                <option value="Advanced / Youth">Advanced / Youth (ከፍተኛ / ወጣቶች)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lead Instructor', 'ዋና አስተማሪ')}
              </label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="መምህር..."
                className="form-input text-sm"
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
              {t('Save Subject', 'የትምህርት ዓይነት መዝግብ')}
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
          subtitle={`${selectedSubject.code} • ${selectedSubject.grade_level}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Weekly Commitment', 'ሳምንታዊ ሰዓት')}:</span>
                <span className="font-semibold text-slate-800">{selectedSubject.credits} hours per week</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Lead Instructor', 'ዋና አስተማሪ')}:</span>
                <span className="font-semibold text-slate-800">{selectedSubject.teacher}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t('Grade Bracket', 'የክፍል ደረጃ')}:</span>
                <span className="badge badge-info">{selectedSubject.grade_level}</span>
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
