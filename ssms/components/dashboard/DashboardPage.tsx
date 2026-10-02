'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Users,
  GraduationCap,
  BookOpen,
  Building2,
  TrendingUp,
  Shield,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import {
  MOCK_DASHBOARD_STATS,
  MOCK_AUDIT_LOGS,
  MOCK_GOVERNANCE_BODIES,
  MOCK_PERSONS,
} from '@/lib/mock/data';
import { formatDate } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  labelEn: string;
  labelAm: string;
  value: string | number;
  subLabel?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendUp?: boolean;
}

function StatCard({
  labelEn,
  labelAm,
  value,
  subLabel,
  icon: Icon,
  iconBg,
  iconColor,
  trend,
  trendUp,
}: StatCardProps) {
  const { t } = useLang();
  return (
    <div className="stat-card group cursor-default">
      <div className={cn('stat-icon', iconBg)}>
        <Icon size={22} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold text-slate-800 leading-tight">{value}</div>
        <div className="text-sm font-medium text-slate-500 mt-0.5">
          {t(labelEn, labelAm)}
        </div>
        {subLabel && (
          <div className="text-xs text-slate-400 mt-1">{subLabel}</div>
        )}
        {trend && (
          <div
            className={cn(
              'text-xs font-semibold mt-1 flex items-center gap-1',
              trendUp ? 'text-emerald-600' : 'text-red-500'
            )}
          >
            <TrendingUp size={12} />
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ en, am }: { en: string; am: string }) {
  const { t } = useLang();
  return (
    <h2 className="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
      <span className="h-4 w-0.5 bg-primary-700 rounded-full inline-block" />
      {t(en, am)}
    </h2>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { t } = useLang();
  const stats = MOCK_DASHBOARD_STATS;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-full p-0.5 shrink-0 shadow-md hidden sm:flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #d97706)',
              boxShadow: '0 4px 14px rgba(251,191,36,0.35)',
            }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="ሳሎ ደብረ ፀሐይ ሐመረ ሕይወት ሰንበት ት/ቤት"
                width={48}
                height={48}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>{t('Dashboard', 'ዳሽቦርድ')}</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 font-sans hidden md:inline-block">
                {t('Hamere Hiwot SSMS', 'ሐመረ ሕይወት ሰ/ት/ቤት')}
              </span>
            </h1>
            <p className="page-subtitle">
              {t(
                `Welcome back, ${user?.person.full_name_en ?? 'User'} • Sallo Debre Tsehay Saint George Church`,
                `እንኳን ደህና መጡ፣ ${user?.person.full_name_am ?? user?.person.full_name_en ?? 'ተጠቃሚ'} • ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤ/ክ`
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="badge bg-emerald-100 text-emerald-700 px-3 py-1.5">
            <span className="status-dot active" />
            {t('System Active', 'ስርዓቱ ንቁ ነው')}
          </div>
        </div>
      </div>

      {/* Academic Year Banner */}
      <div
        className="rounded-xl p-4 mb-6 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1e2770, #2f43c8)' }}
      >
        <Calendar size={20} className="text-yellow-300 flex-shrink-0" />
        <div>
          <span className="text-white font-semibold text-sm">
            {t('Current Academic Year', 'ወቅታዊ የትምህርት ዓመት')}:{' '}
          </span>
          <span className="text-yellow-300 font-bold">{stats.currentAcademicYear}</span>
        </div>
        {stats.pendingApprovals > 0 && (
          <div className="ml-auto flex items-center gap-2 bg-yellow-500/20 rounded-lg px-3 py-1.5">
            <AlertCircle size={15} className="text-yellow-300" />
            <span className="text-yellow-200 text-sm font-medium">
              {stats.pendingApprovals} {t('Pending Approvals', 'በጥበቃ ላይ ያሉ ፈቃዶች')}
            </span>
          </div>
        )}
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          labelEn="Total Members"
          labelAm="ጠቅላላ አባላት"
          value={stats.totalMembers}
          subLabel={t('Registered members', 'የተመዘገቡ አባላት')}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          trend="+12 this year"
          trendUp
        />
        <StatCard
          labelEn="Active Students"
          labelAm="ንቁ ተማሪዎች"
          value={stats.activeStudents}
          subLabel={t('Enrolled this year', 'በዚህ ዓመት የተመዘገቡ')}
          icon={GraduationCap}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          trend="+8 this term"
          trendUp
        />
        <StatCard
          labelEn="Teachers"
          labelAm="አስተማሪዎች"
          value={stats.activeTeachers}
          subLabel={t('Active teachers', 'ንቁ አስተማሪዎች')}
          icon={BookOpen}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          labelEn="Departments"
          labelAm="ክፍሎች"
          value={`${stats.departments} / ${stats.coordinations}`}
          subLabel={t('Departments / Coordinations', 'ክፍሎች / ቅንጅቶች')}
          icon={Building2}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Governance Overview */}
        <div className="card p-5 lg:col-span-1">
          <SectionHeader en="Governance Bodies" am="የአስተዳደር አካላት" />
          <div className="space-y-2">
            {MOCK_GOVERNANCE_BODIES.map((body) => (
              <div
                key={body.id}
                className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    {t(body.name_en, body.name_am)}
                  </div>
                </div>
                <div className="badge bg-emerald-100 text-emerald-700 text-xs">
                  <span className="status-dot active" style={{ width: 6, height: 6 }} />
                  {t('Active', 'ንቁ')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Finance Summary */}
        {can('FINANCE_VIEW') && (
          <div className="card p-5">
            <SectionHeader en="Finance Summary" am="የፋይናንስ ማጠቃለያ" />
            <div className="space-y-3">
              {[
                { label: t('Total Income', 'ጠቅላላ ገቢ'), value: 'ETB 145,000', color: 'text-emerald-600' },
                { label: t('Total Expenses', 'ጠቅላላ ወጪ'), value: 'ETB 45,700', color: 'text-red-500' },
                { label: t('Net Balance', 'ተጣሪ ቀሪ'), value: 'ETB 99,300', color: 'text-blue-600' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <span className={cn('text-sm font-bold', row.color)}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-2 flex items-center justify-between">
              <Link href="/dashboard/finance/income" className="text-xs font-semibold text-primary-700 hover:underline">
                {t('View Income →', 'ገቢዎችን እይ →')}
              </Link>
              <Link href="/dashboard/finance/budget" className="text-xs font-semibold text-primary-700 hover:underline">
                {t('Budget Ledger →', 'የበጀት መዝገብ →')}
              </Link>
            </div>
          </div>
        )}

        {/* Audit Trail Preview */}
        {can('AUDIT_VIEW_ALL') && (
          <div className="card p-5">
            <SectionHeader en="Recent Audit Events" am="የቅርብ ጊዜ ኦዲት ክስተቶች" />
            <div className="space-y-2">
              {MOCK_AUDIT_LOGS.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield size={12} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-700">
                      {log.action} on {log.table_name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Members */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <SectionHeader en="Recent Members" am="የቅርብ ጊዜ አባላት" />
          <Link href="/dashboard/people/members" className="text-xs font-semibold text-primary-700 hover:underline">
            {t('View all →', 'ሁሉንም ይመልከቱ →')}
          </Link>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Member Code', 'የአባል ኮድ')}</th>
                <th>{t('Full Name', 'ሙሉ ስም')}</th>
                <th>{t('Amharic Name', 'በአማርኛ ስም')}</th>
                <th>{t('Gender', 'ጾታ')}</th>
                <th>{t('Phone', 'ስልክ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PERSONS.slice(0, 5).map((person) => (
                <tr key={person.id}>
                  <td>
                    <span className="font-mono text-xs font-semibold text-primary-700">
                      {person.membership_code}
                    </span>
                  </td>
                  <td className="font-medium">{person.full_name_en}</td>
                  <td className="text-slate-600" lang="am">{person.full_name_am ?? '—'}</td>
                  <td>
                    <span className={cn(
                      'badge text-xs',
                      person.gender === 'MALE'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-pink-50 text-pink-700'
                    )}>
                      {t(
                        person.gender === 'MALE' ? 'Male' : 'Female',
                        person.gender === 'MALE' ? 'ወንድ' : 'ሴት'
                      )}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono text-xs">
                    {person.phone_primary ?? '—'}
                  </td>
                  <td>
                    <span className={cn('badge', 
                      person.status === 'ACTIVE' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-slate-100 text-slate-600'
                    )}>
                      {t(
                        person.status === 'ACTIVE' ? 'Active' : person.status,
                        person.status === 'ACTIVE' ? 'ንቁ' : person.status
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
