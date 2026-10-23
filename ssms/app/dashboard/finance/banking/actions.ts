'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Bank accounts, transfers and bank reconciliation (migration 042).
//
//   see accounts, balances, statements   FINANCE_VIEW
//   record / remove transfers            FINANCE_CREATE
//   import statements, match, ignore     FINANCE_CREATE
//   add / change accounts                FINANCE_APPROVE
//   close (reconcile) / reopen statement FINANCE_APPROVE
//
// Matching a statement line gives the matched ledger records this account, so
// older records without an account are sorted out by reconciling. A closed
// (RECONCILED) statement cannot be changed until it is reopened.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import {
  autoMatches,
  fingerprints,
  type AccountKind,
  type AccountTransfer,
  type BankAccount,
  type BankingData,
  type LedgerItem,
  type LineStatus,
  type ParsedLine,
  type ReconcileView,
  type StatementLine,
  type StatementRow,
  type StatementStatus,
} from '@/lib/finance/banking';
import type { TxnType } from '@/lib/finance/types';
import { DEMO_ACCOUNT_OPTIONS } from '@/lib/finance/banking-demo';

type Row = Record<string, unknown> & { id: string };
type ByUser = { person?: { full_name_en?: string | null } | null } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Unknown record');
const personName = (u: unknown) => (u as ByUser)?.person?.full_name_en ?? '';
const num = (v: unknown) => (v == null ? null : Number(v));
const cents = (n: number) => Math.round(n * 100);
const missingTables = (msg: string) => /bank_accounts|bank_statement|account_transfers|bank_account_id/.test(msg);
const friendly = (e: unknown) => {
  const msg = errorMessage(e);
  return missingTables(msg) ? 'Run database migration 042 (bank accounts and reconciliation) first' : msg;
};

const RECORDER = 'recorder:system_users!account_transfers_recorded_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))';
const TXN_COLUMNS = 'id, txn_type, category, amount, txn_date, description, party, receipt_no, bank_account_id, statement_line_id, request:finance_requests(request_no)';

function toItem(t: Row): LedgerItem {
  return {
    id: t.id,
    type: t.txn_type as TxnType,
    category: t.category as string,
    amount: Number(t.amount),
    date: t.txn_date as string,
    description: (t.description as string) ?? '',
    party: (t.party as string) ?? '',
    receipt_no: (t.receipt_no as string) ?? '',
    request_no: ((t.request as { request_no?: string } | null)?.request_no) ?? '',
    bank_account_id: (t.bank_account_id as string) ?? null,
    statement_line_id: (t.statement_line_id as string) ?? null,
  };
}

function toTransfer(t: Row, names: Map<string, string>): AccountTransfer {
  return {
    id: t.id,
    from_id: t.from_account_id as string,
    from: names.get(t.from_account_id as string) ?? '—',
    to_id: t.to_account_id as string,
    to: names.get(t.to_account_id as string) ?? '—',
    amount: Number(t.amount),
    date: t.transfer_date as string,
    reference: (t.reference as string) ?? '',
    notes: (t.notes as string) ?? '',
    recorded_by: personName(t.recorder),
  };
}

// ── Balances ─────────────────────────────────────────────────────────────────

interface Movement {
  income: number;
  expense: number;
  inbound: number;
  outbound: number;
}

