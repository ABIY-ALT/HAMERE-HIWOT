'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer, Users, GraduationCap, Wallet, Landmark, AlertTriangle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { ColumnChart } from '@/components/reports/ColumnChart';
import { compactETB, monthLabel, SERIES_BLUE, SERIES_ORANGE } from '@/lib/charts';
import { loadReports } from './actions';
import type { ReportData, ReportPeriod } from '@/lib/reports/types';
import type { LoadMode } from '@/lib/admin/types';
import { budgetRemaining, categoryLabel, formatETB } from '@/lib/finance/types';
import { boldCell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const BLUE = SERIES_BLUE;
const ORANGE = SERIES_ORANGE;

export default function ReportsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<ReportData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadReports>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadReports().then(apply);
  }, [apply]);

  const choose = async (period: ReportPeriod) => {
    setRefreshing(true);
    apply(await loadReports(period));
    setRefreshing(false);
  };

  const period = data?.period;
  const today = todayIso();
  const presets: { label: string; period: ReportPeriod }[] = [
    ...(data?.years ?? []).slice(0, 3).map((y) => ({ label: y.name, period: { from: y.start_date, to: y.end_date } })),
    { label: t(`Calendar year ${today.slice(0, 4)}`, `${today.slice(0, 4)} ዓ.ም (ግሪጎሪያን)`), period: { from: `${today.slice(0, 4)}-01-01`, to: today } },
    {
      label: t('Last 3 months', 'ያለፉት 3 ወራት'),
      period: { from: new Date(Date.parse(today) - 90 * 86_400_000).toISOString().slice(0, 10), to: today },
    },
  ];
  const periodText = period
    ? `${formatEthiopianDate(period.from, locale)} – ${formatEthiopianDate(period.to, locale)} (${period.from} – ${period.to})`
    : '';
  const fileTag = period ? `${period.from}_${period.to}` : today;

  if (mode === 'demo') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Reports', 'ሪፖርቶች')}</h1>
        <p className="card p-6 text-sm text-slate-600">
          {t(
            'Reports are calculated from the database. Connect the system to Supabase to see them.',
            'ሪፖርቶች የሚሰሉት ከዳታቤዙ ነው። ለማየት ስርዓቱን ከSupabase ጋር ያገናኙ።'
          )}
        </p>
      </div>
    );
  }

  const m = data?.membership;
  const e = data?.education;
  const f = data?.finance;
  const g = data?.governance;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Reports', 'ሪፖርቶች')}</h1>
          <p className="text-sm text-slate-500 mt-1">{periodText || '…'}</p>
        </div>
        <button onClick={() => window.print()} disabled={!data} className="no-print btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
          <Printer size={14} /> {t('Print', 'አትም')}
        </button>
      </div>

      <AdminModeNotice mode={mode === 'live' ? 'live' : mode} error={error} />

      {/* Period filter — scopes every section below */}
      {data && (
        <div className="no-print card p-4 flex flex-wrap items-center gap-2">
          {presets.map((p) => {
            const selected = period?.from === p.period.from && period?.to === p.period.to;
            return (
              <button
                key={p.label}
                onClick={() => choose(p.period)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="text-xs text-slate-400 mx-1">{t('or', 'ወይም')}</span>
          <input type="date" value={period?.from ?? ''} max={period?.to} onChange={(ev) => ev.target.value && period && choose({ ...period, from: ev.target.value })} className="form-input text-xs py-1.5 w-auto" />
          <span className="text-xs text-slate-400">→</span>
          <input type="date" value={period?.to ?? ''} min={period?.from} onChange={(ev) => ev.target.value && period && choose({ ...period, to: ev.target.value })} className="form-input text-xs py-1.5 w-auto" />
          {refreshing && <span className="text-xs text-slate-400">{t('Updating…', 'በማዘመን ላይ…')}</span>}
        </div>
      )}

      <div className={refreshing ? 'opacity-60 transition-opacity space-y-8' : 'space-y-8'}>
        {data && !m && !e && !f && !g && (
          <p className="card p-6 text-sm text-slate-500">{t('Your role does not include any report areas.', 'ሚናዎ ምንም የሪፖርት ዘርፍ አያካትትም።')}</p>
        )}

        {/* ── Membership ── */}
        {m && (
          <Section
            icon={<Users size={18} />}
            title={t('Membership', 'አባልነት')}
            onExport={() =>
              downloadXlsx(`report_membership_${fileTag}`, [
                [boldCell(`${t('Membership', 'አባልነት')} — ${periodText}`)],
                [],
                [headerCell(t('Measure', 'መለኪያ')), headerCell(t('Value', 'ዋጋ'))],
                [t('Total members', 'ጠቅላላ አባላት'), m.total],
                [t('Male', 'ወንድ'), m.male],
                [t('Female', 'ሴት'), m.female],
                [t('Registered in period', 'በጊዜው የተመዘገቡ'), m.newInPeriod],
                ...Object.entries(m.byStatus).map(([s, n]) => [`${t('Status', 'ሁኔታ')}: ${s}`, n]),
                [],
                [headerCell(t('Month', 'ወር')), headerCell(t('New registrations', 'አዲስ ምዝገባ'))],
                ...m.perMonth.map((x) => [x.month, x.count]),
              ], { sheet: 'Membership', widths: [32, 14] })
            }
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label={t('Total members', 'ጠቅላላ አባላት')} value={m.total} />
              <Tile label={t('Active', 'ንቁ')} value={m.byStatus.ACTIVE ?? 0} />
              <Tile label={t('Male / female', 'ወንድ / ሴት')} value={`${m.male} / ${m.female}`} />
              <Tile label={t('Registered in this period', 'በዚህ ጊዜ የተመዘገቡ')} value={m.newInPeriod} />
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('New member registrations per month', 'በወር አዲስ የአባላት ምዝገባ')}</h3>
              <ColumnChart
                label={t('New member registrations per month', 'በወር አዲስ የአባላት ምዝገባ')}
                categories={m.perMonth.map((x) => monthLabel(x.month))}
                series={[{ name: t('Registrations', 'ምዝገባ'), color: BLUE, values: m.perMonth.map((x) => x.count) }]}
                format={(n) => String(Math.round(n))}
                height={160}
              />
            </div>
          </Section>
        )}

        {/* ── Education ── */}
        {e && (
          <Section
            icon={<GraduationCap size={18} />}
            title={`${t('Education', 'ትምህርት')}${e.year ? ` — ${e.year}` : ''}`}
            onExport={() =>
              downloadXlsx(`report_education_${fileTag}`, [
                [boldCell(`${t('Education', 'ትምህርት')} ${e.year ?? ''} — ${periodText}`)],
                [],
                [t('Class', 'ክፍል'), t('Teacher', 'መምህር'), t('Students', 'ተማሪዎች'), t('Male', 'ወንድ'), t('Female', 'ሴት'), t('Sessions', 'ክፍለ ጊዜ'), t('Attendance %', 'ተገኝነት %'), t('With results', 'ውጤት ያላቸው'), t('Average %', 'አማካይ %'), t('Pass rate %', 'ያለፉ %')].map(headerCell),
                ...e.classes.map((c) => [locale === 'am' ? c.class_am : c.class, c.teacher, c.students, c.male, c.female, c.sessions, c.attendanceRate, c.withResults, c.average, c.passRate]),
                [boldCell(t('All classes', 'ሁሉም ክፍሎች')), '', e.totals.students, e.totals.male, e.totals.female, e.totals.sessions, e.totals.attendanceRate, e.totals.withResults, e.totals.average, e.totals.passRate],
                [],
                [headerCell(t('Month', 'ወር')), headerCell(t('Sessions', 'ክፍለ ጊዜ')), headerCell(t('Attendance %', 'ተገኝነት %'))],
                ...e.attendanceByMonth.map((x) => [x.month, x.sessions, x.rate]),
              ], { sheet: 'Education', widths: [28, 22, 10, 8, 8, 10, 12, 12, 10, 10] })
            }
          >
            {!e.year ? (
              <p className="card p-5 text-sm text-slate-500">{t('No academic year has been opened yet.', 'እስካሁን የትምህርት ዓመት አልተከፈተም።')}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Tile label={t('Active students', 'ንቁ ተማሪዎች')} value={e.totals.students} />
                  <Tile label={t('Attendance rate', 'የተገኝነት ምጣኔ')} value={e.totals.attendanceRate === null ? '—' : `${e.totals.attendanceRate}%`} />
                  <Tile label={t('Average score (approved)', 'አማካይ ውጤት (የጸደቁ)')} value={e.totals.average === null ? '—' : `${e.totals.average}%`} />
                  <Tile label={t('Pass rate', 'የማለፍ ምጣኔ')} value={e.totals.passRate === null ? '—' : `${e.totals.passRate}%`} />
                </div>
                <div className="card overflow-hidden">
                  <div className="table-container rounded-none border-0">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Class', 'ክፍል')}</th>
                          <th>{t('Teacher', 'መምህር')}</th>
                          <th className="text-right">{t('Students (M/F)', 'ተማሪዎች (ወ/ሴ)')}</th>
                          <th className="text-right">{t('Sessions', 'ክፍለ ጊዜ')}</th>
                          <th className="text-right">{t('Attendance', 'ተገኝነት')}</th>
                          <th className="text-right">{t('Average', 'አማካይ')}</th>
                          <th className="text-right">{t('Pass rate', 'ያለፉ')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.classes.map((c) => (
                          <tr key={c.class_id}>
                            <td className="font-medium text-slate-900">{locale === 'am' ? c.class_am : c.class}</td>
                            <td className="text-xs text-slate-600">{c.teacher}</td>
                            <td className="text-right tabular-nums">{c.students} <span className="text-xs text-slate-400">({c.male}/{c.female})</span></td>
                            <td className="text-right tabular-nums">{c.sessions}</td>
                            <td className="text-right tabular-nums">{c.attendanceRate === null ? '—' : `${c.attendanceRate}%`}</td>
                            <td className="text-right tabular-nums">{c.average === null ? '—' : `${c.average}%`}</td>
                            <td className="text-right tabular-nums">{c.passRate === null ? '—' : `${c.passRate}%`}</td>
                          </tr>
                        ))}
                        {e.classes.length === 0 && (
                          <tr><td colSpan={7} className="text-center text-sm text-slate-400 py-6">{t('No classes yet.', 'እስካሁን ክፍል የለም።')}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('Attendance rate per month (all classes)', 'በወር የተገኝነት ምጣኔ (ሁሉም ክፍሎች)')}</h3>
                  <ColumnChart
                    label={t('Attendance rate per month', 'በወር የተገኝነት ምጣኔ')}
                    categories={e.attendanceByMonth.map((x) => monthLabel(x.month))}
                    series={[{ name: t('Attendance', 'ተገኝነት'), color: BLUE, values: e.attendanceByMonth.map((x) => x.rate) }]}
                    format={(n) => `${Math.round(n)}%`}
                    fixedMax={100}
                    height={160}
                    emptyText={t('no roll calls', 'የስም ጥሪ የለም')}
                  />
                </div>
              </>
            )}
          </Section>
        )}

        {/* ── Finance ── */}
        {f && (
          <Section
            icon={<Wallet size={18} />}
            title={t('Finance', 'ፋይናንስ')}
            onExport={() =>
              downloadXlsx(`report_finance_${fileTag}`, [
                [boldCell(`${t('Finance', 'ፋይናንስ')} — ${periodText}`)],
                [],
                [t('Income', 'ገቢ'), f.income],
                [t('Expenses', 'ወጪ'), f.expenses],
                [t('Net', 'ተጣራ'), f.income - f.expenses],
                [],
                [t('Month', 'ወር'), t('Income', 'ገቢ'), t('Expenses', 'ወጪ'), t('Net', 'ተጣራ')].map(headerCell),
                ...f.byMonth.map((x) => [x.month, x.income, x.expense, x.income - x.expense]),
                [],
                [headerCell(t('Income by category', 'ገቢ በዓይነት')), headerCell('ETB')],
                ...f.incomeByCategory.map((x) => [categoryLabel(x.category, locale), x.amount]),
                [],
                [headerCell(t('Expenses by category', 'ወጪ በዓይነት')), headerCell('ETB')],
                ...f.expenseByCategory.map((x) => [categoryLabel(x.category, locale), x.amount]),
                [],
                [headerCell(t('Payment requests', 'የክፍያ ጥያቄዎች')), headerCell('')],
                [t('Submitted', 'የቀረቡ'), f.requests.total],
                [t('Amount requested', 'የተጠየቀ መጠን'), f.requests.requested],
                [t('Amount approved', 'የጸደቀ መጠን'), f.requests.approvedAmount],
                [t('Average days to a decision', 'ለውሳኔ አማካይ ቀናት'), f.requests.avgDecisionDays],
                ...Object.entries(f.requests.byStatus).map(([s, n]) => [s, n]),
                [],
                [t('Department', 'ክፍል'), t('Budget', 'በጀት'), t('Spent', 'የወጣ'), t('Approved, unpaid', 'የጸደቀ ያልተከፈለ'), t('Remaining', 'ቀሪ')].map(headerCell),
                ...f.budget.filter((b) => b.allocated !== null || b.spent || b.committed).map((b) => [locale === 'am' ? b.unit_am : b.unit, b.allocated, b.spent, b.committed, budgetRemaining(b)]),
              ], { sheet: 'Finance', widths: [34, 14, 14, 16, 14] })
            }
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label={t('Income', 'ገቢ')} value={formatETB(f.income)} />
              <Tile label={t('Expenses', 'ወጪ')} value={formatETB(f.expenses)} />
              <Tile label={t('Net', 'ተጣራ')} value={formatETB(f.income - f.expenses)} />
              <Tile label={t('Payment requests', 'የክፍያ ጥያቄዎች')} value={`${f.requests.total}`} sub={f.requests.avgDecisionDays === null ? undefined : t(`decided in ${f.requests.avgDecisionDays} days on average`, `በአማካይ በ${f.requests.avgDecisionDays} ቀናት ተወስኗል`)} />
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('Income and expenses per month (ETB)', 'ገቢና ወጪ በወር (ብር)')}</h3>
              <ColumnChart
                label={t('Income and expenses per month', 'ገቢና ወጪ በወር')}
                categories={f.byMonth.map((x) => monthLabel(x.month))}
                series={[
                  { name: t('Income', 'ገቢ'), color: BLUE, values: f.byMonth.map((x) => x.income) },
                  { name: t('Expenses', 'ወጪ'), color: ORANGE, values: f.byMonth.map((x) => x.expense) },
                ]}
                format={compactETB}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CategoryTable title={t('Income by category', 'ገቢ በዓይነት')} rows={f.incomeByCategory} locale={locale} empty={t('No income in this period.', 'በዚህ ጊዜ ገቢ የለም።')} />
              <CategoryTable title={t('Expenses by category', 'ወጪ በዓይነት')} rows={f.expenseByCategory} locale={locale} empty={t('No expenses in this period.', 'በዚህ ጊዜ ወጪ የለም።')} />
            </div>
            {f.budget.some((b) => b.allocated !== null) && (
              <div className="card overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 px-5 pt-4">{t(`Budget use ${f.budgetYear ?? ''}`, `የበጀት አጠቃቀም ${f.budgetYear ?? ''}`)}</h3>
                <div className="table-container rounded-none border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Department', 'ክፍል')}</th>
                        <th className="text-right">{t('Budget', 'በጀት')}</th>
                        <th className="text-right">{t('Spent', 'የወጣ')}</th>
                        <th className="text-right">{t('Remaining', 'ቀሪ')}</th>
                        <th className="text-right">{t('Used', 'ጥቅም ላይ')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.budget.filter((b) => b.allocated !== null).map((b) => {
                        const rem = budgetRemaining(b) ?? 0;
                        const used = b.allocated ? Math.round(((b.spent + b.committed) / b.allocated) * 100) : 0;
                        return (
                          <tr key={b.unit_id}>
                            <td className="font-medium text-slate-900">{locale === 'am' ? b.unit_am : b.unit}</td>
                            <td className="text-right font-mono text-sm">{formatETB(b.allocated ?? 0)}</td>
                            <td className="text-right font-mono text-sm">{formatETB(b.spent + b.committed)}</td>
                            <td className={`text-right font-mono text-sm ${rem < 0 ? 'text-red-600 font-semibold' : ''}`}>{formatETB(rem)}</td>
                            <td className="text-right tabular-nums">
                              {used >= 100 && <AlertTriangle size={12} className="inline text-red-600 mr-1" aria-label={t('over budget', 'ከበጀት በላይ')} />}
                              {used}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── Governance ── */}
        {g && (
          <Section
            icon={<Landmark size={18} />}
            title={t('Governance', 'አስተዳደር')}
            onExport={() =>
              downloadXlsx(`report_governance_${today}`, [
                [boldCell(t('Governance', 'አስተዳደር'))],
                [],
                [t('Body', 'አካል'), t('Active members', 'ንቁ አባላት'), t('Seats', 'ወንበሮች'), t('Officers', 'ኃላፊዎች')].map(headerCell),
                ...g.bodies.map((b) => [locale === 'am' ? b.name_am : b.name_en, b.active, b.seats, b.officers]),
                [],
                [t('Person', 'ሰው'), t('Body', 'አካል'), t('Position', 'ቦታ'), t('Term ends', 'ዘመኑ የሚያበቃው'), t('Status', 'ሁኔታ')].map(headerCell),
                ...g.terms.map((x) => [x.person, locale === 'am' ? x.body_am : x.body, locale === 'am' ? x.position_am : x.position, x.term_end, x.overdue ? t('Overdue', 'አልፏል') : t('Ending soon', 'በቅርቡ ያበቃል')]),
              ], { sheet: 'Governance', widths: [32, 14, 10, 10, 16] })
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card overflow-hidden">
                <div className="table-container rounded-none border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Body', 'አካል')}</th>
                        <th className="text-right">{t('Members', 'አባላት')}</th>
                        <th className="text-right">{t('Officers', 'ኃላፊዎች')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.bodies.map((b) => (
                        <tr key={b.name_en}>
                          <td className="font-medium text-slate-900">{locale === 'am' ? b.name_am : b.name_en}</td>
                          <td className="text-right tabular-nums">
                            {b.seats !== null ? `${b.active} / ${b.seats}` : b.active}
                            {b.seats !== null && b.active < b.seats && (
                              <span className="ml-1 text-[11px] text-amber-700">({t(`${b.seats - b.active} empty`, `${b.seats - b.active} ክፍት`)})</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{b.officers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('Terms ending within 90 days', 'በ90 ቀናት ውስጥ የሚያበቁ ዘመናት')}</h3>
                {g.terms.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('None.', 'የለም።')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {g.terms.map((x, i) => (
                      <li key={i} className="py-2 flex items-center justify-between gap-3">
                        <span>
                          <span className="font-medium text-slate-900">{x.person}</span>
                          <span className="text-xs text-slate-500"> · {locale === 'am' ? x.position_am : x.position}, {locale === 'am' ? x.body_am : x.body}</span>
                        </span>
                        <span className={`text-xs whitespace-nowrap ${x.overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {x.overdue && <AlertTriangle size={12} className="inline mr-1" />}
                          {x.overdue ? t('ended', 'አብቅቷል') : t('ends', 'ያበቃል')} {formatEthiopianDate(x.term_end, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  onExport,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onExport: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <section className="space-y-4 break-inside-avoid">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span className="text-blue-600">{icon}</span>
          {title}
        </h2>
        <button onClick={onExport} className="no-print btn btn-ghost btn-sm text-xs inline-flex items-center gap-1.5">
          <Download size={13} /> {t('Excel', 'ኤክሴል')}
        </button>
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function CategoryTable({
  title,
  rows,
  locale,
  empty,
}: {
  title: string;
  rows: { category: string; amount: number }[];
  locale: string;
  empty: string;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.category}>
              <div className="flex justify-between gap-3">
                <span className="text-slate-700">{categoryLabel(r.category, locale)}</span>
                <span className="font-mono tabular-nums text-slate-900">{formatETB(r.amount)}</span>
              </div>
              <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${total ? (r.amount / total) * 100 : 0}%`, background: BLUE, printColorAdjust: 'exact' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
