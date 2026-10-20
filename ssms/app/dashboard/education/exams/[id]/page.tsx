'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  KeyRound,
  Lock,
  Pencil,
  Play,
  Plus,
  Printer,
  Send,
  Smartphone,
  Square,
  TimerReset,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { AttemptDialog, ExamSettingsDialog, ExtraTimeDialog, QuestionDialog, kindLabel } from '@/components/education/ExamDialogs';
import { downloadXlsx, headerCell } from '@/lib/export/xlsx';
import type { ActionResult, LoadMode } from '@/lib/admin/types';
import { EXAM_STATUS_BADGE, attemptState, deadline, formatTicket, scaleToPart, type ExamQuestion } from '@/lib/exams/types';
import {
  allowAnotherPhone,
  changeStartKey,
  closeExam,
  deleteExam,
  deleteQuestion,
  giveNewCode,
  loadExam,
  moveQuestion,
  openExam,
  sendExamToGrades,
  type ExamDetail,
} from '../actions';

type Tab = 'questions' | 'tickets' | 'results';
type Dialog =
  | { kind: 'settings' }
  | { kind: 'question'; question?: ExamQuestion }
  | { kind: 'attempt'; attemptId: string }
  | { kind: 'extra'; attemptId: string }
  | null;
type Confirm =
  | { kind: 'close' | 'grades' | 'delete' | 'newkey' }
  | { kind: 'question'; question: ExamQuestion }
  | { kind: 'newcode'; attemptId: string }
  | null;

