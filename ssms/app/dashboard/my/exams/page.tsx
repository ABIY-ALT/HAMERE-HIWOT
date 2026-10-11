'use client';

import React from 'react';
import { KeyRound } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { PortalNotice, StartExamButton, useMyPortal } from '@/components/student/portal';
import type { MyExam } from '../actions';

/** The student's online exams: open ones to start, finished ones with the score (when the teacher shows it). */
export default function MyExamsPage() {
  const { t, locale } = useLang();
  const { mode, data, error } = useMyPortal();

  if (!data) return <PortalNotice mode={mode} error={error} />;
  const open = data.exams.filter((e) => e.ticket);
  const done = data.exams.filter((e) => !e.ticket);

  const result = (e: MyExam) => {
    if (!e.submitted) return <span className="text-slate-400">{t('Not sat', 'አልተፈተኑም')}</span>;
    if (e.score !== null) return <span className="font-mono font-semibold text-slate-900">{e.score} / {e.total_marks}</span>;
    if (e.needs_marking) return <span className="text-amber-700">{t('Waiting for marking', 'እየታረመ ነው')}</span>;
    return <span className="text-slate-500">{t('Handed in', 'ገብቷል')}</span>;
  };
  const ended = (e: MyExam) =>
    e.ended_reason === 'LEFT_PAGE'
      ? t('handed in automatically — left the page too often', 'ገጹን ብዙ ጊዜ በመልቀቅዎ በራሱ ገብቷል')
      : e.ended_reason === 'TIME'
        ? t('time was up', 'ጊዜው አልቋል')
        : e.ended_reason === 'CLOSED'
          ? t('closed by the teacher', 'መምህሩ ዘግተዋል')
          : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My exams', 'የእኔ ፈተናዎች')}</h1>
        <p className="text-sm text-slate-500 mt-1 inline-flex items-center gap-1.5">
          <KeyRound size={14} />
          {t('To start, you still need the room key your teacher shows in class.', 'ለመጀመር መምህርዎ በክፍል የሚያሳዩት ቁልፍ አሁንም ያስፈልጋል።')}
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-sm text-slate-800">{t('Open now', 'አሁን ክፍት')}</div>
        {open.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t('No exam is open for you right now.', 'አሁን ለእርስዎ ክፍት የሆነ ፈተና የለም።')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((e) => (
              <li key={e.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{e.title}</div>
                  <div className="text-xs text-slate-500">
                    {locale === 'am' ? e.subject_am : e.subject} · {t(`Term ${e.term}`, `${e.term}ኛ ሩብ`)} · {t(`${e.duration_minutes} min`, `${e.duration_minutes} ደቂቃ`)} ·{' '}
                    {t(`${e.questions} questions (${e.total_marks} marks)`, `${e.questions} ጥያቄ (${e.total_marks} ነጥብ)`)}
                  </div>
                  {e.started && <div className="text-xs text-blue-700 mt-0.5">{t('You have started — continue before the time runs out.', 'ጀምረዋል — ጊዜው ከማለቁ በፊት ይቀጥሉ።')}</div>}
                </div>
                <StartExamButton exam={e} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-bold text-sm text-slate-800">{t('Finished', 'የተጠናቀቁ')}</div>
        {done.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t('No finished exams yet.', 'እስካሁን የተጠናቀቀ ፈተና የለም።')}</p>
        ) : (
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Exam', 'ፈተና')}</th>
                  <th>{t('Term', 'ሩብ')}</th>
                  <th>{t('Result', 'ውጤት')}</th>
                </tr>
              </thead>
              <tbody>
                {done.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium text-slate-900">{e.title}</div>
                      <div className="text-[11px] text-slate-400">{locale === 'am' ? e.subject_am : e.subject}</div>
                    </td>
                    <td className="text-xs text-slate-600">{e.term}</td>
                    <td className="text-xs">
                      {result(e)}
                      {ended(e) && <div className="text-[11px] text-slate-400">{ended(e)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
