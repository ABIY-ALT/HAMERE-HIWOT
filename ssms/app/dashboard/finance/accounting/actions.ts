'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Accounting — the general ledger (migration 044).
//
//   chart, journal, ledger, statements      FINANCE_VIEW
//   write manual entries, send for approval FINANCE_CREATE
//   post / return / reverse entries         FINANCE_APPROVE
//   chart of accounts, posting rules,
//   settings (lock date…), re-post          FINANCE_APPROVE
//
// Income, expenses, transfers and opening balances post themselves (database
// triggers); only manual entries are written here. The database checks that
// an entry balances when it is posted and refuses changes in a closed period.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { ReadOnlyError } from '@/lib/tenant/db';
import { notifyLater } from '@/lib/push/send';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatETB } from '@/lib/finance/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { DEFAULT_GL_SETTINGS, loadAccounts, postedLines, readGlSettings } from '@/lib/finance/gl-data';
import {
  SUB_TYPES,
  addYears,
  balanceSheet,
  cashFlow,
  fiscalYearStart,
  incomeStatement,
  isBalanceSheet,
  natural,
  previousPeriod,
  round2,
  trialBalance,
  type ChartData,
  type EntrySource,
  type EntryStatus,
  type GlAccount,
  type GlMapping,
  type GlSettings,
  type GlUnit,
  type JournalData,
  type JournalEntryView,
  type LedgerData,
  type LedgerRow,
  type ReportKind,
  type StatementsData,
} from '@/lib/finance/gl';

type Row = Record<string, unknown> & { id: string };
type ByUser = { person?: { full_name_en?: string | null } | null } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Unknown record');
const personName = (u: unknown) => (u as ByUser)?.person?.full_name_en ?? '';
const cents = (n: number) => Math.round(n * 100);

const MIGRATION = 'Run database migration 044 (general ledger) first';
const friendly = (e: unknown) => {
  const msg = errorMessage(e);
  return /gl_accounts|gl_settings|gl_mappings|journal_entries|journal_lines|gl_repost/.test(msg) && /schema cache|does not exist|Could not find/.test(msg)
    ? MIGRATION
    : msg;
};

// ── Shared reads ─────────────────────────────────────────────────────────────

/**
 * The Sunday school's settings. A school that has not used the ledger yet has
 * no chart: re-posting from nothing gives it the standard one (gl_ensure_chart).
 */
async function loadSettings(db: SupabaseClient, me: SessionUser): Promise<GlSettings> {
  const settings = await readGlSettings(db);
  if (settings) return settings;
  if (me.tenant.access.mode !== 'full') return DEFAULT_GL_SETTINGS;
  await db.rpc('gl_repost', { p_from: null }).then(check);
  return (await readGlSettings(db)) ?? DEFAULT_GL_SETTINGS;
}

async function loadUnits(db: SupabaseClient): Promise<GlUnit[]> {
  const rows = (await db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check)) as {
    id: string; name_en: string; name_am: string | null;
  }[];
  return rows.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am || u.name_en }));
}

function writable(me: SessionUser) {
  if (me.tenant.access.mode !== 'full') throw new ReadOnlyError();
}

// ── Chart of accounts ────────────────────────────────────────────────────────