/** Money through each account (up to a day, when given), from the ledger and the transfers. */
async function movements(db: SupabaseClient, until?: string, accountId?: string): Promise<Map<string, Movement>> {
  const [txns, transfers] = await Promise.all([
    selectAll<{ bank_account_id: string; txn_type: TxnType; amount: number }>((a, b) => {
      let q = db.from('finance_transactions').select('bank_account_id, txn_type, amount').not('bank_account_id', 'is', null);
      if (until) q = q.lte('txn_date', until);
      if (accountId) q = q.eq('bank_account_id', accountId);
      return q.order('id').range(a, b);
    }),
    selectAll<{ from_account_id: string; to_account_id: string; amount: number }>((a, b) => {
      let q = db.from('account_transfers').select('from_account_id, to_account_id, amount');
      if (until) q = q.lte('transfer_date', until);
      if (accountId) q = q.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
      return q.order('id').range(a, b);
    }),
  ]);
  const out = new Map<string, Movement>();
  const of = (id: string) => {
    if (!out.has(id)) out.set(id, { income: 0, expense: 0, inbound: 0, outbound: 0 });
    return out.get(id)!;
  };
  for (const t of txns) {
    if (t.txn_type === 'INCOME') of(t.bank_account_id).income += Number(t.amount);
    else of(t.bank_account_id).expense += Number(t.amount);
  }
  for (const t of transfers) {
    of(t.from_account_id).outbound += Number(t.amount);
    of(t.to_account_id).inbound += Number(t.amount);
  }
  return out;
}

const balanceOf = (opening: number, m: Movement | undefined) =>
  Math.round((opening + (m ? m.income - m.expense + m.inbound - m.outbound : 0)) * 100) / 100;

function toAccount(a: Row, m: Movement | undefined, last: Row | undefined, open: number): BankAccount {
  return {
    id: a.id,
    name: a.name as string,
    kind: a.kind as AccountKind,
    bank_name: (a.bank_name as string) ?? '',
    account_number: (a.account_number as string) ?? '',
    branch: (a.branch as string) ?? '',
    currency: (a.currency as string) ?? 'ETB',
    opening_balance: Number(a.opening_balance),
    opening_date: a.opening_date as string,
    is_active: a.is_active as boolean,
    notes: (a.notes as string) ?? '',
    balance: balanceOf(Number(a.opening_balance), m),
    income: m?.income ?? 0,
    expense: m?.expense ?? 0,
    last_statement: last
      ? { period_end: (last.period_end as string) ?? null, closing_balance: num(last.closing_balance), status: last.status as StatementStatus }
      : null,
    open_lines: open,
  };
}

// ── Accounts page ────────────────────────────────────────────────────────────

export async function loadBanking(): Promise<Loaded<BankingData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('FINANCE_VIEW');
    const [accountRows, move, statements, openLines, transferRows, unassigned] = await Promise.all([
      db.from('bank_accounts').select('*').order('is_active', { ascending: false }).order('name').then(check) as Promise<Row[]>,
      movements(db),
      db.from('bank_statements').select('id, bank_account_id, period_end, closing_balance, status').order('period_end', { ascending: false, nullsFirst: false }).then(check) as Promise<Row[]>,
      selectAll<{ bank_account_id: string }>((a, b) => db.from('bank_statement_lines').select('bank_account_id').eq('status', 'UNMATCHED').order('id').range(a, b)),
      db.from('account_transfers').select(`*, ${RECORDER}`).order('transfer_date', { ascending: false }).order('created_at', { ascending: false }).limit(200).then(check) as Promise<Row[]>,
      selectAll<{ txn_type: TxnType; amount: number }>((a, b) => db.from('finance_transactions').select('txn_type, amount').is('bank_account_id', null).order('id').range(a, b)),
    ]);
    const lastBy = new Map<string, Row>();
    for (const s of statements) if (!lastBy.has(s.bank_account_id as string)) lastBy.set(s.bank_account_id as string, s);
    const openBy = new Map<string, number>();
    for (const l of openLines) openBy.set(l.bank_account_id, (openBy.get(l.bank_account_id) ?? 0) + 1);
    const accounts = accountRows.map((a) => toAccount(a, move.get(a.id), lastBy.get(a.id), openBy.get(a.id) ?? 0));
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    return {
      mode: 'live',
      data: {
        accounts,
        transfers: transferRows.map((t) => toTransfer(t, names)),
        unassigned: {
          count: unassigned.length,
          income: unassigned.filter((t) => t.txn_type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0),
          expense: unassigned.filter((t) => t.txn_type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0),
        },
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

/** Active accounts, for the "account" choice in the ledger and payment forms. Empty before 042. */
export async function accountOptions(): Promise<{ id: string; name: string; kind: AccountKind }[]> {
  if (!isSupabaseEnabled()) return DEMO_ACCOUNT_OPTIONS;
  try {
    const { db } = await authorize('FINANCE_VIEW', 'FINANCE_CREATE');
    const { data } = await db.from('bank_accounts').select('id, name, kind').eq('is_active', true).order('name');
    return (data ?? []) as { id: string; name: string; kind: AccountKind }[];
  } catch {
    return [];
  }
}

const AccountSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, 'Enter a name for the account').max(80),
  kind: z.enum(['BANK', 'CASH', 'MOBILE']),
  bank_name: z.string().trim().max(80),
  account_number: z.string().trim().max(40),
  branch: z.string().trim().max(80),
  opening_balance: z.coerce.number().min(-1_000_000_000).max(1_000_000_000),
  opening_date: isoDate,
  is_active: z.boolean(),
  notes: z.string().trim().max(500),
});

