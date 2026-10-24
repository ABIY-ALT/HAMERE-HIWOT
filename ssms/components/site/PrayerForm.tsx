'use client';

// "Pray for me" on the public Contact page (app/(site)/contact/prayer-actions → sendPrayer).

import { useActionState } from 'react';
import { CheckCircle2, HeartHandshake } from 'lucide-react';
import { sendPrayer, type PrayerState } from '@/app/(site)/contact/prayer-actions';
import type { SiteLang } from './SiteShell';

export function PrayerForm({ lang, site }: { lang: SiteLang; /** Sunday school slug ('' = default) */ site: string }) {
  const [state, action, pending] = useActionState<PrayerState, FormData>(sendPrayer, { status: 'idle' });
  const t = (am: string, en: string) => (lang === 'am' ? am : en);

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <CheckCircle2 className="text-emerald-600" size={28} />
        <h3 className="mt-3 font-bold text-lg">{t('የጸሎት ጥያቄዎ ደርሷል', 'Your prayer request was received')}</h3>
        <p className="mt-1 text-sm">{t('እግዚአብሔር ይስማዎ። በጸሎት እናስብዎታለን።', 'May God hear you. We will remember you in prayer.')}</p>
      </div>
    );
  }

  const label = 'block text-sm font-semibold text-slate-700 mb-1';
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="site" value={site} />
      <div className="flex items-start gap-3">
        <HeartHandshake className="text-[var(--site-main)] shrink-0 mt-0.5" size={22} />
        <p className="text-sm text-slate-600">
          {t(
            'ጸሎት እንዲደረግልዎ የሚፈልጉትን ይጻፉ። ስምና ስልክ መስጠት አይጠበቅብዎትም። ጥያቄዎ የሚታየው ለጥቂት አገልጋዮች ብቻ ነው።',
            'Write what you would like us to pray for. You do not have to give your name or phone. Only a few servants see your request.'
          )}
        </p>
      </div>
      {state.status === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(state.am, state.en)}</p>}
      <div>
        <label htmlFor="p-request" className={label}>{t('የጸሎት ጥያቄዎ', 'Your prayer request')}</label>
        <textarea id="p-request" name="request" required minLength={3} maxLength={1500} rows={4} className="form-input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className={label}>{t('ስም (አማራጭ)', 'Name (optional)')}</label>
          <input id="p-name" name="name" maxLength={80} autoComplete="name" className="form-input" />
        </div>
        <div>
          <label htmlFor="p-phone" className={label}>{t('ስልክ (አማራጭ)', 'Phone (optional)')}</label>
          <input id="p-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09…" className="form-input" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="wants_call" className="h-4 w-4" />
        {t('እንዲደወልልኝ እፈልጋለሁ', 'I would like someone to call me')}
      </label>
      {/* People never see or fill this; robots do */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="p-website">Website</label>
        <input id="p-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-60">
        <HeartHandshake size={16} /> {pending ? t('በመላክ ላይ…', 'Sending…') : t('ላክ', 'Send')}
      </button>
    </form>
  );
}
