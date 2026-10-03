'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home. What each person sees follows their permissions: the server
// returns only the sections they may see, and empty sections are not shown.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  Music,
  Package,
  Shield,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { MOCK_AUDIT_LOGS, MOCK_GOVERNANCE_BODIES, MOCK_PERSONS } from '@/lib/mock/data';
import { loadDashboard, loadNotifications, type DashboardData, type Notice, type WeekRate } from '@/app/dashboard/actions';
import { DEMO_NOTICES } from '@/lib/notices';
import { formatETB } from '@/lib/finance/types';
import { AUDIT_AREAS } from '@/lib/audit/types';
import { STATUS_LABEL as ASSET_STATUS, type AssetStatus } from '@/lib/property/types';
import { PROGRAM_TYPES, type ProgramType } from '@/lib/programs/types';
import { SESSION_KINDS, type SessionKind } from '@/lib/choir/types';
import { monthsBetween } from '@/lib/reports/types';
import { addDays } from '@/lib/hr/types';
import { ColumnChart } from '@/components/reports/ColumnChart';
import { compactETB, dayLabel, monthLabel, SERIES_BLUE, SERIES_ORANGE } from '@/lib/charts';
import { formatEthiopianDate, todayIso, weekdayOfIso } from '@/lib/utils/ethiopian-calendar';

// ── Demo mode sample ─────────────────────────────────────────────────────────

function demoDashboard(): DashboardData {
  const today = todayIso();
  const months = monthsBetween(`${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`, today).slice(-12);
  const sunday = addDays(today, -(weekdayOfIso(today) ?? 0));
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(sunday, -7 * (11 - i)));
  const rates = (base: number[]): WeekRate[] => weeks.map((week, i) => ({ week, rate: base[i % base.length] }));
  return {
    currentAcademicYear: '2025/2026',
    gradesPending: 3,
    financePending: 0,
    units: { departments: 7, coordinations: 7 },
    members: {
      total: 247,
      newThisYear: 12,
      byMonth: months.map((month, i) => ({ month, count: [3, 5, 2, 8, 4, 6, 9, 3, 2, 5, 7, 4][i] })),
      recent: MOCK_PERSONS.slice(0, 5),
    },
    students: { active: 183, attendanceByWeek: rates([86, 91, 84, 88, 93, 79, 90, 87, 92, 85, 89, 94]) },
    teachers: 24,
    servants: { serving: 31, attendanceByWeek: rates([81, 84, 77, 90, 86, 83, 88, 80, 85, 91, 87, 89]) },
    choir: { members: 28, next: { date: addDays(today, 3), time: '16:00', title: 'Meskel rehearsal', kind: 'REHEARSAL' } },
    finance: {
      income: 145000,
      expenses: 45700,
      byMonth: months.map((month, i) => ({ month, income: [9, 12, 8, 15, 11, 10, 18, 9, 13, 14, 12, 14][i] * 1000, expense: [3, 4, 2, 6, 5, 3, 7, 4, 3, 5, 2, 4][i] * 1000 })),
      pending: 2,
      pendingAmount: 53000,
      toPay: 1,
      toPayAmount: 8000,
    },
    assets: { total: 64, byStatus: { IN_USE: 48, IN_STORE: 10, UNDER_REPAIR: 4, LOST: 1, DISPOSED: 1 } },
    programs: [
      { id: 'p1', title_en: 'Monthly spiritual conference', title_am: 'ወርሃዊ መንፈሳዊ ጉባኤ', start_date: addDays(today, 5), program_type: 'CONFERENCE' },
      { id: 'p2', title_en: 'Youth leadership workshop', title_am: 'የወጣቶች አመራር ሥልጠና', start_date: addDays(today, 12), program_type: 'TRAINING' },
    ],
    governanceBodies: MOCK_GOVERNANCE_BODIES.map((b) => ({ id: b.id, name_en: b.name_en, name_am: b.name_am, is_active: b.is_active })),
    recentAudit: MOCK_AUDIT_LOGS.map((l) => ({ id: l.id, action: l.action, table_name: l.table_name, created_at: l.created_at })),
  };
}

