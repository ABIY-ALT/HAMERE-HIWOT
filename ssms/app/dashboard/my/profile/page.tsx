'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { PortalNotice, useMyPortal } from '@/components/student/portal';
import { changeMyPassword } from '@/app/dashboard/profile/actions';

/** The student's details, and changing their PIN. */
export default function MyProfilePage() {
  const { t, locale } = useLang();
  const { mode, data, error } = useMyPortal();
  const [pin, setPin] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!/^\d{6}$/.test(pin.next)) return setMessage({ ok: false, text: t('The new PIN must be exactly 6 digits.', 'አዲሱ ሚስጥር ቁጥር በትክክል 6 አሃዝ መሆን አለበት።') });
    if (pin.next !== pin.confirm) return setMessage({ ok: false, text: t('The two new PINs do not match.', 'ሁለቱ አዲስ ሚስጥር ቁጥሮች አይዛመዱም።') });
    setBusy(true);
    const res = await changeMyPassword(pin.current, pin.next);
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error });
    setPin({ current: '', next: '', confirm: '' });
    setMessage({ ok: true, text: t('Your PIN was changed. Use the new one next time you sign in.', 'ሚስጥር ቁጥርዎ ተቀይሯል። በሚቀጥለው ሲገቡ አዲሱን ይጠቀሙ።') });
  };

  if (!data) return <PortalNotice mode={mode} error={error} />;
  const s = data.student;
  const rows: [string, string][] = [
    [t('Name', 'ስም'), locale === 'am' ? s.name_am : s.name_en],
    [t('Registration No. (to sign in)', 'የምዝገባ ቁጥር (ለመግቢያ)'), s.reg_no],
    [t('Class', 'ክፍል'), (locale === 'am' ? s.class_name_am : s.class_name) || '—'],
    [t('Baptismal name', 'የክርስትና ስም'), s.baptismal || '—'],
    [t('Gender', 'ጾታ'), s.gender === 'FEMALE' ? t('Female', 'ሴት') : t('Male', 'ወንድ')],
    [t('Date of birth', 'የትውልድ ቀን'), s.date_of_birth ? formatEthiopianDate(s.date_of_birth, locale) : '—'],
    [t('Parent / guardian', 'ወላጅ / አሳዳጊ'), [s.guardian, s.guardian_phone].filter(Boolean).join(' · ') || '—'],
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My profile', 'የእኔ መገለጫ')}</h1>

      <div className="card p-5">
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900 text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-slate-400 mt-3">{t('Something wrong? Tell the school office.', 'የተሳሳተ ነገር ካለ ለትምህርት ቤቱ ጽ/ቤት ይንገሩ።')}</p>
      </div>

      <form onSubmit={change} className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
          <KeyRound size={16} /> {t('Change my PIN', 'ሚስጥር ቁጥሬን ቀይር')}
        </h2>
        {message && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {message.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {message.text}
          </div>
        )}
        {(
          [
            ['current', t('Current PIN', 'የአሁኑ ሚስጥር ቁጥር'), 'current-password'],
            ['next', t('New PIN (6 digits)', 'አዲስ ሚስጥር ቁጥር (6 አሃዝ)'), 'new-password'],
            ['confirm', t('Repeat the new PIN', 'አዲሱን ሚስጥር ቁጥር ይድገሙ'), 'new-password'],
          ] as const
        ).map(([key, label, autoComplete]) => (
          <div key={key}>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
            <input
              type="password"
              inputMode="numeric"
              required
              autoComplete={autoComplete}
              value={pin[key]}
              onChange={(e) => setPin((p) => ({ ...p, [key]: e.target.value }))}
              className="form-input text-sm font-mono tracking-widest w-48"
            />
          </div>
        ))}
        <p className="text-[11px] text-slate-400">{t('Forgot your PIN? The school office can give you a new one.', 'ሚስጥር ቁጥርዎን ከረሱ የትምህርት ቤቱ ጽ/ቤት አዲስ ይሰጥዎታል።')}</p>
        <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
          {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Change PIN', 'ሚስጥር ቁጥር ቀይር')}
        </button>
      </form>
    </div>
  );
}
