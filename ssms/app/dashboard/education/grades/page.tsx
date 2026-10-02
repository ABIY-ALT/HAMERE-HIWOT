'use client';

import React, { useState } from 'react';
import { Plus, Search, AlertCircle, Check, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { reviewGrade, saveGrade, useEducation } from '@/lib/education/client';
import { letterGrade, PASS_MARK, type GradeRow } from '@/lib/education/types';

type Toast = { kind: 'success' | 'error'; text: string } | null;

const STATUS_BADGE: Record<GradeRow['status'], string> = {
  APPROVED: 'badge badge-success',
  PENDING: 'badge badge-warning',
  REJECTED: 'badge badge-danger',
};

export default function GradesPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const { grades, students, subjects, classes, mode } = useEducation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GradeRow['status']>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<GradeRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState('1');
  const [continuous, setContinuous] = useState('');
  const [finalScore, setFinalScore] = useState('');

  const canEnter = can('GRADE_CREATE') || can('GRADE_UPDATE');
  const canApprove = can('GRADE_APPROVE');

  const statusLabel = (s: GradeRow['status']) =>
    s === 'APPROVED' ? t('Approved', 'ጸድቋል') : s === 'REJECTED' ? t('Rejected', 'ተመልሷል') : t('Pending', 'በመጠባበቅ ላይ');

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const classStudents = students
    .filter((s) => s.status === 'ACTIVE' && (!classId || s.class_id === classId))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const student = students.find((s) => s.id === studentId);
  const eligibleSubjects = subjects.filter(
    (s) => s.is_active && (!student || student.grade_level === 0 || s.min_grade <= student.grade_level)
  );
  const existing = grades.find(
    (g) => g.student_id === studentId && g.subject_id === subjectId && g.term === Number(term)
  );

  const contVal = Math.min(30, Math.max(0, Number(continuous) || 0));
  const finalVal = Math.min(70, Math.max(0, Number(finalScore) || 0));

  const openEntry = (prefill?: GradeRow) => {
    setFormError('');
    if (prefill) {
      const s = students.find((x) => x.id === prefill.student_id);
      setClassId(s?.class_id ?? '');
      setStudentId(prefill.student_id);
      setSubjectId(prefill.subject_id);
      setTerm(String(prefill.term));
      setContinuous(String(prefill.continuous));
      setFinalScore(String(prefill.final));
    } else {
      setContinuous('');
      setFinalScore('');
    }
    setSelectedGrade(null);
    setIsAddModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!studentId || !subjectId) {
      setFormError(t('Choose a student and a subject.', 'ተማሪ እና የትምህርት ዓይነት ይምረጡ።'));
      return;
    }
    setBusy(true);
    const res = await saveGrade({
      student_id: studentId,
      subject_id: subjectId,
      term: Number(term),
      continuous: contVal,
      final: finalVal,
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setIsAddModalOpen(false);
    showToast(
      'success',
      t(`Grade saved for ${student?.name_en ?? ''} — waiting for approval`, `ለ${student?.name_am ?? ''} ውጤት ተመዝግቧል — ማጽደቅ ይጠብቃል`)
    );
    setStudentId('');
    setContinuous('');
    setFinalScore('');
  };

  const handleReview = async (g: GradeRow, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    const res = await reviewGrade(g.id, decision);
    setBusy(false);
    if (!res.ok) return showToast('error', res.error);
    setSelectedGrade(null);
    showToast(
      'success',
      decision === 'APPROVED' ? t('Grade approved', 'ውጤቱ ጸድቋል') : t('Grade sent back', 'ውጤቱ ተመልሷል')
    );
  };

  const approved = grades.filter((g) => g.status === 'APPROVED');
  const average = approved.length
    ? Math.round((approved.reduce((sum, g) => sum + g.total, 0) / approved.length) * 10) / 10
    : null;

  const needle = search.toLowerCase();
  const filtered = grades
    .filter((g) => statusFilter === 'ALL' || g.status === statusFilter)
    .filter(
      (g) =>
        (locale === 'am' ? g.student_am : g.student).toLowerCase().includes(needle) ||
        g.reg_no.toLowerCase().includes(needle) ||
        (locale === 'am' ? g.subject_am : g.subject).toLowerCase().includes(needle) ||
        g.class.toLowerCase().includes(needle)
    )
    .sort((a, b) => (a.status === 'PENDING' ? -1 : 0) - (b.status === 'PENDING' ? -1 : 0) || a.student.localeCompare(b.student));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

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
        {canEnter && (
          <button
            onClick={() => openEntry()}
            disabled={mode === 'loading' || mode === 'error' || students.length === 0 || subjects.length === 0}
            className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} />
            {t('Enter Student Grades', 'ውጤት አስገባ')}
          </button>
        )}
      </div>

      <EducationNotice needs="year" />

      {mode === 'live' && subjects.length === 0 && (
        <p className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">
          {t('Add subjects first (Education → Subjects) before entering grades.', 'ውጤት ከማስገባትዎ በፊት የትምህርት ዓይነቶችን ያክሉ።')}
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{grades.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Graded', 'የተመዘገቡ ውጤቶች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{average === null ? '—' : `${average}%`}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Average (approved)', 'አማካይ (የጸደቁ)')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">{approved.length}</div>
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
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All statuses', 'ሁሉም')}</option>
              <option value="PENDING">{statusLabel('PENDING')}</option>
              <option value="APPROVED">{statusLabel('APPROVED')}</option>
              <option value="REJECTED">{statusLabel('REJECTED')}</option>
            </select>
            <span className="text-xs text-slate-400">
              {filtered.length} {t('records', 'መዝገቦች')}
            </span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Student', 'ተማሪ')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Subject', 'ትምህርት')}</th>
                <th>{t('Term', 'ሩብ')}</th>
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
                    <div className="font-semibold text-slate-900">{locale === 'am' ? g.student_am : g.student}</div>
                    <div className="text-[11px] font-mono text-slate-400">{g.reg_no}</div>
                  </td>
                  <td className="text-slate-600 text-xs">{g.class}</td>
                  <td className="text-slate-700 text-xs font-medium">{locale === 'am' ? g.subject_am : g.subject}</td>
                  <td className="text-xs text-slate-600">{g.term}</td>
                  <td className="font-mono text-xs text-slate-700">{g.continuous}/30</td>
                  <td className="font-mono text-xs text-slate-700">{g.final}/70</td>
                  <td>
                    <span className="font-bold text-xs text-slate-900 font-mono">{g.total}%</span>
                  </td>
                  <td>
                    <span className="font-bold text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{g.grade}</span>
                  </td>
                  <td>
                    <span className={STATUS_BADGE[g.status]}>{statusLabel(g.status)}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedGrade(g)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {g.status === 'PENDING' && canApprove ? t('Review', 'ገምግም') : t('Details', 'ዝርዝር')}
                    </button>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-sm text-slate-400 py-8">
                    {t('No grades recorded yet.', 'እስካሁን የተመዘገበ ውጤት የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enter Student Grade Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Enter Student Examination Grade', 'የተማሪ ውጤት አስገባ')}
        subtitle={t('Input continuous assessment and final examination scores', 'የተከታታይ ምዘና እና የመጨረሻ ፈተና ነጥብ ያስገቡ')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Class', 'ክፍል')}</label>
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStudentId('');
                }}
                className="form-input text-sm"
              >
                <option value="">{t('All classes', 'ሁሉም ክፍሎች')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Student', 'ተማሪ')} *</label>
              <select
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="form-input text-sm"
              >
                <option value="">{t('— Choose a student —', '— ተማሪ ይምረጡ —')}</option>
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(locale === 'am' ? s.name_am : s.name_en)} · {s.reg_no}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Curriculum Subject', 'የትምህርት ዓይነት')} *
              </label>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="form-input text-sm"
              >
                <option value="">{t('— Choose a subject —', '— የትምህርት ዓይነት ይምረጡ —')}</option>
                {eligibleSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {locale === 'am' ? s.name_am : s.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Term', 'ሩብ ዓመት')} *</label>
              <select value={term} onChange={(e) => setTerm(e.target.value)} className="form-input text-sm">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{t(`Term ${n}`, `${n}ኛ ሩብ`)}</option>
                ))}
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
                step="0.5"
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
                step="0.5"
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
              {contVal + finalVal}% ({t('Grade', 'ደረጃ')}: {letterGrade(contVal + finalVal)})
            </span>
          </div>

          {existing && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t(
                `A grade already exists for this term (${existing.total}%, ${statusLabel(existing.status)}). Saving replaces it and sends it back for approval.`,
                `ለዚህ ሩብ ዓመት ውጤት አለ (${existing.total}%)። ማስቀመጥ ይተካዋል እና እንደገና ለማጽደቅ ይላካል።`
              )}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Grade', 'ውጤት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Grade Details / Review Modal */}
      {selectedGrade && (
        <Modal
          isOpen={Boolean(selectedGrade)}
          onClose={() => setSelectedGrade(null)}
          title={`${locale === 'am' ? selectedGrade.student_am : selectedGrade.student} — ${
            locale === 'am' ? selectedGrade.subject_am : selectedGrade.subject
          }`}
          subtitle={`${selectedGrade.class} • ${selectedGrade.reg_no} • ${t(`Term ${selectedGrade.term}`, `${selectedGrade.term}ኛ ሩብ`)}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">{t('Overall Score & Letter', 'አጠቃላይ ውጤትና ፊደል')}</div>
                <div className="text-3xl font-extrabold text-blue-600 font-mono mt-0.5">
                  {selectedGrade.total}% <span className="text-lg text-slate-700">({selectedGrade.grade})</span>
                </div>
              </div>
              <span className={STATUS_BADGE[selectedGrade.status]}>{statusLabel(selectedGrade.status)}</span>
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
                <span className={`font-semibold ${selectedGrade.total >= PASS_MARK ? 'text-emerald-600' : 'text-red-600'}`}>
                  {selectedGrade.total >= PASS_MARK ? t('Passed', 'አልፏል') : t('Below pass mark', 'ከማለፊያ በታች')}
                </span>
              </div>
              {selectedGrade.approved_by && (
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">{t('Reviewed by', 'የገመገመው')}:</span>
                  <span className="font-semibold text-slate-900">{selectedGrade.approved_by}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
                {canApprove && selectedGrade.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleReview(selectedGrade, 'APPROVED')}
                      disabled={busy}
                      className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check size={14} />
                      {t('Approve', 'አጽድቅ')}
                    </button>
                    <button
                      onClick={() => handleReview(selectedGrade, 'REJECTED')}
                      disabled={busy}
                      className="btn btn-danger text-xs inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <X size={14} />
                      {t('Send back', 'መልስ')}
                    </button>
                  </>
                )}
                {can('GRADE_UPDATE') && (
                  <button onClick={() => openEntry(selectedGrade)} className="btn btn-secondary text-xs">
                    {t('Edit scores', 'ነጥብ አርትዕ')}
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedGrade(null)} className="btn btn-secondary text-xs">
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
