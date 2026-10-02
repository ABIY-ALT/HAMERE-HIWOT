'use client';

import React from 'react';
import Link from 'next/link';
import { Vote, Users, Shield, Crown, Building2, FileText } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

export default function GovernanceHub() {
  const { t } = useLang();

  const links = [
    {
      titleEn: 'General Assembly',
      titleAm: 'ጠቅላላ ጉባኤ',
      descEn: 'Supreme decision-making body representing all parish members',
      descAm: 'የሰንበት ት/ቤቱ ጠቅላይ ውሳኔ ሰጪ አካል',
      href: '/dashboard/governance/general-assembly',
      icon: Users,
    },
    {
      titleEn: 'Audit Committee',
      titleAm: 'የአፈጻጸም ክትትል ጉባኤ',
      descEn: 'Autonomous supervisory body with read-only audit access',
      descAm: 'ራሱን ችሎ የሚሰራ የቁጥጥርና ክትትል አካል',
      href: '/dashboard/governance/audit-committee',
      icon: Shield,
    },
    {
      titleEn: 'Board of Management',
      titleAm: 'የሥራ አመራር ጉባኤ',
      descEn: 'Strategic governance council with exactly 9 mandated members',
      descAm: 'በትክክል 9 አባላት ያሉት ስልታዊ አመራር ጉባኤ',
      href: '/dashboard/governance/management-board',
      icon: Crown,
    },
    {
      titleEn: 'Executive Committee',
      titleAm: 'የሥራ አስፈጻሚ ጉባኤ',
      descEn: 'Operational executive leadership with exactly 9 members',
      descAm: 'የሥራ አስፈጻሚ አመራር አካል (9 አባላት)',
      href: '/dashboard/governance/executive-committee',
      icon: Building2,
    },
    {
      titleEn: 'Management Secretariat',
      titleAm: 'ጽሕፈት ቤት',
      descEn: 'Administrative secretariat and official documentation custody',
      descAm: 'የሥራ አመራር ጉባኤ አስተዳደራዊ ጽሕፈት ቤት',
      href: '/dashboard/governance/secretariat',
      icon: FileText,
    },
    {
      titleEn: 'Advisory Council',
      titleAm: 'አፈጻጸም አማካሪዎች',
      descEn: 'Senior advisory body providing ecclesiastical and legal guidance',
      descAm: 'ለአስተዳደር አካላት ምክር የሚሰጥ አካል',
      href: '/dashboard/governance/advisory-council',
      icon: Vote,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Governance Architecture Hub', 'የአስተዳደር መዋቅር ማዕከል')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Statutory governance bodies for Category 2 Parish Sunday School (ምድብ ሁለት አጥቢያ)',
            'የምድብ ሁለት አጥቢያ ሰንበት ት/ቤት ሕጋዊ የአመራር አካላት'
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
                <span>{t('Open Body Console →', 'ወደ ጉባኤው ሂድ →')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
