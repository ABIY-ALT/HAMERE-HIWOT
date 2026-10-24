'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Signing up for an event from the public website (no sign-in, migration 046).
// Only programs that are on the website (is_public) and open for sign-up;
// the database guard checks the closing day and the seats. Against misuse: a
// hidden field people never fill, at most MAX_PER_ADDRESS sign-ups an hour
// from one address, one live registration per phone number and event. The
// ticket is shown on the page, and sent to the Telegram chat that shared the
// same phone number, if there is one.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { tenantClient } from '@/lib/tenant/db';
import { defaultTenant, loadTenantAccess, tenantBySlug } from '@/lib/tenant/context';
import { runInTenant } from '@/lib/tenant/scope';
import { rateLimit, requestIp } from '@/lib/security/rate-limit';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { telegramLater } from '@/lib/telegram/bot';
import { createRegistration, isMissingTable, sendTicket } from '@/lib/events/registrations';
import { MAX_SEATS_SELF, failureText } from '@/lib/events/types';

export type SignupState =
  | { status: 'idle' }
  | { status: 'done'; ticket: string; name: string; seats: number }
  | { status: 'error'; am: string; en: string };

const MAX_PER_ADDRESS = 8;

const fail = (am: string, en: string): SignupState => ({ status: 'error', am, en });

const Form = z.object({
  program_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().transform(normalizePhone).refine(isValidPhone),
  seats: z.coerce.number().int().min(1).max(MAX_SEATS_SELF),
});

export async function signUpForEvent(_prev: SignupState, form: FormData): Promise<SignupState> {
  // Filled only by robots (the field is hidden from people)
  if (String(form.get('website') ?? '') !== '') return fail('ይቅርታ፣ ምዝገባው አልተሳካም።', 'Sorry, the registration did not go through.');
  const parsed = Form.safeParse({
    program_id: form.get('program_id') ?? '',
    name: form.get('name') ?? '',
    phone: form.get('phone') ?? '',
    seats: form.get('seats') ?? '1',
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === 'name') return fail('ስምዎን ያስገቡ።', 'Please enter your name.');
    if (field === 'phone') return fail('ትክክለኛ ስልክ ቁጥር ያስገቡ (09… ወይም 07…)።', 'Please enter a valid phone number (09… or 07…).');
    if (field === 'seats') return fail(`ከ1 እስከ ${MAX_SEATS_SELF} ሰው መመዝገብ ይቻላል።`, `You can register 1 to ${MAX_SEATS_SELF} people.`);
    return fail('ይቅርታ፣ ምዝገባው አልተሳካም።', 'Sorry, the registration did not go through.');
  }
  if (!isSupabaseEnabled()) return fail('ድረ-ገጹ ለሙከራ ብቻ ነው፤ ምዝገባው አልተቀመጠም።', 'The site is in demo mode — nothing was saved.');

  if (!(await rateLimit(`event-signup-ip:${await requestIp()}`, MAX_PER_ADDRESS, 3600))) {
    return fail('ብዙ ምዝገባዎች ተልከዋል፤ ትንሽ ቆይተው ይሞክሩ።', 'Too many sign-ups — please try again a little later.');
  }

  const { program_id, name, phone, seats } = parsed.data;
  try {
    const slug = String(form.get('site') ?? '');
    const tenant = slug ? await tenantBySlug(slug) : await defaultTenant();
    if (!tenant) return fail('ይቅርታ፣ ምዝገባው አልተሳካም።', 'Sorry, the registration did not go through.');
    const access = await loadTenantAccess(tenant.id);
    if (access.mode !== 'full' || !access.modules.includes('website')) {
      return fail('ምዝገባ ለጊዜው ተዘግቷል።', 'Sign-up is closed for now.');
    }
    return await runInTenant(tenant.id, async () => {
      const db = tenantClient(tenant.id);
      const { data: program, error } = await db
        .from('programs')
        .select('id, title_en, title_am, start_date, start_time, location')
        .eq('id', program_id)
        .eq('is_public', true)
        .eq('registration_open', true)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error.message)) return { status: 'error', ...failureText('MIGRATION') } as SignupState;
        throw new Error(error.message);
      }
      if (!program) return { status: 'error', ...failureText('CLOSED') } as SignupState;

      const res = await createRegistration(db, { programId: program_id, name, phone, seats, source: 'WEB' });
      if (!res.ok) return { status: 'error', ...failureText(res.reason, res.left) } as SignupState;
      const p = program as { title_en: string; title_am: string | null; start_date: string; start_time: string | null; location: string | null };
      telegramLater((tdb) => sendTicket(tdb, p, { ticket: res.ticket, name, seats, phone, chat_id: null }));
      return { status: 'done', ticket: res.ticket, name, seats } as SignupState;
    });
  } catch (e) {
    console.error('event sign-up failed', e);
    return fail('ይቅርታ፣ ምዝገባው አልተሳካም። ትንሽ ቆይተው ይሞክሩ።', 'Sorry, the registration did not go through. Please try again later.');
  }
}
