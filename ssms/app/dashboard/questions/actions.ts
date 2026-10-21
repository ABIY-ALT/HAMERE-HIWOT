'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Members' questions (migration 033): asked in the Telegram bot ("✉️ Ask a
// department"), answered here; the answer goes back to the asker's chat.
// From migration 038 also from the public website's contact form: no chat,
// a phone number instead — the department calls them back.
//   TASK_REPORT     their own units' questions: answer, close
//   TASK_ASSIGN     every unit's
//   AUDIT_VIEW_ALL  read
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorizeIn, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { escapeHtml, sendTelegram, telegramConfigured } from '@/lib/telegram/bot';

type Row = Record<string, unknown>;

export interface MemberQuestion {
  id: string;
  unit_id: string;
  asker: string;
  /** Asked on the public website: the number to call back (no Telegram chat) */
  phone: string;
  source: 'BOT' | 'WEB';
  question: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  answer: string;
  answered_by: string;
  answered_at: string | null;
  created_at: string;
}

export interface QuestionsData {
  units: { id: string; name_en: string; name_am: string }[];
  questions: MemberQuestion[];
  /** Units whose questions this user may answer */
  answerable: string[];
}

const MIGRATION = 'Run database migration 033 (questions to departments) first';
const missing = (m: string) => (/member_questions/.test(m) ? MIGRATION : m);
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const seesAll = (me: SessionUser) => me.permissions.includes('TASK_ASSIGN') || me.permissions.includes('AUDIT_VIEW_ALL');
const canAnswer = (me: SessionUser, unitId: string) =>
  me.permissions.includes('TASK_ASSIGN') || (me.permissions.includes('TASK_REPORT') && me.organizationIds.includes(unitId));

export async function loadQuestions(): Promise<Loaded<QuestionsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT', 'AUDIT_VIEW_ALL');
    const unitRows = (await db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check)) as Row[];
    const mine = me.organizationIds.filter(isUuid);
    const units = unitRows
      .filter((u) => seesAll(me) || mine.includes(u.id as string))
      .map((u) => ({ id: u.id as string, name_en: u.name_en as string, name_am: (u.name_am as string) || (u.name_en as string) }));
    const ids = units.map((u) => u.id);
    const rows = ids.length
      ? await selectAll<Row>((a, b) => db.from('member_questions').select('*').in('unit_id', ids).order('created_at', { ascending: false }).range(a, b))
      : [];
    const answerers = [...new Set(rows.map((r) => r.answered_by as string).filter(Boolean))];
    const { data: people } = answerers.length
      ? await db.from('system_users').select('id, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)').in('id', answerers)
      : { data: [] };
    const nameOf = new Map(
      ((people ?? []) as Row[]).map((u) => {
        const p = (Array.isArray(u.person) ? u.person[0] : u.person) as { full_name_en?: string; full_name_am?: string | null } | null;
        return [u.id as string, p?.full_name_am || p?.full_name_en || ''];
      })
    );
    const questions: MemberQuestion[] = rows
      .map((r) => ({
        id: r.id as string,
        unit_id: r.unit_id as string,
        asker: (r.asker_name as string) ?? '',
        phone: (r.contact_phone as string) ?? '',
        source: (r.source === 'WEB' ? 'WEB' : 'BOT') as MemberQuestion['source'],
        question: r.question as string,
        status: r.status as MemberQuestion['status'],
        answer: (r.answer as string) ?? '',
        answered_by: nameOf.get(r.answered_by as string) ?? '',
        answered_at: (r.answered_at as string) ?? null,
        created_at: r.created_at as string,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { mode: 'live', data: { units, questions, answerable: ids.filter((id) => canAnswer(me, id)) } };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

async function question(db: Awaited<ReturnType<typeof authorizeIn>>['db'], me: SessionUser, id: string) {
  const q = (await db.from('member_questions').select('*').eq('id', z.string().min(1).parse(id)).maybeSingle().then(check)) as Row | null;
  if (!q) throw new Error('This question was not found — reload the page');
  if (!canAnswer(me, q.unit_id as string)) throw new Error('Only the department’s heads can answer it');
  return q;
}

/** Answer (or correct an answer); the answer is sent to the asker in the bot (website questions: kept only — call them back). */
export async function answerQuestion(id: string, answer: string): Promise<{ ok: true; delivered: boolean; web: boolean } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const text = z.string().trim().min(2, 'Write the answer').max(3000).parse(answer);
    const q = await question(db, me, id);
    await db.from('member_questions')
      .update({ status: 'ANSWERED', answer: text, answered_by: me.systemUser.id, answered_at: new Date().toISOString() })
      .eq('id', q.id as string)
      .then(check);
    let delivered = false;
    const web = !q.chat_id;
    if ((await telegramConfigured()) && !web) {
      const { data: unit } = await db.from('organization_units').select('name_en, name_am').eq('id', q.unit_id as string).maybeSingle();
      const u = unit as { name_en: string; name_am: string | null } | null;
      const html =
        `✉️ <b>መልስ · Answer</b> — ${escapeHtml(u?.name_am || u?.name_en || '')}\n\n` +
        `❓ ${escapeHtml(String(q.question).slice(0, 500))}\n\n` +
        `💬 ${escapeHtml(text)}`;
      delivered = (await sendTelegram(Number(q.chat_id), html)) === 'ok';
    }
    return { ok: true, delivered, web };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Close without an answer (e.g. not a real question). */
export async function closeQuestion(id: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const q = await question(db, me, id);
    await db.from('member_questions').update({ status: 'CLOSED' }).eq('id', q.id as string).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
