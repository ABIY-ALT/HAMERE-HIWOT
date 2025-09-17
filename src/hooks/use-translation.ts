
'use client';

import { useLanguage } from '@/contexts/language-context';
import { translations } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';

// A simple template replacer function.
// e.g. t('hello', { name: 'World' }) with 'hello': 'Hello, {{name}}!' -> 'Hello, World!'
const replacePlaceholders = (text: string, placeholders: Record<string, string | number>) => {
  let result = text;
  for (const key in placeholders) {
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(placeholders[key]));
  }
  return result;
};


export const useTranslation = () => {
  const { language } = useLanguage();

  const t = (key: TranslationKey, placeholders?: Record<string, string | number>) => {
    const translation = translations[language][key] || translations['en'][key];
    if (placeholders) {
      return replacePlaceholders(translation, placeholders);
    }
    return translation;
  };

  return { t, language };
};
