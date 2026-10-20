// ─────────────────────────────────────────────────────────────────────────────
// "ℹ️ About us" topics — the shape and the suggested starting topics, with no
// server code, so the website's editor (a client page) can use them too.
// The bot side is lib/telegram/about.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const ABOUT_KEY = 'bot_about';
export const MAX_TOPICS = 12;

export interface AboutTopic {
  id: string;
  title_am: string;
  title_en: string;
  body_am: string;
  body_en: string;
}

/** Topics the office may start from (titles only). */
export const SUGGESTED_TOPICS: Omit<AboutTopic, 'id'>[] = [
  { title_am: 'ታሪካችን', title_en: 'Our history', body_am: '', body_en: '' },
  { title_am: 'የትምህርት ጊዜያት', title_en: 'Class times', body_am: '', body_en: '' },
  { title_am: 'ክፍላት', title_en: 'Departments', body_am: '', body_en: '' },
  { title_am: 'አባል ለመሆን', title_en: 'Becoming a member', body_am: '', body_en: '' },
  { title_am: 'ወርሃዊ መዋጮ', title_en: 'Monthly dues', body_am: '', body_en: '' },
  { title_am: 'አድራሻና ስልክ', title_en: 'Address & contact', body_am: '', body_en: '' },
];
