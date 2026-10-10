'use client';

import React, { useState } from 'react';
import { Plus, Search, AlertCircle, Check, X, SlidersHorizontal, CalendarCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { AssessmentSchemeModal } from '@/components/education/AssessmentSchemeModal';
import { reviewGrade, saveGrade, useEducation } from '@/lib/education/client';
import {
  activeScheme,
  attendanceMarks,
  describeScheme,
  followsScheme,
  letterGrade,
  partScore,
  PASS_MARK,
  type GradeRow,
} from '@/lib/education/types';

type Toast = { kind: 'success' | 'error'; text: string } | null;

const STATUS_BADGE: Record<GradeRow['status'], string> = {
  APPROVED: 'badge badge-success',
  PENDING: 'badge badge-warning',
  REJECTED: 'badge badge-danger',
};

export default function GradesPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const edu = useEducation();
  const { grades, students, subjects, classes, sessions, years, activeYearId, mode } = edu;
  const scheme = activeScheme(edu);
  const year = years.find((y) => y.id === activeYearId);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GradeRow['status']>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSchemeOpen, setIsSchemeOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<GradeRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState('1');
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  const canEnter = can('GRADE_CREATE') || can('GRADE_UPDATE');
  const canApprove = can('GRADE_APPROVE');

  const partName = (key: string) => {
    const p = scheme.find((x) => x.key === key);
    return p ? (locale === 'am' ? p.name_am : p.name_en) : key.replace(/_/g, ' ');
  };
  const attendancePart = scheme.find((p) => p.source === 'attendance');
  const attendanceFor = (id: string) => (attendancePart && id ? attendanceMarks(sessions, id, attendancePart.weight) : null);
  const suggestion = attendanceFor(studentId);
  const staleCount = grades.filter((g) => !followsScheme(g, scheme)).length;

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

  const values = Object.fromEntries(
    scheme.map((p) => [p.key, Math.min(p.weight, Math.max(0, Number(scoreInputs[p.key]) || 0))])
  );
  const formTotal = Math.round(scheme.reduce((sum, p) => sum + values[p.key], 0) * 100) / 100;

  /** Empty inputs, with the attendance part filled from the student's roll calls. */
  const freshInputs = (id: string): Record<string, string> => {
    const a = attendanceFor(id);
    return attendancePart && a ? { [attendancePart.key]: String(a.marks) } : {};
  };

  const chooseStudent = (id: string) => {
    setStudentId(id);
    if (attendancePart) {
      const a = attendanceFor(id);
      setScoreInputs((prev) => ({ ...prev, [attendancePart.key]: a ? String(a.marks) : '' }));
    }
  };

  const openEntry = (prefill?: GradeRow) => {
    setFormError('');
    if (prefill) {
      const s = students.find((x) => x.id === prefill.student_id);
      setClassId(s?.class_id ?? '');
      setStudentId(prefill.student_id);
      setSubjectId(prefill.subject_id);
      setTerm(String(prefill.term));
      // Parts entered under the same weights carry over; anything else is entered again
      const kept = scheme.flatMap((p) => {
        const s = partScore(prefill, p);
        return s && s.max === p.weight ? [[p.key, String(s.score)]] : [];
      });
      setScoreInputs({ ...freshInputs(prefill.student_id), ...Object.fromEntries(kept) });
    } else {
      setScoreInputs(freshInputs(studentId));
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
      scores: values,
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
    setScoreInputs({});
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
            {t('Marks out of 100', 'ከ100 ነጥብ')}: {describeScheme(scheme, locale)}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {canApprove && (
            <button
              onClick={() => setIsSchemeOpen(true)}
              disabled={!year || mode === 'loading' || mode === 'error'}
              className="btn btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <SlidersHorizontal size={16} />
              {t('Weights', 'የምዘና ክፍፍል')}
            </button>
          )}
          {canEnter && (
            <button
              onClick={() => openEntry()}
              disabled={mode === 'loading' || mode === 'error' || students.length === 0 || subjects.length === 0}
              className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={16} />
              {t('Enter Student Grades', 'ውጤት አስገባ')}
            </button>
          )}
        </div>
      </div>

      <EducationNotice needs="year" />

      {staleCount > 0 && (
        <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
          {t(
            `${staleCount} grade(s) were entered with earlier weights. They keep their totals; open one and choose “Edit scores” to enter it with the current weights.`,
            `${staleCount} ውጤት(ዎች) በቀድሞው ክፍፍል ገብተዋል። ድምራቸው አይቀየርም፤ በአዲሱ ክፍፍል ለማስገባት ውጤቱን ከፍተው “ነጥብ አርትዕ” ይጫኑ።`
          )}
        </p>
      )}

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
                {scheme.map((p) => (
                  <th key={p.key}>
                    {locale === 'am' ? p.name_am : p.name_en} ({p.weight})
                  </th>
                ))}
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
                  {scheme.map((p) => {
                    const s = partScore(g, p);
                    return (
                      <td key={p.key} className="font-mono text-xs text-slate-700">
                        {!s ? (
                          <span className="text-slate-300">—</span>
                        ) : s.max === p.weight ? (
                          `${s.score}/${s.max}`
                        ) : (
                          <span
                            className="text-amber-700"
                            title={t(`Entered when this part carried ${s.max} marks`, `ይህ ምዘና ${s.max} ነጥብ በነበረበት ጊዜ የገባ`)}
                          >
                            {s.score}/{s.max}
                          </span>
                        )}
                      </td>
                    );
                  })}
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
                  <td colSpan={8 + scheme.length} className="text-center text-sm text-slate-400 py-8">
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
        subtitle={t('Enter the score of each part, out of its marks', 'የእያንዳንዱን ምዘና ነጥብ ያስገቡ')}
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
                onChange={(e) => chooseStudent(e.target.value)}
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
            {scheme.map((p) => (
              <div key={p.key}>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {locale === 'am' ? p.name_am : p.name_en} ({t(`out of ${p.weight}`, `ከ${p.weight}`)}) *
                </label>
                <input
                  type="number"
                  min="0"
                  max={p.weight}
                  step="0.1"
                  required
                  value={scoreInputs[p.key] ?? ''}
                  onChange={(e) => setScoreInputs((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="form-input text-sm"
                />
                {p.source === 'attendance' && studentId && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                    <CalendarCheck size={12} className="mt-px shrink-0 text-emerald-600" />
                    {suggestion
                      ? t(
                          `From roll calls: attended ${suggestion.attended} of ${suggestion.counted} → ${suggestion.marks}/${p.weight}`,
                          `ከክትትል መዝገብ: ከ${suggestion.counted} ${suggestion.attended} ተገኝቷል → ${suggestion.marks}/${p.weight}`
                        )
                      : t('No roll calls recorded for this student yet — enter it by hand.', 'ለዚህ ተማሪ ክትትል ገና አልተመዘገበም — በእጅ ያስገቡ።')}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs text-blue-900">
            <span>{t('Calculated Total Score', 'የተሰላ አጠቃላይ ውጤት')}:</span>
            <span className="font-bold text-sm font-mono">
              {formTotal}% ({t('Grade', 'ደረጃ')}: {letterGrade(formTotal)})
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

            {!followsScheme(selectedGrade, scheme) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t(
                  'Entered with earlier weights. Choose “Edit scores” to enter it with the current weights.',
                  'በቀድሞው ክፍፍል የገባ ነው። በአሁኑ ክፍፍል ለማስገባት “ነጥብ አርትዕ” ይጫኑ።'
                )}
              </p>
            )}

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              {selectedGrade.scores.map((s) => (
                <div key={s.key} className="py-2.5 flex justify-between">
                  <span className="text-slate-500">{partName(s.key)} ({s.max}):</span>
                  <span className="font-semibold text-slate-900 font-mono">{s.score} / {s.max}</span>
                </div>
              ))}
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

      {isSchemeOpen && year && (
        <AssessmentSchemeModal
          scheme={scheme}
          yearName={year.name}
          onClose={() => setIsSchemeOpen(false)}
          onSaved={(text) => {
            setIsSchemeOpen(false);
            showToast('success', text);
          }}
        />
      )}
    </div>
  );
}
