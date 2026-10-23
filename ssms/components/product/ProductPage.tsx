// ─────────────────────────────────────────────────────────────────────────────
// The product page (/start) — tells other Sunday schools what the system does
// and brings them to sign-up (/register). No sign-in. Server component.
// Only true things: the modules that exist, the plans and trial as set under
// Platform → Plans / Settings (lib/platform/marketing), and Hamere Hiwot as
// the Sunday school already running on it. Sections without data are left out.
// Amharic by default, English with ?lang=en (like the Sunday schools' sites).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  ArrowRight, BookOpen, Briefcase, Building2, CalendarCheck, CalendarDays, ChartColumn, Check, ChevronDown, Church,
  FileSpreadsheet, Globe, GraduationCap, Languages, ListChecks, Music, Package, Send, ShieldCheck, Smartphone,
  UserRoundCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { LIMIT_LABELS, type LimitMetric, type PlanRow } from '@/lib/billing/access';
import { MODULE_LABELS, isModuleCode } from '@/lib/billing/modules';
import { DEFAULT_BRAND_COLOR, siteVars } from '@/lib/branding';
import type { ProductInfo } from '@/lib/platform/marketing';
import { hrefFor, pick, type SiteLang } from '@/components/site/SiteShell';

type T = (am: string, en: string) => string;

const NAME: [am: string, en: string] = ['የሰንበት ትምህርት ቤት አስተዳደር ሥርዓት', 'Sunday School Management System'];

const FEATURES: { icon: LucideIcon; am: [string, string]; en: [string, string] }[] = [
  { icon: Users, am: ['አባላትና አስተዳደር', 'የአባላት መዝገብና የምዝገባ ቅጽ፣ ኮሚቴዎች፣ ጠቅላላ ጉባኤና ሙሉ መዋቅሩ።'], en: ['Members & governance', 'Member records and registration forms, committees, the general assembly and the whole structure.'] },
  { icon: GraduationCap, am: ['ትምህርት', 'የትምህርት ዘመን፣ ክፍሎች፣ የክትትል መዝገብ፣ ውጤት፣ ማሳለፍና የኦንላይን ፈተና።'], en: ['Education', 'Academic years, classes, roll-call, grades, results, promotion and online exams.'] },
  { icon: UserRoundCheck, am: ['የተማሪና ወላጅ መግቢያ', 'ተማሪዎችና ወላጆች ክትትልን፣ ውጤትንና ፈተናን ራሳቸው ያያሉ።'], en: ['Student & parent portals', 'Students and parents see attendance, results and exams themselves.'] },
  { icon: Wallet, am: ['ፋይናንስና መዋጮ', 'ገቢ፣ ወጪ፣ የገንዘብ ጥያቄና ማጽደቅ፣ በጀት፣ ስጦታና ወርሃዊ መዋጮ።'], en: ['Finance & dues', 'Income, expenses, requests with approval, budgets, donations and monthly dues.'] },
  { icon: CalendarCheck, am: ['ፕሮግራሞችና መገኘት', 'መርሐ ግብሮችን፣ ጉባኤዎችንና ዝግጅቶችን ያቅዱ፤ ማን እንደተገኘ ይመዝግቡ።'], en: ['Programs & check-in', 'Plan programs, assemblies and events, and record who came.'] },
  { icon: Music, am: ['ዜማና ቅዱስ ጥበብ', 'የመዘምራን አባላት፣ መዝሙሮችና የአገልግሎት ድልድል።'], en: ['Choir & sacred arts', 'Choir members, hymns and service rosters.'] },
  { icon: Briefcase, am: ['የሰው ሀብት', 'የአገልጋዮች ምደባ፣ ክትትልና የሥነ ምግባር መዝገብ።'], en: ['Human resources', 'Servants’ assignments, attendance and discipline records.'] },
  { icon: Package, am: ['ንብረት', 'ንብረቶች፣ ክምችት፣ ኃላፊነት፣ ዝውውርና ጥገና።'], en: ['Property & assets', 'Assets, inventory, custody, transfers and maintenance.'] },
  { icon: ListChecks, am: ['እቅድና ተግባራት', 'የክፍሎች ዓመታዊ እቅድ በሩብ ዓመት፣ ተግባራትና የሂደት ሪፖርት።'], en: ['Plans & tasks', 'Yearly department plans by quarter, tasks and progress reports.'] },
  { icon: Send, am: ['የቴሌግራም ቦት', 'አባላትና ወላጆች መዋጮ፣ ውጤትና መርሐ ግብር ያያሉ፤ ክፍሎች ጥያቄ ይመልሳሉ።'], en: ['Telegram bot', 'Members and parents see dues, results and programs; departments answer questions.'] },
  { icon: Globe, am: ['የራስዎ ድረ ገጽ', 'ዜና፣ መርሐ ግብሮች፣ ፎቶዎችና የመልእክት ቅጽ — በአማርኛና በእንግሊዝኛ።'], en: ['Your own website', 'News, events, photo gallery and a contact form — in Amharic and English.'] },
  { icon: ChartColumn, am: ['ሪፖርትና ኦዲት', 'ሪፖርቶች፣ ወደ Excel መላክና ማን ምን እንደቀየረ የሚያሳይ መዝገብ።'], en: ['Reports & audit', 'Reports, Excel exports and a record of who changed what.'] },
];

