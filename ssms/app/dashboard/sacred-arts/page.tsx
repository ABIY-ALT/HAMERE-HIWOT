'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, CalendarCheck, Users } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

export default function SacredArtsHub() {
  const { t } = useLang();

  const links = [
    {
      titleEn: 'Choir Members',
      titleAm: 'የመዘምራን አባላት',
      descEn: 'Voice parts, traditional instruments, vestments and attendance',
      descAm: 'የድምፅ ክፍል፣ የዜማ መሣሪያዎች፣ አልባሳትና ተገኝነት',
      href: '/dashboard/people/choir',
      icon: Users,
    },
    {
      titleEn: 'Rehearsals & Services',
      titleAm: 'ልምምድና አገልግሎት',
      descEn: 'Plan sessions, choose the hymns and take attendance',
      descAm: 'መርሐ ግብር፣ የሚዘመሩ መዝሙራትና ተገኝነት',
      href: '/dashboard/sacred-arts/choir',
      icon: CalendarCheck,
    },
    {
      titleEn: 'Hymn Library',
      titleAm: 'የመዝሙራት ማውጫ',
      descEn: 'Kidase, mezmur, wedase and chants with their lyrics',
      descAm: 'ቅዳሴ፣ መዝሙር፣ ውዳሴና ዜማዎች ከግጥማቸው ጋር',
      href: '/dashboard/sacred-arts/hymns',
      icon: BookOpen,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Sacred Arts & Hymnody Department Hub', 'ቅዱስ ጥበብና ዜማ ማዕከል')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Hymnody, Choir & Sacred Arts Department (ዜማ፣ ዘማሪ እና ቅዱስ ጥበብ ክፍል)',
            'የሰንበት ት/ቤት የዜማ፣ የዘማሪና ቅዱስ ጥበብ አገልግሎት'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                <span>{t('Open Section →', 'ክፍል ክፈት →')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
