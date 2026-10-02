// ─────────────────────────────────────────────────────────────────────────────
// Language Context — English / Amharic localization
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, { createContext, useContext, useCallback, useSyncExternalStore } from 'react';
import type { Locale } from '@/types';

interface LangContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (en: string, am: string) => string;
  /** Resolve a localized name from an object with name_en and name_am */
  ln: (obj: { name_en: string; name_am: string | null } | null | undefined) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

const LOCALE_KEY = 'ssms_locale';
const LOCALE_EVENT = 'ssms-locale-changed';

function subscribeLocale(onChange: () => void) {
  window.addEventListener(LOCALE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LOCALE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Used when storage is blocked (e.g. a private window), so switching language still works for the session
let memoryLocale: Locale | null = null;

function readLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (saved === 'am' || saved === 'en') return saved;
  } catch {
    // fall through to the in-memory choice
  }
  return memoryLocale;
}

export function LangProvider({
  children,
  defaultLocale = 'en',
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  // The server and the first browser render both use defaultLocale, so hydration
  // matches; the saved language is applied right after, without a mismatch.
  const saved = useSyncExternalStore(subscribeLocale, readLocale, () => null);
  const locale: Locale = saved ?? defaultLocale;

  const setLocale = useCallback((l: Locale) => {
    memoryLocale = l;
    try {
      window.localStorage.setItem(LOCALE_KEY, l);
    } catch {
      // Storage unavailable (private mode): the choice just isn't remembered
    }
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }, []);

  const t = useCallback(
    (en: string, am: string) => (locale === 'am' ? am : en),
    [locale]
  );

  const ln = useCallback(
    (obj: { name_en: string; name_am: string | null } | null | undefined) => {
      if (!obj) return '';
      if (locale === 'am' && obj.name_am) return obj.name_am;
      return obj.name_en;
    },
    [locale]
  );

  return (
    <LangContext.Provider value={{ locale, setLocale, t, ln }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
