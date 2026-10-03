'use client';

import React, { useEffect, useState } from 'react';
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
import { loadDashboard, type DashboardData } from '@/app/dashboard/actions';
import { formatETB } from '@/lib/finance/types';
import { AUDIT_AREAS } from '@/lib/audit/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

const DEMO_DASHBOARD: DashboardData = {
  totalMembers: MOCK_DASHBOARD_STATS.totalMembers,
  newMembersThisYear: 12,
  activeStudents: MOCK_DASHBOARD_STATS.activeStudents,
  activeTeachers: MOCK_DASHBOARD_STATS.activeTeachers,
  departments: MOCK_DASHBOARD_STATS.departments,
  coordinations: MOCK_DASHBOARD_STATS.coordinations,
  currentAcademicYear: MOCK_DASHBOARD_STATS.currentAcademicYear,
  pendingApprovals: MOCK_DASHBOARD_STATS.pendingApprovals,
  governanceBodies: MOCK_GOVERNANCE_BODIES.map((b) => ({ id: b.id, name_en: b.name_en, name_am: b.name_am, is_active: b.is_active })),
  recentAudit: MOCK_AUDIT_LOGS.map((l) => ({ id: l.id, action: l.action, table_name: l.table_name, created_at: l.created_at })),
  recentMembers: MOCK_PERSONS.slice(0, 5),
  finance: { income: 145000, expenses: 45700 },
  financePending: 0,
};

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
  const [mode, setMode] = useState<'loading' | 'demo' | 'live' | 'error'>('loading');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboard().then((res) => {
      if (res.mode === 'live') setStats(res.data);
      else if (res.mode === 'demo') setStats(DEMO_DASHBOARD);
      else setError(res.error);
      setMode(res.mode);
    });
  }, []);

  const n = (v: number | undefined) => (stats ? v ?? 0 : '…');

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

      {mode === 'error' && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {t('Could not load dashboard figures: ', 'የዳሽቦርድ መረጃ መጫን አልተቻለም: ')}
          {error}
        </div>
      )}

      {(stats?.financePending ?? 0) > 0 && (
        <Link
          href="/dashboard/finance/requests"
          className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-center gap-2 text-sm text-amber-800 hover:bg-amber-100"
        >
          <AlertCircle size={16} />
          <span className="font-semibold">
            {t(
              `${stats?.financePending} payment request(s) waiting for your approval`,
              `${stats?.financePending} የክፍያ ጥያቄ(ዎች) የእርስዎን ማጽደቅ ይጠብቃሉ`
            )}
          </span>
          <span className="ml-auto text-xs underline">{t('Review →', 'ገምግም →')}</span>
        </Link>
      )}

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
          {stats?.currentAcademicYear ? (
            <span className="text-yellow-300 font-bold">{stats.currentAcademicYear}</span>
          ) : (
            <Link href="/dashboard/education/academic-years" className="text-yellow-300 font-semibold underline">
              {stats ? t('Not set — open one', 'አልተዘጋጀም — ይክፈቱ') : '…'}
            </Link>
          )}
        </div>
        {(stats?.pendingApprovals ?? 0) > 0 && (
          <Link
            href="/dashboard/education/grades"
            className="ml-auto flex items-center gap-2 bg-yellow-500/20 rounded-lg px-3 py-1.5 hover:bg-yellow-500/30"
          >
            <AlertCircle size={15} className="text-yellow-300" />
            <span className="text-yellow-200 text-sm font-medium">
              {stats?.pendingApprovals} {t('Grades awaiting approval', 'ማጽደቅ የሚጠብቁ ውጤቶች')}
            </span>
          </Link>
        )}
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          labelEn="Total Members"
          labelAm="ጠቅላላ አባላት"
          value={n(stats?.totalMembers)}
          subLabel={t('Registered members', 'የተመዘገቡ አባላት')}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          trend={stats?.newMembersThisYear ? t(`+${stats.newMembersThisYear} this year`, `+${stats.newMembersThisYear} በዚህ ዓመት`) : undefined}
          trendUp
        />
        <StatCard
          labelEn="Active Students"
          labelAm="ንቁ ተማሪዎች"
          value={n(stats?.activeStudents)}
          subLabel={t('Enrolled this year', 'በዚህ ዓመት የተመዘገቡ')}
          icon={GraduationCap}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          labelEn="Teachers"
          labelAm="አስተማሪዎች"
          value={n(stats?.activeTeachers)}
          subLabel={t('Class teachers and HR-assigned teachers', 'የክፍል መምህራንና በሰው ሀብት የተመደቡ')}
          icon={BookOpen}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          labelEn="Departments"
          labelAm="ክፍሎች"
          value={stats ? `${stats.departments} / ${stats.coordinations}` : '…'}
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
            {(stats?.governanceBodies ?? []).map((body) => (
              <div
                key={body.id}
                className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    {t(body.name_en, body.name_am)}
                  </div>
                </div>
                <div className={cn('badge text-xs', body.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                  <span className="status-dot active" style={{ width: 6, height: 6 }} />
                  {body.is_active ? t('Active', 'ንቁ') : t('Inactive', 'የቦዘነ')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Finance Summary */}
        {can('FINANCE_VIEW') && (
          <div className="card p-5">
            <SectionHeader en="Finance Summary" am="የፋይናንስ ማጠቃለያ" />
            {stats && !stats.finance ? (
              <p className="text-sm text-slate-500 py-2">
                {t(
                  'Finance is not set up in the database yet (run migration 008).',
                  'ፋይናንስ ገና በዳታቤዝ ውስጥ አልተዘጋጀም (ማይግሬሽን 008 ያስኪዱ)።'
                )}
              </p>
            ) : (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400">{t(`Year ${todayIso().slice(0, 4)} to date`, `ከ${todayIso().slice(0, 4)} መጀመሪያ እስካሁን`)}</div>
              {[
                { label: t('Total Income', 'ጠቅላላ ገቢ'), value: stats?.finance ? formatETB(stats.finance.income) : '…', color: 'text-emerald-600' },
                { label: t('Total Expenses', 'ጠቅላላ ወጪ'), value: stats?.finance ? formatETB(stats.finance.expenses) : '…', color: 'text-red-500' },
                { label: t('Net Balance', 'ተጣሪ ቀሪ'), value: stats?.finance ? formatETB(stats.finance.income - stats.finance.expenses) : '…', color: 'text-blue-600' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <span className={cn('text-sm font-bold', row.color)}>{row.value}</span>
                </div>
              ))}
            </div>
            )}
            <div className="mt-4 pt-2 flex items-center justify-between">
              <Link href="/dashboard/finance/income" className="text-xs font-semibold text-primary-700 hover:underline">
                {t('View Income →', 'ገቢዎችን እይ →')}
              </Link>
              <Link href="/dashboard/finance/requests" className="text-xs font-semibold text-primary-700 hover:underline">
                {t('Payment Requests →', 'የክፍያ ጥያቄዎች →')}
              </Link>
            </div>
          </div>
        )}

        {/* Audit Trail Preview */}
        {can('AUDIT_VIEW_ALL') && (
          <div className="card p-5">
            <SectionHeader en="Recent Audit Events" am="የቅርብ ጊዜ ኦዲት ክስተቶች" />
            <div className="space-y-2">
              {stats && stats.recentAudit.length === 0 && (
                <p className="text-sm text-slate-400 py-2">{t('No audit events yet.', 'እስካሁን የኦዲት ክስተት የለም።')}</p>
              )}
              {(stats?.recentAudit ?? []).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield size={12} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-700">
                      {log.action === 'LOGIN' ? t('Sign-in', 'መግቢያ') : log.action === 'LOGOUT' ? t('Sign-out', 'መውጫ') : log.action} · {AUDIT_AREAS[log.table_name] ? t(AUDIT_AREAS[log.table_name][0], AUDIT_AREAS[log.table_name][1]) : log.table_name}
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
              {stats && stats.recentMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-6">
                    {t('No members registered yet.', 'እስካሁን የተመዘገበ አባል የለም።')}
                  </td>
                </tr>
              )}
              {(stats?.recentMembers ?? []).map((person) => (
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
