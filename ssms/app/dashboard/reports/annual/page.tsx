'use client';

// Annual report for the General Assembly: one printable document for a year —
// the year at a glance, membership, education, service and department plans,
// programmes, library and property, the financial statements, governance, and
// the written parts (message, highlights, challenges, next year), ending with
// signatures. Server work: ./actions.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, Save } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { TenantLogo } from '@/components/branding/TenantLogo';
import type { LoadMode } from '@/lib/admin/types';
import { formatETB } from '@/lib/finance/types';
import { fmtAmount, type StatementGroup } from '@/lib/finance/gl';
import { PROGRAM_TYPES, type ProgramType } from '@/lib/programs/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { EMPTY_NOTES, type AnnualNotes, type AnnualReport } from '@/lib/reports/annual';
import { loadAnnualReport, saveAnnualNotes } from './actions';

type Tr = (en: string, am: string) => string;

const PLAN_STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'ረቂቅ'],
  SUBMITTED: ['Waiting for approval', 'ማጽደቅ ይጠብቃል'],
  APPROVED: ['Approved', 'ጸድቋል'],
  RETURNED: ['Returned', 'ተመልሷል'],
};

const NOTE_FIELDS: { key: keyof AnnualNotes; label: [string, string]; hint: [string, string] }[] = [
  { key: 'message', label: ['Message from the chairperson', 'የሰብሳቢው መልእክት'], hint: ['Opens the report', 'ሪፖርቱን ይከፍታል'] },
  { key: 'highlights', label: ['Main achievements of the year', 'የዓመቱ ዋና ዋና ክንውኖች'], hint: ['One per line', 'በየመስመሩ አንድ'] },
  { key: 'challenges', label: ['Challenges', 'ተግዳሮቶች'], hint: ['One per line', 'በየመስመሩ አንድ'] },
  { key: 'next_year', label: ['Plans for the coming year', 'የሚቀጥለው ዓመት ዕቅድ'], hint: ['One per line', 'በየመስመሩ አንድ'] },
];

export default function AnnualReportPage() {
  const { t, locale } = useLang();
  const router = useRouter();
  const sp = useSearchParams();

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<AnnualReport | null>(null);
  const [query, setQuery] = useState({ yearId: sp.get('year') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<AnnualNotes>(EMPTY_NOTES);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadAnnualReport>>) => {
    if (res.mode === 'live') {
      setData(res.data);
      setNotes(res.data.notes);
    } else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadAnnualReport(query).then(apply);
  }, [apply, query]);

  const choose = (next: typeof query) => {
    setMode('loading');
    setEditing(false);
    setQuery(next);
    const p = new URLSearchParams();
    if (next.yearId) p.set('year', next.yearId);
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
    router.replace(`?${p.toString()}`);
  };

  const save = async () => {
    if (!data) return;
    setBusy(true);
    const res = await saveAnnualNotes({ ...data.period, ...notes });
    setBusy(false);
    setToast(res.ok ? { kind: 'success', text: t('Saved', 'ተቀምጧል') } : { kind: 'error', text: res.error });
    setTimeout(() => setToast(null), 3000);
    if (res.ok) {
      setEditing(false);
      setData({ ...data, notes });
    }
  };

  return (
    <div className="space-y-5">
      <AdminToast toast={toast} />
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/reports" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <ArrowLeft size={13} /> {t('Reports', 'ሪፖርቶች')}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{t('Annual report', 'ዓመታዊ ሪፖርት')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('One document for the General Assembly — print it or save it as PDF', 'ለጠቅላላ ጉባኤ የሚቀርብ አንድ ሰነድ — ያትሙት ወይም በPDF ያስቀምጡት')}
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">
              {t('Academic year', 'የትምህርት ዘመን')}
              <select
                value={data.yearId || 'custom'}
                onChange={(e) => (e.target.value === 'custom' ? choose({ yearId: undefined, from: data.period.from, to: data.period.to }) : choose({ yearId: e.target.value, from: undefined, to: undefined }))}
                className="form-input text-sm mt-1 block"
              >
                {data.years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
                <option value="custom">{t('Other period…', 'ሌላ ጊዜ…')}</option>
              </select>
            </label>
            {!data.yearId && (
              <>
                <input type="date" value={data.period.from} onChange={(e) => e.target.value && choose({ yearId: undefined, from: e.target.value, to: data.period.to })} className="form-input text-sm" />
                <input type="date" value={data.period.to} onChange={(e) => e.target.value && choose({ yearId: undefined, from: data.period.from, to: e.target.value })} className="form-input text-sm" />
              </>
            )}
            {data.canEditNotes && !editing && (
              <button onClick={() => setEditing(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                <Pencil size={14} /> {t('Write the text parts', 'የጽሑፍ ክፍሎቹን ጻፍ')}
              </button>
            )}
            <button onClick={() => window.print()} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <Printer size={14} /> {t('Print / PDF', 'አትም / PDF')}
            </button>
          </div>
        )}
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {editing && data && (
        <div className="no-print card p-5 space-y-4 border-blue-200">
          <div className="text-sm font-bold text-slate-800">{t('Written parts of the report', 'የሪፖርቱ የጽሑፍ ክፍሎች')}</div>
          {NOTE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold text-slate-700">{t(...f.label)}</span>
              <span className="ml-2 text-[11px] text-slate-400">{t(...f.hint)}</span>
              <textarea rows={f.key === 'message' ? 6 : 4} value={notes[f.key]} onChange={(e) => setNotes({ ...notes, [f.key]: e.target.value })} className="form-input text-sm mt-1" />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setNotes(data.notes); setEditing(false); }} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button onClick={save} disabled={busy} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
              <Save size={14} /> {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}
            </button>
          </div>
        </div>
      )}

      {mode === 'live' && data && <ReportDocument r={data} locale={locale} t={t} />}
    </div>
  );
}