const FIT: { icon: LucideIcon; am: [string, string]; en: [string, string] }[] = [
  { icon: CalendarDays, am: ['የኢትዮጵያ ዘመን አቆጣጠር', 'ቀኖች፣ ሩብ ዓመቶችና የትምህርት ዘመኑ ከመስከረም ይጀምራሉ።'], en: ['Ethiopian calendar', 'Dates, quarters and the school year follow the Ethiopian calendar, from Meskerem.'] },
  { icon: Languages, am: ['አማርኛና እንግሊዝኛ', 'እያንዳንዱ ገጽ በሁለቱም ቋንቋዎች ይሠራል።'], en: ['Amharic & English', 'Every page works in both languages.'] },
  { icon: Send, am: ['ኤስኤምኤስ አያስፈልግም', 'መልእክቶችና ማስታወሻዎች በቴሌግራም ይደርሳሉ።'], en: ['No SMS needed', 'Messages and reminders reach people on Telegram.'] },
  { icon: Smartphone, am: ['በማንኛውም ስልክ', 'እንደ መተግበሪያ በስልክ ይጫናል፤ ገጾቹ ለትንሽ ስክሪን ተሠርተዋል።'], en: ['On any phone', 'Install it on a phone like an app; pages fit small screens.'] },
  { icon: ShieldCheck, am: ['ለእያንዳንዱ ኃላፊነቱ', 'እያንዳንዱ አገልጋይ በሚና የተፈቀደለትን ብቻ ያያል።'], en: ['Roles & permissions', 'Each servant sees only what their role allows.'] },
  { icon: FileSpreadsheet, am: ['ከExcel ያስገቡ', 'ያሉትን የተማሪ ዝርዝሮች ከExcel ወይም CSV ያስገቡ።'], en: ['Import from Excel', 'Bring your existing student lists from Excel or CSV.'] },
];

/** "ETB 1,500" */
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-US')}`;

