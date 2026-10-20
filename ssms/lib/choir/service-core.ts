// ─────────────────────────────────────────────────────────────────────────────
// Service roster and vestments — server only (migration 037). What a member
// sees of their own service ("My service" on the website and "🎵 My service"
// in the bot), answering an assignment, and the messages the bot sends.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater } from '@/lib/push/send';
import { escapeHtml, siteUrl } from '@/lib/telegram/bot';
import { addisDate } from '@/lib/checkin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { WEEKS, vestmentLabel, windowStart, type MyService, type ServiceResponse } from './service';
export type { MyService, MyServiceItem } from './service';

const e = escapeHtml;

type SessionRow = { id: string; session_date: string; start_time: string | null; kind: string; title: string | null; location: string | null };

export const sessionTitle = (s: Pick<SessionRow, 'title' | 'kind'>) =>
  s.title || (s.kind === 'PERFORMANCE' ? 'ዝግጅት · Performance' : 'አገልግሎት · Service');

const today = () => addisDate(new Date().toISOString());

/** One person's service: rosters, rehearsal attendance and vestments they hold. */
export async function myService(db: SupabaseClient, personId: string): Promise<MyService> {
  const [{ data: memberRows }, { data: person }, { data: loanRows, error: loanError }] = await Promise.all([
    db.from('choir_members').select('id, status').eq('person_id', personId),
    db.from('persons').select('full_name_en, full_name_am').eq('id', personId).maybeSingle(),
    db.from('vestment_loans')
      .select('id, due_on, vestment:vestments(code, kind, size), session:choir_sessions(title, kind, session_date)')
      .eq('person_id', personId)
      .is('returned_at', null)
      .order('due_on'),
  ]);
  if (loanError) throw new Error(loanError.message);
  const p = person as { full_name_en: string; full_name_am: string | null } | null;
  const now = today();
  const holding = ((loanRows ?? []) as Record<string, unknown>[]).map((l) => {
    const v = l.vestment as { code: string; kind: string; size: string | null } | null;
    const s = l.session as { title: string | null; kind: string; session_date: string } | null;
    return {
      id: l.id as string,
      vestment: v ? vestmentLabel(v) : '—',
      due_on: l.due_on as string,
      overdue: (l.due_on as string) < now,
      session: s ? `${sessionTitle(s)} · ${formatEthiopianDate(s.session_date, 'am')}` : '',
    };
  });
  const member = ((memberRows ?? []) as { id: string; status: string }[])[0];
  const empty = { held: 0, counted: 0, came: 0, rate: null };
  const base = { name: p?.full_name_am || p?.full_name_en || '', holding };
  if (!member || member.status !== 'ACTIVE') return { in_choir: false, upcoming: [], rehearsals: empty, ...base };

  const from = windowStart(now, WEEKS);
  const [{ data: sessions, error }, { data: rehearsals }] = await Promise.all([
    db.from('choir_sessions')
      .select('id, session_date, start_time, kind, title, location')
      .eq('roster_status', 'PUBLISHED')
      .eq('status', 'PLANNED')
      .gte('session_date', now)
      .order('session_date')
      .limit(10),
    db.from('choir_sessions').select('id').eq('kind', 'REHEARSAL').eq('status', 'HELD').gte('session_date', from).lte('session_date', now),
  ]);
  if (error) throw new Error(error.message);
  const upcomingRows = (sessions ?? []) as SessionRow[];
  const rehearsalIds = ((rehearsals ?? []) as { id: string }[]).map((r) => r.id);
  const [{ data: mine }, { data: marks }] = await Promise.all([
    upcomingRows.length
      ? db.from('service_roster').select('id, session_id, role, response, response_note').eq('member_id', member.id).in('session_id', upcomingRows.map((s) => s.id))
      : Promise.resolve({ data: [] }),
    rehearsalIds.length ? db.from('choir_attendance').select('status').eq('member_id', member.id).in('session_id', rehearsalIds) : Promise.resolve({ data: [] }),
  ]);
  const bySession = new Map(((mine ?? []) as { id: string; session_id: string; role: string | null; response: ServiceResponse; response_note: string | null }[]).map((a) => [a.session_id, a]));
  const counted = ((marks ?? []) as { status: string }[]).filter((m) => m.status !== 'EXCUSED');
  const came = counted.filter((m) => m.status === 'PRESENT' || m.status === 'LATE').length;
  return {
    in_choir: true,
    ...base,
    upcoming: upcomingRows.map((s) => {
      const a = bySession.get(s.id);
      return {
        assignment_id: a?.id ?? null,
        session_id: s.id,
        date: s.session_date,
        time: (s.start_time ?? '').slice(0, 5),
        title: sessionTitle(s),
        location: s.location ?? '',
        role: a?.role ?? '',
        response: a?.response ?? null,
        response_note: a?.response_note ?? '',
      };
    }),
    rehearsals: { held: rehearsalIds.length, counted: counted.length, came, rate: counted.length ? Math.round((came / counted.length) * 100) : null },
  };
}

