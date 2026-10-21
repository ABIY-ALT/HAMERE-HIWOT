'use client';

// The public contact form (app/(site)/contact/actions → sendContact).

import { useActionState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { sendContact, type ContactState } from '@/app/(site)/contact/actions';
import type { SiteLang } from './SiteShell';

export function ContactForm({ lang, departments }: { lang: SiteLang; departments: { id: string; name_en: string; name_am: string }[] }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, { status: 'idle' });
  const t = (am: string, en: string) => (lang === 'am' ? am : en);

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <CheckCircle2 className="text-emerald-600" size={28} />
        <h2 className="mt-3 font-bold text-lg">{t('መልእክትዎ ደርሷል', 'Your message has been sent')}</h2>
        <p className="mt-1 text-sm">{t('የሚመለከተው ክፍል በሰጡት ስልክ ቁጥር ይደውልልዎታል።', 'The department will call you back on the number you gave.')}</p>
      </div>
    );
  }

  const label = 'block text-sm font-semibold text-slate-700 mb-1';
  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(state.am, state.en)}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className={label}>{t('ሙሉ ስም', 'Full name')}</label>
          <input id="c-name" name="name" required minLength={2} maxLength={80} autoComplete="name" className="form-input" />
        </div>
        <div>
          <label htmlFor="c-phone" className={label}>{t('ስልክ ቁጥር', 'Phone number')}</label>
          <input id="c-phone" name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="09…" className="form-input" />
        </div>
      </div>
      <div>
        <label htmlFor="c-unit" className={label}>{t('ለየትኛው ክፍል?', 'Which department?')}</label>
        <select id="c-unit" name="unit_id" required defaultValue="" className="form-input">
          <option value="" disabled>{t('ይምረጡ…', 'Choose…')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{lang === 'am' ? d.name_am : d.name_en}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="c-message" className={label}>{t('ጥያቄዎ / መልእክትዎ', 'Your question / message')}</label>
        <textarea id="c-message" name="message" required minLength={5} maxLength={1500} rows={5} className="form-input" />
      </div>
      {/* People never see or fill this; robots do */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-60">
        <Send size={16} /> {pending ? t('በመላክ ላይ…', 'Sending…') : t('ላክ', 'Send')}
      </button>
    </form>
  );
}
