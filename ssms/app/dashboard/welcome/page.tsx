'use client';

// Getting started — where a new Sunday school's first administrator lands
// after sign-up: the few things to set up, each a link to its page.

import Link from 'next/link';
import { ArrowRight, Building2, CreditCard, Globe, Palette, Send, Settings, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

export default function WelcomePage() {
  const { user, can } = useAuth();
  const { t, locale } = useLang();
  const tenant = user?.tenant;
  const modules = tenant?.access.modules ?? [];

  const steps = [
    {
      icon: Settings, href: '/dashboard/admin/settings', show: can('SYSTEM_CONFIGURE'),
      en: ['Parish profile', 'The church, diocese, founding year and motto shown on reports and the website.'],
      am: ['የደብሩ መረጃ', 'በሪፖርቶችና በድረ-ገጹ የሚታዩ ቤተክርስቲያን፣ ሀገረ ስብከት፣ የተመሠረተበት ዓመትና መሪ ቃል።'],
    },
    {
      icon: Palette, href: '/dashboard/admin/branding', show: can('SYSTEM_CONFIGURE'),
      en: ['Logo and colours', 'Upload your logo and choose your colour — used in the menu, on receipts, report cards and your website.'],
      am: ['አርማና ቀለሞች', 'አርማዎን ይጫኑና ቀለምዎን ይምረጡ — በምናሌው፣ በደረሰኞች፣ በውጤት ካርዶችና በድረ-ገጽዎ ይታያሉ።'],
    },
    {
      icon: Building2, href: '/dashboard/organization/structure', show: can('GOVERNANCE_VIEW'),
      en: ['Departments and committees', 'A standard structure is ready — rename or adjust it to yours.'],
      am: ['ክፍሎችና ጉባኤዎች', 'መደበኛ መዋቅር ተዘጋጅቷል — እንደ እርስዎ ይቀይሩት።'],
    },
    {
      icon: Users, href: '/dashboard/admin/users', show: can('USER_MANAGE'),
      en: ['Invite your team', 'Add logins for the office, department heads and teachers, each with a role.'],
      am: ['ቡድንዎን ይጋብዙ', 'ለጽ/ቤቱ፣ ለክፍል ኃላፊዎችና ለአስተማሪዎች መግቢያ ይክፈቱ፤ እያንዳንዱን በሚና።'],
    },
    {
      icon: Send, href: '/dashboard/admin/telegram', show: can('SYSTEM_CONFIGURE') && modules.includes('telegram'),
      en: ['Your Telegram bot', 'Create a bot with @BotFather and paste its token, so members get messages.'],
      am: ['የቴሌግራም ቦትዎ', 'በ@BotFather ቦት ፈጥረው ቁልፉን ያስገቡ፤ አባላት መልእክት ይደርሳቸዋል።'],
    },
    {
      icon: CreditCard, href: '/dashboard/admin/billing', show: can('SYSTEM_CONFIGURE'),
      en: ['Plan and billing', 'See your trial, usage and plans.'],
      am: ['ዕቅድና ክፍያ', 'የሙከራ ጊዜዎን፣ አጠቃቀምዎንና ዕቅዶችን ይመልከቱ።'],
    },
  ].filter((s) => s.show);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t(`Welcome to ${tenant?.name_en ?? 'your Sunday school'}`, `እንኳን ወደ ${tenant?.name_am || tenant?.name_en || 'ሰንበት ትምህርት ቤትዎ'} በደህና መጡ`)}
        </h1>
        {tenant?.access.trialEndsAt && (
          <p className="text-sm text-slate-500 mt-1">
            {t(`Your free trial runs until ${formatEthiopianDate(tenant.access.trialEndsAt.slice(0, 10), locale)}.`, `ነፃ የሙከራ ጊዜዎ እስከ ${formatEthiopianDate(tenant.access.trialEndsAt.slice(0, 10), locale)} ነው።`)}
          </p>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="card p-4 flex items-start gap-4 hover:shadow-md transition">
              <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <s.icon size={16} className="text-slate-500" /> {t(s.en[0], s.am[0])}
                </span>
                <span className="block text-sm text-slate-600 mt-0.5">{t(s.en[1], s.am[1])}</span>
              </span>
              <ArrowRight size={16} className="text-slate-400 mt-1.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ol>

      {tenant && modules.includes('website') && (
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <Globe size={16} /> {t('Your public website:', 'የሕዝብ ድረ-ገጽዎ፦')}{' '}
          <a href={tenant.is_default ? '/' : `/s/${tenant.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 hover:underline">
            {tenant.is_default ? '/' : `/s/${tenant.slug}`}
          </a>
        </p>
      )}
    </div>
  );
}
