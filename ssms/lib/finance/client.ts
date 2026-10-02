'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Finance data on the client — one shared store for the Finance pages.
// Supabase mode: loaded from loadFinance() and reloaded after each change.
// Demo mode: sample data; changes stay on screen until the page reloads.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import {
  cancelRequest as cancelAction,
  loadFinance,
  markRequestPaid as payAction,
  recordTransaction as recordAction,
  resubmitRequest as resubmitAction,
  reviewRequest as reviewAction,
  submitRequest as submitAction,
  type RequestInput,
} from '@/app/dashboard/finance/actions';
import { MOCK_APPROVALS, MOCK_BUDGET_ITEMS, MOCK_EXPENSES, MOCK_INCOME } from '@/lib/mock/modules';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import type { ActionResult } from '@/lib/admin/types';
import {
  EMPTY_FINANCE,
  type BudgetLine,
  type FinanceData,
  type FinanceRequest,
  type FinanceTxn,
  type TxnType,
} from './types';

export type FinanceMode = 'loading' | 'demo' | 'live' | 'error';
export interface FinanceState extends FinanceData {
  mode: FinanceMode;
  error: string;
}

const LOADING: FinanceState = { ...EMPTY_FINANCE, mode: 'loading', error: '' };
const STALE_AFTER_MS = 15_000;

let state: FinanceState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: FinanceState) {
  state = next;
  listeners.forEach((l) => l());
}

function demoFinance(): FinanceData {
  const units = MOCK_ORG_UNITS.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am }));
  const dept = MOCK_ORG_UNITS.find((u) => u.unit_type === 'DEPARTMENT') ?? MOCK_ORG_UNITS[0];
  const requests: FinanceRequest[] = MOCK_APPROVALS.map((a, i) => ({
    id: a.id,
    request_no: `FR-2026-${String(i + 1).padStart(4, '0')}`,
    unit_id: dept.id,
    unit: dept.name_en,
    unit_am: dept.name_am,
    requested_by_id: `demo-requester-${i}`,
    requested_by: a.requested_by,
    title: a.title,
    category: a.type === 'Purchase' ? 'Equipment' : 'Programs & Events',
    amount: a.amount,
    needed_by: null,
    justification: a.title,
    priority: (a.priority as FinanceRequest['priority']) ?? 'NORMAL',
    status: a.status as FinanceRequest['status'],
    review_note: '',
    reviewed_by: '',
    reviewed_at: null,
    paid_at: null,
    payment_reference: '',
    created_at: `${a.requested_at}T09:00:00Z`,
  }));
  const transactions: FinanceTxn[] = [
    ...MOCK_INCOME.map((i) => ({
      id: i.id, type: 'INCOME' as const, category: i.category, amount: i.amount, date: i.date,
      description: i.description, party: '', receipt_no: '', unit: '', request_no: '', recorded_by: i.received_by,
    })),
    ...MOCK_EXPENSES.map((e) => ({
      id: e.id, type: 'EXPENSE' as const, category: e.category, amount: e.amount, date: e.date,
      description: e.description, party: '', receipt_no: '', unit: '', request_no: '', recorded_by: e.paid_by,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return { requests, transactions, units, budget: demoBudget(requests), budgetYear: '2025/2026' };
}

/** Demo budget: the sample allocations spread over the departments. */
export function demoBudget(requests: FinanceRequest[] = []): BudgetLine[] {
  return MOCK_ORG_UNITS.filter((u) => u.unit_type === 'DEPARTMENT' || u.unit_type === 'COORDINATION').map((u, i) => {
    const item = u.unit_type === 'DEPARTMENT' ? MOCK_BUDGET_ITEMS[i % MOCK_BUDGET_ITEMS.length] : undefined;
    const mine = requests.filter((r) => r.unit_id === u.id);
    return {
      unit_id: u.id,
      unit: u.name_en,
      unit_am: u.name_am,
      unit_type: u.unit_type,
      allocated: item ? item.allocated : null,
      notes: '',
      spent: item ? item.spent : 0,
      committed: mine.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0),
      pending: mine.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0),
    };
  });
}

export function refreshFinance(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadFinance()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoFinance(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetFinance() {
  loadedAt = 0;
  emit(LOADING);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > STALE_AFTER_MS) void refreshFinance();
  return () => {
    listeners.delete(listener);
  };
}

export function useFinance(): FinanceState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

async function afterLive(res: ActionResult): Promise<ActionResult> {
  if (res.ok) await refreshFinance();
  return res;
}

function patchRequest(id: string, patch: Partial<FinanceRequest>) {
  emit({ ...state, requests: state.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function submitRequest(
  input: RequestInput,
  me: { id: string; name: string }
): Promise<{ ok: true; request_no: string } | { ok: false; error: string }> {
  if (state.mode === 'live') {
    const res = await submitAction(input);
    if (res.ok) await refreshFinance();
    return res;
  }
  const unit = state.units.find((u) => u.id === input.unit_id);
  const request_no = `FR-${new Date().getFullYear()}-${String(state.requests.length + 1).padStart(4, '0')}`;
  emit({
    ...state,
    requests: [
      {
        id: `fr-${Date.now()}`,
        request_no,
        unit_id: input.unit_id,
        unit: unit?.name_en ?? '—',
        unit_am: unit?.name_am ?? '—',
        requested_by_id: me.id,
        requested_by: me.name,
        title: input.title,
        category: input.category,
        amount: Number(input.amount),
        needed_by: input.needed_by || null,
        justification: input.justification,
        priority: input.priority,
        status: 'PENDING',
        review_note: '',
        reviewed_by: '',
        reviewed_at: null,
        paid_at: null,
        payment_reference: '',
        created_at: new Date().toISOString(),
      },
      ...state.requests,
    ],
  });
  return { ok: true, request_no };
}

export async function resubmitRequest(id: string, input: RequestInput): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await resubmitAction(id, input));
  const unit = state.units.find((u) => u.id === input.unit_id);
  patchRequest(id, {
    unit_id: input.unit_id,
    unit: unit?.name_en ?? '—',
    unit_am: unit?.name_am ?? '—',
    title: input.title,
    category: input.category,
    amount: Number(input.amount),
    needed_by: input.needed_by || null,
    justification: input.justification,
    priority: input.priority,
    status: 'PENDING',
    reviewed_by: '',
    reviewed_at: null,
  });
  return { ok: true };
}

export async function cancelRequest(id: string): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await cancelAction(id));
  patchRequest(id, { status: 'CANCELLED' });
  return { ok: true };
}

export async function reviewRequest(
  id: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  note: string,
  reviewer: string
): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await reviewAction(id, decision, note));
  if (decision !== 'APPROVED' && note.trim().length < 3) {
    return { ok: false, error: 'Write a note explaining why the request is rejected or returned' };
  }
  patchRequest(id, { status: decision, review_note: note.trim(), reviewed_by: reviewer, reviewed_at: new Date().toISOString() });
  return { ok: true };
}