function PlanCard({ plan, info, t, lang }: { plan: PlanRow; info: ProductInfo; t: T; lang: SiteLang }) {
  const featured = plan.code === info.trial_plan_code && info.trial_days > 0;
  const modules = plan.features.filter(isModuleCode);
  const limits = (['students', 'staff_users'] as LimitMetric[]).map((m) => {
    const [en, am] = LIMIT_LABELS[m];
    const n = plan.limits[m];
    return `${t(am, en)}: ${n == null ? t('ያልተገደበ', 'unlimited') : n.toLocaleString('en-US')}`;
  });
  const description = (lang === 'am' && plan.description_am) || plan.description_en;
  return (
    <div className={`relative flex flex-col rounded-2xl bg-white p-6 ${featured ? 'border-2 border-amber-400 shadow-lg' : 'border border-slate-200 shadow-sm'}`}>
      {featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-[var(--site-dark)]">
          {t(`የ${info.trial_days} ቀን ነፃ ሙከራ`, `${info.trial_days}-day free trial`)}
        </span>
      )}
      <h3 className="text-lg font-bold text-slate-900">{(lang === 'am' && plan.name_am) || plan.name_en}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-5">
        {plan.is_free ? (
          <span className="text-3xl font-bold text-slate-900">{t('ነፃ', 'Free')}</span>
        ) : plan.price_monthly != null ? (
          <>
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{money(plan.price_monthly, plan.currency || info.currency)}</span>
            <span className="text-sm text-slate-500"> / {t('በወር', 'month')}</span>
          </>
        ) : plan.price_annual != null ? (
          <>
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{money(plan.price_annual, plan.currency || info.currency)}</span>
            <span className="text-sm text-slate-500"> / {t('በዓመት', 'year')}</span>
          </>
        ) : (
          <span className="text-xl font-bold text-slate-900">{t('ያግኙን', 'Ask us')}</span>
        )}
        {!plan.is_free && plan.price_monthly != null && plan.price_annual != null && (
          <div className="mt-1 text-xs text-slate-500">
            {t('ወይም', 'or')} {money(plan.price_annual, plan.currency || info.currency)} / {t('በዓመት', 'year')}
          </div>
        )}
      </div>
      <ul className="mt-5 space-y-2 text-sm text-slate-700 flex-1">
        <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {t('አባላት፣ መዋቅር፣ ሚናዎችና ሪፖርቶች', 'Members, structure, roles and reports')}</li>
        {modules.map((m) => (
          <li key={m} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {t(MODULE_LABELS[m][1], MODULE_LABELS[m][0])}</li>
        ))}
        {limits.map((l) => (
          <li key={l} className="flex gap-2 text-slate-500"><span className="w-4 shrink-0 text-center">·</span> {l}</li>
        ))}
      </ul>
      {info.registration_open && (
        <Link
          href="/register"
          className={`mt-6 inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-bold ${featured ? 'bg-[var(--site-main)] text-white hover:bg-[var(--site-light)]' : 'border border-slate-300 text-slate-800 hover:bg-slate-50'}`}
        >
          {featured ? t('በነፃ ይጀምሩ', 'Start free') : t('ይመዝገቡ', 'Sign up')}
        </Link>
      )}
    </div>
  );
}

