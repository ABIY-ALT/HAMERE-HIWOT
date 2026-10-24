'use client';

// "Register" under a public event (app/(site)/events/actions → signUpForEvent).
// After signing up the ticket is shown: its code and a QR code to show at the
// entrance.

import { useActionState, useState } from 'react';
import { CheckCircle2, Ticket, Users } from 'lucide-react';
import { signUpForEvent, type SignupState } from '@/app/(site)/events/actions';
import { QrCode } from '@/components/common/QrCode';
import { MAX_SEATS_SELF } from '@/lib/events/types';
import type { SiteLang } from './SiteShell';

export function EventSignup({ eventId, left, lang, site }: { eventId: string; /** Places left; null = no limit */ left: number | null; lang: SiteLang; /** Sunday school slug ('' = default) */ site: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SignupState, FormData>(signUpForEvent, { status: 'idle' });
  const t = (am: string, en: string) => (lang === 'am' ? am : en);
  const max = Math.min(MAX_SEATS_SELF, left ?? MAX_SEATS_SELF);

  if (state.status === 'done') {
    return (
      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="text-emerald-600" size={20} /> {t('ተመዝግበዋል!', 'You are registered!')}
        </div>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="rounded-xl bg-white p-3 self-start shadow-sm">
            <QrCode value={state.ticket} size={132} />
          </div>
          <div className="space-y-1 text-sm">
            <div>{t('የመግቢያ ኮድ', 'Ticket code')}</div>
            <div className="font-mono text-3xl font-bold tracking-[0.2em] text-slate-900">{state.ticket}</div>
            <div>
              {state.name}
              {state.seats > 1 ? ` · ${state.seats} ${t('ሰዎች', 'people')}` : ''}
            </div>
            <p className="pt-1 text-xs text-emerald-800">
              {t(
                'ይህን ገጽ ፎቶ ያንሡ (screenshot) ወይም ኮዱን ይጻፉ፤ በመግቢያው ላይ ያሳዩ። ስልክዎን ለቴሌግራም ቦታችን ካጋሩ ትኬቱ እዚያም ይደርስዎታል።',
                'Take a screenshot or write the code down, and show it at the entrance. If your phone is connected to our Telegram bot, the ticket is sent there too.'
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (left === 0) {
    return <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{t('ቦታው ሞልቷል', 'This event is full')}</p>;
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary text-sm inline-flex items-center gap-2">
          <Ticket size={16} /> {t('ይመዝገቡ', 'Register')}
        </button>
        {left !== null && left <= 50 && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <Users size={13} /> {t(`${left} ቦታ ቀርቷል`, `${left} place(s) left`)}
          </span>
        )}
      </div>
    );
  }

  const label = 'block text-xs font-semibold text-slate-700 mb-1';
  return (
    <form action={action} className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="site" value={site} />
      <input type="hidden" name="program_id" value={eventId} />
      {state.status === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(state.am, state.en)}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
        <div>
          <label htmlFor={`s-name-${eventId}`} className={label}>{t('ሙሉ ስም', 'Full name')}</label>
          <input id={`s-name-${eventId}`} name="name" required minLength={2} maxLength={80} autoComplete="name" className="form-input" />
        </div>
        <div>
          <label htmlFor={`s-phone-${eventId}`} className={label}>{t('ስልክ ቁጥር', 'Phone number')}</label>
          <input id={`s-phone-${eventId}`} name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="09…" className="form-input" />
        </div>
        <div>
          <label htmlFor={`s-seats-${eventId}`} className={label}>{t('ስንት ሰው?', 'How many?')}</label>
          <select id={`s-seats-${eventId}`} name="seats" defaultValue="1" className="form-input">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      {/* People never see or fill this; robots do */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`s-website-${eventId}`}>Website</label>
        <input id={`s-website-${eventId}`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60">
          <Ticket size={16} /> {pending ? t('በመመዝገብ ላይ…', 'Registering…') : t('ተመዝገብ', 'Register')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary text-sm">{t('ተወው', 'Close')}</button>
      </div>
    </form>
  );
}
