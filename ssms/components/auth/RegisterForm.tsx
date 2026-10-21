'use client';

// Sign-up of a new Sunday school (app/register/actions → registerSundaySchool).

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Globe } from 'lucide-react';
import { checkSlug, registerSundaySchool } from '@/app/register/actions';

const slugOf = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');

export default function RegisterForm() {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'am'>('en');
  const t = (en: string, am: string) => (locale === 'am' ? am : en);
  const [nameEn, setNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const address = slugEdited ? slug : slugOf(nameEn);

  useEffect(() => {
    if (address.length < 3) return;
    const timer = setTimeout(() => checkSlug(address).then(setSlugState), 400);
    return () => clearTimeout(timer);
  }, [address]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    form.set('slug', address);
    const res = await registerSundaySchool(form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.note === 'SIGNED_IN') {
      router.push(res.to);
      router.refresh();
      return;
    }
    setDone(
      res.note === 'PENDING_APPROVAL'
        ? t('Thank you! Your Sunday school is registered and waiting for approval. We will call you.', 'እናመሰግናለን! ሰንበት ትምህርት ቤትዎ ተመዝግቧል፤ ፈቃድ በመጠበቅ ላይ ነው። እንደውልልዎታለን።')
        : t('Your Sunday school is ready. Your phone already has a login — sign in with your existing password.', 'ሰንበት ትምህርት ቤትዎ ዝግጁ ነው። ስልክዎ ቀድሞ መግቢያ አለው — በነበረው የይለፍ ቃልዎ ይግቡ።')
    );
  };

  return (
    <main className="min-h-screen bg-[var(--surface-2)] py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">← {t('Sign in', 'ግባ')}</Link>
          <button
            type="button"
            onClick={() => setLocale((l) => (l === 'en' ? 'am' : 'en'))}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
          >
            <Globe size={16} /> {locale === 'en' ? 'አማርኛ' : 'English'}
          </button>
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('Register your Sunday school', 'ሰንበት ትምህርት ቤትዎን ያስመዝግቡ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Members, students, attendance, finance, programs and a Telegram bot — in one place. Start with a free trial.', 'አባላት፣ ተማሪዎች፣ ክትትል፣ ፋይናንስ፣ ፕሮግራሞችና የቴሌግራም ቦት — በአንድ ቦታ። በነፃ የሙከራ ጊዜ ይጀምሩ።')}
          </p>

          {done ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <CheckCircle2 className="text-emerald-600" size={26} />
              <p className="mt-2 text-sm">{done}</p>
              <Link href="/login" className="btn btn-primary btn-sm mt-4 inline-flex">{t('Go to sign in', 'ወደ መግቢያ')}</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-sm font-bold text-slate-800 mb-2">{t('The Sunday school', 'ሰንበት ትምህርት ቤቱ')}</legend>
                <label className="form-group">
                  <span className="form-label">{t('Name (English)', 'ስም (በእንግሊዝኛ)')}</span>
                  <input name="name_en" required minLength={3} maxLength={120} value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="form-input" />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('Name (Amharic)', 'ስም (በአማርኛ)')}</span>
                  <input name="name_am" maxLength={120} className="form-input" lang="am" />
                </label>
                <label className="form-group sm:col-span-2">
                  <span className="form-label">{t('Web address', 'የድረ-ገጽ አድራሻ')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-slate-500 shrink-0">…/s/</span>
                    <input
                      value={address}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      required
                      minLength={3}
                      maxLength={40}
                      className="form-input"
                    />
                  </div>
                  {slugState && address.length >= 3 && (
                    <span className={`text-xs ${slugState.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                      {slugState.ok ? t('Available', 'ይገኛል') : slugState.message}
                    </span>
                  )}
                </label>
                <label className="form-group">
                  <span className="form-label">{t('City / town', 'ከተማ')}</span>
                  <input name="city" maxLength={80} className="form-input" />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('E-mail (optional)', 'ኢሜይል (ካለ)')}</span>
                  <input name="contact_email" type="email" maxLength={120} className="form-input" />
                </label>
              </fieldset>

              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-sm font-bold text-slate-800 mb-2">{t('You — the first administrator', 'እርስዎ — የመጀመሪያው አስተዳዳሪ')}</legend>
                <label className="form-group">
                  <span className="form-label">{t('Full name (English)', 'ሙሉ ስም (በእንግሊዝኛ)')}</span>
                  <input name="admin_name_en" required minLength={2} maxLength={120} autoComplete="name" className="form-input" />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('Full name (Amharic)', 'ሙሉ ስም (በአማርኛ)')}</span>
                  <input name="admin_name_am" maxLength={120} className="form-input" lang="am" />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('Phone (your sign-in)', 'ስልክ (መግቢያዎ)')}</span>
                  <input name="phone" required type="tel" inputMode="tel" placeholder="09…" autoComplete="tel" className="form-input" />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('Gender', 'ጾታ')}</span>
                  <select name="gender" className="form-input" defaultValue="MALE">
                    <option value="MALE">{t('Male', 'ወንድ')}</option>
                    <option value="FEMALE">{t('Female', 'ሴት')}</option>
                  </select>
                </label>
                <label className="form-group sm:col-span-2">
                  <span className="form-label">{t('Password (at least 8 characters)', 'የይለፍ ቃል (ቢያንስ 8 ፊደላት)')}</span>
                  <input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="form-input" />
                </label>
              </fieldset>

              {/* Filled only by robots */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="r-website">Website</label>
                <input id="r-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              <button disabled={busy || (slugState !== null && !slugState.ok)} className="btn btn-primary w-full justify-center disabled:opacity-60">
                {busy ? t('Setting up…', 'በማዘጋጀት ላይ…') : t('Create my Sunday school', 'ሰንበት ትምህርት ቤቴን ፍጠር')}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
