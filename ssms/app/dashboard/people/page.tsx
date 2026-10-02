'use client';

import React from 'react';
import Link from 'next/link';
import { Users, GraduationCap, BookOpen, HeartHandshake, Music } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

export default function PeopleHub() {
  const { t } = useLang();

  const links = [
    {
      titleEn: 'Members Registry',
      titleAm: 'የአባላት መዝገብ',
      descEn: 'Master parish directory of all registered Sunday school members',
      descAm: 'የተመዘገቡ አባላት አጠቃላይ ማውጫ',
      href: '/dashboard/people/members',
      icon: Users,
    },
    {
      titleEn: 'Students Roster',
      titleAm: 'የተማሪዎች መዝገብ',
      descEn: 'Enrolled students categorized by grade levels and stages',
      descAm: 'በክፍል ደረጃ የተመደቡ ተማሪዎች ዝርዝር',
      href: '/dashboard/people/students',
      icon: GraduationCap,
    },
    {
      titleEn: 'Teaching Faculty',
      titleAm: 'መምህራን',
      descEn: 'Spiritual teachers, instructors, and deacons leading curricula',
      descAm: 'ትምህርት የሚያስተምሩ መምህራን',
      href: '/dashboard/people/teachers',
      icon: BookOpen,
    },
    {
      titleEn: 'Ministry Servants',
      titleAm: 'አገልጋዮች',
      descEn: 'Volunteers and servants deployed across all parish ministries',
      descAm: 'በተለያዩ ክፍሎች የሚያገለግሉ አገልጋዮች',
      href: '/dashboard/hr/personnel',
      icon: HeartHandshake,
    },
    {
      titleEn: 'Choir & Cantors',
      titleAm: 'ዘማሪዎች',
      descEn: 'Choir vocalists, cantors, and traditional instrument players',
      descAm: 'የዝማሬ እና የዜማ አባላት',
      href: '/dashboard/people/choir',
      icon: Music,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Parish People & Community Hub', 'የማህበረሰብና አባላት ማዕከል')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Centralized directory of members, students, teachers, servants, and choir',
            'የአባላት፣ የተማሪዎች፣ የመምህራንና የአገልጋዮች ማዕከል'
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
                <span>{t('View Directory →', 'ማውጫ እይ →')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
