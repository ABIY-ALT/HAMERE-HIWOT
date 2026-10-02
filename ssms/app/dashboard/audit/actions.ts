'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Audit trail reader (AUDIT_VIEW_ALL). Entries are written by the database
// trigger (migration 011) and by sign-in / sign-out; nothing here writes.
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import type { AuditActionType, AuditEntry, AuditFilter, AuditPage } from '@/lib/audit/types';

type Row = Record<string, unknown> & { id: string };
type Db = Awaited<ReturnType<typeof authorize>>['db'];

const PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How to name a record of each table: [columns to fetch, label builder]. */
const LABELS: Record<string, [string, (r: Record<string, unknown>) => string]> = {
  persons: ['id, full_name_en, membership_code', (r) => `${r.full_name_en} (${r.membership_code})`],
  students: ['id, reg_no', (r) => String(r.reg_no)],
  system_users: ['id, username', (r) => String(r.username)],
  finance_requests: ['id, request_no, title', (r) => `${r.request_no} — ${r.title}`],
  finance_transactions: ['id, txn_type, category, amount', (r) => `${r.txn_type === 'INCOME' ? 'Income' : 'Expense'} · ${r.category} · ETB ${r.amount}`],
  classes: ['id, name_en', (r) => String(r.name_en)],
  subjects: ['id, code, name_en', (r) => `${r.code} ${r.name_en}`],
  academic_years: ['id, name', (r) => String(r.name)],
  roles: ['id, code', (r) => String(r.code)],
  organization_units: ['id, name_en', (r) => String(r.name_en)],
  governance_bodies: ['id, name_en', (r) => String(r.name_en)],
};

/** Fallback label from the logged values (e.g. for deleted records). */
function labelFromValues(values: Record<string, unknown> | null): string {
  if (!values) return '';
  for (const key of ['full_name_en', 'request_no', 'title', 'name_en', 'name', 'code', 'reg_no', 'username', 'login', 'category', 'key']) {
    if (values[key]) return String(values[key]);
  }
  return '';
}

async function recordLabels(db: Db, rows: Row[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const idsByTable = new Map<string, Set<string>>();
  for (const r of rows) {
    const table = r.table_name as string;
    const id = r.record_id as string;
    if (LABELS[table] && UUID.test(id)) idsByTable.set(table, (idsByTable.get(table) ?? new Set()).add(id));
  }
  await Promise.all(
    [...idsByTable].map(async ([table, ids]) => {
      const [columns, build] = LABELS[table];
      const { data } = await db.from(table).select(columns).in('id', [...ids]);
      for (const rec of (data ?? []) as unknown as Record<string, unknown>[]) labels.set(`${table}:${rec.id}`, build(rec));
    })
  );
  return labels;
}

export async function loadAudit(filter: AuditFilter = {}): Promise<Loaded<AuditPage>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('AUDIT_VIEW_ALL');

    let q = db.from('system_audit_logs')
      .select('*, actor:system_users!system_audit_logs_user_id_fkey(id, person:persons!system_users_person_id_fkey(full_name_en)), unit:organization_units(name_en)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (filter.table) q = q.eq('table_name', filter.table);
    if (filter.action) q = q.eq('action', filter.action);
    if (filter.actorId === 'SYSTEM') q = q.is('user_id', null);
    else if (filter.actorId && UUID.test(filter.actorId)) q = q.eq('user_id', filter.actorId);
    if (filter.from && DATE.test(filter.from)) q = q.gte('created_at', `${filter.from}T00:00:00Z`);
    if (filter.to && DATE.test(filter.to)) q = q.lte('created_at', `${filter.to}T23:59:59.999Z`);
    if (filter.before && UUID.test(filter.before.id) && !Number.isNaN(Date.parse(filter.before.created_at))) {
      const at = filter.before.created_at;
      q = q.or(`created_at.lt."${at}",and(created_at.eq."${at}",id.lt.${filter.before.id})`);
    }

    const rows = (await q.then(check)) as Row[];
    const pageRows = rows.slice(0, PAGE_SIZE);
    const labels = await recordLabels(db, pageRows);

    const entries: AuditEntry[] = pageRows.map((r) => {
      const oldValues = (r.old_values as Record<string, unknown> | null) ?? null;
      const newValues = (r.new_values as Record<string, unknown> | null) ?? null;
      const actor = r.actor as { id?: string; person?: { full_name_en?: string } | null } | null;
      return {
        id: r.id,
        created_at: r.created_at as string,
        action: r.action as AuditActionType,
        table_name: r.table_name as string,
        record_id: r.record_id as string,
        record_label:
          labels.get(`${r.table_name}:${r.record_id}`) || labelFromValues(newValues) || labelFromValues(oldValues),
        actor_id: (r.user_id as string) ?? null,
        actor: actor?.person?.full_name_en ?? '',
        unit: ((r.unit as { name_en?: string } | null)?.name_en) ?? '',
        ip: (r.ip_address as string) ?? '',
        user_agent: (r.user_agent as string) ?? '',
        old_values: oldValues,
        new_values: newValues,
      };
    });

    const actors = ((await db.from('system_users')
      .select('id, person:persons!system_users_person_id_fkey(full_name_en)')
      .then(check)) as unknown as { id: string; person: { full_name_en: string } | null }[])
      .map((u) => ({ id: u.id, name: u.person?.full_name_en ?? u.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { mode: 'live', data: { entries, hasMore: rows.length > PAGE_SIZE, actors } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
