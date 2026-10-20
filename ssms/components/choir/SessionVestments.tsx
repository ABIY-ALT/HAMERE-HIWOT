'use client';

// Vestments for one service: give each person on the roster a vestment (with
// the day it comes back), and receive them back afterwards with their condition.

import React, { useState } from 'react';
import { AlertCircle, Shirt, UserPlus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import type { ChoirMember, ChoirSession } from '@/lib/choir/types';
import {
  CONDITION_LABEL,
  RESPONSE_LABEL,
  dayAfter,
  isOverdue,
  vestmentLabel,
  type Roster,
  type Vestment,
  type VestmentCondition,
  type VestmentLoan,
} from '@/lib/choir/service';
import { issueVestments, returnVestment } from '@/app/dashboard/sacred-arts/service/actions';

type Notify = (text: string, kind?: 'success' | 'error') => void;

/** "Received back" with the condition it came back in. */
export function ReturnControl({ loan, onDone }: { loan: VestmentLoan; onDone: Notify }) {
  const { t } = useLang();
  const [condition, setCondition] = useState<VestmentCondition | 'LOST'>('GOOD');
  const [busy, setBusy] = useState(false);
  const receive = async () => {
    if (condition === 'LOST' && !window.confirm(t('Mark this vestment as lost?', 'ይህ የክብር ልብስ እንደጠፋ ይመዝገብ?'))) return;
    setBusy(true);
    const res = await returnVestment(loan.id, condition, '');
    setBusy(false);
    if (!res.ok) return onDone(res.error, 'error');
    onDone(t('Received back', 'ተመልሷል'));
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="form-input text-xs py-1 w-auto" aria-label={t('Condition', 'ሁኔታ')}>
        {(Object.keys(CONDITION_LABEL) as (VestmentCondition | 'LOST')[]).map((c) => <option key={c} value={c}>{t(...CONDITION_LABEL[c])}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={receive} className="btn btn-secondary text-xs py-1 disabled:opacity-50">
        {t('Received back', 'ተመልሷል')}
      </button>
    </span>
  );
}

export function SessionVestments({
  session,
  roster,
  members,
  vestments,
  loans,
  onClose,
  onDone,
}: {
  session: ChoirSession;
  roster: Roster | undefined;
  members: ChoirMember[];
  vestments: Vestment[];
  loans: VestmentLoan[];
  onClose: () => void;
  onDone: Notify;
}) {
  const { t, locale } = useLang();
  const today = todayIso();
  const [due, setDue] = useState(dayAfter(session.date) < today ? today : dayAfter(session.date));
  const [extra, setExtra] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (m: ChoirMember) => (locale === 'am' ? m.name_am : m.name);

  const assigned = (roster?.assignments ?? []).filter((a) => byId.has(a.member_id));
  const rows = [
    ...assigned.map((a) => ({ member: byId.get(a.member_id)!, assignment: a })),
    ...extra.filter((id) => !assigned.some((a) => a.member_id === id)).map((id) => ({ member: byId.get(id)!, assignment: null })),
  ].filter((r) => r.member);
  const openLoans = loans.filter((l) => !l.returned_at);
  const available = vestments.filter((v) => v.status === 'AVAILABLE');

  /** Their last vestment, if it is in the store now — the same one again */
  const usual = (personId: string) => {
    const last = loans.filter((l) => l.person_id === personId).sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
    return last && available.some((v) => v.id === last.vestment_id) ? last.vestment_id : '';
  };
  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const used = new Set<string>();
    for (const r of rows) {
      if (openLoans.some((l) => l.person_id === r.member.person_id && l.session_id === session.id)) continue;
      if (r.assignment?.response === 'DECLINED') continue;
      const v = usual(r.member.person_id);
      if (v && !used.has(v)) {
        out[r.member.person_id] = v;
        used.add(v);
      }
    }
    return out;
  });
  const chosen = Object.entries(choice).filter(([, v]) => v);
  const takenBy = new Map(chosen.map(([p, v]) => [v, p]));

  const give = async () => {
    setBusy(true);
    setError('');
    const res = await issueVestments(chosen.map(([person_id, vestment_id]) => ({ person_id, vestment_id, session_id: session.id, due_on: due })));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setChoice({});
    onDone(t(`${res.issued} vestment(s) given out — each person was told in the bot`, `${res.issued} የክብር ልብስ ተሰጥቷል — ለእያንዳንዳቸው በቦቱ ተነግሯቸዋል`));
  };

  const others = members.filter((m) => m.status === 'ACTIVE' && !rows.some((r) => r.member.id === m.id));
  const outHere = openLoans.filter((l) => l.session_id === session.id).length;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${t('Vestments', 'የክብር ልብስ')} — ${session.title || t('Service', 'አገልግሎት')}`}
      subtitle={`${formatEthiopianDate(session.date, locale, { weekday: true })} · ${t('out now', 'አሁን የወጡ')}: ${outHere}`}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-700">
            {t('Bring back by', 'የሚመለስበት ቀን')}
            <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className="form-input text-xs py-1 w-auto" />
          </label>
          <span className="text-[11px] text-slate-400">{formatEthiopianDate(due, locale, { weekday: true })}</span>
          <span className="ml-auto text-xs text-slate-500">{t('In the store', 'መጋዘን ውስጥ')}: <b>{available.length}</b></span>
        </div>

        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
            {t('Nobody is on the roster yet. Make the roster first, or add someone below.', 'ገና ማንም አልተመደበም። መጀመሪያ ምደባውን ያውጡ፣ ወይም ከታች ሰው ይጨምሩ።')}
          </p>
        )}

        <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
          {rows.map(({ member, assignment }) => {
            const mine = openLoans.filter((l) => l.person_id === member.person_id);
            const here = mine.find((l) => l.session_id === session.id);
            const elsewhere = mine.filter((l) => l !== here);
            const declined = assignment?.response === 'DECLINED';
            return (
              <li key={member.id} className={`px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 ${declined ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{name(member)}</div>
                  <div className="text-[11px] text-slate-500">
                    {assignment ? `${assignment.role ? `${assignment.role} · ` : ''}${t(...RESPONSE_LABEL[assignment.response])}` : t('Not on the roster', 'ያልተመደበ')}
                    {elsewhere.map((l) => (
                      <span key={l.id} className={`ml-2 ${isOverdue(l, today) ? 'text-red-600 font-semibold' : 'text-amber-700'}`}>
                        · {t('also holds', 'በእጁ ያለ')} {l.vestment}
                      </span>
                    ))}
                  </div>
                </div>
                {here ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-100 rounded px-2 py-1 inline-flex items-center gap-1">
                      <Shirt size={12} /> {here.vestment}
                    </span>
                    <ReturnControl loan={here} onDone={onDone} />
                  </div>
                ) : (
                  <select
                    value={choice[member.person_id] ?? ''}
                    onChange={(e) => setChoice((c) => ({ ...c, [member.person_id]: e.target.value }))}
                    className="form-input text-xs py-1 sm:w-56"
                  >
                    <option value="">{t('— no vestment —', '— የክብር ልብስ የለም —')}</option>
                    {available
                      .filter((v) => !takenBy.has(v.id) || takenBy.get(v.id) === member.person_id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {vestmentLabel(v)}
                          {v.condition !== 'GOOD' ? ` (${t(...CONDITION_LABEL[v.condition])})` : ''}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>

        {others.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <UserPlus size={14} />
            <select value="" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])} className="form-input text-xs py-1 w-auto">
              <option value="">{t('Give to someone not on the roster…', 'ላልተመደበ ሰው ስጥ…')}</option>
              {others.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
            </select>
          </label>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
          <button type="button" disabled={busy || chosen.length === 0} onClick={give} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Shirt size={14} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t(`Give out (${chosen.length})`, `ስጥ (${chosen.length})`)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
