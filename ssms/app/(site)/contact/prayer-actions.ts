'use server';

// ─────────────────────────────────────────────────────────────────────────────
// "Pray for me" on the public website's Contact page (no sign-in, migration
// 048). A name and phone only if the person wants to give them. Saved as a
// private prayer request that only the website managers see (Public Website
// → Prayer requests); they are told one arrived, without its words. Against
// misuse: a hidden field people never fill, at most MAX_PER_ADDRESS an hour
// from one address and MAX_PER_PHONE a day from one number.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { tenantClient } from '@/lib/tenant/db';
import { defaultTenant, loadTenantAccess, tenantBySlug } from '@/lib/tenant/context';
import { runInTenant } from '@/lib/tenant/scope';
import { rateLimit, requestIp } from '@/lib/security/rate-limit';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { notifyLater } from '@/lib/push/send';

export type PrayerState = { status: 'idle' } | { status: 'sent' } | { status: 'error'; am: string; en: string };

const MAX_PER_ADDRESS = 5;
const MAX_PER_PHONE = 3;

const fail = (am: string, en: string): PrayerState => ({ status: 'error', am, en });

const Form = z
  .object({
    name: z.string().trim().max(80),
    phone: z.string().trim().transform((v) => (v ? normalizePhone(v) : '')).refine((v) => v === '' || isValidPhone(v)),
    request: z.string().trim().min(3).max(1500),
    wants_call: z.boolean(),
  })
  .refine((f) => !f.wants_call || f.phone !== '', { path: ['phone'] });

export async function sendPrayer(_prev: PrayerState, form: FormData): Promise<PrayerState> {
  // Filled only by robots (the field is hidden from people)
  if (String(form.get('website') ?? '') !== '') return { status: 'sent' };
  const parsed = Form.safeParse({
    name: form.get('name') ?? '',
    phone: form.get('phone') ?? '',
    request: form.get('request') ?? '',
    wants_call: form.get('wants_call') === 'on',
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === 'phone') return fail('ትክክለኛ ስልክ ቁጥር ያስገቡ (09… ወይም 07…)፤ እንዲደወልልዎ ከፈለጉ ስልክ ያስፈልጋል።', 'Please enter a valid phone number (09… or 07…) — it is needed if you want a call back.');
    if (field === 'request') return fail('የጸሎት ጥያቄዎን ይጻፉ።', 'Please write your prayer request.');
    return fail('ይቅርታ፣ አልተላከም።', 'Sorry, it could not be sent.');
  }
  if (!isSupabaseEnabled()) return fail('ድረ-ገጹ ለሙከራ ብቻ ነው፤ አልተላከም።', 'The site is in demo mode — nothing was sent.');
  if (!(await rateLimit(`prayer-ip:${await requestIp()}`, MAX_PER_ADDRESS, 3600))) {
    return fail('ብዙ ጥያቄዎች ተልከዋል፤ ትንሽ ቆይተው ይሞክሩ።', 'Too many requests — please try again a little later.');
  }

  const { name, phone, request, wants_call } = parsed.data;
  try {
    const slug = String(form.get('site') ?? '');
    const tenant = slug ? await tenantBySlug(slug) : await defaultTenant();
    if (!tenant) return fail('ይቅርታ፣ አልተላከም።', 'Sorry, it could not be sent.');
    const access = await loadTenantAccess(tenant.id);
    if (access.mode !== 'full' || !access.modules.includes('website')) return fail('ለጊዜው ተዘግቷል።', 'This is closed for now.');
    const db = tenantClient(tenant.id);
    if (phone) {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await db.from('prayer_requests').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', dayAgo);
      if ((count ?? 0) >= MAX_PER_PHONE) return fail('ከዚህ ቁጥር ዛሬ በቂ ጥያቄዎች ተልከዋል፤ ነገ እንደገና ይሞክሩ።', 'Enough requests were sent from this number today — please try again tomorrow.');
    }
    const { error } = await db.from('prayer_requests').insert({ name: name || null, phone: phone || null, request, wants_call });
    if (error) {
      console.error('prayer request not saved:', error.message);
      return fail('ይቅርታ፣ አልተላከም። ትንሽ ቆይተው ይሞክሩ።', 'Sorry, it could not be sent. Please try again later.');
    }
    runInTenant(tenant.id, () =>
      notifyLater(
        { permissions: ['WEBSITE_MANAGE'] },
        {
          title: '🙏 የጸሎት ጥያቄ · A prayer request',
          // Never the words of the request: notices travel by push and Telegram
          body: wants_call ? `${name || 'Someone'} would like a call back` : `From ${name || 'someone who did not give a name'}`,
          url: '/dashboard/website/prayers',
          tag: 'prayer-requests',
          kind: 'questions',
        }
      )
    );
    return { status: 'sent' };
  } catch (e) {
    console.error('prayer request failed', e);
    return fail('ይቅርታ፣ አልተላከም። ትንሽ ቆይተው ይሞክሩ።', 'Sorry, it could not be sent. Please try again later.');
  }
}