// ── The document ─────────────────────────────────────────────────────────────

function ReportDocument({ r, locale, t }: { r: AnnualReport; locale: string; t: Tr }) {
  const et = (d: string) => formatEthiopianDate(d, locale as 'en' | 'am');
  const income = r.statements ? r.statements.income.totalIncome : r.finance?.income ?? null;
  const expenses = r.statements ? r.statements.income.totalExpenses : r.finance?.expenses ?? null;
  let n = 0;
  const next = () => ++n;

  const tiles: [string, string | number | null][] = [
    [t('Members', 'አባላት'), r.membership?.total ?? null],
    [t('New members', 'አዲስ አባላት'), r.membership?.newInPeriod ?? null],
    [t('Students', 'ተማሪዎች'), r.education?.totals.students ?? null],
    [t('Class attendance', 'የክፍል ተገኝነት'), r.education?.totals.attendanceRate != null ? `${r.education.totals.attendanceRate}%` : null],
    [t('Pass rate', 'የማለፍ መጠን'), r.education?.totals.passRate != null ? `${r.education.totals.passRate}%` : null],
    [t('People serving', 'አገልጋዮች'), r.service?.servants ?? null],
    [t('Programmes held', 'የተካሄዱ መርሐ ግብሮች'), r.programs ? r.programs.total - r.programs.cancelled : null],
    [t('Plan activities done', 'የተጠናቀቁ የዕቅድ ተግባራት'), r.plans?.activities ? `${r.plans.done} / ${r.plans.activities}` : null],
    [t('Income', 'ገቢ'), income != null ? formatETB(income) : null],
    [t('Expenses', 'ወጪ'), expenses != null ? formatETB(expenses) : null],
    [t('Surplus (deficit)', 'ትርፍ (ጉድለት)'), income != null && expenses != null ? formatETB(income - expenses) : null],
    [t('Net assets', 'የተጣራ ሀብት'), r.statements ? formatETB(r.statements.balance.totalNetAssets) : null],
  ];

  return (
    <article className="print-sheet card p-6 sm:p-10 space-y-10 text-slate-800 max-w-4xl mx-auto bg-white">
      {/* Cover */}
      <header className="text-center space-y-3 border-b-2 border-slate-800 pb-8">
        <div className="flex justify-center"><TenantLogo size={84} /></div>
        <div className="text-lg font-bold text-slate-900 leading-snug">{r.school[1].split(' · ').map((l) => <div key={l}>{l}</div>)}</div>
        <div className="text-sm text-slate-600">{r.school[0]}</div>
        <div className="pt-4">
          <div className="text-3xl font-black tracking-tight text-slate-900">ዓመታዊ ሪፖርት</div>
          <div className="text-xl font-semibold text-slate-700">Annual Report</div>
        </div>
        <div className="text-sm text-slate-600">
          {et(r.period.from)} – {et(r.period.to)} · {r.ecYear} {t('E.C.', 'ዓ.ም.')}
          <div className="text-xs text-slate-400">({r.period.from} – {r.period.to})</div>
        </div>
        <div className="text-sm font-semibold text-slate-700">{t('Presented to the General Assembly', 'ለጠቅላላ ጉባኤ የቀረበ')}</div>
        <div className="text-[11px] text-slate-400">{t('Prepared', 'የተዘጋጀው')} {et(todayIso())}</div>
      </header>

      {r.notes.message && (
        <Section n={next()} title={t('Message from the chairperson', 'የሰብሳቢው መልእክት')}>
          <p className="whitespace-pre-line text-sm leading-relaxed">{r.notes.message}</p>
        </Section>
      )}

      <Section n={next()} title={t('The year at a glance', 'ዓመቱ በጨረፍታ')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiles.filter(([, v]) => v !== null).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 p-3 break-inside-avoid">
              <div className="text-lg font-bold text-slate-900">{value}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      {r.notes.highlights && (
        <Section n={next()} title={t('Main achievements', 'ዋና ዋና ክንውኖች')}>
          <Bullets text={r.notes.highlights} />
        </Section>
      )}

      {r.membership && (
        <Section n={next()} title={t('Membership', 'አባልነት')}>
          <Facts
            rows={[
              [t('Members', 'አባላት'), r.membership.total],
              [t('Men · women', 'ወንድ · ሴት'), `${r.membership.male} · ${r.membership.female}`],
              [t('Joined this year', 'በዓመቱ የተቀላቀሉ'), r.membership.newInPeriod],
              ...Object.entries(r.membership.byStatus).map(([s, c]) => [statusName(s, t), c] as [string, number]),
            ]}
          />
        </Section>
      )}

      {r.education && (
        <Section n={next()} title={t('Education', 'ትምህርት')}>
          <p className="text-sm mb-3">
            {t(
              `${r.education.totals.students} students in ${r.education.classes.length} classes (${r.education.year ?? ''}); ${r.education.totals.sessions} class days recorded.`,
              `${r.education.totals.students} ተማሪዎች በ${r.education.classes.length} ክፍሎች (${r.education.year ?? ''})፤ ${r.education.totals.sessions} የክፍል ቀናት ተመዝግበዋል።`
            )}
          </p>
          <Table
            head={[t('Class', 'ክፍል'), t('Teacher', 'መምህር'), t('Students', 'ተማሪዎች'), t('Attendance', 'ተገኝነት'), t('Average', 'አማካይ'), t('Passed', 'ያለፉ')]}
            rows={r.education.classes.map((c) => [
              locale === 'am' ? c.class_am : c.class,
              c.teacher,
              `${c.students} (${c.male}/${c.female})`,
              c.attendanceRate != null ? `${c.attendanceRate}%` : '—',
              c.average != null ? String(c.average) : '—',
              c.passRate != null ? `${c.passRate}%` : '—',
            ])}
            right={[2, 3, 4, 5]}
          />
        </Section>
      )}

      {(r.service || r.plans) && (
        <Section n={next()} title={t('Service and department plans', 'አገልግሎትና የክፍላት ዕቅድ')}>
          {r.service && (
            <>
              <p className="text-sm mb-3">
                {t(`${r.service.servants} people serve in the departments; ${r.service.newInPeriod} new assignments this year.`, `${r.service.servants} ሰዎች በክፍላቱ ያገለግላሉ፤ በዓመቱ ${r.service.newInPeriod} አዲስ ምደባዎች ተደርገዋል።`)}
              </p>
              {r.service.byUnit.length > 0 && (
                <Table head={[t('Department', 'ክፍል'), t('Serving', 'አገልጋዮች')]} rows={r.service.byUnit.map((u) => [locale === 'am' ? u.unit_am : u.unit, String(u.count)])} right={[1]} />
              )}
            </>
          )}
          {r.plans && r.plans.units.length > 0 && (
            <div className="mt-5">
              <div className="text-sm font-semibold mb-2">
                {t(`Department plans ${r.plans.year} E.C.`, `የክፍላት ዕቅድ ${r.plans.year} ዓ.ም.`)}
                {r.plans.progress != null && <span className="ml-2 text-slate-500 font-normal">· {t('overall progress', 'አጠቃላይ ሂደት')} {r.plans.progress}%</span>}
              </div>
              <Table
                head={[t('Department', 'ክፍል'), t('Plan', 'ዕቅድ'), t('Activities', 'ተግባራት'), t('Done', 'የተጠናቀቁ'), t('Progress', 'ሂደት'), t('Budget', 'በጀት')]}
                rows={r.plans.units.map((u) => [
                  locale === 'am' ? u.unit_am : u.unit,
                  t(...(PLAN_STATUS[u.status] ?? [u.status, u.status])),
                  String(u.activities - u.dropped),
                  String(u.done),
                  u.progress != null ? `${u.progress}%` : '—',
                  u.budget ? fmtAmount(u.budget) : '—',
                ])}
                right={[2, 3, 4, 5]}
              />
            </div>
          )}
        </Section>
      )}

      {r.programs && r.programs.total > 0 && (
        <Section n={next()} title={t('Programmes and events', 'መርሐ ግብሮችና ዝግጅቶች')}>
          <p className="text-sm mb-3">
            {t(
              `${r.programs.total - r.programs.cancelled} programmes (${r.programs.completed} completed)${r.programs.participants ? `, ${r.programs.participants.toLocaleString()} participants` : ''}${r.programs.checkins ? `, ${r.programs.checkins.toLocaleString()} check-ins` : ''}.`,
              `${r.programs.total - r.programs.cancelled} መርሐ ግብሮች (${r.programs.completed} ተጠናቀዋል)${r.programs.participants ? `፣ ${r.programs.participants.toLocaleString()} ተሳታፊዎች` : ''}${r.programs.checkins ? `፣ ${r.programs.checkins.toLocaleString()} የመገኘት ምዝገባዎች` : ''}።`
            )}
          </p>
          <Table
            head={[t('Date', 'ቀን'), t('Programme', 'መርሐ ግብር'), t('Type', 'ዓይነት'), t('Participants', 'ተሳታፊዎች')]}
            rows={r.programs.list.map((p) => [et(p.date), locale === 'am' ? p.title_am : p.title, t(...(PROGRAM_TYPES[p.type as ProgramType] ?? [p.type, p.type])), p.participants != null ? String(p.participants) : '—'])}
            right={[3]}
          />
        </Section>
      )}

      {(r.library || r.property) && (
        <Section n={next()} title={t('Library and property', 'ቤተ መጻሕፍትና ንብረት')}>
          <Facts
            rows={[
              ...(r.library
                ? ([
                    [t('Book titles · copies', 'የመጻሕፍት ርዕሶች · ቅጂዎች'), `${r.library.titles} · ${r.library.copies}`],
                    [t('Books lent this year', 'በዓመቱ የተዋሱ መጻሕፍት'), r.library.loans],
                    [t('Readers', 'አንባቢዎች'), r.library.readers],
                  ] as [string, string | number][])
                : []),
              ...(r.property
                ? ([
                    [t('Assets held', 'ያሉ ንብረቶች'), r.property.assets],
                    [t('Recorded value', 'የተመዘገበ ዋጋ'), formatETB(r.property.value)],
                  ] as [string, string | number][])
                : []),
            ]}
          />
        </Section>
      )}

      {(r.statements || r.finance || r.giving) && (
        <Section n={next()} title={t('Finance', 'ፋይናንስ')}>
          {r.giving && (
            <Facts
              rows={[
                [t('Member dues collected', 'የተሰበሰበ የአባላት መዋጮ'), `${formatETB(r.giving.duesCollected)} · ${r.giving.duesPayers} ${t('members', 'አባላት')}`],
                [t('Donations received', 'የተቀበሉ ስጦታዎች'), `${formatETB(r.giving.donations)} · ${r.giving.donationCount} ${t('gifts', 'ስጦታዎች')}`],
                ...(r.giving.inKindValue ? ([[t('Gifts in kind (estimated)', 'የዓይነት ስጦታ (ግምት)'), formatETB(r.giving.inKindValue)]] as [string, string][]) : []),
                ...(r.giving.openPledges ? ([[t('Pledges not yet received', 'ገና ያልደረሱ የስጦታ ቃሎች'), formatETB(r.giving.openPledges)]] as [string, string][]) : []),
              ]}
            />
          )}

          {r.statements ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
              <MiniStatement
                title={t('Income statement', 'የገቢና ወጪ መግለጫ')}
                blocks={[
                  { label: t('Income', 'ገቢ'), groups: r.statements.income.income, total: r.statements.income.totalIncome },
                  { label: t('Expenses', 'ወጪ'), groups: r.statements.income.expenses, total: r.statements.income.totalExpenses },
                ]}
                result={[r.statements.income.surplus >= 0 ? t('Surplus', 'ትርፍ') : t('Deficit', 'ጉድለት'), r.statements.income.surplus]}
                locale={locale}
              />
              <MiniStatement
                title={`${t('Balance sheet', 'የሀብትና ዕዳ መግለጫ')} · ${et(r.statements.balance.asOf)}`}
                blocks={[
                  { label: t('Assets', 'ሀብት'), groups: [...r.statements.balance.currentAssets, ...r.statements.balance.nonCurrentAssets], total: r.statements.balance.totalAssets },
                  { label: t('Liabilities', 'ዕዳዎች'), groups: [...r.statements.balance.currentLiabilities, ...r.statements.balance.longTermLiabilities], total: r.statements.balance.totalLiabilities },
                  { label: t('Net assets', 'የተጣራ ሀብት'), groups: r.statements.balance.netAssets, total: r.statements.balance.totalNetAssets },
                ]}
                result={[t('Net assets a year earlier', 'ከዓመት በፊት የነበረ የተጣራ ሀብት'), r.statements.balance.compareTotalNetAssets ?? 0]}
                locale={locale}
              />
            </div>
          ) : (
            r.finance && (
              <Facts
                rows={[
                  [t('Income', 'ገቢ'), formatETB(r.finance.income)],
                  [t('Expenses', 'ወጪ'), formatETB(r.finance.expenses)],
                  [t('Surplus (deficit)', 'ትርፍ (ጉድለት)'), formatETB(r.finance.income - r.finance.expenses)],
                ]}
              />
            )
          )}

          {r.finance && r.finance.budget.some((b) => b.allocated !== null) && (
            <div className="mt-5">
              <div className="text-sm font-semibold mb-2">{t(`Budget and spending per department (${r.finance.budgetYear ?? ''})`, `በጀትና ወጪ በክፍል (${r.finance.budgetYear ?? ''})`)}</div>
              <Table
                head={[t('Department', 'ክፍል'), t('Budget', 'በጀት'), t('Spent', 'ወጪ'), t('Used', 'የተጠቀመው')]}
                rows={r.finance.budget
                  .filter((b) => b.allocated !== null || b.spent > 0)
                  .map((b) => [
                    locale === 'am' ? b.unit_am : b.unit,
                    b.allocated !== null ? fmtAmount(b.allocated) : '—',
                    fmtAmount(b.spent),
                    b.allocated ? `${Math.round((b.spent / b.allocated) * 100)}%` : '—',
                  ])}
                right={[1, 2, 3]}
              />
            </div>
          )}
        </Section>
      )}

      {r.governance && r.governance.bodies.length > 0 && (
        <Section n={next()} title={t('Governance', 'አስተዳደር')}>
          <Table
            head={[t('Body', 'አካል'), t('Members', 'አባላት'), t('Seats', 'መቀመጫዎች'), t('Officers', 'ኃላፊዎች')]}
            rows={r.governance.bodies.map((b) => [locale === 'am' ? b.name_am : b.name_en, String(b.active), b.seats != null ? String(b.seats) : '—', String(b.officers)])}
            right={[1, 2, 3]}
          />
          {r.governance.terms.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              {t(`${r.governance.terms.length} terms end within three months or have ended.`, `${r.governance.terms.length} የሥራ ዘመኖች በሦስት ወራት ውስጥ ያበቃሉ ወይም አብቅተዋል።`)}
            </p>
          )}
        </Section>
      )}

      {r.notes.challenges && (
        <Section n={next()} title={t('Challenges', 'ተግዳሮቶች')}>
          <Bullets text={r.notes.challenges} />
        </Section>
      )}

      {r.notes.next_year && (
        <Section n={next()} title={t('Plans for the coming year', 'የሚቀጥለው ዓመት ዕቅድ')}>
          <Bullets text={r.notes.next_year} />
        </Section>
      )}

      <footer className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs text-slate-600 break-inside-avoid">
        {[t('Chairperson', 'ሰብሳቢ'), t('Secretary', 'ጸሐፊ'), t('Finance head', 'የፋይናንስ ኃላፊ'), t('Audit committee', 'ኦዲት ኮሚቴ')].map((role) => (
          <div key={role} className="border-t border-slate-400 pt-2">
            {role}
            <div className="text-[10px] text-slate-400 mt-1">{t('Signature and date', 'ፊርማና ቀን')}</div>
          </div>
        ))}
      </footer>
    </article>
  );
}

