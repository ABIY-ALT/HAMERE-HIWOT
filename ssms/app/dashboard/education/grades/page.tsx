'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_GRADES } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface GradeItem {
  id: string;
  student: string;
  reg_no: string;
  subject: string;
  class: string;
  continuous: number;
  final: number;
  total: number;
  grade: string;
  status: string;
}

export default function GradesPage() {
  const { t } = useLang();
  const [grades, setGrades] = useState<GradeItem[]>(MOCK_GRADES as GradeItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<GradeItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [student, setStudent] = useState('');
  const [regNo, setRegNo] = useState('');
  const [className, setClassName] = useState('Grade 1A');
  const [subject, setSubject] = useState('Bible Studies (መጽሐፍ ቅዱስ)');
  const [continuous, setContinuous] = useState('25');
  const [finalScore, setFinalScore] = useState('62');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const calculateLetter = (total: number) => {
    if (total >= 90) return 'A+';
    if (total >= 85) return 'A';
    if (total >= 80) return 'A-';
    if (total >= 75) return 'B+';
    if (total >= 70) return 'B';
    if (total >= 60) return 'C';
    if (total >= 50) return 'D';
    return 'F';
  };

  const handleAddGrade = (e: React.FormEvent) => {
    e.preventDefault();
    const contVal = Math.min(30, Math.max(0, Number(continuous) || 0));
    const finalVal = Math.min(70, Math.max(0, Number(finalScore) || 0));
    const totalVal = contVal + finalVal;
    const letter = calculateLetter(totalVal);

    const newGrade: GradeItem = {
      id: `grd-${Date.now()}`,
      student,
      reg_no: regNo || `STU-${Math.floor(1000 + Math.random() * 9000)}`,
      class: className,
      subject,
      continuous: contVal,
      final: finalVal,
      total: totalVal,
      grade: letter,
      status: 'APPROVED',
    };

    setGrades([newGrade, ...grades]);
    setIsAddModalOpen(false);
    showToast(t(`Grade recorded for ${student} (${letter})!`, `ለ${student} ውጤት ተመዝግቧል (${letter})!`));

    // Reset
    setStudent('');
    setRegNo('');
  };

  const filtered = grades.filter((g) =>
    g.student.toLowerCase().includes(search.toLowerCase()) ||
    g.reg_no.toLowerCase().includes(search.toLowerCase()) ||
    g.subject.toLowerCase().includes(search.toLowerCase()) ||
    g.class.toLowerCase().includes(search.toLowerCase())
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
            {t('Examinations & Grading', 'ፈተናዎችና ውጤቶች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Assessment records: continuous assessment (30%), final exam (70%), and letter grades',
              'የትምህርት ምዘና: ተከታታይ ምዘና (30%)፣ የማጠቃለያ ፈተና (70%) እና አጠቃላይ ውጤት'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Enter Student Grades', 'ውጤት አስገባ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{grades.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Graded', 'የተመዘገቡ ውጤቶች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">83.4%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Class Average', 'የክፍል አማካይ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {grades.filter((g) => g.status === 'APPROVED').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Approved Grades', 'የጸደቁ ውጤቶች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-500">
            {grades.filter((g) => g.status === 'PENDING').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Pending Approvals', 'ማረጋገጫ የሚጠብቁ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search student or subject...', 'ተማሪ ወይም ትምህርት ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('records', 'መዝገቦች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Student', 'ተማሪ')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Subject', 'ትምህርት')}</th>
                <th>{t('Continuous (30%)', 'ተከታታይ (30%)')}</th>
                <th>{t('Final (70%)', 'የመጨረሻ (70%)')}</th>
                <th>{t('Total (100%)', 'ድምር (100%)')}</th>
                <th>{t('Grade', 'ደረጃ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div className="font-semibold text-slate-900">{g.student}</div>
                    <div className="text-[11px] font-mono text-slate-400">{g.reg_no}</div>
                  </td>
                  <td className="text-slate-600 text-xs">{g.class}</td>
                  <td className="text-slate-700 text-xs font-medium">{g.subject}</td>
                  <td className="font-mono text-xs text-slate-700">{g.continuous}/30</td>
                  <td className="font-mono text-xs text-slate-700">{g.final}/70</td>
                  <td>
                    <span className="font-bold text-xs text-slate-900 font-mono">{g.total}%</span>
                  </td>
                  <td>
                    <span className="font-bold text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      {g.grade}
                    </span>
                  </td>
                  <td>
                    <span className={g.status === 'APPROVED' ? 'badge badge-success' : 'badge badge-warning'}>
                      {g.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedGrade(g)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Details', 'ዝርዝር')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enter Student Grades Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Enter Student Examination Grade', 'የተማሪ ውጤት አስገባ')}
        subtitle={t('Input continuous assessment and final examination scores', 'የተከታታይ ምዘና እና የመጨረሻ ፈተና ነጥብ ያስገቡ')}
      >
        <form onSubmit={handleAddGrade} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Student Full Name', 'የተማሪ ሙሉ ስም')} *
              </label>
              <input
                type="text"
                required
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                placeholder="e.g. Dawit Hailu"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Registration ID', 'የተማሪ መለያ ቁጥር')}
              </label>
              <input
                type="text"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                placeholder="STU-2024-..."
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Class Group', 'ክፍል')} *
              </label>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Grade 1A">Grade 1A (ክፍል 1ሀ)</option>
                <option value="Grade 1B">Grade 1B (ክፍል 1ለ)</option>
                <option value="Grade 2A">Grade 2A (ክፍል 2ሀ)</option>
                <option value="Grade 3A">Grade 3A (ክፍል 3ሀ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Curriculum Subject', 'የትምህርት ዓይነት')} *
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Bible Studies (መጽሐፍ ቅዱስ)">Bible Studies (መጽሐፍ ቅዱስ)</option>
                <option value="Church History (የቤተ ክርስቲያን ታሪክ)">Church History (የቤተ ክርስቲያን ታሪክ)</option>
                <option value="Liturgical Studies (ሥርዓተ ቅዳሴ)">Liturgical Studies (ሥርዓተ ቅዳሴ)</option>
                <option value="Orthodox Hymnody (ዜማ)">Orthodox Hymnody (ዜማ)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Continuous Assessment (Max 30%)', 'ተከታታይ ምዘና (30%)')} *
              </label>
              <input
                type="number"
                min="0"
                max="30"
                required
                value={continuous}
                onChange={(e) => setContinuous(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Final Exam (Max 70%)', 'የመጨረሻ ፈተና (70%)')} *
              </label>
              <input
                type="number"
                min="0"
                max="70"
                required
                value={finalScore}
                onChange={(e) => setFinalScore(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs text-blue-900">
            <span>{t('Calculated Total Score', 'የተሰላ አጠቃላይ ውጤት')}:</span>
            <span className="font-bold text-sm font-mono">
              {(Number(continuous) || 0) + (Number(finalScore) || 0)}% (Grade: {calculateLetter((Number(continuous) || 0) + (Number(finalScore) || 0))})
            </span>
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
              {t('Save Grade', 'ውጤት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Grade Details Modal */}
      {selectedGrade && (
        <Modal
          isOpen={Boolean(selectedGrade)}
          onClose={() => setSelectedGrade(null)}
          title={`${selectedGrade.student} — ${selectedGrade.subject}`}
          subtitle={`${selectedGrade.class} • ${selectedGrade.reg_no}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">{t('Overall Score & Letter', 'አጠቃላይ ውጤትና ፊደል')}</div>
                <div className="text-3xl font-extrabold text-blue-600 font-mono mt-0.5">
                  {selectedGrade.total}% <span className="text-lg text-slate-700">({selectedGrade.grade})</span>
                </div>
              </div>
              <span className="badge badge-success text-xs">{selectedGrade.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Continuous Assessment', 'ተከታታይ ምዘና')} (30%):</span>
                <span className="font-semibold text-slate-900 font-mono">{selectedGrade.continuous} / 30</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Final Examination', 'የመጨረሻ ፈተና')} (70%):</span>
                <span className="font-semibold text-slate-900 font-mono">{selectedGrade.final} / 70</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Academic Standing', 'የትምህርት ደረጃ')}:</span>
                <span className="font-medium text-emerald-600 font-semibold">
                  {selectedGrade.total >= 60 ? t('Satisfactory / Passed', 'አጥጋቢ / አልፏል') : t('Academic Detention', 'ዝቅተኛ ውጤት')}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedGrade(null)}
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