const LETTERS = 'ABCDEF';

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLang();
  const { can } = useAuth();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [tab, setTab] = useState<Tab>('questions');
  const tabChosen = useRef(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bigKey, setBigKey] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadExam>>) => {
    if (res.mode === 'live') {
      setDetail(res.data);
      // Start where the exam is: writing questions, following the class, or the results
      if (!tabChosen.current) {
        tabChosen.current = true;
        setTab(res.data.exam.status === 'DRAFT' ? 'questions' : res.data.exam.status === 'OPEN' ? 'tickets' : 'results');
      }
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  const reload = useCallback(() => loadExam(id).then(apply), [id, apply]);

  useEffect(() => {
    loadExam(id).then(apply);
  }, [id, apply]);

  // While the exam is open, follow the class live
  const status = detail?.exam.status;
  useEffect(() => {
    if (status !== 'OPEN') return;
    const refresh = setInterval(reload, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [status, reload]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const run = async (action: () => Promise<ActionResult | { ok: true; count: number } | { ok: false; error: string }>, success: string) => {
    setBusy(true);
    const res = await action();
    setBusy(false);
    setConfirm(null);
    if (!res.ok) return notify('error', res.error);
    notify('success', success);
    await reload();
  };

  if (!detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <AdminModeNotice mode={mode} error={error} />
        {mode === 'demo' && <p className="text-sm text-slate-500">{t('Online exams need the database.', 'የኦንላይን ፈተናዎች ዳታቤዝ ያስፈልጋቸዋል።')}</p>}
      </div>
    );
  }

  const { exam, questions, attempts, part } = detail;
  const canEdit = can('GRADE_CREATE');
  const draft = exam.status === 'DRAFT';
  const handedIn = attempts.filter((a) => a.submitted_at);
  const toMark = attempts.filter((a) => a.needs_marking).length;
  const percent = (score: number | null) => (score === null || !exam.total_marks ? 0 : Math.round((score / exam.total_marks) * 100));
  const average = handedIn.length ? Math.round(handedIn.reduce((s, a) => s + percent(a.score), 0) / handedIn.length) : 0;
  const name = (a: (typeof attempts)[number]) => (locale === 'am' ? a.student_am : a.student);
  const partName = part ? (locale === 'am' ? part.name_am : part.name_en) : '';
  const statusLabel = exam.status === 'DRAFT' ? t('Draft', 'ረቂቅ') : exam.status === 'OPEN' ? t('Open', 'ክፍት') : t('Closed', 'ተዘግቷል');
  const selected = dialog?.kind === 'attempt' ? attempts.find((a) => a.id === dialog.attemptId) : undefined;
  const extraFor = dialog?.kind === 'extra' ? attempts.find((a) => a.id === dialog.attemptId) : undefined;

  const stateLabel = (a: (typeof attempts)[number]) => {
    const s = attemptState(a);
    if (s === 'SUBMITTED') return <span className="text-emerald-700">{t('Handed in', 'አስገብቷል')}</span>;
    if (s === 'NOT_STARTED') return <span className="text-slate-400">{t('Not started', 'አልጀመረም')}</span>;
    const left = Math.max(0, Math.round((new Date(deadline(a, exam)!).getTime() - now) / 60_000));
    return <span className="text-blue-700">{t(`Writing · ${left} min left`, `እየተፈተነ · ${left} ደቂቃ ቀርቷል`)}</span>;
  };

  const awayText = (s: number) =>
    s < 60 ? t(`${s} s`, `${s} ሰከንድ`) : t(`${Math.floor(s / 60)} min ${s % 60} s`, `${Math.floor(s / 60)} ደቂቃ ${s % 60} ሰከንድ`);

  /** What the teacher should look at: leaving the page, other phones, other codes. */
  const watchNotes = (a: (typeof attempts)[number]) => {
    const notes: { text: string; level: 'info' | 'warn' | 'bad' }[] = [];
    if (a.left_at && !a.submitted_at) notes.push({ text: t('away from the exam now', 'አሁን ከፈተናው ውጭ ነው'), level: 'warn' });
    if (a.focus_lost)
      notes.push({
        text: t(`left the page ${a.focus_lost}× · ${awayText(a.away_seconds)} away`, `ገጹን ${a.focus_lost} ጊዜ ለቋል · ${awayText(a.away_seconds)}`),
        level: a.focus_lost > 2 || a.away_seconds > 60 ? 'warn' : 'info',
      });
    if (a.blocked_tries) notes.push({ text: t(`code tried on another phone ${a.blocked_tries}×`, `ኮዱ በሌላ ስልክ ${a.blocked_tries} ጊዜ ተሞክሯል`), level: 'bad' });
    if (a.tried_other_codes)
      notes.push({ text: t(`their phone tried another student's code ${a.tried_other_codes}×`, `ስልካቸው የሌላ ተማሪ ኮድ ${a.tried_other_codes} ጊዜ ሞክሯል`), level: 'bad' });
    if (a.new_device_allowed) notes.push({ text: t('waiting for the new phone', 'አዲሱን ስልክ በመጠባበቅ ላይ'), level: 'info' });
    if (a.device_changes) notes.push({ text: t(`moved to a new phone ${a.device_changes}× (allowed)`, `ወደ አዲስ ስልክ ${a.device_changes} ጊዜ ተዛውሯል (በፈቃድ)`), level: 'info' });
    if (a.late_sync_seconds)
      notes.push({
        text: t(
          `no network at the end: answers arrived ${awayText(a.late_sync_seconds)} after the time (written before it, the phone says)`,
          `በመጨረሻ ኔትወርክ አልነበረም፦ መልሶቹ ጊዜው ካለቀ ${awayText(a.late_sync_seconds)} በኋላ ደረሱ (ስልኩ እንደሚለው ከዚያ በፊት የተጻፉ)`
        ),
        level: a.late_sync_seconds > 180 ? 'warn' : 'info',
      });
    if (a.ended_reason === 'LEFT_PAGE') notes.push({ text: t('handed in automatically: left the page too often', 'ገጹን ብዙ ጊዜ በመልቀቁ በራሱ ገብቷል'), level: 'bad' });
    return notes;
  };
  const notesFor = (a: (typeof attempts)[number]) => {
    const notes = watchNotes(a);
    if (!notes.length) return <span className="text-slate-300">—</span>;
    return (
      <ul className="space-y-0.5">
        {notes.map((n) => (
          <li key={n.text} className={n.level === 'bad' ? 'text-red-700 font-semibold' : n.level === 'warn' ? 'text-amber-700' : 'text-slate-500'}>
            {n.text}
          </li>
        ))}
      </ul>
    );
  };

  const exportResults = () =>
    downloadXlsx(
      `exam_${exam.title}`,
      [
        [t('Reg No', 'የምዝገባ ቁጥር'), t('Student', 'ተማሪ'), t('Score', 'ውጤት'), t('Out of', 'ከ'), '%', ...(part ? [`${partName} (/${part.weight})`] : []), t('Status', 'ሁኔታ'), t('Left the page', 'ገጹን የለቀቀ'), t('Seconds away', 'ከገጹ ውጭ (ሰከንድ)'), t('Notes', 'ማስታወሻ')].map(headerCell),
        ...attempts.map((a) => [
          a.reg_no,
          name(a),
          a.score,
          exam.total_marks,
          a.submitted_at ? percent(a.score) : null,
          ...(part ? [a.submitted_at ? scaleToPart(a.score ?? 0, exam.total_marks, part.weight) : null] : []),
          attemptState(a) === 'SUBMITTED' ? (a.needs_marking ? t('To mark', 'የሚታረም') : t('Handed in', 'አስገብቷል')) : attemptState(a) === 'NOT_STARTED' ? t('Not started', 'አልጀመረም') : t('Writing', 'እየተፈተነ'),
          a.focus_lost,
          a.away_seconds,
          watchNotes(a).map((n) => n.text).join('; '),
        ]),
      ],
      { sheet: 'Results', widths: [16, 28, 10, 10, 8, 14, 14, 12, 12, 40] }
    );

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <BackLink />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{exam.title}</h1>
            <span className={EXAM_STATUS_BADGE[exam.status]}>{statusLabel}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {[
              locale === 'am' ? exam.class_name_am : exam.class_name,
              locale === 'am' ? exam.subject_name_am : exam.subject_name,
              t(`Term ${exam.term}`, `${exam.term}ኛ ሩብ`),
              t(`${exam.duration_minutes} min`, `${exam.duration_minutes} ደቂቃ`),
              t(`${questions.length} questions · ${exam.total_marks} marks`, `${questions.length} ጥያቄ · ${exam.total_marks} ነጥብ`),
            ].join(' · ')}
          </p>
          <p className="text-xs mt-1 text-slate-500">
            {part
              ? t(`Counts in grades as ${partName} (out of ${part.weight})`, `በውጤት እንደ ${partName} (ከ${part.weight}) ይቆጠራል`)
              : t('Practice — not added to grades', 'ልምምድ — በውጤት አይቆጠርም')}
            {exam.sent_to_grades_at && <span className="text-emerald-700"> · {t('sent to grades', 'ወደ ውጤት ተልኳል')}</span>}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setDialog({ kind: 'settings' })} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
              <Pencil size={14} /> {t('Settings', 'ማስተካከያ')}
            </button>
            {exam.started === 0 && (
              <button onClick={() => setConfirm({ kind: 'delete' })} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 text-red-600">
                <Trash2 size={14} /> {t('Delete', 'ሰርዝ')}
              </button>
            )}
            {exam.status !== 'OPEN' && (
              <button
                disabled={busy || questions.length === 0}
                onClick={() => run(() => openExam(exam.id), draft ? t('Exam opened — print the tickets', 'ፈተናው ተከፍቷል — ኮዶቹን ያትሙ') : t('Exam reopened', 'ፈተናው እንደገና ተከፍቷል'))}
                className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play size={14} /> {draft ? t('Open the exam', 'ፈተናውን ክፈት') : t('Reopen', 'እንደገና ክፈት')}
              </button>
            )}
            {exam.status === 'OPEN' && (
              <button onClick={() => setConfirm({ kind: 'close' })} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
                <Square size={14} /> {t('Close the exam', 'ፈተናውን ዝጋ')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ['questions', t(`Questions (${questions.length})`, `ጥያቄዎች (${questions.length})`)],
            ['tickets', t(`Tickets & progress (${attempts.length})`, `ኮዶችና ሂደት (${attempts.length})`)],
            ['results', t(`Results (${handedIn.length})`, `ውጤቶች (${handedIn.length})`)],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === key ? 'border-rose-800 text-rose-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'questions' && (
        <div className="space-y-3">
          {!draft && (
            <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
              <Lock size={12} /> {t('Questions are fixed once the exam has been opened.', 'ፈተናው ከተከፈተ በኋላ ጥያቄዎች አይቀየሩም።')}
            </p>
          )}
          {questions.map((q, n) => (
            <div key={q.id} className="card p-4 space-y-2">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full bg-rose-50 text-rose-900 text-xs font-bold flex items-center justify-center">{n + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">{q.prompt}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{kindLabel(q.kind, t)} · {t(`${q.marks} marks`, `${q.marks} ነጥብ`)}</p>
                </div>
                {draft && canEdit && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconButton label={t('Move up', 'ወደ ላይ')} disabled={n === 0 || busy} onClick={() => run(() => moveQuestion(exam.id, q.id, -1), t('Moved', 'ተንቀሳቅሷል'))}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label={t('Move down', 'ወደ ታች')} disabled={n === questions.length - 1 || busy} onClick={() => run(() => moveQuestion(exam.id, q.id, 1), t('Moved', 'ተንቀሳቅሷል'))}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton label={t('Edit', 'አርትዕ')} onClick={() => setDialog({ kind: 'question', question: q })}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label={t('Delete', 'ሰርዝ')} onClick={() => setConfirm({ kind: 'question', question: q })}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                )}
              </div>
              {q.kind === 'CHOICE' && (
                <ul className="pl-10 space-y-1">
                  {q.options.map((o, i) => (
                    <li key={i} className={`text-sm flex items-start gap-2 ${String(i) === q.answer ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>
                      <span className="w-4">{LETTERS[i]}.</span> <span className="flex-1">{o}</span> {String(i) === q.answer && <Check size={14} className="mt-0.5" />}
                    </li>
                  ))}
                </ul>
              )}
              {q.kind === 'TRUE_FALSE' && (
                <p className="pl-10 text-sm text-emerald-700 font-semibold">{q.answer === 'true' ? t('True', 'እውነት') : t('False', 'ሐሰት')}</p>
              )}
              {q.kind === 'SHORT' && q.answer && (
                <p className="pl-10 text-xs text-slate-500">{t('Model answer', 'የማረሚያ መልስ')}: {q.answer}</p>
              )}
            </div>
          ))}
          {questions.length === 0 && <p className="text-sm text-slate-400">{t('No questions yet.', 'እስካሁን ጥያቄ የለም።')}</p>}
          {draft && canEdit && (
            <button onClick={() => setDialog({ kind: 'question' })} className="btn btn-secondary text-sm inline-flex items-center gap-2">
              <Plus size={16} /> {t('Add a question', 'ጥያቄ ጨምር')}
            </button>
          )}
        </div>
      )}

      {tab === 'tickets' && (
        <div className="space-y-3">
          {draft ? (
            <p className="text-sm text-slate-500">{t('Open the exam to give every student of the class a ticket.', 'ለክፍሉ ተማሪዎች ሁሉ ኮድ ለመስጠት ፈተናውን ይክፈቱ።')}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/education/exams/${exam.id}/tickets`} target="_blank" className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                  <Printer size={14} /> {t('Print tickets', 'ኮዶቹን አትም')}
                </Link>
                {exam.status === 'OPEN' && exam.use_start_key && exam.start_key && (
                  <button onClick={() => setBigKey(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                    <KeyRound size={14} /> {t('Show the room key', 'የክፍሉን ቁልፍ አሳይ')}
                  </button>
                )}
                {canEdit && detail.without_ticket > 0 && (
                  <button disabled={busy} onClick={() => run(() => openExam(exam.id), t('Tickets given', 'ኮዶች ተሰጥተዋል'))} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                    <Users size={14} /> {t(`Give tickets to ${detail.without_ticket} new student(s)`, `ለ${detail.without_ticket} አዲስ ተማሪ(ዎች) ኮድ ስጥ`)}
                  </button>
                )}
              </div>
              {exam.status === 'OPEN' && exam.use_start_key && exam.start_key && (
                <div className="card p-4 flex flex-wrap items-center gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500">{t('Room key — students need it to start', 'የክፍሉ ቁልፍ — ተማሪዎች ለመጀመር ያስፈልጋቸዋል')}</div>
                    <div className="font-mono text-3xl font-bold tracking-[0.4em] text-slate-900">{exam.start_key}</div>
                  </div>
                  <p className="text-xs text-slate-500 flex-1 min-w-[12rem]">
                    {t(
                      'Write it on the board when the students are ready. Someone outside the class with a stolen code cannot start without it. Students already writing are not affected if you change it.',
                      'ተማሪዎች ሲዘጋጁ በሰሌዳው ላይ ይጻፉት። ከክፍሉ ውጭ ያለ ሰው ኮድ ቢያገኝም ያለዚህ ቁልፍ መጀመር አይችልም። ቢቀይሩት እየተፈተኑ ያሉትን አይነካም።'
                    )}
                  </p>
                  {canEdit && (
                    <button onClick={() => setConfirm({ kind: 'newkey' })} className="btn btn-secondary text-xs">
                      {t('New key', 'አዲስ ቁልፍ')}
                    </button>
                  )}
                </div>
              )}
              <div className="card overflow-hidden">
                <div className="table-container rounded-none border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Student', 'ተማሪ')}</th>
                        <th>{t('Code', 'ኮድ')}</th>
                        <th>{t('Progress', 'ሂደት')}</th>
                        <th>{t('To watch', 'ክትትል')}</th>
                        {canEdit && exam.status === 'OPEN' && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="font-medium text-slate-900">{name(a)}</div>
                            <div className="text-[11px] font-mono text-slate-400">{a.reg_no}</div>
                          </td>
                          <td className="font-mono text-sm tracking-wider">{formatTicket(a.ticket)}</td>
                          <td className="text-xs">
                            {stateLabel(a)}
                            {a.extra_minutes > 0 && (
                              <div className="text-[11px] text-emerald-700">
                                {a.extra_minutes <= 180 ? t(`+${a.extra_minutes} min extra`, `+${a.extra_minutes} ደቂቃ ተጨማሪ`) : t('extra time given', 'ተጨማሪ ጊዜ ተሰጥቷል')}
                              </div>
                            )}
                          </td>
                          <td className="text-xs">{notesFor(a)}</td>
                          {canEdit && exam.status === 'OPEN' && (
                            <td className="text-right whitespace-nowrap">
                              <RowAction label={t('Extra time', 'ተጨማሪ ጊዜ')} onClick={() => setDialog({ kind: 'extra', attemptId: a.id })}>
                                <TimerReset size={13} />
                              </RowAction>
                              {!a.submitted_at && a.started_at && !a.new_device_allowed && (
                                <RowAction
                                  label={t('Allow another phone', 'ሌላ ስልክ ፍቀድ')}
                                  onClick={() =>
                                    run(
                                      () => allowAnotherPhone(a.id),
                                      t(`The next phone that opens ${name(a)}'s code takes the exam over`, `የ${name(a)}ን ኮድ የሚከፍተው ቀጣይ ስልክ ፈተናውን ይረከባል`)
                                    )
                                  }
                                >
                                  <Smartphone size={13} />
                                </RowAction>
                              )}
                              <RowAction label={t('New code', 'አዲስ ኮድ')} onClick={() => setConfirm({ kind: 'newcode', attemptId: a.id })}>
                                <KeyRound size={13} />
                              </RowAction>
                            </td>
                          )}
                        </tr>
                      ))}
                      {attempts.length === 0 && (
                        <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-6">{t('No students are enrolled in this class.', 'በዚህ ክፍል የተመዘገበ ተማሪ የለም።')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label={t('Handed in', 'ያስገቡ')} value={`${handedIn.length} / ${attempts.length}`} />
            <Stat label={t('Average', 'አማካይ')} value={handedIn.length ? `${average}%` : '—'} />
            <Stat label={t('Highest', 'ከፍተኛ')} value={handedIn.length ? `${Math.max(...handedIn.map((a) => percent(a.score)))}%` : '—'} />
            <Stat label={t('Short answers to mark', 'የሚታረሙ አጭር መልሶች')} value={String(toMark)} warn={toMark > 0} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportResults} disabled={attempts.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Download size={14} /> {t('Export Excel', 'ኤክሴል አውርድ')}
            </button>
            {canEdit && part && (
              <button
                disabled={busy || exam.status !== 'CLOSED' || toMark > 0 || handedIn.length === 0}
                onClick={() => setConfirm({ kind: 'grades' })}
                className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} /> {exam.sent_to_grades_at ? t('Send to grades again', 'እንደገና ወደ ውጤት ላክ') : t('Send to grades', 'ወደ ውጤት ላክ')}
              </button>
            )}
          </div>
          {part && exam.status === 'OPEN' && (
            <p className="text-xs text-slate-500">{t('Close the exam before sending the results to grades.', 'ውጤቱን ወደ ውጤት መዝገብ ከመላክዎ በፊት ፈተናውን ይዝጉ።')}</p>
          )}
          <div className="card overflow-hidden">
            <div className="table-container rounded-none border-0">
              <table>
                <thead>
                  <tr>
                    <th>{t('Student', 'ተማሪ')}</th>
                    <th>{t('Score', 'ውጤት')}</th>
                    <th>%</th>
                    {part && <th>{`${partName} (/${part.weight})`}</th>}
                    <th>{t('Status', 'ሁኔታ')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {handedIn.map((a) => (
                    <tr key={a.id} onClick={() => setDialog({ kind: 'attempt', attemptId: a.id })} className="cursor-pointer hover:bg-slate-50">
                      <td>
                        <div className="font-medium text-slate-900">{name(a)}</div>
                        <div className="text-[11px] font-mono text-slate-400">{a.reg_no}</div>
                      </td>
                      <td className="font-mono text-xs">{a.score ?? '—'} / {exam.total_marks}</td>
                      <td className="font-mono text-xs">{percent(a.score)}%</td>
                      {part && <td className="font-mono text-xs">{scaleToPart(a.score ?? 0, exam.total_marks, part.weight)}</td>}
                      <td className="text-xs">
                        {a.needs_marking ? <span className="text-amber-700 font-semibold">{t('Short answers to mark', 'አጭር መልስ የሚታረም')}</span> : <span className="text-emerald-700">{t('Marked', 'ታርሟል')}</span>}
                        <div className="mt-0.5">{notesFor(a)}</div>
                      </td>
                      <td className="text-right text-xs text-blue-600 font-semibold">{t('Open', 'ክፈት')}</td>
                    </tr>
                  ))}
                  {handedIn.length === 0 && (
                    <tr><td colSpan={part ? 6 : 5} className="text-center text-sm text-slate-400 py-6">{t('Nobody has handed in yet.', 'እስካሁን ያስገባ የለም።')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {dialog?.kind === 'settings' && (
        <ExamSettingsDialog
          exam={exam}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            notify('success', t('Saved', 'ተቀምጧል'));
            reload();
          }}
        />
      )}
      {dialog?.kind === 'question' && (
        <QuestionDialog
          examId={exam.id}
          question={dialog.question}
          onClose={() => setDialog(null)}
          onSaved={(keepOpen) => {
            if (!keepOpen) setDialog(null);
            reload();
          }}
        />
      )}
      {selected && (
        <AttemptDialog
          detail={detail}
          attempt={selected}
          canMark={canEdit}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            notify('success', t('Marks saved', 'ነጥብ ተቀምጧል'));
            reload();
          }}
        />
      )}
      {extraFor && (
        <ExtraTimeDialog
          exam={exam}
          attempt={extraFor}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            notify('success', t('Extra time given', 'ተጨማሪ ጊዜ ተሰጥቷል'));
            reload();
          }}
        />
      )}
      {bigKey && exam.start_key && (
        <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center gap-6 p-6" onClick={() => setBigKey(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10" aria-label={t('Close', 'ዝጋ')}>
            <X size={24} />
          </button>
          <div className="text-xl text-slate-300">{t('Room key', 'የክፍሉ ቁልፍ')} · {exam.title}</div>
          <div className="font-mono font-bold tracking-[0.3em] text-[22vw] leading-none">{exam.start_key}</div>
          <div className="text-slate-400">{t('Type it after your code to start the exam', 'ፈተናውን ለመጀመር ከኮድዎ በኋላ ይጻፉት')}</div>
        </div>
      )}
      {confirm && (
        <Modal
          isOpen
          onClose={() => setConfirm(null)}
          title={
            confirm.kind === 'close'
              ? t('Close the exam?', 'ፈተናውን ይዝጉ?')
              : confirm.kind === 'grades'
                ? t('Send the results to grades?', 'ውጤቱን ወደ ውጤት መዝገብ ይላኩ?')
                : confirm.kind === 'newkey'
                  ? t('Make a new room key?', 'አዲስ የክፍል ቁልፍ ይሰራ?')
                  : confirm.kind === 'newcode'
                    ? t('Give this student a new code?', 'ለዚህ ተማሪ አዲስ ኮድ ይሰጥ?')
                    : confirm.kind === 'delete'
                  ? t('Delete this exam?', 'ይህን ፈተና ይሰርዙ?')
                  : t('Delete this question?', 'ይህን ጥያቄ ይሰርዙ?')
          }
          maxWidth="md"
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              {confirm.kind === 'close' &&
                t(
                  `Nobody can start any more. Students still writing (${attempts.filter((a) => attemptState(a) === 'IN_PROGRESS').length}) are handed in with the answers saved so far.`,
                  `ከዚህ በኋላ ማንም መጀመር አይችልም። አሁን እየተፈተኑ ያሉት (${attempts.filter((a) => attemptState(a) === 'IN_PROGRESS').length}) እስካሁን በተቀመጡ መልሶቻቸው ይገባሉ።`
                )}
              {confirm.kind === 'grades' &&
                part &&
                t(
                  `${handedIn.length} result(s) are written into each student's grade for this subject, term ${exam.term}, as "${partName}" out of ${part.weight}. Other parts of their grades are kept, and the grades go to approval. Students who did not sit the exam are left out.`,
                  `${handedIn.length} ውጤት(ዎች) በዚህ ትምህርት የ${exam.term}ኛ ሩብ ውጤት ላይ እንደ «${partName}» (ከ${part.weight}) ይገባሉ። ሌሎች ምዘናዎች አይነኩም፤ ውጤቶቹ ለማጽደቅ ይላካሉ። ያልተፈተኑ ተማሪዎች አይካተቱም።`
                )}
              {confirm.kind === 'delete' && t('The exam and its questions are deleted.', 'ፈተናውና ጥያቄዎቹ ይሰረዛሉ።')}
              {confirm.kind === 'newkey' &&
                t('The old key stops working for students who have not started. Students already writing are not affected.', 'የቀድሞው ቁልፍ ላልጀመሩ ተማሪዎች መስራት ያቆማል። እየተፈተኑ ያሉትን አይነካም።')}
              {confirm.kind === 'newcode' &&
                t(
                  'Use this when someone else got this student’s code. The old code stops working at once, anything written with it is deleted, and the student starts again with the new code.',
                  'የዚህ ተማሪ ኮድ በሌላ ሰው እጅ ሲገባ ይጠቀሙበት። የቀድሞው ኮድ ወዲያው መስራት ያቆማል፣ በእሱ የተጻፈው ይሰረዛል፣ ተማሪውም በአዲሱ ኮድ እንደገና ይጀምራል።'
                )}
              {confirm.kind === 'question' && <span className="whitespace-pre-wrap">{confirm.question.prompt}</span>}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setConfirm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm.kind === 'close') run(() => closeExam(exam.id), t('Exam closed', 'ፈተናው ተዘግቷል'));
                  if (confirm.kind === 'newkey') run(() => changeStartKey(exam.id), t('New room key made', 'አዲስ የክፍል ቁልፍ ተሰርቷል'));
                  if (confirm.kind === 'newcode') {
                    run(() => giveNewCode(confirm.attemptId), t('New code made — it is shown in the list', 'አዲስ ኮድ ተሰርቷል — በዝርዝሩ ውስጥ ይታያል'));
                  }
                  if (confirm.kind === 'grades') {
                    run(() => sendExamToGrades(exam.id), t('Results added to grades — they now wait for approval', 'ውጤቶቹ ገብተዋል — ማጽደቅ ይጠብቃሉ'));
                  }
                  if (confirm.kind === 'question') run(() => deleteQuestion(exam.id, confirm.question.id), t('Question deleted', 'ጥያቄው ተሰርዟል'));
                  if (confirm.kind === 'delete') {
                    setBusy(true);
                    deleteExam(exam.id).then((res) => {
                      setBusy(false);
                      if (!res.ok) {
                        setConfirm(null);
                        return notify('error', res.error);
                      }
                      router.push('/dashboard/education/exams');
                    });
                  }
                }}
                className="btn btn-primary text-xs disabled:opacity-60"
              >
                {busy ? t('Working…', 'በሂደት ላይ…') : t('Yes, go ahead', 'አዎ፣ ቀጥል')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BackLink() {
  const { t } = useLang();
  return (
    <Link href="/dashboard/education/exams" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
      <ArrowLeft size={14} /> {t('All online exams', 'ሁሉም የኦንላይን ፈተናዎች')}
    </Link>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="p-1.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30">
      {children}
    </button>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
    >
      {children} <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-semibold ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