export async function loadChart(): Promise<Loaded<ChartData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'FINANCE_APPROVE');
    const settings = await loadSettings(db, me);
    const [accounts, mappingRows, banks, txnCats] = await Promise.all([
      loadAccounts(db),
      db.from('gl_mappings').select('source, key, account_id').then(check) as Promise<GlMapping[]>,
      db.from('bank_accounts').select('id, name').then(check) as Promise<{ id: string; name: string }[]>,
      selectAll<{ txn_type: string; category: string }>((a, b) => db.from('finance_transactions').select('txn_type, category').order('id').range(a, b)),
    ]);
    const today = todayIso();
    const fyStart = fiscalYearStart(today, settings.fiscal_year_start);
    const lines = await postedLines(db, today);

    const byId = new Map(accounts.map((a) => [a.id, a]));
    const sums = new Map<string, number>();
    const used = new Set<string>();
    for (const l of lines) {
      used.add(l.account_id);
      const a = byId.get(l.account_id);
      if (!a || (!isBalanceSheet(a.type) && l.date < fyStart)) continue;
      sums.set(l.account_id, (sums.get(l.account_id) ?? 0) + l.debit - l.credit);
    }
    // Lines dated after today count as used too
    const { data: later } = await db.from('journal_lines').select('account_id, entry:journal_entries!inner(entry_date)').gt('entry.entry_date', today).limit(1000);
    for (const r of (later ?? []) as { account_id: string }[]) used.add(r.account_id);

    const balances: Record<string, number> = {};
    for (const a of accounts) balances[a.id] = round2(natural(a, sums.get(a.id) ?? 0));
    // A group shows the total of its sub-accounts
    const total = (id: string): number => {
      const kids = accounts.filter((a) => a.parent_id === id);
      return kids.length ? round2(kids.reduce((s, k) => s + (k.is_header ? total(k.id) : balances[k.id]), 0)) : balances[id];
    };
    for (const a of accounts) if (a.is_header) balances[a.id] = total(a.id);

    const cats = (type: string, fixed: [string, string][]) =>
      [...new Set([...fixed.map(([en]) => en), ...txnCats.filter((t) => t.txn_type === type).map((t) => t.category)])];
    return {
      mode: 'live',
      data: {
        accounts,
        bankNames: Object.fromEntries(banks.map((b) => [b.id, b.name])),
        mappings: mappingRows,
        settings,
        categories: { income: cats('INCOME', INCOME_CATEGORIES), expense: cats('EXPENSE', EXPENSE_CATEGORIES) },
        balances,
        used: [...used],
        fyStart,
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

const AccountSchema = z
  .object({
    id: z.string(),
    code: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$/, 'Account number: letters, digits, dot or dash (up to 20)'),
    name_en: z.string().trim().min(2, 'Enter the account name'),
    name_am: z.string().trim(),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
    sub_type: z.string(),
    normal_balance: z.enum(['DEBIT', 'CREDIT']),
    parent_id: z.string(),
    is_header: z.boolean(),
    description: z.string().trim(),
    is_active: z.boolean(),
  })
  .refine((a) => SUB_TYPES.some((s) => s.code === a.sub_type && s.type === a.type), { message: 'Choose a classification that fits the account type' });

export type AccountInput = z.input<typeof AccountSchema>;

export async function saveGlAccount(input: AccountInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const a = AccountSchema.parse(input);
    const fields = {
      code: a.code,
      name_en: a.name_en,
      name_am: a.name_am || null,
      account_type: a.type,
      sub_type: a.sub_type,
      normal_balance: a.normal_balance,
      parent_id: a.parent_id || null,
      is_header: a.is_header,
      description: a.description || null,
      is_active: a.is_active,
    };
    const { error } = a.id
      ? await db.from('gl_accounts').update(fields).eq('id', uuid.parse(a.id))
      : await db.from('gl_accounts').insert({ ...fields, created_by: me.systemUser.id });
    if (error) {
      if (/gl_accounts_tid_code_key/.test(error.message)) throw new Error(`Account number ${a.code} is already used`);
      throw new Error(error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function deleteGlAccount(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_APPROVE');
    const { error } = await db.from('gl_accounts').delete().eq('id', uuid.parse(id));
    if (error) {
      if (/journal_lines_account_fkey/.test(error.message)) throw new Error('This account has entries — make it inactive instead');
      if (/gl_mappings_account_fkey/.test(error.message)) throw new Error('A posting rule uses this account — point the rule to another account first');
      if (/gl_accounts_parent_fkey/.test(error.message)) throw new Error('Move or remove this group’s sub-accounts first');
      throw new Error(error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const MappingSchema = z.object({
  source: z.enum(['DEFAULT', 'INCOME_CATEGORY', 'EXPENSE_CATEGORY']),
  key: z.string().trim().min(1),
  /** '' removes a category's own rule (it then uses the default) */
  account_id: z.string(),
});

export async function saveMapping(input: z.input<typeof MappingSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const m = MappingSchema.parse(input);
    if (!m.account_id) {
      if (m.source === 'DEFAULT') throw new Error('A default account is required');
      await db.from('gl_mappings').delete().eq('source', m.source).eq('key', m.key).then(check);
    } else {
      await db
        .from('gl_mappings')
        .upsert({ source: m.source, key: m.key, account_id: uuid.parse(m.account_id), updated_by: me.systemUser.id }, { onConflict: 'source,key' })
        .then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const SettingsSchema = z.object({
  fiscal_year_start: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, 'Choose the first day of the fiscal year'),
  lock_date: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
  require_approval: z.boolean(),
});

export async function saveGlSettings(input: z.input<typeof SettingsSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const s = SettingsSchema.parse(input);
    if (s.lock_date && s.lock_date >= todayIso()) throw new Error('The books can only be closed up to a day in the past');
    await db
      .from('gl_settings')
      .update({ fiscal_year_start: s.fiscal_year_start, lock_date: s.lock_date || null, require_approval: s.require_approval, updated_by: me.systemUser.id })
      .eq('tenant_id', me.tenant.id)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Re-writes the automatic entries from a date on with the current posting rules. */
export async function repostEntries(from: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    writable(me);
    const count = (await db.rpc('gl_repost', { p_from: from ? isoDate.parse(from) : null }).then(check)) as number;
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Journal ──────────────────────────────────────────────────────────────────

const ENTRY_COLUMNS = [
  'id, entry_no, entry_date, memo, reference, source, status, total, review_note, created_by, posted_at, reversal_of',
  'creator:system_users!journal_entries_created_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))',
  'poster:system_users!journal_entries_posted_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))',
  'lines:journal_lines(line_no, account_id, debit, credit, description, organization_unit_id)',
].join(', ');

function toEntries(rows: Row[], accounts: GlAccount[], units: GlUnit[], reversals: Map<string, string>, numbers: Map<string, string>): JournalEntryView[] {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const unit = new Map(units.map((u) => [u.id, u.name_en]));
  return rows.map((r) => {
    const lines = ((r.lines ?? []) as { line_no: number; account_id: string; debit: number; credit: number; description: string | null; organization_unit_id: string | null }[])
      .sort((x, y) => x.line_no - y.line_no)
      .map((l) => {
        const a = acc.get(l.account_id);
        return {
          account_id: l.account_id,
          code: a?.code ?? '?',
          name_en: a?.name_en ?? '',
          name_am: a?.name_am ?? '',
          debit: Number(l.debit),
          credit: Number(l.credit),
          description: l.description ?? '',
          unit_id: l.organization_unit_id,
          unit: l.organization_unit_id ? unit.get(l.organization_unit_id) ?? '' : '',
        };
      });
    return {
      id: r.id,
      entry_no: r.entry_no as string,
      date: r.entry_date as string,
      memo: r.memo as string,
      reference: (r.reference as string) ?? '',
      source: r.source as EntrySource,
      status: r.status as EntryStatus,
      total: Number(r.total) || round2(lines.reduce((s, l) => s + l.debit, 0)),
      lines,
      created_by_id: (r.created_by as string) ?? null,
      created_by: personName(r.creator),
      posted_by: personName(r.poster),
      posted_at: (r.posted_at as string) ?? null,
      review_note: (r.review_note as string) ?? '',
      reverses: r.reversal_of ? numbers.get(r.reversal_of as string) ?? '' : '',
      reversed_by: reversals.get(r.id) ?? '',
    };
  });
}

export async function loadJournal(range: { from?: string; to?: string; source?: string } = {}): Promise<Loaded<JournalData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW', 'FINANCE_CREATE', 'FINANCE_APPROVE');
    const settings = await loadSettings(db, me);
    const today = todayIso();
    const to = range.to && isoDate.safeParse(range.to).success ? range.to : today;
    const from = range.from && isoDate.safeParse(range.from).success ? range.from : fiscalYearStart(to, settings.fiscal_year_start);
    const [accounts, units, posted, open, reversalRows] = await Promise.all([
      loadAccounts(db),
      loadUnits(db),
      selectAll<Row>((a, b) => {
        let q = db.from('journal_entries').select(ENTRY_COLUMNS).eq('status', 'POSTED').gte('entry_date', from).lte('entry_date', to);
        if (range.source && ['MANUAL', 'TRANSACTION', 'TRANSFER', 'OPENING', 'REVERSAL'].includes(range.source)) q = q.eq('source', range.source);
        return q.order('entry_date', { ascending: false }).order('entry_no', { ascending: false }).range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
      }),
      db.from('journal_entries').select(ENTRY_COLUMNS).neq('status', 'POSTED').order('entry_date', { ascending: false }).limit(200).then(check) as Promise<Row[]>,
      db.from('journal_entries').select('id, entry_no, reversal_of').not('reversal_of', 'is', null).then(check) as Promise<{ id: string; entry_no: string; reversal_of: string }[]>,
    ]);
    const reversedBy = new Map(reversalRows.map((r) => [r.reversal_of, r.entry_no]));
    // Numbers of the entries the reversals point to
    const targets = [...new Set(reversalRows.map((r) => r.reversal_of))];
    const numbers = new Map<string, string>();
    if (targets.length) {
      const rows = (await db.from('journal_entries').select('id, entry_no').in('id', targets).then(check)) as { id: string; entry_no: string }[];
      for (const r of rows) numbers.set(r.id, r.entry_no);
    }
    // Others' drafts are private until they are sent for approval
    const visibleOpen = open.filter((r) => r.status === 'PENDING' || r.created_by === me.systemUser.id);
    return {
      mode: 'live',
      data: {
        entries: toEntries(posted, accounts, units, reversedBy, numbers),
        open: toEntries(visibleOpen, accounts, units, reversedBy, numbers),
        accounts,
        units,
        settings,
        from,
        to,
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

const LineSchema = z.object({
  account_id: uuid,
  debit: z.coerce.number().min(0, 'Amounts cannot be negative').max(1_000_000_000, 'Amount is too large'),
  credit: z.coerce.number().min(0, 'Amounts cannot be negative').max(1_000_000_000, 'Amount is too large'),
  description: z.string().trim().max(300),
  unit_id: z.string(),
});

const EntrySchema = z.object({
  id: z.string(),
  date: isoDate,
  memo: z.string().trim().min(3, 'Describe the entry (what it is for)').max(500),
  reference: z.string().trim().max(100),
  lines: z.array(LineSchema).min(2, 'An entry needs at least two lines').max(100, 'Too many lines'),
  /** draft: keep it · submit: send for approval · post: post now */
  action: z.enum(['draft', 'submit', 'post']),
});

export type EntryInput = z.input<typeof EntrySchema>;

/** May this user post an entry written by `authorId`? */
function canPost(me: SessionUser, settings: GlSettings, authorId: string | null) {
  if (!me.permissions.includes('FINANCE_APPROVE')) return false;
  return !settings.require_approval || authorId !== me.systemUser.id;
}

function notifyApprovers(me: SessionUser, entry: { entry_no: string; memo: string; total: number }) {
  notifyLater(
    { permissions: ['FINANCE_APPROVE'], except: me.systemUser.id },
    {
      title: '📒 የሂሳብ መዝገብ ማጽደቅ · Journal entry to approve',
      body: `${entry.entry_no} — ${entry.memo} — ${formatETB(entry.total)}`,
      url: '/dashboard/finance/accounting/journal',
      tag: 'gl-to-approve',
    }
  );
}

export async function saveEntry(input: EntryInput): Promise<{ ok: true; entry_no: string; status: EntryStatus } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE', 'FINANCE_APPROVE');
    const e = EntrySchema.parse(input);
    const settings = await loadSettings(db, me);

    const lines = e.lines
      .map((l, i) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit), line_no: i + 1 }))
      .filter((l) => l.debit > 0 || l.credit > 0);
    if (lines.some((l) => l.debit > 0 && l.credit > 0)) throw new Error('A line has either a debit or a credit, not both');
    if (lines.length < 2) throw new Error('An entry needs at least two lines with an amount');
    const dr = lines.reduce((s, l) => s + cents(l.debit), 0);
    const cr = lines.reduce((s, l) => s + cents(l.credit), 0);
    if (e.action !== 'draft' && dr !== cr) {
      throw new Error(`Debits (${formatETB(dr / 100)}) and credits (${formatETB(cr / 100)}) must be equal`);
    }
    if (e.action !== 'draft' && settings.lock_date && e.date <= settings.lock_date) {
      throw new Error(`The books are closed up to ${settings.lock_date} — use a later date`);
    }

    let id = e.id;
    let author: string | null = me.systemUser.id;
    if (id) {
      const row = (await db.from('journal_entries').select('id, status, source, created_by').eq('id', uuid.parse(id)).single().then(check)) as {
        id: string; status: EntryStatus; source: EntrySource; created_by: string | null;
      };
      if (row.source !== 'MANUAL' || row.status === 'POSTED') throw new Error('Only a draft or an entry waiting for approval can be changed');
      if (row.created_by !== me.systemUser.id && !me.permissions.includes('FINANCE_APPROVE')) throw new Error('Only the person who wrote this entry can change it');
      author = row.created_by;
      await db
        .from('journal_entries')
        .update({ entry_date: e.date, memo: e.memo, reference: e.reference || null, status: 'DRAFT', review_note: null })
        .eq('id', id)
        .neq('status', 'POSTED')
        .then(check);
      await db.from('journal_lines').delete().eq('entry_id', id).then(check);
    } else {
      const row = (await db
        .from('journal_entries')
        .insert({ entry_date: e.date, memo: e.memo, reference: e.reference || null, source: 'MANUAL', status: 'DRAFT', created_by: me.systemUser.id })
        .select('id')
        .single()
        .then(check)) as { id: string };
      id = row.id;
    }

    const { error: lineError } = await db.from('journal_lines').insert(
      lines.map((l) => ({
        entry_id: id,
        line_no: l.line_no,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        description: l.description || null,
        organization_unit_id: l.unit_id || null,
      }))
    );
    if (lineError) {
      if (!e.id) await db.from('journal_entries').delete().eq('id', id);
      throw new Error(lineError.message);
    }

    let status: EntryStatus = 'DRAFT';
    if (e.action === 'post' && canPost(me, settings, author)) {
      await db.from('journal_entries').update({ status: 'POSTED', posted_by: me.systemUser.id }).eq('id', id).then(check);
      status = 'POSTED';
    } else if (e.action !== 'draft') {
      await db.from('journal_entries').update({ status: 'PENDING', submitted_at: new Date().toISOString() }).eq('id', id).then(check);
      status = 'PENDING';
    }
    const saved = (await db.from('journal_entries').select('entry_no').eq('id', id).single().then(check)) as { entry_no: string };
    if (status === 'PENDING') notifyApprovers(me, { entry_no: saved.entry_no, memo: e.memo, total: dr / 100 });
    return { ok: true, entry_no: saved.entry_no, status };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function approveEntry(id: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const settings = await loadSettings(db, me);
    const row = (await db.from('journal_entries').select('id, entry_no, memo, total, status, created_by').eq('id', uuid.parse(id)).single().then(check)) as {
      id: string; entry_no: string; memo: string; total: number; status: EntryStatus; created_by: string | null;
    };
    if (row.status !== 'PENDING') throw new Error('This entry is not waiting for approval');
    if (!canPost(me, settings, row.created_by)) throw new Error('Another approver must post an entry you wrote');
    const updated = (await db
      .from('journal_entries')
      .update({ status: 'POSTED', posted_by: me.systemUser.id, review_note: null })
      .eq('id', row.id)
      .eq('status', 'PENDING')
      .select('id')
      .then(check)) as { id: string }[];
    if (!updated.length) throw new Error('This entry was already handled — reload the page');
    notifyLater(
      { users: [row.created_by], except: me.systemUser.id },
      { title: `📒 ${row.entry_no} ተመዝግቧል · was posted`, body: `${row.memo} — ${formatETB(Number(row.total))}`, url: '/dashboard/finance/accounting/journal', tag: `gl-${row.id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function returnEntry(id: string, note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const clean = note.trim();
    if (clean.length < 3) throw new Error('Write what needs to change');
    const row = (await db.from('journal_entries').select('id, entry_no, memo, status, created_by').eq('id', uuid.parse(id)).single().then(check)) as {
      id: string; entry_no: string; memo: string; status: EntryStatus; created_by: string | null;
    };
    if (row.status !== 'PENDING') throw new Error('This entry is not waiting for approval');
    await db.from('journal_entries').update({ status: 'DRAFT', review_note: clean }).eq('id', row.id).eq('status', 'PENDING').then(check);
    notifyLater(
      { users: [row.created_by], except: me.systemUser.id },
      { title: `📒 ${row.entry_no} ለማስተካከያ ተመልሷል · returned for changes`, body: `${row.memo} — ${clean}`, url: '/dashboard/finance/accounting/journal', tag: `gl-${row.id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE', 'FINANCE_APPROVE');
    const row = (await db.from('journal_entries').select('id, status, source, created_by').eq('id', uuid.parse(id)).single().then(check)) as {
      id: string; status: EntryStatus; source: EntrySource; created_by: string | null;
    };
    if (row.status === 'POSTED' || row.source !== 'MANUAL') throw new Error('A posted entry cannot be deleted — reverse it instead');
    if (row.created_by !== me.systemUser.id && !me.permissions.includes('FINANCE_APPROVE')) throw new Error('Only the person who wrote this entry can delete it');
    await db.from('journal_entries').delete().eq('id', row.id).neq('status', 'POSTED').then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Cancels a posted manual entry with an opposite entry on the given date. */
export async function reverseEntry(id: string, date: string): Promise<{ ok: true; entry_no: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const d = isoDate.parse(date);
    const settings = await loadSettings(db, me);
    if (settings.lock_date && d <= settings.lock_date) throw new Error(`The books are closed up to ${settings.lock_date} — use a later date`);
    const row = (await db
      .from('journal_entries')
      .select('id, entry_no, entry_date, memo, status, source, lines:journal_lines(line_no, account_id, debit, credit, description, organization_unit_id)')
      .eq('id', uuid.parse(id))
      .single()
      .then(check)) as unknown as {
      id: string; entry_no: string; entry_date: string; memo: string; status: EntryStatus; source: EntrySource;
      lines: { line_no: number; account_id: string; debit: number; credit: number; description: string | null; organization_unit_id: string | null }[];
    };
    if (row.status !== 'POSTED' || row.source !== 'MANUAL') {
      throw new Error('Only a posted manual entry can be reversed — automatic entries change with their income, expense or transfer record');
    }
    if (d < row.entry_date) throw new Error('The reversal cannot be dated before the entry it reverses');
    const { data: created, error } = await db
      .from('journal_entries')
      .insert({ entry_date: d, memo: `Reversal of ${row.entry_no} — ${row.memo}`.slice(0, 500), reference: row.entry_no, source: 'REVERSAL', reversal_of: row.id, status: 'DRAFT', created_by: me.systemUser.id })
      .select('id, entry_no')
      .single();
    if (error) throw new Error(/journal_entries_tid_reversal_key/.test(error.message) ? 'This entry has already been reversed' : error.message);
    const rev = created as { id: string; entry_no: string };
    try {
      await db.from('journal_lines').insert(
        row.lines.map((l) => ({
          entry_id: rev.id,
          line_no: l.line_no,
          account_id: l.account_id,
          debit: l.credit,
          credit: l.debit,
          description: l.description,
          organization_unit_id: l.organization_unit_id,
        }))
      ).then(check);
      await db.from('journal_entries').update({ status: 'POSTED', posted_by: me.systemUser.id }).eq('id', rev.id).then(check);
    } catch (err) {
      await db.from('journal_entries').delete().eq('id', rev.id);
      throw err;
    }
    return { ok: true, entry_no: rev.entry_no };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── General ledger ───────────────────────────────────────────────────────────

export async function loadLedger(params: { account?: string; from?: string; to?: string }): Promise<Loaded<LedgerData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW');
    const settings = await loadSettings(db, me);
    const to = params.to && isoDate.safeParse(params.to).success ? params.to : todayIso();
    const from = params.from && isoDate.safeParse(params.from).success ? params.from : fiscalYearStart(to, settings.fiscal_year_start);
    const accounts = await loadAccounts(db);
    if (!params.account) return { mode: 'live', data: { accounts, settings, sections: [], from, to } };

    const chosen = params.account === 'all' ? accounts.filter((a) => !a.is_header) : accounts.filter((a) => a.id === params.account && !a.is_header);
    const ids = new Set(chosen.map((a) => a.id));
    // Income / expense accounts open at the start of the fiscal year `from` is in
    const fyStart = fiscalYearStart(from, settings.fiscal_year_start);

    const all = await postedLines(db, to);
    const opening = new Map<string, number>();
    for (const l of all) {
      if (!ids.has(l.account_id) || l.date >= from) continue;
      const a = chosen.find((x) => x.id === l.account_id)!;
      if (!isBalanceSheet(a.type) && l.date < fyStart) continue;
      opening.set(l.account_id, (opening.get(l.account_id) ?? 0) + l.debit - l.credit);
    }

    // The period's lines with their entries
    const rows = await selectAll<Row>((a, b) => {
      let q = db
        .from('journal_lines')
        .select('id, line_no, account_id, debit, credit, description, organization_unit_id, entry:journal_entries!inner(id, entry_no, entry_date, memo, reference, source, status)')
        .eq('entry.status', 'POSTED')
        .gte('entry.entry_date', from)
        .lte('entry.entry_date', to);
      if (params.account !== 'all') q = q.eq('account_id', chosen[0]?.id ?? '00000000-0000-0000-0000-000000000000');
      return q.order('id').range(a, b);
    });
    const units = new Map((await loadUnits(db)).map((u) => [u.id, u.name_en]));

    const sections = chosen
      .map((account) => {
        const mine = rows
          .filter((r) => r.account_id === account.id)
          .map((r) => {
            const e = r.entry as { id: string; entry_no: string; entry_date: string; memo: string; reference: string | null; source: EntrySource };
            return { r, e };
          })
          .sort((x, y) => x.e.entry_date.localeCompare(y.e.entry_date) || x.e.entry_no.localeCompare(y.e.entry_no) || Number(x.r.line_no) - Number(y.r.line_no));
        const open = round2(natural(account, opening.get(account.id) ?? 0));
        let running = open;
        let debit = 0;
        let credit = 0;
        const out: LedgerRow[] = mine.map(({ r, e }) => {
          const dr = Number(r.debit);
          const cr = Number(r.credit);
          debit += dr;
          credit += cr;
          running = round2(running + natural(account, dr - cr));
          return {
            entry_id: e.id,
            entry_no: e.entry_no,
            date: e.entry_date,
            memo: e.memo,
            reference: e.reference ?? '',
            source: e.source,
            description: (r.description as string) ?? '',
            unit: r.organization_unit_id ? units.get(r.organization_unit_id as string) ?? '' : '',
            debit: dr,
            credit: cr,
            balance: running,
          };
        });
        return { account, opening: open, rows: out, debit: round2(debit), credit: round2(credit), closing: running };
      })
      .filter((s) => params.account !== 'all' || s.rows.length > 0 || s.opening !== 0);

    return { mode: 'live', data: { accounts, settings, sections, from, to } };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

// ── Financial statements ─────────────────────────────────────────────────────

export interface StatementParams {
  report: ReportKind;
  from?: string;
  to?: string;
  /** income: 'previous' period, 'year' (same dates a year earlier) or none · balance: a date */
  compare?: string;
  unit?: string;
}

export async function loadStatements(params: StatementParams): Promise<Loaded<StatementsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('FINANCE_VIEW');
    const settings = await loadSettings(db, me);
    const fyOf = (d: string) => fiscalYearStart(d, settings.fiscal_year_start);
    const to = params.to && isoDate.safeParse(params.to).success ? params.to : todayIso();
    const from = params.from && isoDate.safeParse(params.from).success ? params.from : fyOf(to);
    if (from > to) throw new Error('The start date is after the end date');
    const [accounts, units, lines] = await Promise.all([loadAccounts(db), loadUnits(db), postedLines(db, to)]);

    const data: StatementsData = {
      tenant: [me.tenant.name_en, me.tenant.name_am || me.tenant.name_en],
      units,
      settings,
      report: params.report,
    };
    if (params.report === 'trial') {
      data.trial = trialBalance(accounts, lines, from, to, fyOf(to));
    } else if (params.report === 'income') {
      const compare =
        params.compare === 'previous' ? previousPeriod(from, to) : params.compare === 'year' ? { from: addYears(from, -1), to: addYears(to, -1) } : null;
      const unit = params.unit && units.some((u) => u.id === params.unit) ? params.unit : undefined;
      data.income = incomeStatement(accounts, lines, from, to, compare, unit);
    } else if (params.report === 'balance') {
      const compareAsOf = params.compare && isoDate.safeParse(params.compare).success && params.compare < to ? params.compare : null;
      data.balance = balanceSheet(accounts, lines, to, compareAsOf, fyOf);
    } else {
      data.cashflow = cashFlow(accounts, lines, from, to);
    }
    return { mode: 'live', data };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}
