'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle2, Clock, Cloud, CloudOff, EyeOff, KeyRound, Languages, Loader2, Send, TimerReset } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { EXAM_TICKET_KEY as TICKET_KEY, formatTicket, normalizeTicket, type StudentQuestion } from '@/lib/exams/types';
import { examClock, openTicket, reportBack, reportLeft, saveAnswers, startExam, submitExam, type TicketInfo, type TicketResult } from './actions';

const LETTERS = 'ABCDEF';

type Exam = { questions: StudentQuestion[]; deadline: number };

export default function ExamPage() {
  const { t, locale, setLocale } = useLang();
  const [typed, setTyped] = useState('');
  const [ticket, setTicket] = useState('');
  const [info, setInfo] = useState<TicketInfo | null>(null);
  const [stage, setStage] = useState<'enter' | 'ready' | 'exam' | 'done'>('enter');
  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Extract<TicketResult, { state: 'SUBMITTED' }>['result'] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [extended, setExtended] = useState(false);
  const [key, setKey] = useState('');
  /** Times the student has left the exam page (shown to them as a reminder) */
  const [left, setLeft] = useState(0);
  const [notice, setNotice] = useState('');
  const answersRef = useRef<Record<string, string>>({});
  const awaySince = useRef<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offset = useRef(0);
  const deadlineAt = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handingIn = useRef(false);
  const checkingTime = useRef(false);

  const errorText = useCallback(
    (code: string) =>
      ({
        NOT_FOUND: t('This code was not found. Check it on your slip and type it again.', 'ይህ ኮድ አልተገኘም። በወረቀቱ ላይ ያለውን ኮድ አረጋግጠው እንደገና ይጻፉ።'),
        NOT_OPEN: t('This exam has not started yet. Wait for your teacher.', 'ይህ ፈተና ገና አልተጀመረም። መምህርዎን ይጠብቁ።'),
        CLOSED: t('This exam is closed.', 'ይህ ፈተና ተዘግቷል።'),
        UNAVAILABLE: t('Could not reach the school system. Check the internet and try again.', 'ከሲስተሙ ጋር መገናኘት አልተቻለም። ኢንተርኔትዎን አረጋግጠው እንደገና ይሞክሩ።'),
        OTHER_PHONE: t(
          'This exam was started on another phone. If your phone stopped working, ask your teacher to allow a new phone.',
          'ይህ ፈተና በሌላ ስልክ ተጀምሯል። ስልክዎ ከተበላሸ መምህርዎ አዲስ ስልክ እንዲፈቅዱልዎ ይጠይቁ።'
        ),
        PHONE_TAKEN: t(
          'This phone has already been used for another student in this exam. Each student sits the exam on their own phone — ask your teacher.',
          'ይህ ስልክ በዚህ ፈተና ለሌላ ተማሪ ተጠቅሟል። እያንዳንዱ ተማሪ በራሱ ስልክ ይፈተናል — መምህርዎን ይጠይቁ።'
        ),
        WRONG_KEY: t('That room key is not right. Type the key your teacher shows in class.', 'የክፍሉ ቁልፍ ትክክል አይደለም። መምህርዎ በክፍል የሚያሳዩትን ቁልፍ ይጻፉ።'),
      })[code] ?? code,
    [t]
  );

  /** Show whatever state the server says the ticket is in. */
  const show = useCallback(
    (res: TicketResult, code: string) => {
      if (!res.ok) {
        setError(errorText(res.error));
        if (res.error === 'NOT_FOUND' || res.error === 'OTHER_PHONE' || res.error === 'PHONE_TAKEN') {
          setStage('enter');
          setInfo(null);
          try {
            sessionStorage.removeItem(TICKET_KEY);
          } catch {}
        }
        return;
      }
      setError('');
      setTicket(code);
      setInfo(res.info);
      try {
        sessionStorage.setItem(TICKET_KEY, code);
      } catch {}
      if (res.state === 'READY') setStage('ready');
      if (res.state === 'IN_PROGRESS') {
        offset.current = new Date(res.now).getTime() - Date.now();
        deadlineAt.current = new Date(res.deadline).getTime();
        setExam({ questions: res.questions, deadline: deadlineAt.current });
        setAnswers(res.answers);
        answersRef.current = res.answers;
        setLeft(res.left);
        setStage('exam');
      }
      if (res.state === 'SUBMITTED') {
        setResult(res.result);
        setStage('done');
        try {
          sessionStorage.removeItem(TICKET_KEY);
        } catch {}
      }
    },
    [errorText]
  );

  // Coming back to the page (reload, phone locked) continues the same exam
  useEffect(() => {
    let saved = '';
    try {
      saved = sessionStorage.getItem(TICKET_KEY) ?? '';
    } catch {}
    if (saved) openTicket(saved).then((res) => show(res, saved));
  }, [show]);

  const lookUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeTicket(typed);
    if (code.length !== 8) return setError(t('The code has 8 letters and numbers, like ABCD-2345.', 'ኮዱ 8 ፊደሎችና ቁጥሮች አሉት፤ ለምሳሌ ABCD-2345።'));
    setBusy(true);
    show(await openTicket(code), code);
    setBusy(false);
  };

  const begin = async () => {
    setBusy(true);
    show(await startExam(ticket, key), ticket);
    setBusy(false);
  };

  const handIn = useCallback(
    async (final: Record<string, string>) => {
      if (handingIn.current) return;
      handingIn.current = true;
      setBusy(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const res = await submitExam(ticket, final);
      setBusy(false);
      setConfirming(false);
      handingIn.current = false;
      show(res, ticket);
    },
    [ticket, show]
  );

  /** Follow the server's deadline — the teacher may have given this student extra time. */
  const applyClock = useCallback((deadlineIso: string, nowIso: string) => {
    offset.current = new Date(nowIso).getTime() - Date.now();
    const next = new Date(deadlineIso).getTime();
    if (next === deadlineAt.current) return;
    if (next > deadlineAt.current + 30_000) {
      setExtended(true);
      setTimeout(() => setExtended(false), 10_000);
    }
    deadlineAt.current = next;
    setExam((e) => (e ? { ...e, deadline: next } : e));
  }, []);

  // Clock: the server's deadline, corrected for the phone's own time
  useEffect(() => {
    if (stage !== 'exam') return;
    const id = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(id);
  }, [stage]);

  // Every minute, ask the server for the time left (extra time, or the teacher closed the exam)
  useEffect(() => {
    if (stage !== 'exam') return;
    const id = setInterval(async () => {
      const clock = await examClock(ticket);
      if (clock?.state === 'IN_PROGRESS') applyClock(clock.deadline, clock.now);
      if (clock?.state === 'OVER') show(await openTicket(ticket), ticket);
    }, 60_000);
    return () => clearInterval(id);
  }, [stage, ticket, applyClock, show]);

  // At 0:00 check once more — extra time may have just been given — then hand in
  const remaining = exam ? Math.max(0, Math.floor((exam.deadline - now) / 1000)) : 0;
  useEffect(() => {
    if (stage !== 'exam' || !exam || remaining > 0 || checkingTime.current) return;
    checkingTime.current = true;
    examClock(ticket).then((clock) => {
      checkingTime.current = false;
      if (clock?.state === 'IN_PROGRESS' && new Date(clock.deadline) > new Date(clock.now)) applyClock(clock.deadline, clock.now);
      else handIn(answers);
    });
  }, [stage, exam, remaining, answers, handIn, ticket, applyClock]);

  const flash = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 12_000);
  }, []);

  // Leaving the exam page — another app or tab, a locked screen, or another
  // window for more than 3 s — is counted and timed for the teacher.
  useEffect(() => {
    if (stage !== 'exam') return;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const away = () => {
      if (awaySince.current !== null) return;
      awaySince.current = Date.now();
      reportLeft(ticket);
    };
    const back = async () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = null;
      if (awaySince.current === null) return;
      const seconds = (Date.now() - awaySince.current) / 1000;
      awaySince.current = null;
      const res = await reportBack(ticket, seconds, answersRef.current);
      if (!res) return;
      if (res.result) return show(res.result, ticket);
      setLeft(res.left);
      flash(
        res.limit
          ? t(
              `You left the exam page (${res.left} of ${res.limit}). At ${res.limit} your exam is handed in automatically.`,
              `ከፈተናው ገጽ ወጥተዋል (${res.limit} ውስጥ ${res.left})። ${res.limit} ሲደርስ ፈተናዎ በራሱ ይገባል።`
            )
          : t(`You left the exam page — this was recorded for your teacher (${res.left}×).`, `ከፈተናው ገጽ ወጥተዋል — ለመምህርዎ ተመዝግቧል (${res.left} ጊዜ)።`)
      );
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? away() : back());
    const onBlur = () => {
      blurTimer = setTimeout(away, 3000);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', back);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, [stage, ticket, show, flash, t]);

  /** No copying questions out, and no pasting answers in. */
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  const answer = (questionId: string, value: string) => {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    answersRef.current = next;
    setSaving('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await saveAnswers(ticket, next);
        if (res.closed) return show(await openTicket(ticket), ticket);
        if (res.deadline && res.now) applyClock(res.deadline, res.now);
        setSaving(res.ok ? 'saved' : 'offline');
      } catch {
        setSaving('offline');
      }
    }, 1200);
  };

  const answered = exam ? exam.questions.filter((q) => (answers[q.id] ?? '').trim()).length : 0;
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const name = info ? (locale === 'am' ? info.student_am : info.student) : '';
  const subject = info ? (locale === 'am' ? info.subject_am : info.subject) : '';
  const className = info ? (locale === 'am' ? info.class_name_am : info.class_name) : '';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{stage === 'exam' && info ? info.title : t('Online exam', 'የኦንላይን ፈተና')}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {stage === 'exam' ? `${name} · ${subject}` : t('Hamere Hiwot Sunday School', 'የሐመረ ሕይወት ሰንበት ትምህርት ቤት')}
            </div>
          </div>
          {stage === 'exam' ? (
            <div
              className={`flex items-center gap-1 font-mono text-sm font-bold px-2.5 py-1 rounded-lg ${remaining <= 60 ? 'bg-red-100 text-red-700' : remaining <= 300 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}`}
              aria-label={t('Time left', 'የቀረው ጊዜ')}
            >
              <Clock size={14} /> {clock}
            </div>
          ) : (
            <button onClick={() => setLocale(locale === 'am' ? 'en' : 'am')} className="text-xs text-slate-600 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100">
              <Languages size={14} /> {locale === 'am' ? 'English' : 'አማርኛ'}
            </button>
          )}
        </div>
        {stage === 'exam' && exam && (
          <div className="max-w-2xl mx-auto px-4 pb-2 flex items-center gap-3 text-[11px] text-slate-500">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-rose-800 transition-all" style={{ width: `${(answered / exam.questions.length) * 100}%` }} />
            </div>
            <span>{t(`${answered} of ${exam.questions.length} answered`, `${exam.questions.length} ውስጥ ${answered} ተመልሷል`)}</span>
            <span className="inline-flex items-center gap-1">
              {saving === 'offline' ? <CloudOff size={12} className="text-red-500" /> : <Cloud size={12} className={saving === 'saving' ? 'text-slate-300' : 'text-emerald-600'} />}
              {saving === 'saving' ? t('Saving…', 'በማስቀመጥ ላይ…') : saving === 'offline' ? t('Not saved', 'አልተቀመጠም') : t('Saved', 'ተቀምጧል')}
            </span>
            {left > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold" title={t('Times you left the exam page', 'ከፈተናው ገጽ የወጡበት ብዛት')}>
                <EyeOff size={12} /> {info?.leave_limit ? `${left}/${info.leave_limit}` : left}
              </span>
            )}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {notice && stage === 'exam' && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-900 flex items-start gap-2" role="alert">
            <EyeOff size={16} className="mt-0.5 shrink-0" /> {notice}
          </div>
        )}

        {extended && stage === 'exam' && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2" role="status">
            <TimerReset size={16} className="shrink-0" /> {t('Your teacher gave you more time.', 'መምህርዎ ተጨማሪ ጊዜ ሰጥተውዎታል።')}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2" role="alert">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {stage === 'enter' && (
          <form onSubmit={lookUp} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{t('Start your exam', 'ፈተናዎን ይጀምሩ')}</h1>
              <p className="text-sm text-slate-500 mt-1">{t('Type the code on the slip your teacher gave you.', 'መምህርዎ በሰጡዎት ወረቀት ላይ ያለውን ኮድ ይጻፉ።')}</p>
            </div>
            <input
              value={typed}
              onChange={(e) => setTyped(formatTicket(normalizeTicket(e.target.value).slice(0, 8)))}
              placeholder="ABCD-2345"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              className="form-input text-center font-mono text-2xl tracking-[0.3em] uppercase"
              aria-label={t('Exam code', 'የፈተና ኮድ')}
            />
            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : t('Continue', 'ቀጥል')}
            </button>
          </form>
        )}

        {stage === 'ready' && info && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div>
              <p className="text-xs text-slate-500">{t('Is this you?', 'እርስዎ ነዎት?')}</p>
              <h1 className="text-xl font-bold text-slate-900">{name}</h1>
              <p className="text-sm text-slate-500">{className}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label={t('Exam', 'ፈተና')} value={info.title} />
              <Info label={t('Subject', 'ትምህርት')} value={subject} />
              <Info label={t('Time', 'ጊዜ')} value={t(`${info.duration_minutes} minutes`, `${info.duration_minutes} ደቂቃ`)} />
              <Info label={t('Questions', 'ጥያቄዎች')} value={t(`${info.questions} (${info.total_marks} marks)`, `${info.questions} (${info.total_marks} ነጥብ)`)} />
            </dl>
            {info.instructions && <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">{info.instructions}</p>}
            <ul className="text-xs text-slate-500 list-disc pl-5 space-y-1">
              <li>{t('The clock starts when you press Start and does not stop.', '«ጀምር» ሲጫኑ ሰዓቱ ይጀምራል፤ አይቆምም።')}</li>
              <li>{t('Your answers are saved as you go. If the page closes, type your code again to continue.', 'መልሶችዎ እየተቀመጡ ይሄዳሉ። ገጹ ከተዘጋ ኮድዎን እንደገና በመጻፍ ይቀጥሉ።')}</li>
              <li>{t('When the time is up, the exam is handed in by itself.', 'ጊዜው ሲያልቅ ፈተናው በራሱ ይገባል።')}</li>
              <li>{t('Once you start, this exam works only on this phone.', 'ከጀመሩ በኋላ ፈተናው የሚሰራው በዚህ ስልክ ብቻ ነው።')}</li>
              <li>
                {info.leave_limit
                  ? t(`If you leave this page ${info.leave_limit} times, your exam is handed in automatically.`, `ከዚህ ገጽ ${info.leave_limit} ጊዜ ከወጡ ፈተናዎ በራሱ ይገባል።`)
                  : t('Leaving this page is recorded for your teacher, with how long you were away.', 'ከዚህ ገጽ መውጣትና የቆዩበት ጊዜ ለመምህርዎ ይመዘገባል።')}
              </li>
              <li>{t('Copying and pasting are switched off.', 'መቅዳትና መለጠፍ አይቻልም።')}</li>
            </ul>
            {info.needs_key && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 mb-1">
                  <KeyRound size={13} /> {t('Room key — your teacher shows it in class', 'የክፍሉ ቁልፍ — መምህርዎ በክፍል ያሳያሉ')}
                </span>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0000"
                  className="form-input text-center font-mono text-2xl tracking-[0.5em]"
                />
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setStage('enter'); setInfo(null); }} className="btn btn-secondary flex-1 justify-center">
                {t('Not me', 'እኔ አይደለሁም')}
              </button>
              <button onClick={begin} disabled={busy || (info.needs_key && key.length !== 4)} className="btn btn-primary flex-1 justify-center disabled:opacity-60">
                {busy ? <Loader2 size={16} className="animate-spin" /> : t('Start', 'ጀምር')}
              </button>
            </div>
          </div>
        )}

        {stage === 'exam' && exam && (
          <div onCopy={block} onCut={block} onContextMenu={block} onDragStart={block} className="space-y-4 select-none">
            {exam.questions.map((q, n) => (
              <section key={q.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-rose-50 text-rose-900 text-xs font-bold flex items-center justify-center">{n + 1}</span>
                  <p className="flex-1 text-[15px] text-slate-900 whitespace-pre-wrap">{q.prompt}</p>
                  <span className="text-[11px] text-slate-400 shrink-0">{t(`${q.marks} mk`, `${q.marks} ነጥብ`)}</span>
                </div>
                {q.kind === 'CHOICE' && (
                  <div className="space-y-2">
                    {q.options.map((o, k) => (
                      <label
                        key={o.i}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${answers[q.id] === String(o.i) ? 'border-rose-800 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <input type="radio" name={q.id} checked={answers[q.id] === String(o.i)} onChange={() => answer(q.id, String(o.i))} className="mt-1" />
                        <span className="text-xs font-bold text-slate-400 mt-0.5">{LETTERS[k]}</span>
                        <span className="text-sm text-slate-800 whitespace-pre-wrap">{o.text}</span>
                      </label>
                    ))}
                  </div>
                )}
                {q.kind === 'TRUE_FALSE' && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['true', t('True', 'እውነት')],
                      ['false', t('False', 'ሐሰት')],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => answer(q.id, value)}
                        className={`p-3 rounded-xl border text-sm font-semibold ${answers[q.id] === value ? 'border-rose-800 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {q.kind === 'SHORT' && (
                  <textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => answer(q.id, e.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder={t('Write your answer', 'መልስዎን ይጻፉ')}
                    onPaste={(e) => {
                      e.preventDefault();
                      flash(t('Pasting is switched off in the exam — type your answer.', 'በፈተና መለጠፍ አይቻልም — መልስዎን ይጻፉ።'));
                    }}
                    className="form-input text-sm select-text"
                  />
                )}
              </section>
            ))}

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              {confirming ? (
                <>
                  <p className="text-sm text-slate-800">
                    {answered < exam.questions.length
                      ? t(
                          `You have not answered ${exam.questions.length - answered} question(s). Hand in anyway? You cannot change your answers afterwards.`,
                          `${exam.questions.length - answered} ጥያቄ(ዎች) አልመለሱም። ቢሆንም ያስገቡ? ከዚያ በኋላ መልሶችን መቀየር አይቻልም።`
                        )
                      : t('Hand in now? You cannot change your answers afterwards.', 'አሁን ያስገቡ? ከዚያ በኋላ መልሶችን መቀየር አይቻልም።')}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirming(false)} className="btn btn-secondary flex-1 justify-center">{t('Keep working', 'ልቀጥል')}</button>
                    <button onClick={() => handIn(answers)} disabled={busy} className="btn btn-primary flex-1 justify-center disabled:opacity-60">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : t('Hand in', 'አስገባ')}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setConfirming(true)} className="btn btn-primary w-full justify-center inline-flex items-center gap-2">
                  <Send size={16} /> {t('Hand in the exam', 'ፈተናውን አስገባ')}
                </button>
              )}
            </div>
          </div>
        )}

        {stage === 'done' && info && result && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
            <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
            <h1 className="text-lg font-bold text-slate-900">{t('Your exam has been handed in', 'ፈተናዎ ገብቷል')}</h1>
            <p className="text-sm text-slate-500">{name} · {info.title}</p>
            {result.ended_reason === 'LEFT_PAGE' && (
              <p className="text-sm text-amber-800">{t('It was handed in automatically because you left the exam page too many times.', 'ከፈተናው ገጽ ብዙ ጊዜ ስለወጡ በራሱ ገብቷል።')}</p>
            )}
            {result.ended_reason === 'TIME' && <p className="text-sm text-slate-600">{t('The time was up.', 'ጊዜው አልቋል።')}</p>}
            {result.ended_reason === 'CLOSED' && <p className="text-sm text-slate-600">{t('Your teacher closed the exam.', 'መምህርዎ ፈተናውን ዘግተዋል።')}</p>}
            {result.score !== null && (
              <p className="text-3xl font-bold text-slate-900">
                {result.score} <span className="text-base font-medium text-slate-400">/ {result.total}</span>
              </p>
            )}
            {result.pending && (
              <p className="text-xs text-slate-500">{t('Your teacher still has to mark the written answers.', 'የጽሑፍ መልሶችዎን መምህርዎ ገና ያርማሉ።')}</p>
            )}
            <button
              onClick={() => {
                setStage('enter');
                setTyped('');
                setInfo(null);
                setResult(null);
              }}
              className="btn btn-secondary"
            >
              {t('Done', 'ጨርሻለሁ')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