/**
 * A member answers their assignment: they will serve, or cannot (with a reason).
 * Only for their own assignment, before the service. A "can't come" tells the
 * choir leaders at once, so they can put someone else on.
 */
export async function answerAssignment(
  db: SupabaseClient,
  assignmentId: string,
  personIds: string[],
  response: 'CONFIRMED' | 'DECLINED',
  note: string
): Promise<{ ok: true; title: string; date: string } | { ok: false; error: string }> {
  const { data, error } = await db.from('service_roster')
    .select('id, response, member:choir_members(person_id), session:choir_sessions(id, session_date, title, kind, status, roster_status)')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as { id: string; response: ServiceResponse; member: { person_id: string } | null; session: (SessionRow & { status: string; roster_status: string }) | null } | null;
  if (!row || !row.member || !personIds.includes(row.member.person_id) || !row.session) return { ok: false, error: 'This assignment is not yours' };
  const s = row.session;
  if (s.status !== 'PLANNED' || s.roster_status !== 'PUBLISHED' || s.session_date < today()) return { ok: false, error: 'This service is no longer open for answers' };
  const reason = note.trim().slice(0, 500);
  if (response === 'DECLINED' && reason.length < 2) return { ok: false, error: 'Please give a short reason' };
  const { error: saveError } = await db.from('service_roster')
    .update({ response, response_note: response === 'DECLINED' ? reason : null, responded_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (saveError) return { ok: false, error: saveError.message };
  if (response === 'DECLINED' && row.response !== 'DECLINED') {
    const { data: who } = await db.from('persons').select('full_name_en, full_name_am').eq('id', row.member.person_id).maybeSingle();
    const w = who as { full_name_en: string; full_name_am: string | null } | null;
    notifyLater(
      { permissions: ['CHOIR_MANAGE'] },
      {
        title: `${w?.full_name_am || w?.full_name_en || ''} — አይችሉም · can’t come`,
        body: `${sessionTitle(s)} · ${formatEthiopianDate(s.session_date, 'am')}\n${reason}`,
        url: '/dashboard/sacred-arts/service',
        tag: `roster-${s.id}`,
      }
    );
  }
  return { ok: true, title: sessionTitle(s), date: s.session_date };
}

// ── Bot messages ─────────────────────────────────────────────────────────────

const when = (date: string, time: string) => `${formatEthiopianDate(date, 'am', { weekday: true })}${time ? ` · ${time}` : ''}`;

/** The roster, as the paper posted on Telegram used to show it. */
export function rosterLines(names: { name: string; role: string }[]): string[] {
  return names.map((n, i) => `${i + 1}. ${e(n.name)}${n.role ? ` — ${e(n.role)}` : ''}`);
}

export function assignedText(s: { title: string; date: string; time: string; location: string }, role: string, roster: { name: string; role: string }[]) {
  return [
    `🎵 <b>ተመድበዋል · You are on the service roster</b>`,
    `<b>${e(s.title)}</b>`,
    e(`📅 ${when(s.date, s.time)}${s.location ? ` · 📍 ${s.location}` : ''}`),
    role ? e(`🎯 ድርሻዎ · Your part: ${role}`) : '',
    '',
    e('እባክዎ ይመጡ እንደሆነ ያሳውቁ፦ በቦቱ «🎵 ምደባዬ» ይጫኑ።'),
    e('Please confirm: tap “🎵 My roster” in the bot.'),
    '',
    `<b>${e('የተመደቡ · On the roster')}</b> (${roster.length})`,
    ...rosterLines(roster),
  ].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n');
}

export function notAssignedText(s: { title: string; date: string; time: string }, rate: number | null, minRate: number | null, roster: { name: string; role: string }[]) {
  return [
    `🎵 <b>${e(s.title)}</b> — ${e(when(s.date, s.time))}`,
    e('በዚህ አገልግሎት ምደባ ውስጥ አልተካተቱም። · You are not on the roster for this service.'),
    minRate !== null
      ? e(`📊 የጥናት ተገኝነትዎ · Your rehearsal attendance: ${rate === null ? '—' : `${rate}%`} (የሚያስፈልገው · needed ${minRate}%)`)
      : '',
    '',
    `<b>${e('የተመደቡ · On the roster')}</b> (${roster.length})`,
    ...rosterLines(roster),
  ].filter(Boolean).join('\n');
}

export function removedText(s: { title: string; date: string; time: string }) {
  return `🎵 <b>${e(s.title)}</b> — ${e(when(s.date, s.time))}\n` + e('ከዚህ አገልግሎት ምደባ ተነስተዋል። ለጥያቄ የመዘምራን ክፍሉን ያነጋግሩ።\nYou were taken off the roster for this service. Ask the choir leaders if you have a question.');
}

export function roleChangedText(s: { title: string; date: string; time: string }, role: string) {
  return `🎵 <b>${e(s.title)}</b> — ${e(when(s.date, s.time))}\n` + e(`ድርሻዎ ተቀይሯል · Your part changed: ${role || '—'}`);
}

export function cancelledText(s: { title: string; date: string; time: string }) {
  return `🎵 <b>${e(s.title)}</b> — ${e(when(s.date, s.time))}\n` + e('ይህ አገልግሎት ተሰርዟል። · This service was cancelled.');
}

export function vestmentIssuedText(vestment: string, due: string, title: string) {
  return e(`👘 የክብር ልብስ ተሰጥቶዎታል · A vestment was given to you\n${vestment}${title ? `\nለ · For: ${title}` : ''}\n📅 የሚመለስበት · Bring it back by: ${formatEthiopianDate(due, 'am', { weekday: true })}`);
}

export function vestmentReminderText(items: { vestment: string; due_on: string }[]) {
  return [
    `👘 <b>${e('የክብር ልብስ ማስታወሻ · Vestment reminder')}</b>`,
    e('እነዚህ የክብር ልብሶች የሚመለሱበት ቀን አልፏል፤ እባክዎ ለመዘምራን ክፍሉ ይመልሱ።'),
    e('These vestments are past their return day — please bring them back to the choir.'),
    '',
    ...items.map((i) => e(`• ${i.vestment} — ${formatEthiopianDate(i.due_on, 'am')}`)),
  ].join('\n');
}

/** "🎵 My roster" in the bot: the same view as the website. */
export function myServiceText(s: MyService): string {
  const lines = [`🎵 <b>${e('ምደባዬ · My roster')}</b>${s.name ? ` — ${e(s.name)}` : ''}`, ''];
  if (s.in_choir) {
    const r = s.rehearsals;
    lines.push(e(`📊 ጥናት (ያለፉት ${WEEKS} ሳምንታት) · Rehearsals (last ${WEEKS} weeks): ${r.rate === null ? '—' : `${r.rate}%`} · ${r.came}/${r.counted}`), '');
    if (s.upcoming.length === 0) lines.push(e('የወጣ ምደባ የለም። · No roster published yet.'));
    for (const u of s.upcoming) {
      lines.push(`<b>${e(u.title)}</b>`, e(`📅 ${when(u.date, u.time)}${u.location ? ` · 📍 ${u.location}` : ''}`));
      if (!u.assignment_id) lines.push(e('➖ አልተመደቡም · Not on the roster'));
      else {
        lines.push(e(`✅ ተመድበዋል · On the roster${u.role ? ` — ${u.role}` : ''}`));
        lines.push(
          e(
            u.response === 'CONFIRMED'
              ? '👍 እመጣለሁ ብለዋል · You said you will serve'
              : u.response === 'DECLINED'
                ? `🚫 አልችልም ብለዋል · You said you can’t come${u.response_note ? `: ${u.response_note}` : ''}`
                : '⏳ ገና አልመለሱም · Not answered yet'
          )
        );
      }
      lines.push('');
    }
  } else {
    lines.push(e('በመዘምራን ዝርዝር ውስጥ አልተገኙም። · You are not on the choir list.'), '');
  }
  if (s.holding.length) {
    lines.push(`<b>${e('👘 በእጅዎ ያለ የክብር ልብስ · Vestments you hold')}</b>`);
    for (const h of s.holding) lines.push(e(`• ${h.vestment} — ${h.overdue ? '⚠️ ' : ''}${formatEthiopianDate(h.due_on, 'am')}`));
    lines.push('');
  }
  lines.push(siteUrl() + '/dashboard/my-service');
  return lines.join('\n').trim();
}
