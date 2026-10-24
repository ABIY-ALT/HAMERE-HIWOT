'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Copy, Play, Save, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { DEFAULT_AUTOMATION, JOB_LABELS, type AutomationSettings } from '@/lib/automation/types';
import { loadAutomationPage, runAutomationNow, saveAutomation, type AutomationPage } from './actions';

type Toggle = Exclude<keyof AutomationSettings, 'dues_day'>;

/** Which daily reminders run, what the last run did, and how the daily timer is set up. */
export default function AutomationAdminPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState<AutomationPage | null>(null);
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_AUTOMATION);
  const [busy, setBusy] = useState<'' | 'save' | 'run'>('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAutomationPage().then((res) => {
      if (res.mode === 'live') {
        setPage(res.data);
        setSettings(res.data.settings);
      }
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);

  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const save = async () => {
    if (mode !== 'live') return notify('success', t('Demo mode — not saved', 'የሙከራ ሁኔታ — አልተቀመጠም'));
    setBusy('save');
    const res = await saveAutomation(settings);
    setBusy('');
    if (!res.ok) return notify('error', res.error);
    notify('success', t('Saved', 'ተቀምጧል'));
  };

  const runNow = async () => {
    setBusy('run');
    const res = await runAutomationNow();
    setBusy('');
    if (!res.ok) return notify('error', res.error);
    setPage((p) => (p ? { ...p, last_run: res.run } : p));
    notify('success', t('Done — see “Last run” below', 'ተጠናቋል — ከታች «የመጨረሻው ሩጫ» ይመልከቱ'));
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => notify('success', t('Copied', 'ተቀድቷል')),
      () => notify('error', t('Could not copy', 'መቅዳት አልተቻለም'))
    );
  };

  const toggles: { key: Toggle; en: string; am: string; hintEn: string; hintAm: string }[] = [
    {
      key: 'event_reminders', en: 'Event reminders', am: 'የመርሐ ግብር ማስታወሻ',
      hintEn: 'The day before a program marked “Show on the public website”, everyone connected to the bot gets a reminder. People who signed up for a program get their ticket again instead.',
      hintAm: '«በሕዝብ ድረ-ገጽ ላይ አሳይ» ከተባለ መርሐ ግብር አንድ ቀን በፊት ቦቱን ያገናኙ ሁሉ ማስታወሻ ይደርሳቸዋል። ለመርሐ ግብሩ የተመዘገቡት ደግሞ ትኬታቸውን ይቀበላሉ።',
    },
    {
      key: 'roster_reminders', en: 'Choir roster reminders', am: 'የመዘምራን ምደባ ማስታወሻ',
      hintEn: 'The day before a service with a published roster, each member on it is reminded (and asked to confirm if they have not).',
      hintAm: 'ምደባው ከታተመ አገልግሎት አንድ ቀን በፊት የተመደቡ አባላት ይታወሳሉ (ያላረጋገጡ እንዲያረጋግጡ ይጠየቃሉ)።',
    },
    {
      key: 'vestment_reminders', en: 'Vestment reminders', am: 'የክብር ልብስ ማስታወሻ',
      hintEn: 'Vestments past their return day: the holder is reminded, and again every week while it is still out.',
      hintAm: 'የመመለሻ ቀናቸው ያለፈ የክብር ልብሶች፦ የያዙት ይታወሳሉ፤ እስኪመለስ በየሳምንቱ።',
    },
    {
      key: 'library_reminders', en: 'Library book reminders', am: 'የመጻሕፍት መመለሻ ማስታወሻ',
      hintEn: 'Books taken home: the borrower (and a student’s parents) is reminded the day before the return day, then every week while it is late.',
      hintAm: 'ወደ ቤት የተወሰዱ መጻሕፍት፦ ተዋሹ (የተማሪ ወላጆችም) ከመመለሻው ቀን አንድ ቀን በፊት፣ ከዚያም እስኪመለስ በየሳምንቱ ይታወሳሉ።',
    },
    {
      key: 'overdue_tasks', en: 'Overdue task alerts', am: 'ጊዜው ያለፈ ተግባር ማሳወቂያ',
      hintEn: 'The day after a task’s due date, its department’s heads are told it is still open.',
      hintAm: 'የተግባር የማብቂያ ቀን ባለፈ ማግስት የክፍሉ ኃላፊዎች ተግባሩ እንዳልተጠናቀቀ ይነገራቸዋል።',
    },
    {
      key: 'dues_reminders', en: 'Monthly dues reminders', am: 'የወርሃዊ መዋጮ ማስታወሻ',
      hintEn: 'Once a month, members connected to the bot who owe dues get a reminder with the unpaid months and the total.',
      hintAm: 'በወር አንድ ጊዜ መዋጮ ያለባቸው፣ ቦቱን ያገናኙ አባላት ያልተከፈሉ ወራትና ድምሩ ያለበት ማስታወሻ ይደርሳቸዋል።',
    },
    {
      key: 'feast_reminders', en: 'Feast and fast reminders', am: 'የበዓልና የጾም ማስታወሻ',
      hintEn: 'The day before a great feast (Meskel, Genna, Timket, Fasika…) or the start of a fast (Nineveh, Lent, Filseta…), everyone connected to the bot gets a message.',
      hintAm: 'ከዐቢይ በዓል (መስቀል፣ ገና፣ ጥምቀት፣ ፋሲካ…) ወይም ከጾም መጀመሪያ (ነነዌ፣ ዐቢይ ጾም፣ ፍልሰታ…) አንድ ቀን በፊት ቦቱን ያገናኙ ሁሉ መልእክት ይደርሳቸዋል።',
    },
    {
      key: 'depreciation', en: 'Monthly depreciation', am: 'ወርሃዊ የእርጅና ቅናሽ',
      hintEn: 'When a month has ended, its depreciation of fixed assets is posted to the books (Finance → Accounting → Fixed assets), and the finance approvers are told. Nothing is posted if a later month is already in the books.',
      hintAm: 'አንድ ወር ሲያልቅ የቋሚ ንብረቶች የእርጅና ቅናሽ በመዝገቡ ይመዘገባል (ፋይናንስ → የሂሳብ አያያዝ → ቋሚ ንብረቶች)፤ የፋይናንስ አጽዳቂዎችም ይነገራቸዋል። የኋለኛው ወር ቀድሞ ከተመዘገበ ምንም አይመዘገብም።',
    },
  ];

  const last = page?.last_run;
  const ran = last ? new Date(last.at) : null;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Automation', 'አውቶሜሽን')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Reminders and repeating tasks that the site sends by itself once a day.',
              'ድረ-ገጹ በቀን አንድ ጊዜ በራሱ የሚልካቸው ማስታወሻዎችና ተደጋጋሚ ተግባራት።'
            )}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={runNow} disabled={mode !== 'live' || busy !== ''} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Play size={14} /> {busy === 'run' ? t('Running…', 'በመሥራት ላይ…') : t('Run now', 'አሁን አሂድ')}
          </button>
          <button onClick={save} disabled={mode === 'loading' || mode === 'error' || busy !== ''} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> {busy === 'save' ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}
          </button>
        </div>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {page && (
        <div className="card p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">{t('Daily timer', 'የዕለት ሰዓት ቆጣሪ')}</h2>
          <ul className="space-y-1.5 text-sm">
            <Check ok={page.timer_ready} text={page.timer_ready ? t('CRON_SECRET is set on the server', 'CRON_SECRET በሰርቨሩ ላይ ገብቷል') : t('CRON_SECRET is not set on the server — the daily run cannot start', 'CRON_SECRET በሰርቨሩ ላይ አልገባም — የዕለቱ ሩጫ መጀመር አይችልም')} />
            <Check ok={page.telegram} text={page.telegram ? t('Telegram bot set up', 'የቴሌግራም ቦት ተዘጋጅቷል') : t('Telegram bot not set up — reminders cannot be sent', 'የቴሌግራም ቦት አልተዘጋጀም — ማስታወሻዎች መላክ አይችሉም')} />
            <Check ok={page.push} text={page.push ? t('Phone notifications set up', 'የስልክ ማሳወቂያዎች ተዘጋጅተዋል') : t('Phone notifications not set up (Telegram still works)', 'የስልክ ማሳወቂያዎች አልተዘጋጁም (ቴሌግራም ግን ይሠራል)')} />
          </ul>
          <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-semibold text-slate-700">{t('How to set it up (once):', 'እንዴት እንደሚዘጋጅ (አንድ ጊዜ)፦')}</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t('On Render → the site → Environment, add CRON_SECRET: a long random text (at least 16 letters/numbers). Save and deploy.', 'በRender → ድረ-ገጹ → Environment ላይ CRON_SECRET ያክሉ፦ ረጅም የዘፈቀደ ጽሑፍ (ቢያንስ 16 ፊደል/ቁጥር)። Save አድርገው deploy ያድርጉ።')}</li>
              <li>{t('At cron-job.org (free), create a job that calls this address every day at 06:00 (Africa/Addis_Ababa):', 'በcron-job.org (ነጻ) ላይ ይህን አድራሻ በየቀኑ 06:00 (Africa/Addis_Ababa) የሚጠራ ሥራ ይፍጠሩ፦')}</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate bg-white border border-slate-200 rounded px-2 py-1 font-mono text-[11px]">{page.cron_url}?key=CRON_SECRET</code>
              <button type="button" onClick={() => copy(`${page.cron_url}?key=`)} className="btn btn-secondary text-[11px] inline-flex items-center gap-1 shrink-0">
                <Copy size={12} /> {t('Copy', 'ቅዳ')}
              </button>
            </div>
            <p>{t('Replace CRON_SECRET in the address with the value you saved. Running twice in a day is harmless — nothing is sent twice.', 'በአድራሻው ውስጥ CRON_SECRET የሚለውን ባስቀመጡት እሴት ይተኩ። በቀን ሁለት ጊዜ ቢሠራ ችግር የለውም — ምንም ሁለት ጊዜ አይላክም።')}</p>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-slate-800 text-sm">{t('What runs every day', 'በየቀኑ የሚሠሩት')}</h2>
        <div className="flex items-start gap-3 text-sm">
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-slate-800">{t('Repeating tasks', 'ተደጋጋሚ ተግባራት')}</div>
            <div className="text-xs text-slate-500">{t('The next task of each repeating series is given on its day, even if nobody signs in. Always on.', 'የእያንዳንዱ ተደጋጋሚ ተግባር ቀጣዩ በቀኑ ይሰጣል — ማንም ባይገባም። ሁልጊዜ ይሠራል።')}</div>
          </div>
        </div>
        {toggles.map((x) => (
          <label key={x.key} className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings[x.key]}
              onChange={(e) => setSettings((s) => ({ ...s, [x.key]: e.target.checked }))}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-semibold text-slate-800">{t(x.en, x.am)}</div>
              <div className="text-xs text-slate-500">{t(x.hintEn, x.hintAm)}</div>
              {x.key === 'dues_reminders' && settings.dues_reminders && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  {t('From day', 'ከወሩ')}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.dues_day}
                    onChange={(e) => setSettings((s) => ({ ...s, dues_day: Number(e.target.value) }))}
                    className="form-input text-xs w-20"
                  />
                  {t('of each Ethiopian month (one reminder a month)', 'ቀን ጀምሮ (በወር አንድ ማስታወሻ)')}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-slate-800 text-sm inline-flex items-center gap-2">
          <Clock size={16} /> {t('Last run', 'የመጨረሻው ሩጫ')}
        </h2>
        {!last || !ran ? (
          <p className="text-sm text-slate-500">{t('It has not run yet.', 'ገና አልተሠራም።')}</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {formatEthiopianDate(last.at.slice(0, 10), locale)} · {ran.toLocaleTimeString(locale === 'am' ? 'am-ET' : 'en-GB', { hour: '2-digit', minute: '2-digit' })} ·{' '}
              {last.trigger === 'timer' ? t('daily timer', 'የዕለት ቆጣሪ') : t('run by hand', 'በእጅ የተሠራ')}
            </p>
            <ul className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
              {last.results.map((r) => (
                <li key={r.job} className="flex items-center justify-between gap-3 py-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    {r.error ? <AlertCircle size={15} className="text-red-600 shrink-0" /> : <CheckCircle2 size={15} className={r.note ? 'text-slate-300 shrink-0' : 'text-emerald-600 shrink-0'} />}
                    <span className="truncate">{t(...JOB_LABELS[r.job])}</span>
                  </span>
                  <span className={`text-xs text-right ${r.error ? 'text-red-700' : 'text-slate-500'}`}>{r.note ?? r.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" /> : <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />}
      <span className="text-slate-700">{text}</span>
    </li>
  );
}