export async function markRequestPaid(
  id: string,
  input: { paid_at: string; reference: string; payee: string },
  recorder: string
): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await payAction(id, input));
  const req = state.requests.find((r) => r.id === id);
  if (!req) return { ok: false, error: 'Request not found' };
  emit({
    ...state,
    requests: state.requests.map((r) =>
      r.id === id ? { ...r, status: 'COMPLETED', paid_at: input.paid_at, payment_reference: input.reference } : r
    ),
    transactions: [
      {
        id: `txn-${Date.now()}`, type: 'EXPENSE', category: req.category, amount: req.amount, date: input.paid_at,
        description: `${req.request_no} — ${req.title}`, party: input.payee, receipt_no: input.reference,
        unit: req.unit, request_no: req.request_no, recorded_by: recorder,
      },
      ...state.transactions,
    ],
  });
  return { ok: true };
}

export async function recordTransaction(
  input: {
    type: TxnType;
    category: string;
    amount: number;
    date: string;
    party: string;
    receipt_no: string;
    unit_id: string;
    description: string;
  },
  recorder: string
): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await recordAction(input));
  const unit = state.units.find((u) => u.id === input.unit_id);
  emit({
    ...state,
    transactions: [
      {
        id: `txn-${Date.now()}`, type: input.type, category: input.category, amount: input.amount, date: input.date,
        description: input.description, party: input.party, receipt_no: input.receipt_no,
        unit: unit?.name_en ?? '', request_no: '', recorded_by: recorder,
      },
      ...state.transactions,
    ].sort((a, b) => b.date.localeCompare(a.date)),
  });
  return { ok: true };
}
