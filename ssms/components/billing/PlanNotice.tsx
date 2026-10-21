'use client';

// The band above every dashboard page when the subscription needs attention:
// trial ending, renewal due, unpaid (grace days), read-only, or suspended.
// Administrators get a link to Billing; others just see what is happening.

import Link from 'next/link';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { AccessReason } from '@/lib/billing/access';

const REASONS: Record<AccessReason, [en: string, am: string]> = {
  TENANT_PENDING: ['This Sunday school is waiting for approval.', 'ይህ ሰንበት ትምህርት ቤት ፈቃድ እየጠበቀ ነው።'],
  TENANT_SUSPENDED: ['This Sunday school’s account is suspended. Please contact support.', 'የዚህ ሰንበት ትምህርት ቤት መለያ ታግዷል። እባክዎ ድጋፍ ሰጪውን ያነጋግሩ።'],
  TENANT_DEACTIVATED: ['This Sunday school’s account is closed.', 'የዚህ ሰንበት ትምህርት ቤት መለያ ተዘግቷል።'],
  NO_SUBSCRIPTION: ['There is no active plan, so the system is read-only.', 'ንቁ ዕቅድ ስለሌለ ስርዓቱ ለማየት ብቻ ነው።'],
  TRIAL_ENDED: ['The free trial has ended, so the system is read-only. Your data is safe.', 'የሙከራ ጊዜው አብቅቷል፤ ስርዓቱ ለማየት ብቻ ነው። መረጃዎ አልጠፋም።'],
  PAST_DUE_GRACE_OVER: ['The subscription was not renewed, so the system is read-only. Your data is safe.', 'ምዝገባው ስላልታደሰ ስርዓቱ ለማየት ብቻ ነው። መረጃዎ አልጠፋም።'],
  CANCELED: ['The subscription has ended, so the system is read-only. Your data is safe.', 'ምዝገባው አብቅቷል፤ ስርዓቱ ለማየት ብቻ ነው። መረጃዎ አልጠፋም።'],
  EXPIRED: ['The subscription has expired, so the system is read-only. Your data is safe.', 'ምዝገባው አልፏል፤ ስርዓቱ ለማየት ብቻ ነው። መረጃዎ አልጠፋም።'],
  SUSPENDED: ['The subscription is suspended, so the system is read-only.', 'ምዝገባው ታግዷል፤ ስርዓቱ ለማየት ብቻ ነው።'],
};

export function PlanNotice() {
  const { user, can } = useAuth();
  const { t, locale } = useLang();
  const notice = user?.tenant?.access.notice;
  if (!notice) return null;

  const date = (iso: string) => formatEthiopianDate(iso.slice(0, 10), locale);
  let tone = 'bg-amber-50 border-amber-200 text-amber-900';
  let Icon = Clock;
  let text: string;
  switch (notice.kind) {
    case 'TRIAL_ENDING':
      text = t(`The free trial ends on ${date(notice.date)}. Choose a plan to keep everything working.`, `የሙከራ ጊዜው ${date(notice.date)} ያበቃል። ሁሉም እንዲሠራ ዕቅድ ይምረጡ።`);
      break;
    case 'RENEWAL_DUE':
      text = t(`The plan renews on ${date(notice.date)}. Pay the renewal invoice to continue without interruption.`, `ዕቅዱ ${date(notice.date)} ይታደሳል። ሳይቋረጥ እንዲቀጥል የእድሳት ደረሰኙን ይክፈሉ።`);
      break;
    case 'PAST_DUE':
      tone = 'bg-orange-50 border-orange-200 text-orange-900';
      Icon = AlertTriangle;
      text = t(`Payment is overdue. The system becomes read-only on ${date(notice.date)}.`, `ክፍያው አልፏል። ስርዓቱ ${date(notice.date)} ለማየት ብቻ ይሆናል።`);
      break;
    case 'ENDING':
      text = t(`The subscription ends on ${date(notice.date)}.`, `ምዝገባው ${date(notice.date)} ያበቃል።`);
      break;
    case 'READ_ONLY':
    case 'BLOCKED':
      tone = 'bg-red-50 border-red-200 text-red-900';
      Icon = Lock;
      text = t(...REASONS[notice.reason]);
      break;
  }

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 min-w-[12rem]">{text}</span>
      {notice.kind !== 'BLOCKED' && can('SYSTEM_CONFIGURE') && (
        <Link href="/dashboard/admin/billing" className="btn btn-secondary btn-sm shrink-0">
          {t('Billing & plan', 'ክፍያና ዕቅድ')}
        </Link>
      )}
    </div>
  );
}

/** Shown instead of a page whose module is not in the plan. */
export function NotInPlan({ module }: { module: string }) {
  const { can } = useAuth();
  const { t } = useLang();
  return (
    <div className="card p-8 text-center max-w-lg mx-auto mt-10">
      <Lock className="mx-auto text-slate-400" size={32} />
      <h1 className="mt-3 text-lg font-bold text-slate-900">{t('Not included in your plan', 'በዕቅድዎ ውስጥ የለም')}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {t(`This part of the system (${module}) is not part of your Sunday school’s current plan.`, `ይህ የስርዓቱ ክፍል (${module}) አሁን ባለው የሰንበት ትምህርት ቤቱ ዕቅድ ውስጥ የለም።`)}
      </p>
      {can('SYSTEM_CONFIGURE') && (
        <Link href="/dashboard/admin/billing" className="btn btn-primary btn-sm mt-4 inline-flex">
          {t('See plans', 'ዕቅዶችን ይመልከቱ')}
        </Link>
      )}
    </div>
  );
}
