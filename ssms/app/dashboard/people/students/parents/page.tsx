'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, Link2, Printer, Search, UserPlus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import {
  createParentLogin,
  loadFamilies,
  relinkFamily,
  resetParentPin,
  setParentLoginActive,
  type FamilyRow,
  type ParentSlip,
} from './actions';

type Relationship = 'Mother' | 'Father' | 'Guardian';

/** Staff: parent logins (phone + PIN), made from the guardian phone on the students' records. */
export default function ParentLoginsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [classes, setClasses] = useState<{ id: string; name_en: string; name_am: string }[]>([]);
  const [classId, setClassId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FamilyRow | null>(null);
  const [slip, setSlip] = useState<ParentSlip | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadFamilies>>) => {
    if (res.mode === 'live') {
      setFamilies(res.data.families);
      setClasses(res.data.classes);
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadFamilies().then(apply);
  }, [apply]);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };
  const reload = () => loadFamilies().then(apply);

  const needle = search.trim().toLowerCase();
  const rows = families.filter(
    (f) =>
      (classId === 'ALL' || f.children.some((c) => c.class_id === classId)) &&
      (!needle || f.phone.includes(needle) || f.guardian_name.toLowerCase().includes(needle) || f.children.some((c) => `${c.name_en} ${c.name_am}`.toLowerCase().includes(needle)))
  );
  const className = (id: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? (locale === 'am' ? c.name_am : c.name_en) : '';
  };

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) return notify('error', res.error ?? '');
    notify('success', success);
    reload();
  };

  const resetPin = async (f: FamilyRow) => {
    setBusy(true);
    const res = await resetParentPin(f.phone);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    setSlip({ name: f.guardian_name, phone: f.phone, pin: res.pin, children: f.children.map((c) => (locale === 'am' ? c.name_am : c.name_en)) });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="no-print space-y-1">
        <Link href="/dashboard/people/students" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> {t('Back to students', 'ወደ ተማሪዎች ተመለስ')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Parent logins', 'የወላጅ መግቢያዎች')}</h1>
        <p className="text-sm text-slate-500">
          {t(
            'Parents sign in with their phone number and a 6-digit PIN and see only their own children. Families come from the guardian phone on each student’s record.',
            'ወላጆች በስልክ ቁጥራቸውና ባለ 6 አሃዝ ሚስጥር ቁጥር ይገባሉ፤ የልጆቻቸውን ብቻ ያያሉ። ቤተሰቦች የሚገኙት በእያንዳንዱ ተማሪ መዝገብ ላይ ካለው የአሳዳጊ ስልክ ነው።'
          )}
        </p>
      </div>
      <div className="no-print">
        <AdminModeNotice mode={mode} error={error} />
      </div>

      {slip && (
        <div className="space-y-3">
          <div className="no-print p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={16} />
              {slip.pin
                ? t('The PIN is shown only now. Print the slip or tell it to the parent.', 'ሚስጥር ቁጥሩ የሚታየው አሁን ብቻ ነው። ወረቀቱን ያትሙ ወይም ለወላጁ ይንገሩ።')
                : t('This parent already has an account — they sign in with their own password.', 'ይህ ወላጅ መለያ አለው — በራሳቸው የይለፍ ቃል ይገባሉ።')}
            </span>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
                <Printer size={14} /> {t('Print slip', 'ወረቀቱን አትም')}
              </button>
              <button onClick={() => setSlip(null)} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
            </div>
          </div>
          <div className="print-sheet max-w-sm border border-dashed border-slate-400 p-4 space-y-1.5 bg-white">
            <div className="text-[11px] text-slate-500">{t('Hamere Hiwot Sunday School · Parent login', 'የሐመረ ሕይወት ሰንበት ት/ቤት · የወላጅ መግቢያ')}</div>
            <div className="font-bold text-slate-900">{slip.name}</div>
            <div className="text-xs text-slate-600">{t('Children', 'ልጆች')}: {slip.children.join(', ')}</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] text-slate-500">{t('Phone (to sign in)', 'ስልክ (ለመግቢያ)')}</div>
                <div className="font-mono font-bold text-slate-900">{slip.phone}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">{t('PIN', 'ሚስጥር ቁጥር')}</div>
                <div className="font-mono text-xl font-bold tracking-[0.2em] text-slate-900">{slip.pin ?? t('your password', 'የእርስዎ የይለፍ ቃል')}</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 pt-1">
              {t('Sign in at the school website, then “Connect Telegram” to get absence alerts and results.', 'በትምህርት ቤቱ ድረ-ገጽ ይግቡ፤ የመቅረትና የውጤት መልእክቶችን ለማግኘት «ቴሌግራም አገናኝ» ይጫኑ።')}
            </div>
          </div>
        </div>
      )}

      <div className="no-print card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search parent, phone or child…', 'ወላጅ፣ ስልክ ወይም ልጅ ፈልግ…')} className="form-input pl-9 text-sm" />
          </div>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="form-input text-sm w-auto">
            <option value="ALL">{t('All classes', 'ሁሉም ክፍሎች')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>)}
          </select>
          <span className="text-xs text-slate-400">{rows.length} {t('families', 'ቤተሰቦች')}</span>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Parent', 'ወላጅ')}</th>
                <th>{t('Children', 'ልጆች')}</th>
                <th>{t('Login', 'መግቢያ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const unlinked = f.children.filter((c) => !c.linked).length;
                return (
                  <tr key={f.phone}>
                    <td>
                      <div className="font-medium text-slate-900">{f.guardian_name || '—'}</div>
                      <div className="text-[11px] font-mono text-slate-400">{f.phone}</div>
                    </td>
                    <td className="text-xs">
                      {f.children.map((c) => (
                        <div key={c.student_id} className="text-slate-700">
                          {locale === 'am' ? c.name_am : c.name_en} <span className="text-slate-400">· {className(c.class_id)}</span>
                          {f.account === 'PARENT' && !c.linked && <span className="text-amber-700"> · {t('not linked', 'አልተያያዘም')}</span>}
                        </div>
                      ))}
                    </td>
                    <td className="text-xs">
                      {f.account === 'NONE' && <span className="text-slate-400">{t('No login yet', 'መግቢያ የለውም')}</span>}
                      {f.account === 'STAFF' && <span className="text-slate-500">{t('Has a staff account', 'የሠራተኛ መለያ አለው')}</span>}
                      {f.account === 'PARENT' &&
                        (f.active ? (
                          <span className="text-emerald-700 inline-flex items-center gap-1">
                            <CheckCircle2 size={13} /> {t('Active', 'ንቁ')}
                            {f.last_login && <span className="text-slate-400">· {formatEthiopianDate(f.last_login.slice(0, 10), locale)}</span>}
                          </span>
                        ) : (
                          <span className="text-red-600">{t('Turned off', 'ተዘግቷል')}</span>
                        ))}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {f.account !== 'PARENT' && (
                        <button disabled={busy} onClick={() => setEditing(f)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50">
                          <UserPlus size={13} /> {f.account === 'STAFF' ? t('Add parent access', 'የወላጅ መዳረሻ ጨምር') : t('Create login', 'መግቢያ ስራ')}
                        </button>
                      )}
                      {f.account === 'PARENT' && unlinked > 0 && (
                        <button
                          disabled={busy}
                          onClick={() => run(() => relinkFamily(f.phone), t('Children linked', 'ልጆቹ ተያይዘዋል'))}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
                        >
                          <Link2 size={13} /> {t(`Link ${unlinked} new child(ren)`, `${unlinked} አዲስ ልጅ(ጆች) አያይዝ`)}
                        </button>
                      )}
                      {f.account === 'PARENT' && f.parent_only && (
                        <>
                          <button disabled={busy} onClick={() => resetPin(f)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50">
                            <KeyRound size={13} /> {t('Reset PIN', 'ሚስጥር ቁጥር ቀይር')}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => run(() => setParentLoginActive(f.phone, !f.active), f.active ? t('Login turned off', 'መግቢያው ተዘግቷል') : t('Login turned on', 'መግቢያው ተከፍቷል'))}
                            className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded hover:bg-slate-100"
                          >
                            {f.active ? t('Turn off', 'ዝጋ') : t('Turn on', 'ክፈት')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {mode === 'live' && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-sm text-slate-400 py-8">
                    {t('No families found. A family needs a guardian phone on the student’s record.', 'ቤተሰብ አልተገኘም። በተማሪው መዝገብ ላይ የአሳዳጊ ስልክ ያስፈልጋል።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ParentDialog
          family={editing}
          onClose={() => setEditing(null)}
          onDone={(s) => {
            setEditing(null);
            setSlip(s);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ParentDialog({ family, onClose, onDone }: { family: FamilyRow; onClose: () => void; onDone: (slip: ParentSlip) => void }) {
  const { t, locale } = useLang();
  const [name, setName] = useState(family.guardian_name);
  const [relationship, setRelationship] = useState<Relationship>('Mother');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (r: Relationship) => {
    setRelationship(r);
    if (r === 'Mother') setGender('FEMALE');
    if (r === 'Father') setGender('MALE');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await createParentLogin({ phone: family.phone, name, relationship, gender });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.slip);
  };

  return (
    <Modal isOpen onClose={onClose} title={family.account === 'STAFF' ? t('Add parent access', 'የወላጅ መዳረሻ ጨምር') : t('Create a parent login', 'የወላጅ መግቢያ ስራ')} subtitle={family.phone} maxWidth="md">
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Parent’s name', 'የወላጅ ስም')} *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="form-input text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Relationship', 'ዝምድና')}</label>
          <div className="flex gap-4">
            {(
              [
                ['Mother', t('Mother', 'እናት')],
                ['Father', t('Father', 'አባት')],
                ['Guardian', t('Guardian', 'አሳዳጊ')],
              ] as [Relationship, string][]
            ).map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="relationship" checked={relationship === value} onChange={() => pick(value)} /> {label}
              </label>
            ))}
          </div>
        </div>
        {relationship === 'Guardian' && (
          <div className="flex gap-4">
            {(
              [
                ['FEMALE', t('Female', 'ሴት')],
                ['MALE', t('Male', 'ወንድ')],
              ] as ['MALE' | 'FEMALE', string][]
            ).map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="gender" checked={gender === value} onChange={() => setGender(value)} /> {label}
              </label>
            ))}
          </div>
        )}
        <div className="text-xs text-slate-500">
          {t('Children who will be linked', 'የሚያያዙ ልጆች')}: {family.children.map((c) => (locale === 'am' ? c.name_am : c.name_en)).join(', ')}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
