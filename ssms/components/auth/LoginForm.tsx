'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loginHelpByTelegram, signIn } from '@/app/login/actions';

export default function LoginForm() {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'am'>('en');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const t = (en: string, am: string) => (locale === 'am' ? am : en);
  const [helpPhone, setHelpPhone] = useState('');
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpNote, setHelpNote] = useState('');

  const askHelp = async () => {
    setHelpBusy(true);
    setHelpNote('');
    const res = await loginHelpByTelegram(helpPhone).catch(() => ({ ok: false, error: 'SERVER' }) as const);
    setHelpBusy(false);
    if (res.ok) {
      setHelpNote(t(
        'If this number is in a Sunday school’s records and connected to its Telegram bot, a message is on its way to that chat. If nothing comes, open the bot, share your phone, and try again.',
        'ይህ ቁጥር በሰንበት ትምህርት ቤት መዝገብ ውስጥ ካለና ከቦቱ ጋር ከተገናኘ፣ መልእክት ወደዚያ ቻት እየሄደ ነው። ምንም ካልመጣ ቦቱን ከፍተው ስልክዎን ያጋሩና እንደገና ይሞክሩ።'
      ));
    } else if (res.error === 'INVALID') setHelpNote(t('Enter a valid phone number, e.g. 0912345678.', 'ትክክለኛ ስልክ ቁጥር ያስገቡ፣ ለምሳሌ 0912345678።'));
    else if (res.error === 'RATE_LIMITED') setHelpNote(t('Asked too many times — try again later.', 'ብዙ ጊዜ ተጠይቋል — ቆይተው ይሞክሩ።'));
    else setHelpNote(t('Something went wrong — try again.', 'ችግር ተፈጥሯል — እንደገና ይሞክሩ።'));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn(username, password).catch(
      () => ({ ok: false, error: 'SERVER' }) as const
    );
    if (result.ok) {
      // Back to the page that asked for sign-in (e.g. /platform) — only addresses on this site
      const next = new URLSearchParams(window.location.search).get('next');
      const back = next && /^\/(?![/\\])/.test(next) ? next : null;
      router.push(back && result.to !== '/set-password' ? back : result.to);
      router.refresh();
      return;
    }

    if (result.error === 'RATE_LIMITED') {
      setError(t('Too many attempts. Wait 15 minutes and try again.', 'ብዙ ሙከራዎች ተደርገዋል። 15 ደቂቃ ቆይተው እንደገና ይሞክሩ።'));
    } else if (result.error === 'INACTIVE') {
      setError(t('This account is disabled. Contact the administrator.', 'ይህ መለያ ተዘግቷል። አስተዳዳሪውን ያነጋግሩ።'));
    } else if (result.error === 'SERVER') {
      setError(t('Could not sign in right now. Please try again.', 'አሁን መግባት አልተቻለም። እባክዎ እንደገና ይሞክሩ።'));
    } else {
      setError(t('Wrong phone / registration number or password', 'ስልክ / የምዝገባ ቁጥር ወይም የይለፍ ቃል ትክክል አይደለም'));
    }
    setLoading(false);
  };

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: "url('/images/hamere.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />

      <div className="absolute top-8 left-8 z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-full p-[3px] shrink-0"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #b45309 100%)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.45), 0 0 16px rgba(251,191,36,0.35)',
            }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-950">
              <Image src="/logo.png" alt="Hamere Hiwot Sunday School" width={56} height={56} className="w-full h-full object-cover" priority />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-2xl font-bold text-white tracking-tight">Hamere Hiwot</div>
            <div className="text-xs font-medium text-amber-300" lang="am">ሐመረ ሕይወት ሰንበት ት/ቤት</div>
          </div>
        </div>
      </div>

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
          <h2 className="text-3xl font-bold text-slate-900 mb-2">{t('Login', 'ግባ')}</h2>
          <p className="text-slate-500">
            {t('Staff: phone number and password. Students: registration number and PIN.', 'ሠራተኞች፦ ስልክ ቁጥርና የይለፍ ቃል። ተማሪዎች፦ የምዝገባ ቁጥርና ሚስጥር ቁጥር።')}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="form-group">
            <label className="form-label" htmlFor="username">{t('Phone or registration number', 'ስልክ ወይም የምዝገባ ቁጥር')}</label>
            <input
              id="username"
              type="text"
              placeholder="09…  /  REG-2026-0001"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </div>
          <div className="form-group">
            <div className="flex items-center justify-between">
              <label className="form-label" htmlFor="password">{t('Password / PIN', 'የይለፍ ቃል / ሚስጥር ቁጥር')}</label>
              <button type="button" onClick={() => setShowForgot((s) => !s)} className="text-sm font-medium text-slate-800 hover:underline">
                {t('First time, or forgot?', 'የመጀመሪያ ጊዜ ወይስ ረስተዋል?')}
              </button>
            </div>
            {showForgot && (
              <div className="mb-2 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs space-y-2">
                <p>
                  {t(
                    'Members, teachers and servants in the records can get their login on Telegram — first share your phone with your Sunday school’s bot. Then:',
                    'በመዝገቡ ያሉ አባላት፣ መምህራንና አገልጋዮች መግቢያቸውን በቴሌግራም ያገኛሉ — መጀመሪያ ስልክዎን ለሰንበት ትምህርት ቤትዎ ቦት ያጋሩ። ከዚያ፦'
                  )}
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={helpPhone}
                    onChange={(e) => setHelpPhone(e.target.value)}
                    placeholder="09…"
                    className="form-input text-sm flex-1"
                    aria-label={t('Your phone number', 'ስልክ ቁጥርዎ')}
                  />
                  <button type="button" onClick={askHelp} disabled={helpBusy || helpPhone.trim().length < 9} className="btn btn-secondary text-xs whitespace-nowrap disabled:opacity-50">
                    {helpBusy ? '…' : t('Send to my Telegram', 'ወደ ቴሌግራሜ ላክ')}
                  </button>
                </div>
                {helpNote && <p className="font-medium">{helpNote}</p>}
                <p className="text-sky-700">
                  {t(
                    'Or in the bot press “🔑 Forgot my PIN” (it also offers “Create my login”). Students: your class teacher gives your PIN. Not on Telegram? Ask the office.',
                    'ወይም በቦቱ «🔑 ሚስጥር ቁጥሬን ረሳሁ» ይጫኑ («መግቢያ ፍጠርልኝ»ም አለው)። ተማሪዎች፦ ሚስጥር ቁጥራችሁን የክፍል መምህራችሁ ይሰጣሉ። ቴሌግራም የለዎትም? ጽ/ቤቱን ይጠይቁ።'
                  )}
                </p>
              </div>
            )}
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className="form-input pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn('w-full py-3 rounded-md font-semibold text-white', loading && 'opacity-70 cursor-not-allowed')}
            style={{ background: '#0c2248' }}
          >
            {loading ? t('Signing in…', 'በመግባት ላይ…') : t('Login', 'ግባ')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          {t('New Sunday school?', 'አዲስ ሰንበት ትምህርት ቤት?')}{' '}
          <a href="/register" className="font-semibold text-slate-800 hover:underline">
            {t('Register it here', 'እዚህ ያስመዝግቡ')}
          </a>
        </p>
      </div>
    </main>
  );
}