export async function saveAccount(input: z.input<typeof AccountSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const a = AccountSchema.parse(input);
    const fields = {
      name: a.name,
      kind: a.kind,
      bank_name: a.bank_name || null,
      account_number: a.account_number || null,
      branch: a.branch || null,
      opening_balance: a.opening_balance,
      opening_date: a.opening_date,
      is_active: a.is_active,
      notes: a.notes || null,
    };
    const res = a.id
      ? await db.from('bank_accounts').update(fields).eq('id', a.id)
      : await db.from('bank_accounts').insert({ ...fields, created_by: me.systemUser.id });
    if (res.error) {
      if (res.error.message.includes('bank_accounts_tid_name_key')) throw new Error('Another account already has this name');
      throw new Error(res.error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Transfers ────────────────────────────────────────────────────────────────

const TransferSchema = z.object({
  from_id: uuid,
  to_id: uuid,
  amount: z.coerce.number().positive('Amount must be more than 0').max(1_000_000_000, 'Amount is too large'),
  date: isoDate,
  reference: z.string().trim().max(120),
  notes: z.string().trim().max(500),
});

/** Money moved between two accounts (cash deposited at the bank, a withdrawal…). */
export async function recordTransfer(input: z.input<typeof TransferSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const t = TransferSchema.parse(input);
    if (t.from_id === t.to_id) throw new Error('Choose two different accounts');
    await db.from('account_transfers')
      .insert({
        from_account_id: t.from_id,
        to_account_id: t.to_id,
        amount: t.amount,
        transfer_date: t.date,
        reference: t.reference || null,
        notes: t.notes || null,
        recorded_by: me.systemUser.id,
      })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    const { data: used } = await db.from('bank_statement_lines').select('id').eq('transfer_id', id).limit(1);
    if ((used ?? []).length) throw new Error('This transfer is matched to a bank statement line — unmatch it first');
    await db.from('account_transfers').delete().eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Reconciliation view ──────────────────────────────────────────────────────

const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

function toStatement(s: Row, counts: Map<string, Record<LineStatus, number>>): StatementRow {
  const c = counts.get(s.id) ?? { MATCHED: 0, UNMATCHED: 0, IGNORED: 0 };
  return {
    id: s.id,
    account_id: s.bank_account_id as string,
    file_name: s.file_name as string,
    period_start: (s.period_start as string) ?? null,
    period_end: (s.period_end as string) ?? null,
    opening_balance: num(s.opening_balance),
    closing_balance: num(s.closing_balance),
    line_count: Number(s.line_count),
    skipped_count: Number(s.skipped_count),
    status: s.status as StatementStatus,
    imported_by: personName(s.importer),
    imported_at: s.imported_at as string,
    reconciled_by: personName(s.closer),
    reconciled_at: (s.reconciled_at as string) ?? null,
    matched: c.MATCHED,
    unmatched: c.UNMATCHED,
    ignored: c.IGNORED,
  };
}

export async function loadReconcile(accountId: string, statementId?: string): Promise<Loaded<ReconcileView>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('FINANCE_VIEW');
    const account = (await db.from('bank_accounts').select('*').eq('id', accountId).maybeSingle().then(check)) as Row | null;
    if (!account) throw new Error('This account was not found');

    const [statementRows, lineStates] = await Promise.all([
      db.from('bank_statements')
        .select('*, importer:system_users!bank_statements_imported_by_fkey(person:persons!system_users_person_id_fkey(full_name_en)), closer:system_users!bank_statements_reconciled_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
        .eq('bank_account_id', accountId)
        .order('period_end', { ascending: false, nullsFirst: false })
        .order('imported_at', { ascending: false })
        .then(check) as Promise<Row[]>,
      selectAll<{ statement_id: string; status: LineStatus }>((a, b) =>
        db.from('bank_statement_lines').select('statement_id, status').eq('bank_account_id', accountId).order('id').range(a, b)
      ),
    ]);
    const counts = new Map<string, Record<LineStatus, number>>();
    for (const l of lineStates) {
      if (!counts.has(l.statement_id)) counts.set(l.statement_id, { MATCHED: 0, UNMATCHED: 0, IGNORED: 0 });
      counts.get(l.statement_id)![l.status]++;
    }
    const statements = statementRows.map((s) => toStatement(s, counts));
    const statement = statements.find((s) => s.id === statementId) ?? statements.find((s) => s.status === 'OPEN') ?? statements[0] ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const from = shift(statement?.period_start ?? shift(today, -90), -45);
    const to = shift(statement?.period_end ?? today, 30);

    const [lineRows, near, transferRows, accountNames, move] = await Promise.all([
      statement
        ? selectAll<Row>((a, b) => db.from('bank_statement_lines').select('*').eq('statement_id', statement.id).order('line_date').order('created_at').order('id').range(a, b))
        : Promise.resolve([] as Row[]),
      // Records near the statement's dates: matched to its lines, or still free (this account's or no account's)
      selectAll<Row>((a, b) =>
        db.from('finance_transactions')
          .select(TXN_COLUMNS)
          .or(`bank_account_id.eq.${accountId},bank_account_id.is.null`)
          .gte('txn_date', from)
          .lte('txn_date', to)
          .order('txn_date')
          .order('id')
          .range(a, b)
      ),
      db.from('account_transfers')
        .select(`*, ${RECORDER}`)
        .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
        .gte('transfer_date', from)
        .lte('transfer_date', to)
        .order('transfer_date')
        .then(check) as Promise<Row[]>,
      db.from('bank_accounts').select('id, name').then(check) as Promise<{ id: string; name: string }[]>,
      statement?.period_end ? movements(db, statement.period_end, accountId) : Promise.resolve(null),
    ]);

    const items = near.map(toItem);
    const lineIds = new Set(lineRows.map((l) => l.id));
    const byLine = new Map<string, LedgerItem[]>();
    for (const x of items) if (x.statement_line_id && lineIds.has(x.statement_line_id)) byLine.set(x.statement_line_id, [...(byLine.get(x.statement_line_id) ?? []), x]);
    const lines: StatementLine[] = lineRows.map((l) => ({
      id: l.id,
      date: l.line_date as string,
      description: (l.description as string) ?? '',
      reference: (l.reference as string) ?? '',
      amount: Number(l.amount),
      balance: num(l.balance),
      status: l.status as LineStatus,
      note: (l.note as string) ?? '',
      transfer_id: (l.transfer_id as string) ?? null,
      txns: byLine.get(l.id) ?? [],
    }));
    const names = new Map(accountNames.map((a) => [a.id, a.name]));
    const opening = Number(account.opening_balance);

    // Outstanding: this account's records up to the end that no statement shows
    let outstanding: LedgerItem[] = [];
    let summary: ReconcileView['summary'] = null;
    if (statement?.period_end) {
      const end = statement.period_end;
      const [free, bankOnlyRows] = await Promise.all([
        selectAll<Row>((a, b) =>
          db.from('finance_transactions').select(TXN_COLUMNS).eq('bank_account_id', accountId).is('statement_line_id', null).lte('txn_date', end).order('txn_date').order('id').range(a, b)
        ),
        selectAll<{ amount: number }>((a, b) =>
          db.from('bank_statement_lines').select('amount').eq('bank_account_id', accountId).in('status', ['UNMATCHED', 'IGNORED']).lte('line_date', end).order('id').range(a, b)
        ),
      ]);
      outstanding = free.map(toItem);
      summary = {
        bank_closing: statement.closing_balance,
        book_balance: balanceOf(opening, move?.get(accountId)),
        bank_only: Math.round(bankOnlyRows.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100,
        book_only: Math.round(outstanding.reduce((s, x) => s + (x.type === 'INCOME' ? x.amount : -x.amount), 0) * 100) / 100,
      };
    }

    const whole = await movements(db, undefined, accountId);
    return {
      mode: 'live',
      data: {
        account: toAccount(account, whole.get(accountId), undefined, lines.filter((l) => l.status === 'UNMATCHED').length),
        statements,
        statement,
        lines,
        candidates: items.filter((x) => !x.statement_line_id),
        transfers: transferRows.map((t) => toTransfer(t, names)),
        outstanding,
        summary,
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

// ── Importing a statement ────────────────────────────────────────────────────

const LineSchema = z.object({
  date: isoDate,
  description: z.string().max(500),
  reference: z.string().max(120),
  amount: z.number().finite().refine((n) => n !== 0, 'A line without money'),
  balance: z.number().finite().nullable(),
});

const ImportSchema = z.object({
  account_id: uuid,
  file_name: z.string().trim().min(1).max(200),
  lines: z.array(LineSchema).min(1, 'The file has no money lines').max(5000, 'At most 5,000 lines per file — split the statement'),
  closing_balance: z.number().finite().nullable(),
});

export async function importStatement(
  input: z.input<typeof ImportSchema>
): Promise<{ ok: true; statement_id: string; added: number; skipped: number; matched: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const s = ImportSchema.parse(input);
    const lines = s.lines as ParsedLine[];
    const account = (await db.from('bank_accounts').select('id, is_active').eq('id', s.account_id).maybeSingle().then(check)) as { id: string; is_active: boolean } | null;
    if (!account) throw new Error('This account was not found');
    if (!account.is_active) throw new Error('This account is switched off');

    const dates = lines.map((l) => l.date).sort();
    // The bank's own balance: after the last line (in file order) when the file has a balance column
    const lastWithBalance = [...lines].reverse().find((l) => l.balance != null);
    const firstWithBalance = lines.find((l) => l.balance != null);
    const statement = (await db.from('bank_statements')
      .insert({
        bank_account_id: s.account_id,
        file_name: s.file_name,
        period_start: dates[0],
        period_end: dates[dates.length - 1],
        opening_balance: firstWithBalance ? Math.round((firstWithBalance.balance! - firstWithBalance.amount) * 100) / 100 : null,
        closing_balance: s.closing_balance ?? lastWithBalance?.balance ?? null,
        imported_by: me.systemUser.id,
      })
      .select('id')
      .single()
      .then(check)) as { id: string };

    const prints = fingerprints(lines);
    let added = 0;
    for (let i = 0; i < lines.length; i += 500) {
      const chunk = lines.slice(i, i + 500).map((l, j) => ({
        statement_id: statement.id,
        bank_account_id: s.account_id,
        line_date: l.date,
        description: l.description || null,
        reference: l.reference || null,
        amount: l.amount,
        balance: l.balance,
        fingerprint: prints[i + j],
      }));
      const { data, error } = await db.from('bank_statement_lines')
        .upsert(chunk, { onConflict: 'bank_account_id,fingerprint', ignoreDuplicates: true })
        .select('id');
      if (error) {
        await db.from('bank_statements').delete().eq('id', statement.id);
        throw new Error(error.message);
      }
      added += (data ?? []).length;
    }
    const skipped = lines.length - added;
    if (added === 0) {
      await db.from('bank_statements').delete().eq('id', statement.id);
      throw new Error(`Every line of this file was imported before (${skipped} lines) — nothing new`);
    }
    await db.from('bank_statements').update({ line_count: added, skipped_count: skipped }).eq('id', statement.id).then(check);
    const matched = await runAutoMatch(db, me.systemUser.id, statement.id);
    return { ok: true, statement_id: statement.id, added, skipped, matched };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** The line and its statement, if the statement may still be changed. */
async function openLine(db: SupabaseClient, lineId: string) {
  const line = (await db.from('bank_statement_lines')
    .select('id, statement_id, bank_account_id, amount, line_date, status, statement:bank_statements!bank_statement_lines_statement_fkey(status)')
    .eq('id', lineId)
    .maybeSingle()
    .then(check)) as (Row & { statement_id: string; bank_account_id: string; amount: number; line_date: string; status: LineStatus; statement: { status: string } | null }) | null;
  if (!line) throw new Error('This statement line was not found');
  if (line.statement?.status === 'RECONCILED') throw new Error('This statement is closed — reopen it to change matches');
  return { ...line, amount: Number(line.amount) };
}

async function setLine(db: SupabaseClient, lineId: string, status: LineStatus, by: string | null, extra: Record<string, unknown> = {}) {
  await db.from('bank_statement_lines')
    .update({ status, matched_by: by, matched_at: by ? new Date().toISOString() : null, ...extra })
    .eq('id', lineId)
    .then(check);
}

/** Matches a line to ledger records (one, or several that add up to it — e.g. one deposit of many collections). */
export async function matchLine(lineId: string, txnIds: string[]): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const ids = z.array(uuid).min(1, 'Choose at least one record').max(200).parse([...new Set(txnIds)]);
    const line = await openLine(db, lineId);
    if (line.status !== 'UNMATCHED') throw new Error('This line is already matched or set aside');
    const txns = (await db.from('finance_transactions').select('id, txn_type, amount, bank_account_id, statement_line_id').in('id', ids).then(check)) as {
      id: string; txn_type: TxnType; amount: number; bank_account_id: string | null; statement_line_id: string | null;
    }[];
    if (txns.length !== ids.length) throw new Error('A chosen record no longer exists');
    const type: TxnType = line.amount > 0 ? 'INCOME' : 'EXPENSE';
    if (txns.some((t) => t.txn_type !== type)) throw new Error(type === 'INCOME' ? 'Money in can only match income records' : 'Money out can only match expense records');
    if (txns.some((t) => t.statement_line_id)) throw new Error('A chosen record is already matched to another line');
    if (txns.some((t) => t.bank_account_id && t.bank_account_id !== line.bank_account_id)) throw new Error('A chosen record belongs to another account');
    const total = txns.reduce((s, t) => s + cents(Number(t.amount)), 0);
    if (total !== cents(Math.abs(line.amount))) throw new Error('The chosen records must add up to exactly the line’s amount');

    const updated = (await db.from('finance_transactions')
      .update({ statement_line_id: lineId, bank_account_id: line.bank_account_id })
      .in('id', ids)
      .is('statement_line_id', null)
      .select('id')
      .then(check)) as { id: string }[];
    if (updated.length !== ids.length) {
      await db.from('finance_transactions').update({ statement_line_id: null }).eq('statement_line_id', lineId);
      throw new Error('Someone matched one of these records at the same time — try again');
    }
    await setLine(db, lineId, 'MATCHED', me.systemUser.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** The line is money moved between two of our own accounts. */
export async function matchTransfer(lineId: string, transferId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const line = await openLine(db, lineId);
    if (line.status !== 'UNMATCHED') throw new Error('This line is already matched or set aside');
    const t = (await db.from('account_transfers').select('id, from_account_id, to_account_id, amount').eq('id', uuid.parse(transferId)).maybeSingle().then(check)) as {
      id: string; from_account_id: string; to_account_id: string; amount: number;
    } | null;
    if (!t) throw new Error('This transfer was not found');
    const side = line.amount > 0 ? t.to_account_id : t.from_account_id;
    if (side !== line.bank_account_id) throw new Error(line.amount > 0 ? 'This transfer does not go into this account' : 'This transfer does not come out of this account');
    if (cents(Number(t.amount)) !== cents(Math.abs(line.amount))) throw new Error('The transfer’s amount is not the line’s amount');
    const { data: used } = await db.from('bank_statement_lines').select('id').eq('transfer_id', t.id).eq('bank_account_id', line.bank_account_id).limit(1);
    if ((used ?? []).length) throw new Error('This transfer is already matched on this account');
    await setLine(db, lineId, 'MATCHED', me.systemUser.id, { transfer_id: t.id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function unmatchLine(lineId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    await openLine(db, lineId);
    await db.from('finance_transactions').update({ statement_line_id: null }).eq('statement_line_id', lineId).then(check);
    await setLine(db, lineId, 'UNMATCHED', null, { transfer_id: null, note: null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Sets a line aside with a reason (e.g. a reversed entry) — it stays out of the books. */
export async function ignoreLine(lineId: string, note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const reason = z.string().trim().min(3, 'Write why this line is set aside').max(300).parse(note);
    const line = await openLine(db, lineId);
    if (line.status !== 'UNMATCHED') throw new Error('This line is already matched or set aside');
    await setLine(db, lineId, 'IGNORED', me.systemUser.id, { note: reason });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const FromLineSchema = z.object({
  category: z.string().trim().min(1, 'Choose a category'),
  party: z.string().trim().max(120),
  description: z.string().trim().max(500),
  unit_id: z.string(),
});

/** A line the books do not have yet (bank charges, interest, a direct deposit): record it and match it at once. */
export async function recordFromLine(lineId: string, input: z.input<typeof FromLineSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const f = FromLineSchema.parse(input);
    const line = await openLine(db, lineId);
    if (line.status !== 'UNMATCHED') throw new Error('This line is already matched or set aside');
    const full = (await db.from('bank_statement_lines').select('description, reference').eq('id', lineId).single().then(check)) as { description: string | null; reference: string | null };
    const txn = (await db.from('finance_transactions')
      .insert({
        txn_type: line.amount > 0 ? 'INCOME' : 'EXPENSE',
        category: f.category,
        amount: Math.abs(line.amount),
        txn_date: line.line_date,
        description: f.description || full.description || null,
        party: f.party || null,
        receipt_no: full.reference || null,
        organization_unit_id: f.unit_id || null,
        bank_account_id: line.bank_account_id,
        statement_line_id: lineId,
        recorded_by: me.systemUser.id,
      })
      .select('id')
      .single()
      .then(check)) as { id: string };
    try {
      await setLine(db, lineId, 'MATCHED', me.systemUser.id);
    } catch (e) {
      await db.from('finance_transactions').delete().eq('id', txn.id);
      throw e;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

async function runAutoMatch(db: SupabaseClient, userId: string, statementId: string): Promise<number> {
  const st = (await db.from('bank_statements').select('id, bank_account_id, period_start, period_end, status').eq('id', statementId).single().then(check)) as {
    id: string; bank_account_id: string; period_start: string | null; period_end: string | null; status: StatementStatus;
  };
  if (st.status === 'RECONCILED') return 0;
  const today = new Date().toISOString().slice(0, 10);
  const [lineRows, txnRows] = await Promise.all([
    selectAll<Row>((a, b) => db.from('bank_statement_lines').select('id, line_date, description, reference, amount, status').eq('statement_id', statementId).eq('status', 'UNMATCHED').order('id').range(a, b)),
    selectAll<Row>((a, b) =>
      db.from('finance_transactions')
        .select(TXN_COLUMNS)
        .or(`bank_account_id.eq.${st.bank_account_id},bank_account_id.is.null`)
        .is('statement_line_id', null)
        .gte('txn_date', shift(st.period_start ?? today, -14))
        .lte('txn_date', shift(st.period_end ?? today, 14))
        .order('id')
        .range(a, b)
    ),
  ]);
  const lines: StatementLine[] = lineRows.map((l) => ({
    id: l.id, date: l.line_date as string, description: (l.description as string) ?? '', reference: (l.reference as string) ?? '',
    amount: Number(l.amount), balance: null, status: 'UNMATCHED', note: '', transfer_id: null, txns: [],
  }));
  let matched = 0;
  for (const m of autoMatches(lines, txnRows.map(toItem), st.bank_account_id)) {
    const { data } = await db.from('finance_transactions')
      .update({ statement_line_id: m.lineId, bank_account_id: st.bank_account_id })
      .eq('id', m.txnId)
      .is('statement_line_id', null)
      .select('id');
    if (!(data ?? []).length) continue;
    const { error } = await db.from('bank_statement_lines')
      .update({ status: 'MATCHED', matched_by: userId, matched_at: new Date().toISOString(), note: 'Matched automatically' })
      .eq('id', m.lineId)
      .eq('status', 'UNMATCHED');
    if (error) await db.from('finance_transactions').update({ statement_line_id: null }).eq('id', m.txnId);
    else matched++;
  }
  return matched;
}

/** Matches the lines that are clearly one ledger record (see lib/finance/banking autoMatches). */
export async function autoMatch(statementId: string): Promise<{ ok: true; matched: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    return { ok: true, matched: await runAutoMatch(db, me.systemUser.id, uuid.parse(statementId)) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Statements ───────────────────────────────────────────────────────────────

export async function setClosingBalance(statementId: string, closing: number | null): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    const value = z.number().finite().nullable().parse(closing);
    await db.from('bank_statements').update({ closing_balance: value }).eq('id', statementId).eq('status', 'OPEN').then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Closes a statement once every line is matched or set aside. */
export async function finishStatement(statementId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_APPROVE');
    const { count } = await db.from('bank_statement_lines').select('id', { count: 'exact', head: true }).eq('statement_id', statementId).eq('status', 'UNMATCHED');
    if (count) throw new Error(`${count} line(s) are not matched yet — match them or set them aside first`);
    await db.from('bank_statements')
      .update({ status: 'RECONCILED', reconciled_by: me.systemUser.id, reconciled_at: new Date().toISOString() })
      .eq('id', statementId)
      .eq('status', 'OPEN')
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function reopenStatement(statementId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_APPROVE');
    await db.from('bank_statements').update({ status: 'OPEN', reconciled_by: null, reconciled_at: null }).eq('id', statementId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Removes an open statement and its lines; their ledger records become unmatched again. */
export async function deleteStatement(statementId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    const st = (await db.from('bank_statements').select('status').eq('id', statementId).maybeSingle().then(check)) as { status: StatementStatus } | null;
    if (!st) throw new Error('This statement was not found');
    if (st.status === 'RECONCILED') throw new Error('A closed statement cannot be removed — reopen it first');
    await db.from('bank_statements').delete().eq('id', statementId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
