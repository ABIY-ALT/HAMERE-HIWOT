// Sample bank accounts and a statement for demo mode (no database): enough to
// see the accounts page and every kind of line on the reconciliation page.

import type { BankingData, LedgerItem, ReconcileView, StatementLine } from './banking';

const ACCOUNTS: BankingData['accounts'] = [
  {
    id: 'demo-cbe', name: 'CBE main account', kind: 'BANK', bank_name: 'Commercial Bank of Ethiopia', account_number: '1000123456789', branch: 'Sallo',
    currency: 'ETB', opening_balance: 18500, opening_date: '2026-09-11', is_active: true, notes: '', balance: 24135, income: 9150, expense: 3515,
    last_statement: { period_end: '2026-10-20', closing_balance: 24120, status: 'OPEN' }, open_lines: 2,
  },
  {
    id: 'demo-cash', name: 'Cash box', kind: 'CASH', bank_name: '', account_number: '', branch: '', currency: 'ETB',
    opening_balance: 2000, opening_date: '2026-09-11', is_active: true, notes: '', balance: 3450, income: 3650, expense: 2200,
    last_statement: null, open_lines: 0,
  },
  {
    id: 'demo-telebirr', name: 'Telebirr', kind: 'MOBILE', bank_name: 'Telebirr', account_number: '0911000000', branch: '', currency: 'ETB',
    opening_balance: 0, opening_date: '2026-09-11', is_active: true, notes: '', balance: 1200, income: 1200, expense: 0,
    last_statement: null, open_lines: 0,
  },
];

export function demoBanking(): BankingData {
  return {
    accounts: ACCOUNTS,
    transfers: [{ id: 'demo-t1', from_id: 'demo-cash', from: 'Cash box', to_id: 'demo-cbe', to: 'CBE main account', amount: 1800, date: '2026-10-06', reference: 'DS-0412', notes: 'Sunday collection deposited', recorded_by: 'Demo' }],
    unassigned: { count: 4, income: 2350, expense: 0 },
  };
}

const item = (x: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'type' | 'category' | 'amount' | 'date'>): LedgerItem => ({
  description: '', party: '', receipt_no: '', request_no: '', bank_account_id: 'demo-cbe', statement_line_id: null, ...x,
});

export function demoReconcile(): ReconcileView {
  const dues = item({ id: 'd1', type: 'INCOME', category: 'Member Contributions', amount: 1500, date: '2026-10-02', party: 'Abebe Kebede', receipt_no: 'DUE-2019-0012', statement_line_id: 'l1' });
  const print = item({ id: 'd2', type: 'EXPENSE', category: 'Printing & Media', amount: 2300, date: '2026-10-04', party: 'Selam Printing', request_no: 'FR-2026-0004', statement_line_id: 'l2' });
  const statement: ReconcileView['statements'][number] = {
    id: 'demo-s1', account_id: 'demo-cbe', file_name: 'CBE_October_2026.xlsx', period_start: '2026-10-03', period_end: '2026-10-20',
    opening_balance: 18500, closing_balance: 24120, line_count: 5, skipped_count: 0, status: 'OPEN', imported_by: 'Demo', imported_at: '2026-10-21T08:00:00Z',
    reconciled_by: '', reconciled_at: null, matched: 3, unmatched: 2, ignored: 0,
  };
  const lines: StatementLine[] = [
    { id: 'l1', date: '2026-10-03', description: 'Cash deposit by Abebe DUE-2019-0012', reference: 'FT26276ABC', amount: 1500, balance: 20000, status: 'MATCHED', note: 'Matched automatically', transfer_id: null, txns: [dues] },
    { id: 'l2', date: '2026-10-05', description: 'Transfer to Selam Printing FR-2026-0004', reference: 'FT26278XYZ', amount: -2300, balance: 17700, status: 'MATCHED', note: '', transfer_id: null, txns: [print] },
    { id: 'l3', date: '2026-10-06', description: 'Cash deposit', reference: 'DS-0412', amount: 1800, balance: 19500, status: 'MATCHED', note: '', transfer_id: 'demo-t1', txns: [] },
    { id: 'l4', date: '2026-10-12', description: 'Deposit — Sunday donations', reference: 'FT26285QWE', amount: 4650, balance: 24150, status: 'UNMATCHED', note: '', transfer_id: null, txns: [] },
    { id: 'l5', date: '2026-10-20', description: 'Service charge', reference: '', amount: -30, balance: 24120, status: 'UNMATCHED', note: '', transfer_id: null, txns: [] },
  ];
  return {
    account: ACCOUNTS[0],
    statements: [statement],
    statement,
    lines,
    candidates: [
      item({ id: 'c1', type: 'INCOME', category: 'Donations', amount: 2300, date: '2026-10-11', party: 'Sunday collection', bank_account_id: null }),
      item({ id: 'c2', type: 'INCOME', category: 'Member Contributions', amount: 1650, date: '2026-10-11', receipt_no: 'DUE-2019-0031', bank_account_id: null }),
      item({ id: 'c3', type: 'INCOME', category: 'Donations', amount: 700, date: '2026-10-12', party: 'W/ro Almaz', bank_account_id: null }),
      item({ id: 'c4', type: 'EXPENSE', category: 'Transport', amount: 450, date: '2026-10-18', party: 'Taxi' }),
    ],
    transfers: demoBanking().transfers,
    outstanding: [item({ id: 'c4', type: 'EXPENSE', category: 'Transport', amount: 450, date: '2026-10-18', party: 'Taxi' })],
    summary: { bank_closing: 24120, book_balance: 19050, bank_only: 4620, book_only: -450 },
  };
}

export const DEMO_ACCOUNT_OPTIONS = ACCOUNTS.map(({ id, name, kind }) => ({ id, name, kind }));
