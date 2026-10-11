'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FilePlus2, Info, MonitorSmartphone } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { ExamSettingsDialog } from '@/components/education/ExamDialogs';
import type { LoadMode } from '@/lib/admin/types';
import { EXAM_STATUS_BADGE, type ExamStatus } from '@/lib/exams/types';
import { useExamAddress } from '@/lib/exams/useExamAddress';
import { loadExams, type ExamSummary } from './actions';

export default function ExamsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const address = useExamAddress();

  const apply = useCallback((res: Awaited<ReturnType<typeof loadExams>>) => {
    if (res.mode === 'live') setExams(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadExams().then(apply);
  }, [apply]);

  const statusLabel = (s: ExamStatus) =>
    s === 'DRAFT' ? t('Draft', 'ረቂቅ') : s === 'OPEN' ? t('Open', 'ክፍት') : t('Closed', 'ተዘግቷል');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Online Exams', 'የኦንላይን ፈተናዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Students sit the exam on a phone with the ticket you give them; choices are marked automatically', 'ተማሪዎች በሚሰጧቸው ኮድ በስልክ ይፈተናሉ፤ ምርጫዎች በራሳቸው ይታረማሉ')}
          </p>
        </div>
        {can('GRADE_CREATE') && (
          <button onClick={() => setCreating(true)} disabled={mode !== 'live'} className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50">
            <FilePlus2 size={16} /> {t('New exam', 'አዲስ ፈተና')}
          </button>
        )}
      </div>

      <AdminModeNotice mode={mode} error={error} />
      {mode === 'demo' && (
        <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
          {t('Online exams need the database — they are not available in demo mode.', 'የኦንላይን ፈተናዎች ዳታቤዝ ያስፈልጋቸዋል — በሙከራ ሁኔታ አይሰሩም።')}
        </p>
      )}

      <div className="card p-4 flex items-start gap-3 text-sm text-slate-600">
        <MonitorSmartphone size={20} className="text-rose-800 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">{t('How it works', 'እንዴት ይሰራል')}</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-xs">
            <li>{t('Create the exam and write the questions.', 'ፈተናውን ይፍጠሩና ጥያቄዎቹን ይጻፉ።')}</li>
            <li>{t('Open it: every student of the class gets a ticket code. Print the tickets and hand them out.', 'ይክፈቱት፦ እያንዳንዱ የክፍሉ ተማሪ ኮድ ያገኛል። ኮዶቹን አትመው ያከፋፍሉ።')}</li>
            <li>
              {t('Students open ', 'ተማሪዎች ')}
              <span className="font-mono font-semibold text-slate-800">{address}</span>
              {t(' on a phone and type their code.', ' በስልካቸው ከፍተው ኮዳቸውን ይጻፋሉ።')}
            </li>
            <li>{t('Close the exam, mark any short answers, then send the results to grades.', 'ፈተናውን ይዝጉ፣ አጭር መልሶችን ያርሙ፣ ከዚያ ውጤቱን ወደ ውጤት መዝገብ ይላኩ።')}</li>
          </ol>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Exam', 'ፈተና')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Term', 'ሩብ')}</th>
                <th>{t('Questions', 'ጥያቄዎች')}</th>
                <th>{t('Handed in', 'ያስገቡ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id} onClick={() => router.push(`/dashboard/education/exams/${e.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td>
                    <Link href={`/dashboard/education/exams/${e.id}`} className="font-semibold text-slate-900 hover:text-blue-700">{e.title}</Link>
                    <div className="text-[11px] text-slate-400">{locale === 'am' ? e.subject_name_am : e.subject_name}</div>
                  </td>
                  <td className="text-xs text-slate-600">{locale === 'am' ? e.class_name_am : e.class_name}</td>
                  <td className="text-xs text-slate-600">{e.term}</td>
                  <td className="text-xs text-slate-600">
                    {e.questions} · {t(`${e.total_marks} marks`, `${e.total_marks} ነጥብ`)}
                  </td>
                  <td className="text-xs text-slate-600">
                    {e.tickets ? `${e.submitted} / ${e.tickets}` : '—'}
                    {e.needs_marking > 0 && <div className="text-amber-700">{t(`${e.needs_marking} to mark`, `${e.needs_marking} የሚታረሙ`)}</div>}
                  </td>
                  <td>
                    <span className={EXAM_STATUS_BADGE[e.status]}>{statusLabel(e.status)}</span>
                    {e.sent_to_grades_at && <div className="text-[11px] text-emerald-700 mt-0.5">{t('In grades', 'ውጤት ገብቷል')}</div>}
                  </td>
                </tr>
              ))}
              {mode === 'live' && exams.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-8">
                    <Info size={16} className="inline mr-1" />
                    {t('No online exams yet.', 'እስካሁን የኦንላይን ፈተና የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <ExamSettingsDialog onClose={() => setCreating(false)} onSaved={(id) => router.push(`/dashboard/education/exams/${id}`)} />
      )}
    </div>
  );
}
