'use client';

import React from 'react';
import Link from 'next/link';
import { Wallet, ArrowDownLeft, ArrowUpRight, Gift, CheckSquare } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

export default function FinanceHub() {
  const { t } = useLang();

  const links = [
    {
      titleEn: 'Payment Requests & Approvals',
      titleAm: 'የክፍያ ጥያቄዎችና ማጽደቂያ',
      descEn: 'Departments request money; the finance head approves; the treasurer pays',
      descAm: 'ክፍሎች ገንዘብ ይጠይቃሉ፤ የፋይናንስ ኃላፊ ያጸድቃል፤ ገንዘብ ያዥ ይከፍላል',
      href: '/dashboard/finance/requests',
      icon: CheckSquare,
    },
    {
      titleEn: 'Annual Budget',
      titleAm: 'ዓመታዊ በጀት',
      descEn: 'Budget appropriations, line item utilization, and ceilings',
      descAm: 'የበጀት ድልድልና አጠቃቀም',
      href: '/dashboard/finance/budget',
      icon: Wallet,
    },
    {
      titleEn: 'Income & Revenues',
      titleAm: 'ገቢዎች',
      descEn: 'Membership dues, collections, and receipt records',
      descAm: 'የአባልነት መዋጮና ገቢዎች',
      href: '/dashboard/finance/income',
      icon: ArrowDownLeft,
    },
    {
      titleEn: 'Expenses & Payments',
      titleAm: 'ወጪዎች',
      descEn: 'Disbursements, petty cash, vouchers, and vendor payouts',
      descAm: 'የተከፈሉ ወጪዎችና ቫውቸሮች',
      href: '/dashboard/finance/expenses',
      icon: ArrowUpRight,
    },
    {
      titleEn: 'Donations & Pledges',
      titleAm: 'ስጦታዎችና ምጽዋት',
      descEn: 'Benefactor gifts, building funds, and designated offerings',
      descAm: 'የለጋሾች ስጦታዎችና የሕንፃ ማሰሪያ',
      href: '/dashboard/finance/donations',
      icon: Gift,
    },

  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Finance & Treasury Ministry Hub', 'የፋይናንስና በጀት ማዕከል')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Parish Sunday school budget allocations, revenue collections, expenses, and approvals',
            'የሰንበት ት/ቤት በጀት፣ ገቢ፣ ወጪና የፈቃድ ማጽደቂያ'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {links.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={idx}
              href={item.href}
              className="card p-6 hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">
                  {t(item.titleEn, item.titleAm)}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(item.descEn, item.descAm)}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-blue-600 group-hover:translate-x-1 transition-transform">
                <span>{t('Open Ledger →', 'መዝገብ ክፈት →')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
