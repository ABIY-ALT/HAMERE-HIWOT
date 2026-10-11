'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, KeyRound, Printer, UserCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { createStudentLogins, loadStudentLogins, resetStudentPin, setStudentLoginActive, type LoginSlip, type StudentLoginsData } from './actions';

/** Staff: give students their registration number + PIN login, print the slips, reset forgotten PINs. */
export default function StudentLoginsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<StudentLoginsData | null>(null);
  const [classId, setClassId] = useState('');
  const [slips, setSlips] = useState<LoginSlip[]>([]);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadStudentLogins>>) => {
    if (res.mode === 'live') {
      setData(res.data);
      setClassId((c) => c || res.data.classes[0]?.id || '');
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadStudentLogins().then(apply);
  }, [apply]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const rows = data?.rows.filter((r) => r.class_id === classId) ?? [];
  const without = rows.filter((r) => !r.has_login);
  const className = (id: string) => {
    const c = data?.classes.find((x) => x.id === id);
    return c ? (locale === 'am' ? c.name_am : c.name_en) : '';
  };

  const createAll = async () => {
    setBusy(true);
    const res = await createStudentLogins(without.map((r) => r.student_id));
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    setSlips(res.slips);
    setSkipped(res.skipped);
    notify('success', t(`${res.slips.length} login(s) made — print the slips now`, `${res.slips.length} መግቢያ(ዎች) ተሰርተዋል — ወረቀቶቹን አሁን ያትሙ`));
    loadStudentLogins().then(apply);
  };

  const reset = async (studentId: string) => {
    setBusy(true);
    const res = await resetStudentPin(studentId);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    setSlips([res.slip]);
    setSkipped([]);
    notify('success', t('New PIN made — give the student the slip below', 'አዲስ ሚስጥር ቁጥር ተሰርቷል — ከታች ያለውን ወረቀት ለተማሪው ይስጡ'));
  };

  const toggle = async (studentId: string, active: boolean) => {
    setBusy(true);
    const res = await setStudentLoginActive(studentId, active);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', active ? t('Login turned on', 'መግቢያው ተከፍቷል') : t('Login turned off', 'መግቢያው ተዘግቷል'));
    loadStudentLogins().then(apply);
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="no-print space-y-1">
        <Link href="/dashboard/people/students" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> {t('Back to students', 'ወደ ተማሪዎች ተመለስ')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Student logins', 'የተማሪ መግቢያዎች')}</h1>
        <p className="text-sm text-slate-500">
          {t(
            'Students sign in with their registration number and a 6-digit PIN, and see only their own exams, results and attendance.',
            'ተማሪዎች በምዝገባ ቁጥራቸውና ባለ 6 አሃዝ ሚስጥር ቁጥር ይገባሉ፤ የራሳቸውን ፈተና፣ ውጤትና ክትትል ብቻ ያያሉ።'
          )}
        </p>
      </div>

      <div className="no-print">
        <AdminModeNotice mode={mode} error={error} />
        {mode === 'demo' && (
          <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
            {t('Student logins need the database — not available in demo mode.', 'የተማሪ መግቢያዎች ዳታቤዝ ያስፈልጋቸዋል — በሙከራ ሁኔታ አይሰሩም።')}
          </p>
        )}
      </div>

      {/* Slips: shown once, right after creating or resetting */}
      {slips.length > 0 && (
        <div className="space-y-3">
          <div className="no-print p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={16} />
              {t('The PINs are shown only now. Print the slips before leaving this page.', 'ሚስጥር ቁጥሮቹ የሚታዩት አሁን ብቻ ነው። ከዚህ ገጽ ከመውጣትዎ በፊት ያትሙ።')}
            </span>
            <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <Printer size={14} /> {t('Print slips', 'ወረቀቶቹን አትም')}
            </button>
          </div>
          <div className="print-sheet grid grid-cols-1 sm:grid-cols-2 gap-0">
            {slips.map((s) => (
              <div key={s.reg_no} className="border border-dashed border-slate-400 p-4 space-y-1.5 break-inside-avoid bg-white">
                <div className="text-[11px] text-slate-500">{t('Hamere Hiwot Sunday School · Student login', 'የሐመረ ሕይወት ሰንበት ት/ቤት · የተማሪ መግቢያ')}</div>
                <div className="font-bold text-slate-900">{locale === 'am' ? s.name_am : s.name_en}</div>
                <div className="text-xs text-slate-600">{locale === 'am' ? s.class_name_am : s.class_name}</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="text-[10px] text-slate-500">{t('Registration No.', 'የምዝገባ ቁጥር')}</div>
                    <div className="font-mono font-bold text-slate-900">{s.reg_no}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">{t('PIN', 'ሚስጥር ቁጥር')}</div>
                    <div className="font-mono text-xl font-bold tracking-[0.2em] text-slate-900">{s.pin}</div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 pt-1">
                  {t('Sign in at the school website. Change your PIN under “My profile”. Keep it secret.', 'በትምህርት ቤቱ ድረ-ገጽ ይግቡ። ሚስጥር ቁጥርዎን በ«የእኔ መገለጫ» ይቀይሩ። ለማንም አያሳዩ።')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {skipped.length > 0 && (
        <div className="no-print p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-0.5">
          <p className="font-semibold">{t('Not made:', 'ያልተሰሩ፦')}</p>
          {skipped.map((s) => (
            <p key={s.name}>{s.name} — {s.reason}</p>
          ))}
        </div>
      )}

      {data && (
        <div className="no-print card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="form-input text-sm w-auto">
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
              ))}
            </select>
            <button
              onClick={createAll}
              disabled={busy || without.length === 0}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <UserCheck size={14} />
              {without.length
                ? t(`Create logins for ${without.length} student(s) in ${className(classId)}`, `በ${className(classId)} ላሉ ${without.length} ተማሪ(ዎች) መግቢያ ስራ`)
                : t('Everyone in this class has a login', 'በዚህ ክፍል ሁሉም መግቢያ አላቸው')}
            </button>
          </div>
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Student', 'ተማሪ')}</th>
                  <th>{t('Registration No.', 'የምዝገባ ቁጥር')}</th>
                  <th>{t('Login', 'መግቢያ')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="font-medium text-slate-900">{locale === 'am' ? r.name_am : r.name_en}</td>
                    <td className="font-mono text-xs">{r.reg_no}</td>
                    <td className="text-xs">
                      {!r.has_login ? (
                        <span className="text-slate-400">{t('No login yet', 'መግቢያ የለውም')}</span>
                      ) : !r.student_login ? (
                        <span className="text-slate-500">{t('Has a staff account', 'የሠራተኛ መለያ አለው')}</span>
                      ) : r.active ? (
                        <span className="text-emerald-700">
                          {t('Active', 'ንቁ')}
                          {r.last_login && <span className="text-slate-400"> · {t('last sign-in', 'መጨረሻ የገባው')} {formatEthiopianDate(r.last_login.slice(0, 10), locale)}</span>}
                        </span>
                      ) : (
                        <span className="text-red-600">{t('Turned off', 'ተዘግቷል')}</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {r.student_login && (
                        <>
                          <button disabled={busy} onClick={() => reset(r.student_id)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50">
                            <KeyRound size={13} /> {t('Reset PIN', 'ሚስጥር ቁጥር ቀይር')}
                          </button>
                          <button disabled={busy} onClick={() => toggle(r.student_id, !r.active)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded hover:bg-slate-100">
                            {r.active ? t('Turn off', 'ዝጋ') : t('Turn on', 'ክፈት')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-sm text-slate-400 py-8">{t('No students in this class.', 'በዚህ ክፍል ተማሪ የለም።')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
