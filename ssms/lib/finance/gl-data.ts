// ─────────────────────────────────────────────────────────────────────────────
// Reading the general ledger (migration 044) — server only, never a server
// action itself (the callers check permissions). Used by the accounting pages
// and the annual report.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/auth/authorize';
import type { EntrySource, GlAccount, GlSettings, GlType, PostedLine } from '@/lib/finance/gl';

type Row = Record<string, unknown> & { id: string };

export const DEFAULT_GL_SETTINGS: GlSettings = { fiscal_year_start: '07-08', lock_date: null, require_approval: false };

const ACCOUNT_COLUMNS = 'id, code, name_en, name_am, account_type, sub_type, normal_balance, parent_id, is_header, bank_account_id, description, is_active';

function toAccount(r: Row): GlAccount {
  return {
    id: r.id,
    code: r.code as string,
    name_en: r.name_en as string,
    name_am: (r.name_am as string) ?? '',
    type: r.account_type as GlType,
    sub_type: r.sub_type as string,
    normal_balance: r.normal_balance as GlAccount['normal_balance'],
    parent_id: (r.parent_id as string) ?? null,
    is_header: Boolean(r.is_header),
    bank_account_id: (r.bank_account_id as string) ?? null,
    description: (r.description as string) ?? '',
    is_active: Boolean(r.is_active),
  };
}

export async function loadAccounts(db: SupabaseClient): Promise<GlAccount[]> {
  const rows = await selectAll<Row>((a, b) => db.from('gl_accounts').select(ACCOUNT_COLUMNS).order('code').order('id').range(a, b));
  return rows.map(toAccount);
}

/** The settings row, or null when the Sunday school has no ledger yet. */
export async function readGlSettings(db: SupabaseClient): Promise<GlSettings | null> {
  const { data, error } = await db.from('gl_settings').select('fiscal_year_start, lock_date, require_approval').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const s = data as { fiscal_year_start: string; lock_date: string | null; require_approval: boolean };
  return { fiscal_year_start: s.fiscal_year_start, lock_date: s.lock_date, require_approval: s.require_approval };
}

/** Posted lines dated up to `to` (and from `from`) */
export async function postedLines(db: SupabaseClient, to: string, from?: string): Promise<PostedLine[]> {
  const rows = await selectAll<Row>((a, b) => {
    let q = db
      .from('journal_lines')
      .select('id, entry_id, account_id, debit, credit, organization_unit_id, entry:journal_entries!inner(entry_date, status, source)')
      .eq('entry.status', 'POSTED')
      .lte('entry.entry_date', to);
    if (from) q = q.gte('entry.entry_date', from);
    return q.order('id').range(a, b);
  });
  return rows.map((r) => {
    const e = r.entry as { entry_date: string; source: EntrySource };
    return {
      entry_id: r.entry_id as string,
      date: e.entry_date,
      account_id: r.account_id as string,
      debit: Number(r.debit),
      credit: Number(r.credit),
      unit_id: (r.organization_unit_id as string) ?? null,
      source: e.source,
    };
  });
}
