'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, BookOpen, GraduationCap, CalendarCheck, Award, FileText } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { EducationNotice } from '@/components/education/EducationNotice';

export default function EducationHub() {
  const { t } = useLang();

  const links = [
    {
      titleEn: 'Academic Years',
      titleAm: 'የትምህርት ዓመታት',
      descEn: 'Academic cycles, active terms, and school year parameters',
      descAm: 'የትምህርት ዘመናት እና ንቁ ካላንደር',
      href: '/dashboard/education/academic-years',
      icon: Calendar,
    },
    {
      titleEn: 'Classes & Grade Levels',
      titleAm: 'ክፍሎች',
      descEn: 'Class rosters, capacities, classrooms, and homeroom teachers',
      descAm: 'የክፍሎች ዝርዝር እና መምህራን',
      href: '/dashboard/education/classes',
      icon: BookOpen,
    },
    {
      titleEn: 'Subjects & Curriculum',
      titleAm: 'የትምህርት ዓይነቶች',
      descEn: 'Orthodox curriculum: Bible, Church History, Liturgy, and Hymnody',
      descAm: 'ሥርዓተ ትምህርትና የትምህርት ዓይነቶች',
      href: '/dashboard/education/subjects',
      icon: GraduationCap,
    },
    {
      titleEn: 'Attendance Tracking',
      titleAm: 'የተማሪዎች ክትትል',
      descEn: 'Session-by-session student presence, absenteeism, and topics',
      descAm: 'የክፍለ-ጊዜ ተገኝነትና መቅረት',
      href: '/dashboard/education/attendance',
      icon: CalendarCheck,
    },
    {
      titleEn: 'Examinations & Grades',
      titleAm: 'ፈተናዎችና ውጤቶች',
      descEn: 'Continuous assessments (30%) and final examination marks (70%)',
      descAm: 'ተከታታይ ምዘና እና ፈተናዎች',
      href: '/dashboard/education/grades',
      icon: Award,
    },
    {
      titleEn: 'Term Results & Cards',
      titleAm: 'የሩብ ዓመት ውጤቶችና ሪፖርት ካርድ',
      descEn: 'Consolidated report cards, rankings, and promotion status',
      descAm: 'አጠቃላይ ውጤት፣ ደረጃና የማለፍ ሁኔታ',
      href: '/dashboard/education/results',
      icon: FileText,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Education & Academic Ministry Hub', 'የትምህርትና አካዳሚክ ማዕከል')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'Sunday school spiritual curriculum, classes, attendance, exams, and report cards',
            'የሰንበት ት/ቤት ትምህርት፣ ክፍሎች፣ ክትትልና የፈተና ውጤቶች'
          )}
        </p>
      </div>

      <EducationNotice needs="classes" />

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
                <span>{t('Open Module →', 'ክፈት →')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
