'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Church, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Demo credentials (mock mode)
const DEMO_CREDENTIALS = [
  { username: 'admin', password: 'admin123', label: 'Super Admin', labelAm: 'ዋና አስተዳዳሪ' },
  { username: 'board_chair', password: 'board123', label: 'Board Officer', labelAm: 'የሥራ አመራር ኃላፊ' },
  { username: 'audit_inspector', password: 'audit123', label: 'Audit Inspector', labelAm: 'ኦዲት ተቆጣጣሪ' },
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
      (c) => c.username.toLowerCase() === cleanUsername && c.password === cleanPassword
    );

    if (valid) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ssms_user', JSON.stringify(valid));
        document.cookie = `ssms_user=${valid.username}; path=/; max-age=86400`;
      }
      router.push('/dashboard');
      return;
    }

    setError(t('Invalid username or password', 'ተጠቃሚ ስም ወይም የይለፍ ቃል ትክክል አይደለም'));
    setLoading(false);
  };

  const fillDemo = (cred: (typeof DEMO_CREDENTIALS)[0]) => {
    setUsername(cred.username);
    setPassword(cred.password);
    setError('');
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #161a4b 0%, #1e2770 50%, #2f43c8 100%)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-center items-center flex-1 p-12 text-white">
        <div className="max-w-md text-center flex flex-col items-center">
          <div
            className="w-28 h-28 rounded-full overflow-hidden p-1 mb-5 relative"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #b45309 100%)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.5), 0 0 24px rgba(251,191,36,0.35)',
            }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ሐመረ ሕይወት ሰንበት ትምህርት ቤት"
                width={112}
                height={112}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-1 tracking-tight text-white" lang="am">
            ሐመረ ሕይወት ሰንበት ት/ቤት
          </h1>
          <p className="text-amber-300 text-sm font-semibold mb-1" lang="am">
            ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን
          </p>
          <p className="text-blue-200 text-xs font-medium mb-3">
            Sallo Debre Tsehay St. George Church Hamere Hiwot Sabbath School
          </p>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-mono mb-4">
            <span>፲፱፻፺፪ ዓ.ም</span>
            <span>•</span>
            <span>ነህ 2፥20</span>
          </div>

          <p className="text-blue-300 text-xs tracking-wide">
            Sunday School Management Information System (SSMS)
          </p>

          <div className="mt-6 w-full p-4 rounded-xl border border-white/10 bg-white/5 text-left text-xs text-blue-200 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{t('ምድብ ሁለት አጥቢያ ሰንበት ት/ቤት', 'Category 2 Parish Sunday School')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span>7 {t('Coordinations', 'ቅንጅቶች')} · 7 {t('Departments', 'ክፍሎች')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{t('Bilingual: English & Amharic', 'ሁለት ቋንቋ: ቋንቋ እንግሊዝኛ እና አማርኛ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right login card */}
      <div className="flex flex-col justify-center items-center w-full lg:w-auto lg:min-w-[440px] p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-6 lg:hidden">
            <div
              className="w-12 h-12 rounded-full p-0.5 shrink-0"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="Hamere Hiwot"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 leading-tight">ሐመረ ሕይወት ሰ/ት/ቤት</div>
              <div className="text-[11px] text-slate-500">ሳሎ ደብረ ፀሐይ ቅ/ጊዮርጊስ</div>
            </div>
          </div>

          {/* Language toggle */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setLocale((l) => (l === 'en' ? 'am' : 'en'))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {locale === 'en' ? '🇪🇹 አማርኛ' : '🌐 English'}
            </button>
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-1">
            {t('Welcome Back', 'እንኳን ደህና መጡ')}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {t('Sign in to your account to continue', 'ለመቀጠል ወደ መለያዎ ይግቡ')}
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="form-group">
              <label className="form-label" htmlFor="username">
                {t('Username', 'የተጠቃሚ ስም')}
              </label>
              <input
                id="username"
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('Enter your username', 'የተጠቃሚ ስምዎን ያስገቡ')}
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">
                {t('Password', 'የይለፍ ቃል')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className="form-input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'btn btn-primary w-full mt-2',
                loading && 'opacity-70 cursor-not-allowed'
              )}
            >
              {loading ? (
                <span className="loading-spinner" style={{ width: 18, height: 18 }} />
              ) : (
                <LogIn size={16} />
              )}
              {loading
                ? t('Signing in…', 'በመግባት ላይ…')
                : t('Sign In', 'ግባ')}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {t('Demo Accounts', 'ሙከራ መለያዎች')}
            </p>
            <div className="space-y-2">
              {DEMO_CREDENTIALS.map((cred) => (
                <button
                  key={cred.username}
                  onClick={() => fillDemo(cred)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex justify-between items-center group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-700">
                      {t(cred.label, cred.labelAm)}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{cred.username}</div>
                  </div>
                  <span className="text-xs text-primary-600 opacity-0 group-hover:opacity-100 font-medium">
                    {t('Use →', 'ጠቀም →')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
