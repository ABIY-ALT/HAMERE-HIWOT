// ─────────────────────────────────────────────────────────────────────────────
// Budget figures (server only). Allocations come from budget_allocations;
// spent / committed / pending are derived from the ledger and requests that
// fall inside the academic year's dates.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { check, selectAll } from '@/lib/auth/authorize';
import type { BudgetLine, BudgetYear } from './types';

/** Units always listed on the budget, even with no allocation or spending yet. */
const BUDGETED_UNIT_TYPES = ['DEPARTMENT', 'COORDINATION'];

export async function computeBudget(
  db: SupabaseClient,
  year: BudgetYear,
  onlyUnitIds?: string[]
): Promise<BudgetLine[]> {
  const yearEnd = `${year.end_date}T23:59:59.999Z`;
  const [units, allocations, expenses, requests] = await Promise.all([
    db.from('organization_units')
      .select('id, name_en, name_am, unit_type, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .then(check) as Promise<{ id: string; name_en: string; name_am: string | null; unit_type: string }[]>,
    db.from('budget_allocations')
      .select('organization_unit_id, allocated, notes')
      .eq('academic_year_id', year.id)
      .then(check) as Promise<{ organization_unit_id: string; allocated: number; notes: string | null }[]>,
    selectAll<{ organization_unit_id: string | null; amount: number }>((a, b) =>
      db.from('finance_transactions')
        .select('organization_unit_id, amount')
        .eq('txn_type', 'EXPENSE')
        .gte('txn_date', year.start_date)
        .lte('txn_date', year.end_date)
        .order('id')
        .range(a, b)
    ),
    selectAll<{ organization_unit_id: string; amount: number; status: string }>((a, b) =>
      db.from('finance_requests')
        .select('organization_unit_id, amount, status')
        .in('status', ['PENDING', 'APPROVED'])
        .gte('created_at', year.start_date)
        .lte('created_at', yearEnd)
        .order('id')
        .range(a, b)
    ),
  ]);

  const add = (map: Map<string, number>, key: string | null, amount: number) => {
    if (key) map.set(key, (map.get(key) ?? 0) + Number(amount));
  };
  const spent = new Map<string, number>();
  const committed = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const e of expenses) add(spent, e.organization_unit_id, e.amount);
  for (const r of requests) add(r.status === 'APPROVED' ? committed : pending, r.organization_unit_id, r.amount);
  const allocationOf = new Map(allocations.map((a) => [a.organization_unit_id, a]));

  return units
    .filter((u) => (onlyUnitIds ? onlyUnitIds.includes(u.id) : true))
    .filter(
      (u) =>
        BUDGETED_UNIT_TYPES.includes(u.unit_type) ||
        allocationOf.has(u.id) ||
        spent.has(u.id) ||
        committed.has(u.id) ||
        pending.has(u.id) ||
        Boolean(onlyUnitIds)
    )
    .map((u) => {
      const allocation = allocationOf.get(u.id);
      return {
        unit_id: u.id,
        unit: u.name_en,
        unit_am: u.name_am || u.name_en,
        unit_type: u.unit_type,
        allocated: allocation ? Number(allocation.allocated) : null,
        notes: allocation?.notes ?? '',
        spent: spent.get(u.id) ?? 0,
        committed: committed.get(u.id) ?? 0,
        pending: pending.get(u.id) ?? 0,
      };
    });
}

export async function loadYears(db: SupabaseClient): Promise<BudgetYear[]> {
  return (await db.from('academic_years')
    .select('id, name, is_current, start_date, end_date')
    .order('start_date', { ascending: false })
    .then(check)) as BudgetYear[];
}