// ── Building blocks ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend, href,
}: {
  label: string; value: React.ReactNode; sub?: string; icon: React.ElementType; iconBg: string; iconColor: string; trend?: string; href?: string;
}) {
  const body = (
    <div className={cn('stat-card group h-full', href ? 'hover:border-blue-300 transition-colors' : 'cursor-default')}>
      <div className={cn('stat-icon', iconBg)}>
        <Icon size={22} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('font-bold text-slate-800 leading-tight tabular-nums whitespace-nowrap', String(value).length > 8 ? 'text-xl' : 'text-2xl')}>{value}</div>
        <div className="text-sm font-medium text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
        {trend && (
          <div className="text-xs font-semibold mt-1 flex items-center gap-1 text-emerald-600">
            <TrendingUp size={12} />
            {trend}
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card p-5 flex flex-col', className)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-slate-700 flex items-center gap-2">
          <span className="h-4 w-0.5 bg-primary-700 rounded-full inline-block" />
          {title}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-xs font-semibold text-primary-700 hover:underline whitespace-nowrap">{children}</Link>;
}

const pct = (n: number) => `${Math.round(n)}%`;
/** Axis top for counts so the four steps are whole numbers. */
const countMax = (values: number[]) => Math.max(4, Math.ceil(Math.max(0, ...values) / 4) * 4);
const lastRate = (rows: WeekRate[]) => [...rows].reverse().find((r) => r.rate !== null)?.rate ?? null;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [mode, setMode] = useState<'loading' | 'demo' | 'live' | 'error'>('loading');
  const [error, setError] = useState('');
  const [d, setData] = useState<DashboardData | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);

  useEffect(() => {
    loadDashboard().then((res) => {
      if (res.mode === 'live') setData(res.data);
      else if (res.mode === 'demo') setData(demoDashboard());
      else setError(res.error);
      setMode(res.mode);
    });
    loadNotifications()
      .then((res) => setNotices(res.mode === 'live' ? res.data : res.mode === 'demo' ? DEMO_NOTICES : []))
      .catch(() => setNotices([]));
  }, []);

  const name = locale === 'am' ? user?.person.full_name_am || user?.person.full_name_en : user?.person.full_name_en;
  const today = todayIso();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-full p-0.5 shrink-0 shadow-md hidden sm:flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)', boxShadow: '0 4px 14px rgba(251,191,36,0.35)' }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
              <Image src="/logo.png" alt="ሳሎ ደብረ ፀሐይ ሐመረ ሕይወት ሰንበት ት/ቤት" width={48} height={48} className="w-full h-full object-cover" priority />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t(`Welcome, ${name ?? ''}`, `እንኳን ደህና መጡ፣ ${name ?? ''}`)}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('Sallo Debre Tsehay Saint George Church — Hamere Hiwot Sunday School', 'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤ/ክ — ሐመረ ሕይወት ሰንበት ት/ቤት')}
            </p>
          </div>
        </div>
        <div className="text-sm text-slate-600 inline-flex items-center gap-2 self-start sm:self-auto">
          <Calendar size={15} className="text-slate-400" />
          {formatEthiopianDate(today, locale, { weekday: true })}
        </div>
      </div>

      {mode === 'error' && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {t('Could not load dashboard figures: ', 'የዳሽቦርድ መረጃ መጫን አልተቻለም: ')}
          {error}
        </div>
      )}

      {/* Academic year */}
      <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'linear-gradient(135deg, #1e2770, #2f43c8)' }}>
        <Calendar size={20} className="text-yellow-300 flex-shrink-0" />
        <div>
          <span className="text-white font-semibold text-sm">{t('Current Academic Year', 'ወቅታዊ የትምህርት ዓመት')}: </span>
          {d?.currentAcademicYear ? (
            <span className="text-yellow-300 font-bold">{d.currentAcademicYear}</span>
          ) : (
            <Link href="/dashboard/education/academic-years" className="text-yellow-300 font-semibold underline">
              {d ? t('Not set — open one', 'አልተዘጋጀም — ይክፈቱ') : '…'}
            </Link>
          )}
        </div>
        {(d?.gradesPending ?? 0) > 0 && (
          <Link href="/dashboard/education/grades" className="sm:ml-auto flex items-center gap-2 bg-yellow-500/20 rounded-lg px-3 py-1.5 hover:bg-yellow-500/30">
            <AlertCircle size={15} className="text-yellow-300" />
            <span className="text-yellow-200 text-sm font-medium">{d?.gradesPending} {t('grades awaiting approval', 'ማጽደቅ የሚጠብቁ ውጤቶች')}</span>
          </Link>
        )}
      </div>

      {/* Needs your attention */}
      <Panel title={t('Needs your attention', 'ትኩረትዎን የሚሹ')}>
        {notices === null ? (
          <p className="text-sm text-slate-400">…</p>
        ) : notices.length === 0 ? (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {t("You're all caught up — nothing is waiting for you.", 'ሁሉም ተጠናቋል — የሚጠብቅዎት ነገር የለም።')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {notices.slice(0, 6).map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-slate-50 transition-colors">
                  <span
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      n.kind === 'alert' && 'bg-amber-100 text-amber-700',
                      n.kind === 'success' && 'bg-emerald-100 text-emerald-700',
                      n.kind === 'info' && 'bg-blue-100 text-blue-700'
                    )}
                  >
                    {n.kind === 'alert' ? <AlertCircle size={14} /> : n.kind === 'success' ? <CheckCircle size={14} /> : <Calendar size={14} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-800 leading-snug">{locale === 'am' ? n.am : n.en}</span>
                    {n.at && <span className="block text-[11px] text-slate-400 mt-0.5">{formatEthiopianDate(n.at.slice(0, 10), locale)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Key numbers — only what this person may see */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {d?.members && (
          <StatCard
            label={t('Members', 'አባላት')} value={d.members.total} sub={t('Registered members', 'የተመዘገቡ አባላት')}
            trend={d.members.newThisYear ? t(`+${d.members.newThisYear} this year`, `+${d.members.newThisYear} በዚህ ዓመት`) : undefined}
            icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" href="/dashboard/people/members"
          />
        )}
        {d?.students && (
          <StatCard label={t('Students', 'ተማሪዎች')} value={d.students.active} sub={t('Enrolled this year', 'በዚህ ዓመት የተመዘገቡ')} icon={GraduationCap} iconBg="bg-violet-50" iconColor="text-violet-600" href="/dashboard/people/students" />
        )}
        {d?.teachers !== null && d?.teachers !== undefined && (
          <StatCard label={t('Teachers', 'መምህራን')} value={d.teachers} sub={t('Class and HR-assigned teachers', 'የክፍልና በሰው ሀብት የተመደቡ')} icon={BookOpen} iconBg="bg-amber-50" iconColor="text-amber-600" href="/dashboard/people/teachers" />
        )}
        {d?.servants && (
          <StatCard label={t('Servants', 'አገልጋዮች')} value={d.servants.serving} sub={t('Serving now', 'አሁን የሚያገለግሉ')} icon={HeartHandshake} iconBg="bg-rose-50" iconColor="text-rose-600" href="/dashboard/hr/personnel" />
        )}
        {d?.finance && (
          <StatCard
            label={t('Net balance', 'ተጣሪ ቀሪ')} value={`ETB ${Math.round(d.finance.income - d.finance.expenses).toLocaleString('en-US')}`}
            sub={t(`${today.slice(0, 4)} so far`, `${today.slice(0, 4)} እስካሁን`)}
            icon={Wallet} iconBg="bg-emerald-50" iconColor="text-emerald-600" href="/dashboard/finance/income"
          />
        )}
        {d?.choir && (
          <StatCard label={t('Choir', 'መዘምራን')} value={d.choir.members} sub={t('Active choir members', 'ንቁ የመዘምራን አባላት')} icon={Music} iconBg="bg-sky-50" iconColor="text-sky-600" href="/dashboard/people/choir" />
        )}
        {d?.assets && (
          <StatCard
            label={t('Property', 'ንብረት')} value={d.assets.total}
            sub={t(`${d.assets.byStatus.IN_USE ?? 0} in use · ${d.assets.byStatus.UNDER_REPAIR ?? 0} under repair`, `${d.assets.byStatus.IN_USE ?? 0} በአገልግሎት · ${d.assets.byStatus.UNDER_REPAIR ?? 0} በጥገና`)}
            icon={Package} iconBg="bg-orange-50" iconColor="text-orange-600" href="/dashboard/property/assets"
          />
        )}
        {d && (
          <StatCard
            label={t('Departments', 'ክፍሎች')} value={`${d.units.departments} / ${d.units.coordinations}`} sub={t('Departments / coordinations', 'ክፍሎች / አስተባባሪዎች')}
            icon={Building2} iconBg="bg-emerald-50" iconColor="text-emerald-600" href="/dashboard/organization/departments"
          />
        )}
      </div>

      {/* Trends */}
      {d && (d.finance || d.members || d.students || d.servants) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {d.finance && (
            <Panel title={t('Income and expenses — last 12 months', 'ገቢና ወጪ — ያለፉት 12 ወራት')} action={<MoreLink href="/dashboard/reports">{t('Reports →', 'ሪፖርቶች →')}</MoreLink>}>
              {d.finance.byMonth.every((m) => !m.income && !m.expense) ? (
                <Empty text={t('Nothing recorded in the ledger yet.', 'በሂሳብ መዝገቡ እስካሁን የተመዘገበ የለም።')} />
              ) : (
                <ColumnChart
                  label={t('Income and expenses per month', 'ወርሃዊ ገቢና ወጪ')}
                  categories={d.finance.byMonth.map((m) => monthLabel(m.month))}
                  series={[
                    { name: t('Income', 'ገቢ'), color: SERIES_BLUE, values: d.finance.byMonth.map((m) => m.income) },
                    { name: t('Expenses', 'ወጪ'), color: SERIES_ORANGE, values: d.finance.byMonth.map((m) => m.expense) },
                  ]}
                  format={compactETB}
                  height={170}
                  labelEvery={2}
                />
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Link href="/dashboard/finance/requests" className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                  <div className="text-slate-500">{t('Waiting for approval', 'ማጽደቅ የሚጠብቁ')}</div>
                  <div className="font-bold text-slate-800 mt-0.5 tabular-nums">{d.finance.pending} · {formatETB(d.finance.pendingAmount)}</div>
                </Link>
                <Link href="/dashboard/finance/requests" className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                  <div className="text-slate-500">{t('Approved, not yet paid', 'የጸደቁ፣ ያልተከፈሉ')}</div>
                  <div className="font-bold text-slate-800 mt-0.5 tabular-nums">{d.finance.toPay} · {formatETB(d.finance.toPayAmount)}</div>
                </Link>
              </div>
            </Panel>
          )}
          {d.members && (
            <Panel title={t('New members per month', 'በወር አዲስ አባላት')} action={<MoreLink href="/dashboard/people/members">{t('Members →', 'አባላት →')}</MoreLink>}>
              {d.members.byMonth.every((m) => !m.count) ? (
                <Empty text={t('No new members in the last 12 months.', 'ባለፉት 12 ወራት አዲስ አባል የለም።')} />
              ) : (
                <ColumnChart
                  label={t('New members per month', 'በወር አዲስ አባላት')}
                  categories={d.members.byMonth.map((m) => monthLabel(m.month))}
                  series={[{ name: t('New members', 'አዲስ አባላት'), color: SERIES_BLUE, values: d.members.byMonth.map((m) => m.count) }]}
                  format={(n) => String(Math.round(n))}
                  fixedMax={countMax(d.members.byMonth.map((m) => m.count))}
                  height={170}
                  labelEvery={2}
                />
              )}
            </Panel>
          )}
          {d.students && (
            <WeeklyPanel
              title={t('Student attendance per week', 'የተማሪዎች ሳምንታዊ ተገኝነት')}
              href="/dashboard/education/attendance"
              more={t('Attendance →', 'ተገኝነት →')}
              rows={d.students.attendanceByWeek}
              empty={t('No class attendance recorded in the last 12 weeks.', 'ባለፉት 12 ሳምንታት የክፍል ተገኝነት አልተመዘገበም።')}
            />
          )}
          {d.servants && (
            <WeeklyPanel
              title={t('Servant attendance per week', 'የአገልጋዮች ሳምንታዊ ተገኝነት')}
              href="/dashboard/hr/attendance"
              more={t('Roll call →', 'ተገኝነት →')}
              rows={d.servants.attendanceByWeek}
              empty={t('No servant attendance recorded in the last 12 weeks.', 'ባለፉት 12 ሳምንታት የአገልጋዮች ተገኝነት አልተመዘገበም።')}
            />
          )}
        </div>
      )}

      {/* Lists */}
      {d && (d.programs || d.choir || d.assets || d.governanceBodies || d.recentAudit) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {(d.programs || d.choir) && (
            <Panel title={t('Coming up — next 30 days', 'የሚመጡ — በ30 ቀናት ውስጥ')} action={d.programs ? <MoreLink href="/dashboard/programs">{t('Programs →', 'መርሐ ግብሮች →')}</MoreLink> : undefined}>
              <ComingUp d={d} />
            </Panel>
          )}
          {d.assets && (
            <Panel title={t('Property by status', 'ንብረት በሁኔታ')} action={<MoreLink href="/dashboard/property/assets">{t('Register →', 'መዝገብ →')}</MoreLink>}>
              {d.assets.total === 0 ? (
                <Empty text={t('No assets registered yet.', 'እስካሁን የተመዘገበ ንብረት የለም።')} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(Object.keys(ASSET_STATUS) as AssetStatus[]).filter((s) => d.assets!.byStatus[s]).map((s) => (
                    <li key={s} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-600">{t(...ASSET_STATUS[s])}</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{d.assets!.byStatus[s]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {d.governanceBodies && (
            <Panel title={t('Governance bodies', 'የአስተዳደር አካላት')} action={<MoreLink href="/dashboard/governance">{t('Open →', 'ክፈት →')}</MoreLink>}>
              <ul className="divide-y divide-slate-100">
                {d.governanceBodies.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-slate-700">{t(b.name_en, b.name_am)}</span>
                    <span className={cn('badge text-xs', b.is_active ? 'badge-success' : 'bg-slate-100 text-slate-600')}>
                      {b.is_active ? t('Active', 'ንቁ') : t('Inactive', 'የቦዘነ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {d.recentAudit && (
            <Panel title={t('Recent activity', 'የቅርብ ጊዜ እንቅስቃሴ')} action={<MoreLink href="/dashboard/audit">{t('Audit trail →', 'ኦዲት →')}</MoreLink>}>
              {d.recentAudit.length === 0 ? (
                <Empty text={t('No activity yet.', 'እስካሁን እንቅስቃሴ የለም።')} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.recentAudit.map((log) => (
                    <li key={log.id} className="flex items-start gap-3 py-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Shield size={12} className="text-blue-600" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-slate-700">
                          {log.action === 'LOGIN' ? t('Sign-in', 'መግቢያ') : log.action === 'LOGOUT' ? t('Sign-out', 'መውጫ') : log.action} ·{' '}
                          {AUDIT_AREAS[log.table_name] ? t(AUDIT_AREAS[log.table_name][0], AUDIT_AREAS[log.table_name][1]) : log.table_name}
                        </span>
                        <span className="block text-xs text-slate-400">{formatDate(log.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* Recent members */}
      {d?.members && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-700 flex items-center gap-2">
              <span className="h-4 w-0.5 bg-primary-700 rounded-full inline-block" />
              {t('Recently registered members', 'በቅርቡ የተመዘገቡ አባላት')}
            </h2>
            <MoreLink href="/dashboard/people/members">{t('View all →', 'ሁሉንም ይመልከቱ →')}</MoreLink>
          </div>
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Member Code', 'የአባል ኮድ')}</th>
                  <th>{t('Full Name', 'ሙሉ ስም')}</th>
                  <th>{t('Amharic Name', 'በአማርኛ ስም')}</th>
                  <th>{t('Phone', 'ስልክ')}</th>
                  <th>{t('Status', 'ሁኔታ')}</th>
                </tr>
              </thead>
              <tbody>
                {d.members.recent.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-6">{t('No members registered yet.', 'እስካሁን የተመዘገበ አባል የለም።')}</td></tr>
                )}
                {d.members.recent.map((p) => (
                  <tr key={p.id}>
                    <td><span className="font-mono text-xs font-semibold text-primary-700">{p.membership_code}</span></td>
                    <td className="font-medium">{p.full_name_en}</td>
                    <td className="text-slate-600" lang="am">{p.full_name_am ?? '—'}</td>
                    <td className="text-slate-500 font-mono text-xs">{p.phone_primary ?? '—'}</td>
                    <td>
                      <span className={cn('badge', p.status === 'ACTIVE' ? 'badge-success' : 'bg-slate-100 text-slate-600')}>
                        {p.status === 'ACTIVE' ? t('Active', 'ንቁ') : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === 'loading' && <p className="text-sm text-slate-400">{t('Loading…', 'በመጫን ላይ…')}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 py-8 text-center">{text}</p>;
}

function WeeklyPanel({ title, href, more, rows, empty }: { title: string; href: string; more: string; rows: WeekRate[]; empty: string }) {
  const { t } = useLang();
  const latest = lastRate(rows);
  return (
    <Panel title={title} action={<MoreLink href={href}>{more}</MoreLink>}>
      {rows.every((r) => r.rate === null) ? (
        <Empty text={empty} />
      ) : (
        <>
          <p className="text-xs text-slate-500 -mt-2 mb-3">
            {t('Latest week', 'የመጨረሻው ሳምንት')}: <span className="font-bold text-slate-800 tabular-nums">{latest === null ? '—' : pct(latest)}</span>
            <span className="text-slate-400"> · {t('present or late, excused not counted', 'የተገኙና የዘገዩ፤ በፈቃድ የቀሩ አይቆጠሩም')}</span>
          </p>
          <ColumnChart
            label={title}
            categories={rows.map((r) => dayLabel(r.week))}
            series={[{ name: t('Attendance', 'ተገኝነት'), color: SERIES_BLUE, values: rows.map((r) => r.rate) }]}
            format={pct}
            fixedMax={100}
            height={150}
            labelEvery={2}
            emptyText={t('not taken', 'አልተያዘም')}
          />
        </>
      )}
    </Panel>
  );
}

function ComingUp({ d }: { d: DashboardData }) {
  const { t, locale } = useLang();
  const items = [
    ...(d.programs ?? []).map((p) => ({
      key: p.id,
      date: p.start_date,
      title: locale === 'am' ? p.title_am || p.title_en : p.title_en,
      sub: t(...(PROGRAM_TYPES[p.program_type as ProgramType] ?? ['Program', 'መርሐ ግብር'])),
      href: '/dashboard/programs',
    })),
    ...(d.choir?.next
      ? [{
          key: 'choir',
          date: d.choir.next.date,
          title: d.choir.next.title || t(...(SESSION_KINDS[d.choir.next.kind as SessionKind] ?? ['Choir session', 'የመዘምራን መርሐ ግብር'])),
          sub: `${t('Choir', 'መዘምራን')}${d.choir.next.time ? ` · ${d.choir.next.time}` : ''}`,
          href: '/dashboard/sacred-arts/choir',
        }]
      : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (items.length === 0) return <Empty text={t('Nothing planned in the next 30 days.', 'በሚቀጥሉት 30 ቀናት የታቀደ የለም።')} />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((i) => (
        <li key={i.key}>
          <Link href={i.href} className="flex items-start gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded-lg">
            <span className="w-12 shrink-0 text-center rounded-lg bg-blue-50 text-blue-800 py-1">
              <span className="block text-[10px] uppercase tracking-wide">{dayLabel(i.date).split(' ')[0]}</span>
              <span className="block text-base font-bold leading-tight">{Number(i.date.slice(8, 10))}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800 truncate">{i.title}</span>
              <span className="block text-[11px] text-slate-500">{formatEthiopianDate(i.date, locale)} · {i.sub}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
