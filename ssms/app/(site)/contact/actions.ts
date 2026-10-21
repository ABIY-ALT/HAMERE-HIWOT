'use server';

// ─────────────────────────────────────────────────────────────────────────────
// The public contact form (no sign-in): a question to a department, saved as
// a member question from the website (migration 038 — no Telegram chat, a
// phone number instead). The department sees it on Members' questions and
// calls back. Against misuse: a hidden field people never fill, at most
// MAX_PER_PHONE a day from one number and MAX_PER_ADDRESS an hour from one
// address, and only the departments the form offers.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { notifyLater } from '@/lib/push/send';

export type ContactState = { status: 'idle' } | { status: 'sent' } | { status: 'error'; am: string; en: string };

const MAX_PER_PHONE = 3;
const MAX_PER_ADDRESS = 5;
const MAX_LENGTH = 1500;

/** Recent sends per address (this server only; resets on restart — the per-phone limit is in the database) */
const recent = new Map<string, number[]>();

function tooMany(address: string): boolean {
  const hourAgo = Date.now() - 3_600_000;
  const times = (recent.get(address) ?? []).filter((t) => t > hourAgo);
  if (times.length >= MAX_PER_ADDRESS) return true;
  times.push(Date.now());
  recent.set(address, times);
  if (recent.size > 5000) recent.clear();
  return false;
}

const fail = (am: string, en: string): ContactState => ({ status: 'error', am, en });

const Form = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().transform(normalizePhone).refine(isValidPhone),
  // Seeded units have hand-made ids that a strict uuid check would refuse
  unit_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  message: z.string().trim().min(5).max(MAX_LENGTH),
});

export async function sendContact(_prev: ContactState, form: FormData): Promise<ContactState> {
  // Filled only by robots (the field is hidden from people)
  if (String(form.get('website') ?? '') !== '') return { status: 'sent' };
  const parsed = Form.safeParse({
    name: form.get('name') ?? '',
    phone: form.get('phone') ?? '',
    unit_id: form.get('unit_id') ?? '',
    message: form.get('message') ?? '',
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === 'name') return fail('ስምዎን ያስገቡ።', 'Please enter your name.');
    if (field === 'phone') return fail('ትክክለኛ ስልክ ቁጥር ያስገቡ (09… ወይም 07…)።', 'Please enter a valid phone number (09… or 07…).');
    if (field === 'unit_id') return fail('ክፍል ይምረጡ።', 'Please choose a department.');
    return fail('ጥያቄዎን ይጻፉ።', 'Please write your question.');
  }
  if (!isSupabaseEnabled()) return fail('ድረ-ገጹ ለሙከራ ብቻ ነው፤ መልእክቱ አልተላከም።', 'The site is in demo mode — the message was not sent.');

  const h = await headers();
  const address = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (tooMany(address)) return fail('ብዙ መልእክቶች ተልከዋል፤ ትንሽ ቆይተው ይሞክሩ።', 'Too many messages — please try again a little later.');

  const { name, phone, unit_id, message } = parsed.data;
  try {
    const db = createAdminClient();
    const { data: unit } = await db.from('organization_units')
      .select('id, name_en')
      .eq('id', unit_id)
      .eq('is_active', true)
      .in('unit_type', ['DEPARTMENT', 'COORDINATION'])
      .maybeSingle();
    if (!unit) return fail('ክፍል ይምረጡ።', 'Please choose a department.');

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from('member_questions').select('id', { count: 'exact', head: true }).eq('contact_phone', phone).gte('created_at', dayAgo);
    if ((count ?? 0) >= MAX_PER_PHONE) {
      return fail(`ከዚህ ቁጥር ዛሬ ${MAX_PER_PHONE} መልእክቶች ተልከዋል፤ ነገ እንደገና ይሞክሩ።`, `${MAX_PER_PHONE} messages were already sent from this number today — please try again tomorrow.`);
    }

    const { error } = await db.from('member_questions').insert({
      unit_id,
      chat_id: null,
      person_id: null,
      asker_name: name,
      contact_phone: phone,
      source: 'WEB',
      question: message,
    });
    if (error) {
      console.error('contact form not saved:', error.message);
      return fail('ይቅርታ፣ መልእክቱ አልተላከም። ትንሽ ቆይተው ይሞክሩ።', 'Sorry, the message could not be sent. Please try again later.');
    }
    notifyLater(
      { units: { ids: [unit_id], holding: 'TASK_REPORT' } },
      { title: 'አዲስ ጥያቄ ከድረ-ገጽ · A question from the website', body: `${name} (${phone}): ${message.slice(0, 120)}`, url: '/dashboard/questions', tag: 'member-questions' }
    );
    return { status: 'sent' };
  } catch (e) {
    console.error('contact form failed', e);
    return fail('ይቅርታ፣ መልእክቱ አልተላከም። ትንሽ ቆይተው ይሞክሩ።', 'Sorry, the message could not be sent. Please try again later.');
  }
}
