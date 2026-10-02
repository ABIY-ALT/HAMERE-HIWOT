'use client';

import React from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { budgetRemaining, formatETB, type BudgetLine } from '@/lib/finance/types';

/**
 * A department's budget at a glance, and what is left after `amount`.
 * Used in the request form (requester) and the review screen (finance head).
 */
export function BudgetCheck({
  line,
  year,
  amount,
}: {
  line: BudgetLine | undefined;
  year: string | null;
  amount: number;
}) {
  const { t } = useLang();
  if (!year) return null;

  if (!line || line.allocated === null) {
    return (
      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
        <Wallet size={14} className="text-slate-400 shrink-0" />
        {t(`No budget has been set for this department in ${year}.`, `ለዚህ ክፍል በ${year} በጀት አልተመደበም።`)}
      </div>
    );
  }

  const remaining = budgetRemaining(line) ?? 0;
  const after = remaining - (amount || 0);
  const over = amount > 0 && after < 0;
  const usedPct = line.allocated > 0 ? Math.min(100, Math.round(((line.spent + line.committed) / line.allocated) * 100)) : 100;

  return (
    <div className={`text-xs rounded-lg border px-3 py-2.5 space-y-2 ${over ? 'bg-red-50 border-red-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
      <div className="flex items-center justify-between gap-2 font-semibold text-slate-800">
        <span className="flex items-center gap-1.5">
          <Wallet size={14} /> {t(`Department budget ${year}`, `የክፍሉ በጀት ${year}`)}
        </span>
        <span className="font-mono">{formatETB(line.allocated)}</span>
      </div>
      <div className="w-full bg-white h-1.5 rounded-full overflow-hidden border border-slate-200">
        <div className={`h-full ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-slate-600">
        <div>
          {t('Spent', 'የወጣ')}
          <div className="font-mono font-semibold text-slate-800">{formatETB(line.spent)}</div>
        </div>
        <div>
          {t('Approved, unpaid', 'የጸደቀ ያልተከፈለ')}
          <div className="font-mono font-semibold text-slate-800">{formatETB(line.committed)}</div>
        </div>
        <div>
          {t('Remaining', 'ቀሪ')}
          <div className={`font-mono font-semibold ${remaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatETB(remaining)}</div>
        </div>
      </div>
      {amount > 0 && (
        <div className={`flex items-start gap-1.5 font-medium ${over ? 'text-red-700' : 'text-emerald-800'}`}>
          {over && <AlertTriangle size={14} className="shrink-0 mt-px" />}
          {over
            ? t(
                `This request is ${formatETB(-after)} over the remaining budget.`,
                `ይህ ጥያቄ ከቀሪው በጀት በ${formatETB(-after)} ይበልጣል።`
              )
            : t(`After this request: ${formatETB(after)} left.`, `ከዚህ ጥያቄ በኋላ፡ ${formatETB(after)} ይቀራል።`)}
        </div>
      )}
    </div>
  );
}
