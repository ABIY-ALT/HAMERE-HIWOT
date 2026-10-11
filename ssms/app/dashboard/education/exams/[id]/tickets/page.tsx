'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer, Scissors } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatTicket } from '@/lib/exams/types';
import { useExamAddress } from '@/lib/exams/useExamAddress';
import { loadExam, type ExamDetail } from '../../actions';

/** Ticket slips to print and cut out: one per student, with the code they type on /exam. */
export default function ExamTicketsPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const address = useExamAddress();

  useEffect(() => {
    loadExam(id).then((res) => {
      if (res.mode === 'live') setDetail(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, [id]);

  const exam = detail?.exam;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/education/exams/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> {t('Back to the exam', 'ወደ ፈተናው ተመለስ')}
        </Link>
        <button onClick={() => window.print()} disabled={!detail} className="btn btn-primary text-xs inline-flex items-center gap-2 disabled:opacity-50">
          <Printer size={14} /> {t('Print', 'አትም')}
        </button>
      </div>
      <div className="no-print">
        <AdminModeNotice mode={mode} error={error} />
        {detail && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Scissors size={12} /> {t('Cut along the dashed lines and give each student their own slip.', 'በነጥብ መስመሮቹ ቆርጠው ለእያንዳንዱ ተማሪ የራሱን ወረቀት ይስጡ።')}
          </p>
        )}
      </div>

      {exam && detail && (
        <div className="print-sheet grid grid-cols-2 gap-0">
          {detail.attempts.map((a) => (
            <div key={a.id} className="border border-dashed border-slate-400 p-4 space-y-2 break-inside-avoid">
              <div className="text-[11px] text-slate-500">{t('Hamere Hiwot Sunday School · Online exam', 'የሐመረ ሕይወት ሰንበት ት/ቤት · የኦንላይን ፈተና')}</div>
              <div className="font-bold text-slate-900">{locale === 'am' ? a.student_am : a.student}</div>
              <div className="text-xs text-slate-600">
                {exam.title} · {locale === 'am' ? exam.subject_name_am : exam.subject_name} · {locale === 'am' ? exam.class_name_am : exam.class_name}
              </div>
              <div className="text-xs text-slate-600">
                {t('1. Open', '1. ይክፈቱ፦')} <span className="font-mono font-semibold text-slate-900">{address}</span>
              </div>
              <div className="text-xs text-slate-600">{t('2. Type your code:', '2. ኮድዎን ይጻፉ፦')}</div>
              <div className="font-mono text-2xl font-bold tracking-[0.25em] text-center py-1 border border-slate-300 rounded">{formatTicket(a.ticket)}</div>
              <div className="text-[10px] text-slate-400">{t('Keep this code to yourself — it is your exam.', 'ይህን ኮድ ለማንም አያሳዩ — የእርስዎ ፈተና ነው።')}</div>
            </div>
          ))}
          {detail.attempts.length === 0 && (
            <p className="col-span-2 text-sm text-slate-500">{t('Open the exam first — tickets are made when it opens.', 'መጀመሪያ ፈተናውን ይክፈቱ — ኮዶቹ የሚሰሩት ሲከፈት ነው።')}</p>
          )}
        </div>
      )}
    </div>
  );
}
