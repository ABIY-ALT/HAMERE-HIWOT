'use client';

import React, { useState } from 'react';
import { AlertCircle, Check, Plus, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { useEducation } from '@/lib/education/client';
import { MAX_OPTIONS, attemptState, deadline, examTotal, isTimeUp, type ExamQuestion, type QuestionKind } from '@/lib/exams/types';
import {
  createExam,
  giveExtraTime,
  markShortAnswers,
  saveQuestion,
  updateExam,
  type AttemptRow,
  type ExamDetail,
  type ExamInput,
  type ExamSummary,
  type QuestionInput,
} from '@/app/dashboard/education/exams/actions';

const LETTERS = 'ABCDEF';

function ErrorBox({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} /> {text}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function kindLabel(kind: QuestionKind, t: (en: string, am: string) => string) {
  return kind === 'CHOICE' ? t('Multiple choice', 'ምርጫ') : kind === 'TRUE_FALSE' ? t('True / false', 'እውነት / ሐሰት') : t('Short answer', 'አጭር መልስ');
}

// ── Exam settings ────────────────────────────────────────────────────────────

export function ExamSettingsDialog({ exam, onClose, onSaved }: { exam?: ExamSummary; onClose: () => void; onSaved: (id: string) => void }) {
  const { t, locale } = useLang();
  const { classes, subjects, years } = useEducation();
  const [form, setForm] = useState<ExamInput>({
    title: exam?.title ?? '',
    instructions: exam?.instructions ?? '',
    class_id: exam?.class_id ?? '',
    subject_id: exam?.subject_id ?? '',
    term: exam?.term ?? 1,
    part_key: exam?.part_key ?? '',
    duration_minutes: exam?.duration_minutes ?? 40,
    shuffle: exam?.shuffle ?? true,
    show_score: exam?.show_score ?? true,
    use_start_key: exam?.use_start_key ?? true,
    leave_limit: exam?.leave_limit ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof ExamInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const locked = Boolean(exam && exam.status !== 'DRAFT');
  // An exam from an earlier year keeps its class even though that class is not listed any more
  const classOptions = exam && !classes.some((c) => c.id === exam.class_id)
    ? [{ id: exam.class_id, name_en: exam.class_name, name_am: exam.class_name_am, academic_year_id: exam.academic_year_id }, ...classes]
    : classes;
  const yearId = classOptions.find((c) => c.id === form.class_id)?.academic_year_id;
  const parts = (years.find((y) => y.id === yearId)?.scheme ?? []).filter((p) => p.source !== 'attendance');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (exam) {
      const res = await updateExam(exam.id, form);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      onSaved(exam.id);
    } else {
      const res = await createExam(form);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      onSaved(res.id);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={exam ? t('Exam settings', 'የፈተና ማስተካከያ') : t('New online exam', 'አዲስ የኦንላይን ፈተና')} maxWidth="xl">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <Field label={t('Title', 'ርዕስ') + ' *'}>
          <input required value={form.title} onChange={set('title')} placeholder={t('e.g. Mid exam — Chapter 1–3', 'ለምሳሌ፦ የመካከለኛ ፈተና — ምዕራፍ 1–3')} className="form-input text-sm" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Class', 'ክፍል') + ' *'}>
            <select required disabled={locked} value={form.class_id} onChange={set('class_id')} className="form-input text-sm disabled:bg-slate-50">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am || c.name_en : c.name_en}</option>)}
            </select>
          </Field>
          <Field label={t('Subject', 'የትምህርት ዓይነት') + ' *'}>
            <select required value={form.subject_id} onChange={set('subject_id')} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {subjects.filter((s) => s.is_active || s.id === form.subject_id).map((s) => (
                <option key={s.id} value={s.id}>{locale === 'am' ? s.name_am || s.name_en : s.name_en}</option>
              ))}
            </select>
          </Field>
          <Field label={t('Term', 'ሩብ ዓመት') + ' *'}>
            <select value={String(form.term)} onChange={set('term')} className="form-input text-sm">
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t(`Term ${n}`, `${n}ኛ ሩብ`)}</option>)}
            </select>
          </Field>
          <Field label={t('Time (minutes)', 'ጊዜ (ደቂቃ)') + ' *'}>
            <input type="number" required min={1} max={300} disabled={locked} value={String(form.duration_minutes)} onChange={set('duration_minutes')} className="form-input text-sm disabled:bg-slate-50" />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label={t('Counts in grades as', 'በውጤት የሚቆጠረው እንደ')}
              hint={t('The score is scaled to the marks of this part, e.g. 38/50 → 19/25.', 'ውጤቱ ወደዚህ ምዘና ነጥብ ይቀየራል፤ ለምሳሌ 38/50 → 19/25።')}
            >
              <select value={form.part_key} onChange={set('part_key')} className="form-input text-sm">
                <option value="">{t('Not added to grades (practice)', 'በውጤት አይቆጠርም (ልምምድ)')}</option>
                {parts.map((p) => (
                  <option key={p.key} value={p.key}>
                    {locale === 'am' ? p.name_am : p.name_en} ({p.weight})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <Field label={t('Instructions for students', 'ለተማሪዎች መመሪያ')}>
          <textarea rows={2} value={form.instructions} onChange={set('instructions')} className="form-input text-sm" />
        </Field>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={locked} checked={form.shuffle} onChange={(e) => setForm((f) => ({ ...f, shuffle: e.target.checked }))} />
            {t('Mix the order of questions and choices for each student', 'የጥያቄዎችንና የምርጫዎችን ቅደም ተከተል ለእያንዳንዱ ተማሪ ቀላቅል')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.show_score} onChange={(e) => setForm((f) => ({ ...f, show_score: e.target.checked }))} />
            {t('Show the student their score after handing in', 'ተማሪው ካስገባ በኋላ ውጤቱን አሳይ')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.use_start_key} onChange={(e) => setForm((f) => ({ ...f, use_start_key: e.target.checked }))} />
            {t('Students need the room key you show in class to start', 'ለመጀመር በክፍል የሚያሳዩት ቁልፍ ያስፈልጋል')}
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Number(form.leave_limit) > 0}
              onChange={(e) => setForm((f) => ({ ...f, leave_limit: e.target.checked ? 3 : 0 }))}
            />
            {t('Hand in automatically after leaving the exam page', 'ከፈተናው ገጽ ሲወጡ በራሱ ይግባ፤ ከ')}
            <input
              type="number"
              min={1}
              max={20}
              disabled={Number(form.leave_limit) === 0}
              value={Number(form.leave_limit) || 3}
              onChange={(e) => setForm((f) => ({ ...f, leave_limit: e.target.value }))}
              className="form-input text-sm w-16 py-1 disabled:bg-slate-50"
            />
            {t('times', 'ጊዜ በኋላ')}
          </label>
        </div>
        {locked && <p className="text-[11px] text-slate-400">{t('The class, time and order are fixed once the exam has been opened.', 'ፈተናው ከተከፈተ በኋላ ክፍሉ፣ ጊዜውና ቅደም ተከተሉ አይቀየሩም።')}</p>}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : exam ? t('Save', 'አስቀምጥ') : t('Create and add questions', 'ፍጠርና ጥያቄ ጨምር')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Question ─────────────────────────────────────────────────────────────────

const blank = (kind: QuestionKind = 'CHOICE', marks = 1): QuestionInput => ({ kind, prompt: '', options: ['', '', '', ''], answer: '', marks });

export function QuestionDialog({
  examId,
  question,
  onClose,
  onSaved,
}: {
  examId: string;
  question?: ExamQuestion;
  onClose: () => void;
  /** keepOpen: "Save and add another" */
  onSaved: (keepOpen: boolean) => void;
}) {
  const { t } = useLang();
  const [q, setQ] = useState<QuestionInput>(
    question ? { kind: question.kind, prompt: question.prompt, options: question.kind === 'CHOICE' ? question.options : ['', '', '', ''], answer: question.answer, marks: question.marks } : blank()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);

  const setKind = (kind: QuestionKind) => setQ((x) => ({ ...x, kind, answer: '' }));
  const setOption = (i: number, text: string) => setQ((x) => ({ ...x, options: x.options.map((o, k) => (k === i ? text : o)) }));
  const removeOption = (i: number) =>
    setQ((x) => {
      const answer = x.answer === '' ? '' : Number(x.answer) === i ? '' : Number(x.answer) > i ? String(Number(x.answer) - 1) : x.answer;
      return { ...x, options: x.options.filter((_, k) => k !== i), answer };
    });

  const save = async (keepOpen: boolean) => {
    setBusy(true);
    setError('');
    const res = await saveQuestion(examId, question?.id ?? null, q);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (keepOpen) {
      setAdded((n) => n + 1);
      setQ(blank(q.kind, Number(q.marks) || 1));
    }
    onSaved(keepOpen);
  };

  return (
    <Modal isOpen onClose={onClose} title={question ? t('Edit question', 'ጥያቄ አርትዕ') : t('Add a question', 'ጥያቄ ጨምር')} maxWidth="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="space-y-4"
      >
        <ErrorBox text={error} />
        {added > 0 && <p className="text-xs text-emerald-700">{t(`${added} question(s) added — write the next one.`, `${added} ጥያቄ(ዎች) ተጨምረዋል — ቀጣዩን ይጻፉ።`)}</p>}
        <div className="grid grid-cols-3 gap-2">
          {(['CHOICE', 'TRUE_FALSE', 'SHORT'] as QuestionKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`p-2 rounded-lg border text-xs font-semibold ${q.kind === k ? 'border-rose-800 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {kindLabel(k, t)}
            </button>
          ))}
        </div>
        <Field label={t('Question', 'ጥያቄ') + ' *'}>
          <textarea required rows={3} value={q.prompt} onChange={(e) => setQ((x) => ({ ...x, prompt: e.target.value }))} className="form-input text-sm" />
        </Field>

        {q.kind === 'CHOICE' && (
          <Field label={t('Choices — tick the right one', 'ምርጫዎች — ትክክለኛውን ምልክት ያድርጉ')}>
            <div className="space-y-2">
              {q.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQ((x) => ({ ...x, answer: String(i) }))}
                    title={t('Right answer', 'ትክክለኛ መልስ')}
                    className={`w-7 h-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold ${q.answer === String(i) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 text-slate-500'}`}
                  >
                    {q.answer === String(i) ? <Check size={14} /> : LETTERS[i]}
                  </button>
                  <input value={o} onChange={(e) => setOption(i, e.target.value)} className="form-input text-sm flex-1" />
                  {q.options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="text-slate-400 hover:text-red-600 p-1" aria-label={t('Remove choice', 'ምርጫውን አስወግድ')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {q.options.length < MAX_OPTIONS && (
                <button type="button" onClick={() => setQ((x) => ({ ...x, options: [...x.options, ''] }))} className="text-xs text-blue-600 inline-flex items-center gap-1">
                  <Plus size={12} /> {t('Add a choice', 'ምርጫ ጨምር')}
                </button>
              )}
            </div>
          </Field>
        )}

        {q.kind === 'TRUE_FALSE' && (
          <Field label={t('The statement is', 'ዓረፍተ ነገሩ')}>
            <div className="flex gap-5 py-1">
              {[
                ['true', t('True', 'እውነት')],
                ['false', t('False', 'ሐሰት')],
              ].map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="radio" name="tf" checked={q.answer === value} onChange={() => setQ((x) => ({ ...x, answer: value }))} /> {label}
                </label>
              ))}
            </div>
          </Field>
        )}

        {q.kind === 'SHORT' && (
          <Field
            label={t('Model answer (for marking)', 'የማረሚያ መልስ')}
            hint={t('Students do not see this. You mark short answers yourself after the exam.', 'ተማሪዎች አያዩትም። አጭር መልሶችን ከፈተና በኋላ እርስዎ ያርማሉ።')}
          >
            <textarea rows={2} value={q.answer} onChange={(e) => setQ((x) => ({ ...x, answer: e.target.value }))} className="form-input text-sm" />
          </Field>
        )}

        <div className="w-32">
          <Field label={t('Marks', 'ነጥብ') + ' *'}>
            <input type="number" required min={0.5} max={100} step={0.5} value={String(q.marks)} onChange={(e) => setQ((x) => ({ ...x, marks: e.target.value }))} className="form-input text-sm" />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          {!question && (
            <button type="button" disabled={busy} onClick={() => save(true)} className="btn btn-secondary text-xs disabled:opacity-60">
              {t('Save and add another', 'አስቀምጥና ሌላ ጨምር')}
            </button>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Extra time ───────────────────────────────────────────────────────────────

export function ExtraTimeDialog({
  exam,
  attempt,
  onClose,
  onSaved,
}: {
  exam: ExamSummary;
  attempt: AttemptRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useLang();
  const [minutes, setMinutes] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openedAt] = useState(() => Date.now());
  const state = attemptState(attempt);
  const timeUp = state === 'IN_PROGRESS' && isTimeUp(attempt, exam, openedAt);
  const reopens = state === 'SUBMITTED' || timeUp;
  const n = Number(minutes) || 0;
  const endsAt = deadline(attempt, exam);
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale === 'am' ? 'am-ET' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await giveExtraTime(attempt.id, n);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Extra time', 'ተጨማሪ ጊዜ')} subtitle={locale === 'am' ? attempt.student_am : attempt.student} maxWidth="md">
      <form onSubmit={save} className="space-y-4">
        <ErrorBox text={error} />
        <div className="flex flex-wrap gap-2">
          {[5, 10, 15, 30].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(String(m))}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${n === m ? 'border-rose-800 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              +{m}
            </button>
          ))}
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input type="number" min={1} max={180} required value={minutes} onChange={(e) => setMinutes(e.target.value)} className="form-input text-sm w-20 py-1" />
            {t('minutes', 'ደቂቃ')}
          </label>
        </div>
        <p className="text-sm text-slate-700">
          {state === 'NOT_STARTED' &&
            t(`When they start, they will have ${exam.duration_minutes + attempt.extra_minutes + n} minutes instead of ${exam.duration_minutes + attempt.extra_minutes}.`,
              `ሲጀምሩ ከ${exam.duration_minutes + attempt.extra_minutes} ደቂቃ ይልቅ ${exam.duration_minutes + attempt.extra_minutes + n} ደቂቃ ይኖራቸዋል።`)}
          {state === 'IN_PROGRESS' && !timeUp && endsAt &&
            t(`Their time ends at ${clock(endsAt)}; it will end ${n} minutes later. Their phone shows the new time within a minute.`,
              `ጊዜያቸው በ${clock(endsAt)} ያልቃል፤ ${n} ደቂቃ ይጨመርላቸዋል። ስልካቸው በአንድ ደቂቃ ውስጥ አዲሱን ጊዜ ያሳያል።`)}
          {reopens &&
            t(`Their exam is reopened with their answers kept, and the ${n} minutes start now. Tell them to type their code again to continue.`,
              `ፈተናቸው በመልሶቻቸው እንደገና ይከፈታል፤ ${n} ደቂቃው ከአሁን ይጀምራል። ለመቀጠል ኮዳቸውን እንደገና እንዲጽፉ ይንገሯቸው።`)}
        </p>
        {reopens && exam.sent_to_grades_at && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('These results were already sent to grades — send them again after the student hands in.', 'ውጤቱ ቀድሞ ወደ ውጤት መዝገብ ተልኳል — ተማሪው ካስገባ በኋላ እንደገና ይላኩ።')}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy || n < 1} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : reopens ? t(`Reopen with ${n} minutes`, `በ${n} ደቂቃ እንደገና ክፈት`) : t(`Give ${n} more minutes`, `${n} ደቂቃ ጨምር`)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── One student's paper ──────────────────────────────────────────────────────

export function AttemptDialog({
  detail,
  attempt,
  canMark,
  onClose,
  onSaved,
}: {
  detail: ExamDetail;
  attempt: AttemptRow;
  canMark: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useLang();
  const { questions } = detail;
  const [given, setGiven] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.filter((q) => q.kind === 'SHORT' && attempt.marks[q.id] !== undefined).map((q) => [q.id, String(attempt.marks[q.id])]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shorts = questions.filter((q) => q.kind === 'SHORT' && (attempt.answers[q.id] ?? '').trim());

  const answerText = (q: ExamQuestion, value: string | undefined) => {
    if (value === undefined || value === '') return '';
    if (q.kind === 'CHOICE') return `${LETTERS[Number(value)] ?? '?'}. ${q.options[Number(value)] ?? ''}`;
    if (q.kind === 'TRUE_FALSE') return value === 'true' ? t('True', 'እውነት') : t('False', 'ሐሰት');
    return value;
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const res = await markShortAnswers(attempt.id, Object.fromEntries(Object.entries(given).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={locale === 'am' ? attempt.student_am : attempt.student}
      subtitle={`${attempt.reg_no} · ${attempt.score ?? '—'} / ${examTotal(questions)}${attempt.focus_lost ? ` · ${t(`left the page ${attempt.focus_lost}×`, `ገጹን ${attempt.focus_lost} ጊዜ ለቋል`)}` : ''}`}
      maxWidth="2xl"
    >
      <div className="space-y-3">
        <ErrorBox text={error} />
        {questions.map((q, n) => {
          const value = attempt.answers[q.id];
          const got = attempt.marks[q.id];
          const isShort = q.kind === 'SHORT';
          const right = !isShort && got === q.marks;
          return (
            <div key={q.id} className="rounded-xl border border-slate-200 p-3 space-y-1.5 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-slate-400 mt-0.5">{n + 1}.</span>
                <p className="flex-1 text-slate-900 whitespace-pre-wrap">{q.prompt}</p>
                {!isShort && (
                  <span className={`text-xs font-semibold ${right ? 'text-emerald-700' : 'text-red-600'}`}>
                    {got ?? 0}/{q.marks}
                  </span>
                )}
              </div>
              <p className={`text-xs ${value ? 'text-slate-800' : 'text-slate-400 italic'} whitespace-pre-wrap pl-5`}>
                <span className="text-slate-500 not-italic">{t('Answer', 'መልስ')}: </span>
                {answerText(q, value) || t('not answered', 'አልተመለሰም')}
              </p>
              {!isShort && !right && (
                <p className="text-xs text-emerald-700 pl-5">
                  {t('Right answer', 'ትክክለኛ መልስ')}: {answerText(q, q.answer)}
                </p>
              )}
              {isShort && q.answer && <p className="text-xs text-slate-500 pl-5">{t('Model answer', 'የማረሚያ መልስ')}: {q.answer}</p>}
              {isShort && (value ?? '').trim() !== '' && (
                <div className="pl-5 flex items-center gap-2">
                  <span className="text-xs text-slate-600">{t('Marks', 'ነጥብ')}:</span>
                  <input
                    type="number"
                    min={0}
                    max={q.marks}
                    step={0.5}
                    disabled={!canMark}
                    value={given[q.id] ?? ''}
                    onChange={(e) => setGiven((g) => ({ ...g, [q.id]: e.target.value }))}
                    className={`form-input text-sm w-20 py-1 ${given[q.id] === undefined || given[q.id] === '' ? 'border-amber-400' : ''}`}
                  />
                  <span className="text-xs text-slate-400">/ {q.marks}</span>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          {canMark && shorts.length > 0 && (
            <button onClick={save} disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
              {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save marks', 'ነጥብ አስቀምጥ')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

