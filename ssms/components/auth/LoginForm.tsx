'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Demo credentials (mock mode)
const DEMO_CREDENTIALS = [
  { username: 'admin', phone: '0912345678', password: 'admin123', label: 'Super Admin', labelAm: 'ዋና አስተዳዳሪ' },
  { username: 'board_chair', phone: '0911000002', password: 'board123', label: 'Board Officer', labelAm: 'የሥራ አመራር ኃላፊ' },
  { username: 'audit_inspector', phone: '0911000003', password: 'audit123', label: 'Audit Inspector', labelAm: 'ኦዲት ተቆጣጣሪ' },
];

export default function LoginForm() {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'am'>('en');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const t = (en: string, am: string) => (locale === 'am' ? am : en);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate auth delay
    await new Promise((r) => setTimeout(r, 500));

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    // Check demo credentials
    const valid = DEMO_CREDENTIALS.find(
      (c) => (c.phone === cleanUsername || c.username.toLowerCase() === cleanUsername) && c.password === cleanPassword
    );

    if (valid) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ssms_user', JSON.stringify(valid));
        document.cookie = `ssms_user=${valid.username}; path=/; max-age=86400`;
      }
      router.push('/dashboard');
      return;
    }

    setError(t('Invalid phone number or password', 'ስልክ ቁጥር ወይም የይለፍ ቃል ትክክል አይደለም'));
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
            {t('Enter your phone number and password.', 'ስልክ ቁጥርዎን እና የይለፍ ቃልዎን ያስገቡ።')}
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
            <label className="form-label" htmlFor="username">{t('Phone Number', 'ስልክ ቁጥር')}</label>
            <input
              id="username"
              type="tel"
              placeholder="09..."
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="tel"
              required
            />
          </div>
          <div className="form-group">
            <div className="flex items-center justify-between">
              <label className="form-label" htmlFor="password">{t('Password', 'የይለፍ ቃል')}</label>
              <a href="#" className="text-sm font-medium text-slate-800 hover:underline">
                {t('Forgot password?', 'የይለፍ ቃል ረስተዋል?')}
              </a>
            </div>
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
      </div>
    </main>
  );
}