function statusName(s: string, t: Tr): string {
  const map: Record<string, [string, string]> = {
    ACTIVE: ['Active', 'ንቁ'],
    INACTIVE: ['Inactive', 'ንቁ ያልሆኑ'],
    SUSPENDED: ['Suspended', 'የታገዱ'],
    DECEASED: ['Deceased', 'ያረፉ'],
    TRANSFERRED: ['Transferred', 'የተዛወሩ'],
  };
  return t(...(map[s] ?? [s, s]));
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1 break-after-avoid">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ text }: { text: string }) {
  const items = text.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Facts({ rows }: { rows: [string, string | number][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-dotted border-slate-200 py-1.5 break-inside-avoid">
          <dt className="text-slate-600">{k}</dt>
          <dd className="font-semibold text-slate-900 text-right">{typeof v === 'number' ? v.toLocaleString() : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, right = [] }: { head: string[]; rows: string[][]; right?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100">
            {head.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 font-semibold text-slate-700 border border-slate-200 ${right.includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="break-inside-avoid">
              {row.map((c, j) => (
                <td key={j} className={`px-2 py-1 border border-slate-200 ${right.includes(j) ? 'text-right font-mono' : ''}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A statement in short: the classification groups with their totals */
function MiniStatement({
  title,
  blocks,
  result,
  locale,
}: {
  title: string;
  blocks: { label: string; groups: StatementGroup[]; total: number }[];
  result: [string, number];
  locale: string;
}) {
  return (
    <div className="break-inside-avoid">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {blocks.map((b) => (
            <React.Fragment key={b.label}>
              <tr>
                <td colSpan={2} className="pt-2 font-bold text-slate-800">{b.label}</td>
              </tr>
              {b.groups.map((g) => (
                <tr key={g.code}>
                  <td className="pl-3 text-slate-600">{locale === 'am' ? g.label[1] : g.label[0]}</td>
                  <td className="text-right font-mono">{fmtAmount(g.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="pl-3 font-semibold">{locale === 'am' ? `ጠቅላላ ${b.label}` : `Total ${b.label.toLowerCase()}`}</td>
                <td className="text-right font-mono font-semibold border-t border-slate-400">{fmtAmount(b.total)}</td>
              </tr>
            </React.Fragment>
          ))}
          <tr>
            <td className="pt-3 font-bold">{result[0]}</td>
            <td className="pt-3 text-right font-mono font-bold"><span className="border-b-4 border-double border-slate-700">{fmtAmount(result[1])}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