/** A picture of the app — drawn, not a screenshot, and without made-up numbers */
function AppSketch({ t }: { t: T }) {
  const menu: [string, string][] = [['ዳሽቦርድ', 'Dashboard'], ['አባላት', 'Members'], ['ትምህርት', 'Education'], ['ፋይናንስ', 'Finance'], ['ፕሮግራሞች', 'Programs'], ['ቴሌግራም', 'Telegram']];
  return (
    <div aria-hidden className="rounded-2xl bg-white/95 shadow-2xl ring-1 ring-white/20 overflow-hidden text-slate-700">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </div>
      <div className="flex">
        <div className="hidden sm:block w-36 shrink-0 bg-[var(--site-main)] p-3 space-y-1">
          {menu.map(([am, en], i) => (
            <div key={en} className={`rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? 'bg-white/20 text-white font-semibold' : 'text-white/70'}`}>{t(am, en)}</div>
          ))}
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="h-3 w-32 rounded bg-slate-300" />
          <div className="grid grid-cols-3 gap-2">
            {[t('አባላት', 'Members'), t('ተማሪዎች', 'Students'), t('ዛሬ የተገኙ', 'Present today')].map((label) => (
              <div key={label} className="rounded-lg border border-slate-200 p-2">
                <div className="text-[10px] text-slate-500">{label}</div>
                <div className="mt-1.5 h-3 w-10 rounded bg-[var(--site-light)] opacity-70" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            {[80, 64, 72, 50].map((w) => (
              <div key={w} className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-slate-200" />
                <div className="h-2.5 rounded bg-slate-200" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductPage({ info, lang }: { info: ProductInfo; lang: SiteLang }) {
  const t: T = (am, en) => pick(lang, am, en);
  const open = info.registration_open;
  const trial = info.trial_days > 0;
  const nav: [string, string, string][] = [
    ['#features', 'አገልግሎቶች', 'Features'],
    ['#how', 'እንዴት ይጀመራል', 'How it works'],
    ...(info.plans.length > 0 ? [['#pricing', 'ዋጋ', 'Pricing'] as [string, string, string]] : []),
    ['#faq', 'ጥያቄዎች', 'FAQ'],
  ];
  const start = open ? (trial ? t(`በነፃ ይሞክሩ — ${info.trial_days} ቀን`, `Start free — ${info.trial_days} days`) : t('ሰንበት ትምህርት ቤትዎን ያስመዝግቡ', 'Register your Sunday school')) : '';

  const faq: { q: string; a: string }[] = [
    {
      q: t('ምንም ነገር መጫን ያስፈልገናል?', 'Do we need to install anything?'),
      a: t('አያስፈልግም። በኮምፒውተርም በስልክም ብራውዘር ላይ ይሠራል፤ ከፈለጉ በስልክዎ እንደ መተግበሪያ መጫን ይችላሉ።', 'No. It runs in the browser on computers and phones; you can also install it on a phone like an app.'),
    },
    {
      q: t('የእኛ መረጃ ለሌሎች ይታያል?', 'Can other Sunday schools see our records?'),
      a: t('አይታይም። የእያንዳንዱ ሰንበት ትምህርት ቤት መዝገብ ለብቻው ይቀመጣል፤ መግባት የሚችሉት እርስዎ ሚና የሰጧቸው ብቻ ናቸው፤ እያንዳንዳቸውም ሚናቸው የሚፈቅደውን ብቻ ያያሉ።', 'No. Each Sunday school’s records are kept apart. Only people you give a role can sign in, and each sees only what that role allows.'),
    },
    {
      q: t('ኤስኤምኤስ ያስፈልገናል?', 'Do we need SMS?'),
      a: t('አያስፈልግም። የራስዎ የቴሌግራም ቦት አባላትንና ወላጆችን ያገናኛል፤ መዋጮ፣ ውጤት፣ መርሐ ግብርና ማስታወሻ በእሱ ይደርሳል።', 'No. Your own Telegram bot connects members and parents — dues, results, programs and reminders reach them there.'),
    },
    {
      q: t('ያሉንን መዝገቦች ማስገባት እንችላለን?', 'Can we bring our existing records?'),
      a: t('አዎ። የተማሪ ዝርዝሮችን ከExcel ወይም CSV ፋይል ማስገባት ይቻላል።', 'Yes. Student lists can be imported from an Excel or CSV file.'),
    },
    ...(trial
      ? [{
          q: t('የሙከራ ጊዜው ሲያልቅ ምን ይሆናል?', 'What happens when the trial ends?'),
          a: info.after_trial_plan
            ? t(`ዕቅድ መርጠው ይክፈሉ። ካልከፈሉ ወደ “${info.after_trial_plan.am}” ዕቅድ ይዛወራሉ — መዝገቦችዎ አይጠፉም።`, `Choose a plan and pay. If you don’t, you move to the “${info.after_trial_plan.en}” plan — your records stay.`)
            : t('ዕቅድ መርጠው ይክፈሉ። እስኪከፍሉ ድረስ መዝገቦችዎን ማየት ይችላሉ፤ ምንም አይጠፋም።', 'Choose a plan and pay. Until you do, your records stay readable — nothing is deleted.'),
        }]
      : []),
    {
      q: t('እንዴት እንከፍላለን?', 'How do we pay?'),
      a: t('በወር ወይም በዓመት በባንክ ዝውውር ይከፍላሉ፤ ቡድናችን ክፍያውን አረጋግጦ ዕቅድዎን ያስቀጥላል። ካርድ አያስፈልግም።', 'Monthly or yearly by bank transfer; our team confirms the payment and your plan carries on. No card needed.'),
    },
  ];

  return (
    <div lang={lang} className="min-h-screen bg-white text-slate-900" style={siteVars(DEFAULT_BRAND_COLOR) as React.CSSProperties}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Link href={hrefFor('/start', lang)} className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--site-main)] text-amber-300">
              <Church size={20} />
            </span>
            <span className="font-bold text-sm sm:text-base truncate">{t(...NAME)}</span>
          </Link>
          <nav className="ml-auto hidden md:flex items-center gap-1 text-sm">
            {nav.map(([href, am, en]) => (
              <a key={href} href={href} className="px-3 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100">{t(am, en)}</a>
            ))}
          </nav>
          <div className="ml-auto md:ml-2 flex items-center gap-2 shrink-0">
            <Link href={hrefFor('/start', lang === 'am' ? 'en' : 'am')} hrefLang={lang === 'am' ? 'en' : 'am'} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
              {lang === 'am' ? 'English' : 'አማርኛ'}
            </Link>
            <Link href="/login" className="hidden sm:inline-flex text-sm font-semibold px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100">{t('ግባ', 'Sign in')}</Link>
            {open && (
              <Link href="/register" className="text-sm font-bold px-3.5 py-1.5 rounded-lg bg-[var(--site-main)] text-white hover:bg-[var(--site-light)]">{t('ይመዝገቡ', 'Sign up')}</Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[var(--site-dark)] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--site-light)_60%,transparent),transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-amber-300">
              <BookOpen size={14} /> {t('ለኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ሰንበት ትምህርት ቤቶች', 'For Ethiopian Orthodox Tewahedo Sunday schools')}
            </p>
            <h1 className="mt-5 text-3xl sm:text-5xl font-bold leading-tight">
              {t('ሰንበት ትምህርት ቤትዎን በአንድ ቦታ ያስተዳድሩ', 'Run your whole Sunday school in one place')}
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg text-white/80 leading-relaxed">
              {t(
                'አባላት፣ ተማሪዎች፣ ክትትል፣ ፈተና፣ ፋይናንስ፣ ፕሮግራሞች፣ የራስዎ ድረ ገጽና የቴሌግራም ቦት — በአማርኛና በእንግሊዝኛ፣ በኢትዮጵያ ዘመን አቆጣጠር።',
                'Members, students, attendance, exams, finance, programs, your own website and a Telegram bot — in Amharic and English, on the Ethiopian calendar.'
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {open && (
                <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[var(--site-dark)] hover:bg-amber-300">
                  {start} <ArrowRight size={16} />
                </Link>
              )}
              <a href="#features" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold hover:bg-white/10">
                {t('ምን ያደርጋል?', 'See what it does')}
              </a>
            </div>
            {open && trial && <p className="mt-4 text-xs text-white/60">{t('ካርድ አያስፈልግም · በደቂቃዎች ይጀምሩ', 'No card needed · set up in minutes')}</p>}
          </div>
          <AppSketch t={t} />
        </div>
      </section>

      {/* ── Already running ── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-3 text-center text-sm text-slate-600">
          <span>
            {t('በሥራ ላይ፦', 'Running at')}{' '}
            <Link href={hrefFor('/', lang)} className="font-semibold text-[var(--site-main)] hover:underline">
              {t('ሐመረ ሕይወት ሰንበት ትምህርት ቤት — ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ', 'Hamere Hiwot Sunday School — Sallo Debre Tsehay St. George')}
            </Link>
          </span>
          {info.schools > 1 && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={16} className="text-slate-400" />
              {t(`${info.schools} ሰንበት ትምህርት ቤቶች ይጠቀሙበታል`, `${info.schools} Sunday schools use it`)}
            </span>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-amber-700">{t('አገልግሎቶች', 'Features')}</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold">{t('የጽሕፈት ቤቱ ሥራ ሁሉ በአንድ ሥርዓት', 'Everything the office does, in one system')}</h2>
          <p className="mt-3 text-slate-600">{t('የሚፈልጉትን ብቻ ይጠቀሙ — ዕቅድዎ የሚያካትታቸው ክፍሎች ብቻ ይታያሉ።', 'Use only what you need — the menu shows just the parts your plan includes.')}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, am, en }) => (
            <div key={en[0]} className="rounded-2xl border border-slate-200 p-5 hover:border-[var(--site-main)] hover:shadow-md transition">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--site-main)_10%,white)] text-[var(--site-main)]">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 font-bold">{t(am[0], en[0])}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{t(am[1], en[1])}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Made for us ── */}
      <section className="bg-[var(--site-main)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold max-w-2xl">{t('ለኢትዮጵያ ሰንበት ትምህርት ቤቶች የተሠራ', 'Made for Ethiopian Sunday schools')}</h2>
          <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FIT.map(({ icon: Icon, am, en }) => (
              <div key={en[0]} className="flex gap-4">
                <Icon size={22} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <h3 className="font-bold">{t(am[0], en[0])}</h3>
                  <p className="mt-1 text-sm text-white/75 leading-relaxed">{t(am[1], en[1])}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:py-20 scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{t('በሦስት ደረጃ ይጀምሩ', 'Up and running in three steps')}</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            [t('ያስመዝግቡ', 'Register'), t('የሰንበት ትምህርት ቤቱን ስምና የእርስዎን ስልክ ያስገቡ። መደበኛው መዋቅር፣ ክፍሎችና ሚናዎች ወዲያው ይዘጋጃሉ።', 'Enter the Sunday school’s name and your phone. The usual structure, departments and roles are set up for you.')],
            [t('መዝገቦችን ያስገቡ', 'Add your records'), t('አባላትንና ተማሪዎችን ያስገቡ — የተማሪ ዝርዝርን ከExcel በአንድ ጊዜ ማስገባት ይቻላል።', 'Add members and students — a student list can come in at once from Excel.')],
            [t('አገልጋዮችን ይጋብዙ', 'Invite your servants'), t('ለእያንዳንዱ አገልጋይ ሚና ይስጡ፣ የቴሌግራም ቦቱን ያገናኙ፣ ድረ ገጽዎንም ያትሙ።', 'Give each servant a role, connect the Telegram bot and publish your website.')],
          ].map(([title, body], i) => (
            <li key={title} className="relative rounded-2xl border border-slate-200 p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-[var(--site-dark)]">{i + 1}</span>
              <h3 className="mt-4 font-bold text-lg">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Pricing ── */}
      {info.plans.length > 0 && (
        <section id="pricing" className="bg-slate-50 border-y border-slate-200 scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold">{t('ግልጽ ዋጋ', 'Simple pricing')}</h2>
              <p className="mt-3 text-slate-600">
                {trial
                  ? t(`በ${info.trial_days} ቀን ነፃ ሙከራ ይጀምሩ፤ ከዚያ የሚስማማዎትን ዕቅድ ይምረጡ።`, `Start with a ${info.trial_days}-day free trial, then choose the plan that fits.`)
                  : t('የሚስማማዎትን ዕቅድ ይምረጡ።', 'Choose the plan that fits.')}
              </p>
            </div>
            <div className={`mt-12 grid gap-6 ${info.plans.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : info.plans.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'max-w-md mx-auto'}`}>
              {info.plans.map((p) => <PlanCard key={p.id} plan={p} info={info} t={t} lang={lang} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:py-20 scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{t('ተደጋጋሚ ጥያቄዎች', 'Questions people ask')}</h2>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {faq.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Last call ── */}
      {open && (
        <section className="px-4 pb-16 sm:pb-20">
          <div className="mx-auto max-w-6xl rounded-3xl bg-[var(--site-dark)] px-6 py-12 sm:px-12 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold">{t('ሰንበት ትምህርት ቤትዎን ዛሬ ያስመዝግቡ', 'Bring your Sunday school online today')}</h2>
            <p className="mt-3 text-white/75">{t('ምዝገባው ጥቂት ደቂቃዎች ብቻ ይወስዳል።', 'Registration takes only a few minutes.')}</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-[var(--site-dark)] hover:bg-amber-300">
              {start} <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {t(...NAME)}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {nav.map(([href, am, en]) => <a key={href} href={href} className="hover:text-slate-900">{t(am, en)}</a>)}
            <Link href="/login" className="hover:text-slate-900">{t('ግባ', 'Sign in')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
