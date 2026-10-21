'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Globe, KeyRound } from 'lucide-react';
import { chooseOwnPassword } from '@/app/set-password/actions';
import { signOut } from '@/app/login/actions';

/** Signed in with a temporary PIN / password: choose your own before anything else. */
export default function SetPasswordForm({ pin, name, login }: { pin: boolean; name: string; login: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'am'>('am');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = (en: string, am: string) => (locale === 'am' ? am : en);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== again) return setError(t('The two do not match', 'ሁለቱ አይመሳሰሉም'));
    setBusy(true);
    const res = await chooseOwnPassword(next).catch(() => ({ ok: false as const, error: t('Could not save right now. Please try again.', 'አሁን ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።') }));
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
      return;
    }
    setError(res.error);
    setBusy(false);
  };

  const leave = async () => {
    await signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-cover bg-center p-4" style={{ backgroundImage: "url('/images/hamere.jpg')" }}>
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="absolute top-8 right-8 z-10">
        <button
          type="button"
          onClick={() => setLocale((l) => (l === 'en' ? 'am' : 'en'))}
          className="flex items-center justify-center w-12 h-12 rounded-lg bg-white text-slate-800 hover:bg-slate-100"
          aria-label={t('Switch language', 'ቋንቋ ቀይር')}
          title={locale === 'en' ? 'አማርኛ' : 'English'}
        >
          <Globe size={20} />
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><KeyRound size={22} /></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{pin ? t('Choose your own PIN', 'የራስዎን ሚስጥር ቁጥር ይምረጡ') : t('Choose your own password', 'የራስዎን የይለፍ ቃል ይምረጡ')}</h2>
          <p className="text-slate-500 text-sm">
            {name} · <span className="font-mono">{login}</span>
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {t(
              'You signed in with a temporary one. Choose one only you know — it replaces the temporary one.',
              'በጊዜያዊ ገብተዋል። እርስዎ ብቻ የሚያውቁትን ይምረጡ — ጊዜያዊውን ይተካል።'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div className="form-group">
            <label className="form-label" htmlFor="next">
              {pin ? t('New PIN (6 digits)', 'አዲስ ሚስጥር ቁጥር (6 አኃዝ)') : t('New password (at least 8 characters)', 'አዲስ የይለፍ ቃል (ቢያንስ 8 ፊደል)')}
            </label>
            <div className="relative">
              <input
                id="next"
                type={show ? 'text' : 'password'}
                inputMode={pin ? 'numeric' : undefined}
                maxLength={pin ? 6 : 128}
                className="form-input pr-10"
                value={next}
                onChange={(e) => setNext(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
                autoComplete="new-password"
                required
                autoFocus
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={t('Show', 'አሳይ')}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="again">{t('Type it again', 'እንደገና ይጻፉት')}</label>
            <input
              id="again"
              type={show ? 'text' : 'password'}
              inputMode={pin ? 'numeric' : undefined}
              maxLength={pin ? 6 : 128}
              className="form-input"
              value={again}
              onChange={(e) => setAgain(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save and continue', 'አስቀምጥና ቀጥል')}
          </button>
          <button type="button" onClick={leave} className="w-full text-sm text-slate-500 hover:text-slate-800 hover:underline">
            {t('Sign out', 'ውጣ')}
          </button>
        </form>
      </div>
    </main>
  );
}
