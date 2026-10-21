// Plans: prices, included modules and limits — edited here, never in code.
// A plan in use or in history cannot be deleted; switch it off (not active)
// or hide it from sign-up (not public) instead.

import { platformPlans } from '@/lib/platform/data';
import { PlanEditor } from '@/components/platform/PlanEditor';

export default async function PlansPage() {
  const plans = await platformPlans();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Plans</h1>
      <p className="text-sm text-slate-500">
        Price changes apply to new invoices; paid periods keep what was paid. A missing limit means unlimited.
        “Over the limit (%)” lets a Sunday school go that far past a limit before new records are refused.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => <PlanEditor key={p.id} plan={p} />)}
        <PlanEditor plan={null} />
      </div>
    </div>
  );
}
