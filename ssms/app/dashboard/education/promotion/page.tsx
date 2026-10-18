'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, CheckCircle2, Copy, GraduationCap } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { PASS_MARK } from '@/lib/education/types';
import { defaultTargets, suggestedClass, type ClassTargets } from '@/lib/education/promotion';
import { setCurrentAcademicYear } from '@/app/dashboard/education/actions';
import { applyPromotion, copyClasses, loadPromotion, type PromotionData } from './actions';

/** Year-end promotion: next year's classes for every student, in one step. */
export default function PromotionPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<PromotionData | null>(null);
  /** Per class: where its students go (changes the suggestion for the whole class) */
  const [targets, setTargets] = useState<Map<string, ClassTargets>>(new Map());
  /** Per student: a class chosen by hand ('' = leaves) */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadPromotion>>) => {
    if (res.mode === 'live') {
      setData(res.data);
      setTargets(defaultTargets(res.data.from_classes, res.data.to_classes));
      setChosen({});
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadPromotion().then(apply);
  }, [apply]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const yearName = (id: string | null) => data?.years.find((y) => y.id === id)?.name ?? '';
  const toName = (id: string) => {
    const c = data?.to_classes.find((x) => x.id === id);
    return c ? (locale === 'am' ? c.name_am : c.name_en) : t('Leaves / graduates', 'ይወጣል / ተመርቋል');
  };
  const decisionOf = useCallback(
    (s: PromotionData['students'][number]) => chosen[s.student_id] ?? suggestedClass(s, targets, PASS_MARK),
    [chosen, targets]
  );

  const summary = useMemo(() => {
    const out = { up: 0, same: 0, leave: 0, already: 0 };
    if (!data) return out;
    const level = new Map([...data.from_classes, ...data.to_classes].map((c) => [c.id, c.grade_level]));
    for (const s of data.students) {
      if (s.next_class_id) out.already += 1;
      else {
        const target = decisionOf(s);
        if (!target) out.leave += 1;
        else if ((level.get(target) ?? 0) > (level.get(s.class_id) ?? 0)) out.up += 1;
        else out.same += 1;
      }
    }
    return out;
  }, [data, decisionOf]);

  const enroll = async () => {
    if (!data?.to_year_id) return;
    const decisions = data.students
      .filter((s) => !s.next_class_id)
      .map((s) => ({ student_id: s.student_id, class_id: decisionOf(s) }))
      .filter((d) => d.class_id);
    setBusy(true);
    const res = await applyPromotion(data.to_year_id, decisions);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return notify('error', res.error);
    setDone(res.enrolled);
    notify('success', t(`${res.enrolled} students enrolled in ${yearName(data.to_year_id)}`, `${res.enrolled} ተማሪዎች በ${yearName(data.to_year_id)} ተመዝግበዋል`));
    loadPromotion(data.from_year_id ?? undefined, data.to_year_id).then(apply);
  };

  const copy = async () => {
    if (!data?.from_year_id || !data.to_year_id) return;
    setBusy(true);
    const res = await copyClasses(data.from_year_id, data.to_year_id);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`${res.count} classes made in ${yearName(data.to_year_id)}`, `በ${yearName(data.to_year_id)} ${res.count} ክፍሎች ተሰርተዋል`));
    loadPromotion(data.from_year_id, data.to_year_id).then(apply);
  };

  const makeCurrent = async () => {
    if (!data?.to_year_id) return;
    setBusy(true);
    const res = await setCurrentAcademicYear(data.to_year_id);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`${yearName(data.to_year_id)} is now the current year`, `${yearName(data.to_year_id)} አሁን የአሁኑ ዓመት ነው`));
    loadPromotion().then(apply);
  };

  const fromOptions = data?.years ?? [];
  const toCurrent = data?.years.find((y) => y.id === data.to_year_id)?.is_current;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Year-end promotion', 'የዓመት መጨረሻ ዝውውር')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            `Students whose average of approved grades reaches ${PASS_MARK}% move up a grade; the others repeat it. Change anyone before saving.`,
            `የጸደቁ ውጤቶቻቸው አማካይ ${PASS_MARK}% የደረሰ ተማሪዎች ወደ ቀጣዩ ክፍል ይዛወራሉ፤ ሌሎቹ ይደግማሉ። ከማስቀመጥዎ በፊት ማንኛውንም መቀየር ይችላሉ።`
          )}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {data && (
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <select value={data.from_year_id ?? ''} onChange={(e) => loadPromotion(e.target.value, data.to_year_id ?? undefined).then(apply)} className="form-input text-sm w-auto">
            {fromOptions.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <ArrowRight size={16} className="text-slate-400" />
          <select value={data.to_year_id ?? ''} onChange={(e) => loadPromotion(data.from_year_id ?? undefined, e.target.value).then(apply)} className="form-input text-sm w-auto">
            <option value="">{t('— next year —', '— ቀጣይ ዓመት —')}</option>
            {fromOptions.filter((y) => y.id !== data.from_year_id).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
      )}

      {data && !data.to_year_id && (
        <div className="card p-5 text-sm text-slate-600 flex flex-wrap items-center justify-between gap-3">
          <span>{t('Create next academic year first.', 'መጀመሪያ ቀጣዩን የትምህርት ዓመት ይፍጠሩ።')}</span>
          <Link href="/dashboard/education/academic-years" className="btn btn-primary text-xs inline-flex items-center gap-1.5">
            <CalendarPlus size={14} /> {t('Academic years', 'የትምህርት ዓመታት')}
          </Link>
        </div>
      )}

      {data?.to_year_id && data.to_classes.length === 0 && (
        <div className="card p-5 text-sm text-slate-600 flex flex-wrap items-center justify-between gap-3">
          <span>{t(`${yearName(data.to_year_id)} has no classes yet.`, `${yearName(data.to_year_id)} ገና ክፍሎች የሉትም።`)}</span>
          <button disabled={busy || data.from_classes.length === 0} onClick={copy} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Copy size={14} /> {t(`Copy this year’s ${data.from_classes.length} classes`, `የዚህን ዓመት ${data.from_classes.length} ክፍሎች ቅዳ`)}
          </button>
        </div>
      )}

      {done !== null && data?.to_year_id && !toCurrent && (
        <div className="card p-5 text-sm text-emerald-800 bg-emerald-50 border-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={16} /> {t(`${done} students enrolled. When the new year starts, make it the current year.`, `${done} ተማሪዎች ተመዝግበዋል። አዲሱ ዓመት ሲጀምር የአሁኑ ዓመት ያድርጉት።`)}
          </span>
          <button disabled={busy} onClick={makeCurrent} className="btn btn-primary text-xs">
            {t(`Make ${yearName(data.to_year_id)} the current year`, `${yearName(data.to_year_id)}ን የአሁኑ ዓመት አድርግ`)}
          </button>
        </div>
      )}

      {data?.to_year_id && data.to_classes.length > 0 &&
        data.from_classes.map((c) => {
          const students = data.students.filter((s) => s.class_id === c.id);
          if (students.length === 0) return null;
          const target = targets.get(c.id) ?? { up: null, same: null };
          const setTarget = (key: keyof ClassTargets, value: string) => setTargets((m) => new Map(m).set(c.id, { ...target, [key]: value || null }));
          return (
            <div key={c.id} className="card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-bold text-slate-900 inline-flex items-center gap-1.5">
                  <GraduationCap size={16} className="text-rose-800" /> {locale === 'am' ? c.name_am : c.name_en}
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  {t('Passed →', 'ያለፉ →')}
                  <select value={target.up ?? ''} onChange={(e) => setTarget('up', e.target.value)} className="form-input text-xs py-1 w-auto">
                    <option value="">{t('leave / graduate', 'ይወጣሉ / ተመርቀዋል')}</option>
                    {data.to_classes.map((x) => <option key={x.id} value={x.id}>{locale === 'am' ? x.name_am : x.name_en}</option>)}
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  {t('Below pass mark →', 'ከማለፊያ በታች →')}
                  <select value={target.same ?? ''} onChange={(e) => setTarget('same', e.target.value)} className="form-input text-xs py-1 w-auto">
                    <option value="">{t('leave', 'ይወጣሉ')}</option>
                    {data.to_classes.map((x) => <option key={x.id} value={x.id}>{locale === 'am' ? x.name_am : x.name_en}</option>)}
                  </select>
                </label>
              </div>
              <div className="table-container rounded-none border-0">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Student', 'ተማሪ')}</th>
                      <th>{t('Average', 'አማካይ')}</th>
                      <th>{t('Next year', 'በቀጣዩ ዓመት')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const value = decisionOf(s);
                      const changed = s.student_id in chosen;
                      return (
                        <tr key={s.student_id}>
                          <td>
                            <div className="font-medium text-slate-900">{locale === 'am' ? s.name_am : s.name_en}</div>
                            <div className="text-[11px] font-mono text-slate-400">{s.reg_no}</div>
                          </td>
                          <td className="text-xs">
                            {s.average === null ? (
                              <span className="text-amber-700">{t('no results', 'ውጤት የለም')}</span>
                            ) : (
                              <span className={s.average >= PASS_MARK ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{s.average}%</span>
                            )}
                          </td>
                          <td>
                            {s.next_class_id ? (
                              <span className="text-xs text-slate-500">{t(`already in ${toName(s.next_class_id)}`, `ቀድሞ በ${toName(s.next_class_id)} ተመዝግቧል`)}</span>
                            ) : (
                              <select
                                value={value}
                                onChange={(e) => setChosen((m) => ({ ...m, [s.student_id]: e.target.value }))}
                                className={`form-input text-xs py-1 w-auto ${changed ? 'border-blue-400' : ''}`}
                              >
                                {data.to_classes.map((x) => <option key={x.id} value={x.id}>{locale === 'am' ? x.name_am : x.name_en}</option>)}
                                <option value="">{t('Leaves / graduates', 'ይወጣል / ተመርቋል')}</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      {data?.to_year_id && data.to_classes.length > 0 && data.students.length > 0 && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-4">
          <span className="text-sm text-slate-700">
            {t(
              `Up a grade ${summary.up} · Repeat ${summary.same} · Leave ${summary.leave}${summary.already ? ` · Already enrolled ${summary.already}` : ''}`,
              `ወደ ቀጣይ ክፍል ${summary.up} · ይደግማሉ ${summary.same} · ይወጣሉ ${summary.leave}${summary.already ? ` · ቀድሞ የተመዘገቡ ${summary.already}` : ''}`
            )}
          </span>
          <button disabled={busy || summary.up + summary.same === 0} onClick={() => setConfirming(true)} className="btn btn-primary text-xs disabled:opacity-50">
            {t(`Enroll ${summary.up + summary.same} students in ${yearName(data.to_year_id)}`, `${summary.up + summary.same} ተማሪዎችን በ${yearName(data.to_year_id)} መዝግብ`)}
          </button>
        </div>
      )}

      {confirming && data?.to_year_id && (
        <Modal isOpen onClose={() => setConfirming(false)} title={t('Enroll the students?', 'ተማሪዎቹ ይመዝገቡ?')} maxWidth="md">
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              {t(
                `${summary.up + summary.same} students are enrolled in ${yearName(data.to_year_id)}. This year’s records stay as they are. ${summary.leave} students are not enrolled.`,
                `${summary.up + summary.same} ተማሪዎች በ${yearName(data.to_year_id)} ይመዘገባሉ። የዚህ ዓመት መዝገቦች አይነኩም። ${summary.leave} ተማሪዎች አይመዘገቡም።`
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setConfirming(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button disabled={busy} onClick={enroll} className="btn btn-primary text-xs disabled:opacity-60">
                {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Yes, enroll them', 'አዎ፣ መዝግብ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
