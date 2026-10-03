'use server';

// ─────────────────────────────────────────────────────────────────────────────
// My profile: the signed-in user's own record, where they serve, their
// permissions, contact details they may change, and their password.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { env } from '@/lib/env';
import { createSessionClient } from '@/lib/supabase/server';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { ROLE_KINDS, type RoleKind } from '@/lib/hr/types';

export interface MyProfile {
  person: Person;
  username: string;
  lastLogin: string | null;
  /** System access: role in a unit. */
  access: { role: string; role_am: string; unit: string; unit_am: string }[];
  /** HR service assignments now in force. */
  service: { role: string; role_am: string; unit: string; unit_am: string; class_name: string; since: string }[];
  governance: { body: string; body_am: string; position: string; position_am: string; since: string }[];
  choir: { voice: string; since: string | null } | null;
  permissions: { code: string; name_en: string; name_am: string; category: string }[];
}

type Named = { name_en?: string; name_am?: string | null } | null;
const en = (x: unknown) => (x as Named)?.name_en ?? '—';
const am = (x: unknown) => (x as Named)?.name_am || (x as Named)?.name_en || '—';

/** Reads an optional area; a table that doesn't exist yet gives an empty list. */
async function optional<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  return error ? [] : (data ?? []);
}

export async function loadMyProfile(): Promise<Loaded<MyProfile>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    type Row = Record<string, unknown>;
    const [access, service, governance, choir, permissions] = await Promise.all([
      db.from('user_unit_assignments')
        .select('role:roles(name_en, name_am), unit:organization_units(name_en, name_am)')
        .eq('system_user_id', me.systemUser.id)
        .eq('is_active', true)
        .then(check) as Promise<Row[]>,
      optional<Row>(
        db.from('service_assignments')
          .select('role_kind, title, start_date, unit:organization_units(name_en, name_am), class:classes(name_en)')
          .eq('person_id', me.person.id)
          .eq('status', 'ACTIVE')
          .order('start_date')
      ),
      optional<Row>(
        db.from('governance_memberships')
          .select('term_start, body:governance_bodies(name_en, name_am), position:governance_positions(name_en, name_am)')
          .eq('person_id', me.person.id)
          .eq('status', 'ACTIVE')
      ),
      optional<Row>(db.from('choir_members').select('voice_part, joined_on, status').eq('person_id', me.person.id)),
      me.permissions.length
        ? (db.from('permissions').select('code, name_en, name_am, category').in('code', me.permissions).order('category').order('code').then(check) as Promise<MyProfile['permissions']>)
        : Promise.resolve([] as MyProfile['permissions']),
    ]);
    const singing = choir.find((c) => c.status === 'ACTIVE');

    return {
      mode: 'live',
      data: {
        person: me.person,
        username: me.systemUser.username,
        lastLogin: me.systemUser.last_login_at ?? null,
        access: access.map((a) => ({ role: en(a.role), role_am: am(a.role), unit: en(a.unit), unit_am: am(a.unit) })),
        service: service.map((s) => {
          const kind = ROLE_KINDS[s.role_kind as RoleKind] ?? [String(s.role_kind), String(s.role_kind)];
          return {
            role: (s.title as string) || kind[0],
            role_am: (s.title as string) || kind[1],
            unit: en(s.unit),
            unit_am: am(s.unit),
            class_name: ((s.class as { name_en?: string } | null)?.name_en) ?? '',
            since: s.start_date as string,
          };
        }),
        governance: governance.map((g) => ({ body: en(g.body), body_am: am(g.body), position: en(g.position), position_am: am(g.position), since: g.term_start as string })),
        choir: singing ? { voice: singing.voice_part as string, since: (singing.joined_on as string) ?? null } : null,
        permissions,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const optionalText = z.string().trim().max(200).transform((v) => v || null);

const ContactSchema = z.object({
  phone_secondary: optionalText,
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid e-mail address')
    .transform((v) => v || null),
  address: optionalText,
  father_of_confession: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
});

export type ContactInput = z.input<typeof ContactSchema>;

/** Anyone signed in may update their own contact details (not their name or sign-in phone). */
export async function updateMyContact(input: ContactInput): Promise<ActionResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Demo mode — connect the database to save changes.' };
  try {
    const { me, db } = await authorize();
    const c = ContactSchema.parse(input);
    await db.from('persons').update(c).eq('id', me.person.id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Checks the current password, then sets the new one. */
export async function changeMyPassword(current: string, next: string): Promise<ActionResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Demo mode — passwords cannot be changed.' };
  try {
    if (next.length < 8) throw new Error('The new password must be at least 8 characters');
    if (next === current) throw new Error('Choose a password different from the current one');
    const { me, db } = await authorize();
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user?.email) throw new Error('Your session has expired. Please sign in again.');

    // Verify the current password on a throw-away client, so the browser session is untouched
    const verifier = createClient(env.supabaseUrl()!, env.supabaseAnonKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: wrong } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
    if (wrong) throw new Error('The current password is not correct');
    await verifier.auth.signOut({ scope: 'local' });

    const { error } = await db.auth.admin.updateUserById(user.id, { password: next });
    if (error) throw new Error(error.message);

    // Record that the password changed (never the password itself)
    const h = await headers();
    await db.from('system_audit_logs').insert({
      user_id: me.systemUser.id,
      action: 'UPDATE',
      table_name: 'system_users',
      record_id: me.systemUser.id,
      new_values: { change: 'password' },
      user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
