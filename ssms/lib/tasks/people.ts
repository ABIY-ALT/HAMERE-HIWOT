// ─────────────────────────────────────────────────────────────────────────────
// People in a department, and telling one of them about their task — server
// only (migration 035). A department's people are:
//   • members whose member form names it as their department (assigned_unit_id)
//   • servants assigned to it (HR → service assignments)
//   • accounts with a role in it (user_unit_assignments)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater, type PushMessage } from '@/lib/push/send';
import { escapeHtml, siteUrl, telegramLater, telegramToPersons } from '@/lib/telegram/bot';
import type { TaskPerson } from './types';

type Named = { id: string; full_name_en: string; full_name_am: string | null; status?: string };
const one = <T>(x: unknown) => (Array.isArray(x) ? x[0] : x) as T | null;

/** unit id → its people, by name. Missing tables (older databases) just give fewer people. */
export async function unitPeople(db: SupabaseClient, unitIds: string[]): Promise<Record<string, TaskPerson[]>> {
  const out: Record<string, TaskPerson[]> = {};
  if (unitIds.length === 0) return out;
  const [members, servants, accounts] = await Promise.all([
    db.from('persons').select('id, full_name_en, full_name_am, assigned_unit_id').in('assigned_unit_id', unitIds).eq('status', 'ACTIVE'),
    db.from('service_assignments').select('person_id, unit_id').in('unit_id', unitIds).eq('status', 'ACTIVE'),
    db.from('user_unit_assignments')
      .select('organization_unit_id, user:system_users!user_unit_assignments_system_user_id_fkey(person_id, is_active)')
      .in('organization_unit_id', unitIds)
      .eq('is_active', true),
  ]);
  const pairs: [string, string][] = [];
  const names = new Map<string, string>();
  for (const p of (members.data ?? []) as (Named & { assigned_unit_id: string })[]) {
    pairs.push([p.assigned_unit_id, p.id]);
    names.set(p.id, p.full_name_am || p.full_name_en);
  }
  for (const s of (servants.data ?? []) as { person_id: string; unit_id: string }[]) pairs.push([s.unit_id, s.person_id]);
  for (const a of (accounts.data ?? []) as { organization_unit_id: string; user: unknown }[]) {
    const u = one<{ person_id: string; is_active: boolean }>(a.user);
    if (u?.is_active) pairs.push([a.organization_unit_id, u.person_id]);
  }
  const unnamed = [...new Set(pairs.map(([, id]) => id).filter((id) => !names.has(id)))];
  if (unnamed.length) {
    const { data } = await db.from('persons').select('id, full_name_en, full_name_am, status').in('id', unnamed);
    for (const p of (data ?? []) as Named[]) if (p.status === 'ACTIVE') names.set(p.id, p.full_name_am || p.full_name_en);
  }
  for (const [unit, person] of pairs) {
    const name = names.get(person);
    if (!name) continue;
    const list = (out[unit] ??= []);
    if (!list.some((x) => x.id === person)) list.push({ id: person, name });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Is this person one of the unit's people? */
export async function inUnit(db: SupabaseClient, unitId: string, personId: string): Promise<boolean> {
  return ((await unitPeople(db, [unitId]))[unitId] ?? []).some((p) => p.id === personId);
}

/**
 * Tell a person about their task: with a website account by push + their
 * Telegram; without one, on Telegram only. Sent after the response.
 */
export async function tellPerson(db: SupabaseClient, personId: string, message: PushMessage) {
  const { data } = await db.from('system_users').select('id').eq('person_id', personId).eq('is_active', true);
  const users = ((data ?? []) as { id: string }[]).map((u) => u.id);
  if (users.length) return notifyLater({ users }, message);
  const html = `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}\n${escapeHtml('በቦቱ «🗂️ ተግባሮቼ» ይጫኑ · Tap “🗂️ My tasks” in the bot')}\n${siteUrl()}`;
  telegramLater((bg) => telegramToPersons(bg, [personId], html, 'SELF'));
}
