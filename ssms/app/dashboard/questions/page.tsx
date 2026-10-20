'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageCircleQuestion, Send, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { answerQuestion, closeQuestion, loadQuestions, type MemberQuestion, type QuestionsData } from './actions';

type Filter = 'OPEN' | 'ANSWERED' | 'CLOSED' | 'ALL';

/** Questions members sent from the Telegram bot to a department, and their answers. */
export default function QuestionsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<QuestionsData | null>(null);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [unit, setUnit] = useState('ALL');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadQuestions>>) => {
    if (res.mode === 'live') setData(res.data);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadQuestions().then(apply);
  }, [apply]);
  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };
  const unitName = (id: string) => {
    const u = data?.units.find((x) => x.id === id);
    return u ? (locale === 'am' ? u.name_am : u.name_en) : '';
  };
  const shown = (data?.questions ?? []).filter((q) => (filter === 'ALL' || q.status === filter) && (unit === 'ALL' || q.unit_id === unit));
  /** The questions shown (filters applied) — Excel / CSV */
  const exportQuestions = (format: ExportFormat) =>
    exportTable(
      `questions_${todayIso()}`,
      [t('Date', 'ቀን'), t('Department', 'ክፍል'), t('Asked by', 'ጠያቂ'), t('Question', 'ጥያቄ'), t('Status', 'ሁኔታ'), t('Answer', 'መልስ'), t('Answered by', 'የመለሰው'), t('Answered on', 'የተመለሰበት')],
      shown.map((q) => [
        formatEthiopianDate(q.created_at.slice(0, 10), locale),
        unitName(q.unit_id),
        q.asker,
        q.question,
        { OPEN: t('Waiting', 'መልስ የሚጠብቅ'), ANSWERED: t('Answered', 'ተመልሷል'), CLOSED: t('Closed', 'ተዘግቷል') }[q.status],
        q.answer,
        q.answered_by,
        q.answered_at ? formatEthiopianDate(q.answered_at.slice(0, 10), locale) : '',
      ]),
      format,
      { sheet: 'Questions', widths: [14, 24, 28, 50, 12, 50, 22, 14] }
    );
  const count = (f: Filter) => (data?.questions ?? []).filter((q) => (f === 'ALL' || q.status === f) && (unit === 'ALL' || q.unit_id === unit)).length;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2">
          <MessageCircleQuestion size={22} /> {t('Members’ questions', 'የአባላት ጥያቄዎች')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Sent from the Telegram bot (“✉️ Ask a department”). Your answer goes straight back to the person in the bot.', 'ከቴሌግራም ቦቱ («✉️ ጥያቄ») የተላኩ። መልስዎ በቀጥታ በቦቱ ለጠያቂው ይደርሳል።')}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {data && (
        <div className="flex flex-wrap items-center gap-2">
          {(['OPEN', 'ANSWERED', 'CLOSED', 'ALL'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {{ OPEN: t('Waiting', 'መልስ የሚጠብቁ'), ANSWERED: t('Answered', 'የተመለሱ'), CLOSED: t('Closed', 'የተዘጉ'), ALL: t('All', 'ሁሉም') }[f]} · {count(f)}
            </button>
          ))}
          <ExportButton onExport={exportQuestions} disabled={shown.length === 0} className="ml-auto" />
          {data.units.length > 1 && (
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs w-auto">
              <option value="ALL">{t('All departments', 'ሁሉም ክፍላት')}</option>
              {data.units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
            </select>
          )}
        </div>
      )}

      {data && shown.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">{t('No questions here.', 'እዚህ ጥያቄ የለም።')}</p>}

      <div className="space-y-3">
        {shown.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            unit={unitName(q.unit_id)}
            canAnswer={Boolean(data?.answerable.includes(q.unit_id))}
            onDone={(text, kind = 'success') => {
              notify(kind, text);
              if (kind === 'success') loadQuestions().then(apply);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({ q, unit, canAnswer, onDone }: { q: MemberQuestion; unit: string; canAnswer: boolean; onDone: (text: string, kind?: 'success' | 'error') => void }) {
  const { t, locale } = useLang();
  const [answer, setAnswer] = useState(q.answer);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const res = await answerQuestion(q.id, answer);
    setBusy(false);
    if (!res.ok) return onDone(res.error, 'error');
    setOpen(false);
    onDone(res.delivered ? t('Answered — sent to them in the bot', 'ተመልሷል — በቦቱ ደርሷቸዋል') : t('Answer saved, but the bot could not deliver it (they may have stopped the bot)', 'መልሱ ተቀምጧል፤ ቦቱ ግን ማድረስ አልቻለም (ቦቱን አቁመው ሊሆን ይችላል)'));
  };
  const close = async () => {
    if (!window.confirm(t('Close this question without an answer?', 'ይህን ጥያቄ ያለ መልስ ልዝጋው?'))) return;
    setBusy(true);
    const res = await closeQuestion(q.id);
    setBusy(false);
    if (!res.ok) return onDone(res.error, 'error');
    onDone(t('Closed', 'ተዘግቷል'));
  };

  return (
    <div className="card p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          <b className="text-slate-800">{q.asker || '—'}</b> → {unit} · {formatEthiopianDate(q.created_at.slice(0, 10), locale)}
        </span>
        {q.status === 'ANSWERED' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> {t('Answered', 'ተመልሷል')}</span>}
        {q.status === 'CLOSED' && <span className="inline-flex items-center gap-1 text-slate-400"><XCircle size={13} /> {t('Closed', 'ተዘግቷል')}</span>}
      </div>
      <p className="text-sm text-slate-900 whitespace-pre-wrap">❓ {q.question}</p>
      {q.status === 'ANSWERED' && !open && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-emerald-50/60 border border-emerald-100 rounded-lg p-2.5">
          💬 {q.answer} <span className="block text-[11px] text-slate-500 mt-1">— {q.answered_by}{q.answered_at ? ` · ${formatEthiopianDate(q.answered_at.slice(0, 10), locale)}` : ''}</span>
        </p>
      )}
      {canAnswer && q.status !== 'CLOSED' && (
        open || q.status === 'OPEN' ? (
          <div className="space-y-2">
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} maxLength={3000} placeholder={t('Write the answer…', 'መልሱን ይጻፉ…')} className="form-input text-sm" />
            <div className="flex justify-end gap-2">
              {q.status === 'OPEN' && (
                <button disabled={busy} onClick={close} className="btn btn-secondary text-xs text-slate-600">{t('Close without answer', 'ያለ መልስ ዝጋ')}</button>
              )}
              <button disabled={busy || answer.trim().length < 2} onClick={send} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                <Send size={14} /> {t('Send answer', 'መልስ ላክ')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">{t('Change the answer', 'መልሱን ቀይር')}</button>
        )
      )}
    </div>
  );
}
