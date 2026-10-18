'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { TelegramConnect } from '@/components/telegram/TelegramConnect';
import { changeMyPassword } from '@/app/dashboard/profile/actions';

/** A parent's profile: Telegram, and changing their PIN. */
export default function FamilyProfilePage() {
  const { t } = useLang();
  const { user } = useAuth();
  const [pin, setPin] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Staff who are also parents change their password on the staff profile
  const portalOnly = user ? [...user.permissions].every((p) => p === 'PARENT_PORTAL' || p === 'STUDENT_PORTAL') : false;

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
    setMessage({ ok: true, text: t('Your PIN was changed.', 'ሚስጥር ቁጥርዎ ተቀይሯል።') });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My profile', 'የእኔ መገለጫ')}</h1>
      <TelegramConnect what={t('Get a message on Telegram when your child is absent or gets a new result.', 'ልጅዎ ሲቀር ወይም አዲስ ውጤት ሲያገኝ በቴሌግራም መልእክት ያግኙ።')} />

      {portalOnly && (
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
      )}
    </div>
  );
}
