'use client';

// Fixed assets register and monthly depreciation (migration 047). The assets
// themselves are kept under Property; here Finance gives each one its cost,
// useful life and accounts, and posts the depreciation month by month.
// Server work: ./actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, Pencil, RotateCcw } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { ExportButton } from '@/components/ui/ExportButton';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ErrorBox, Field, GlNav } from '@/components/finance/GlShared';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { accountName, fmtAmount, type GlAccount } from '@/lib/finance/gl';
import { assetCategoryLabel } from '@/lib/property/types';
import { bookValue, lastEndedMonth, monthLabel, nextMonth, type DepreciationLine, type FixedAsset, type FixedAssetsData } from '@/lib/finance/assets';
import { loadFixedAssets, postDepreciation, previewDepreciation, saveAssetSetup, undoDepreciation } from './actions';

type Filter = 'ALL' | 'DEPRECIATING' | 'NOT_SET';
type Toast = { kind: 'success' | 'error'; text: string } | null;

export default function FixedAssetsPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<FixedAssetsData | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const reload = useCallback(() => {
    loadFixedAssets().then((res) => {
      if (res.mode === 'live') setData(res.data);
      if (res.mode === 'error') setError(res.error);
      setMode(res.mode);
    });
  }, []);
  useEffect(reload, [reload]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const accountById = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const assetAccount = (a: FixedAsset) => accountById.get(a.gl_account_id ?? data?.categoryAccount[a.category] ?? data?.defaultAccount ?? '');

  const assets = data?.assets ?? [];
  const depreciating = assets.filter((a) => a.useful_life_months !== null);
  const inBooks = assets.filter((a) => a.entry_no && !a.disposal_no);
  const totals = {
    cost: inBooks.reduce((s, a) => s + (a.cost ?? 0), 0),
    accumulated: inBooks.reduce((s, a) => s + a.accumulated, 0),
  };
  const shown = assets.filter((a) => (filter === 'ALL' ? true : filter === 'DEPRECIATING' ? a.useful_life_months !== null : a.useful_life_months === null));

  const doExport = (format: ExportFormat) =>
    exportTable(
      'fixed-assets-register',
      [t('Tag', 'መለያ'), t('Asset', 'ንብረት'), t('Category', 'ዓይነት'), t('Account', 'ሂሳብ'), t('Acquired', 'የተገኘበት'), t('Cost', 'ዋጋ'), t('Salvage', 'ቀሪ ዋጋ'), t('Life (months)', 'የአገልግሎት ዘመን (ወር)'), t('Accumulated depreciation', 'የተጠራቀመ ቅናሽ'), t('Book value', 'የመዝገብ ዋጋ'), t('Status', 'ሁኔታ')],
      assets.map((a) => {
        const acc = assetAccount(a);
        return [
          a.tag, locale === 'am' ? a.name_am : a.name_en, assetCategoryLabel(a.category, locale), acc ? `${acc.code} ${accountName(acc, locale)}` : '',
          a.acquired_on ?? '', a.cost, a.useful_life_months !== null ? a.salvage_value : null, a.useful_life_months, a.accumulated, bookValue(a),
          a.disposal_no ? t('Disposed', 'ተወግዷል') : a.entry_no ? t('In the books', 'በመዝገብ') : t('Not in the books', 'ያልተመዘገበ'),
        ];
      }),
      format,
      { sheet: 'Fixed assets', widths: [14, 30, 20, 28, 12, 12, 10, 10, 14, 14, 14] }
    );

  return (
    <div className="space-y-5">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Accounting', 'የሂሳብ አያያዝ')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Fixed assets in the books and their monthly depreciation (straight-line)', 'በመዝገብ ያሉ ቋሚ ንብረቶችና ወርሃዊ የእርጅና ቅናሻቸው (በእኩል መጠን)')}
        </p>
      </div>
      <GlNav />
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={t('Cost in the books', 'በመዝገብ ያለ ዋጋ')} value={fmtAmount(totals.cost)} />
            <Stat label={t('Accumulated depreciation', 'የተጠራቀመ የእርጅና ቅናሽ')} value={fmtAmount(totals.accumulated)} />
            <Stat label={t('Book value', 'የመዝገብ ዋጋ')} value={fmtAmount(totals.cost - totals.accumulated)} />
            <Stat label={t('Assets depreciating', 'ቅናሽ የሚሰላላቸው')} value={`${depreciating.length} / ${assets.length}`} />
          </div>

          <DepreciationCard data={data} say={say} onPosted={reload} />

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <div className="font-bold text-slate-900">{t('Fixed assets register', 'የቋሚ ንብረቶች መዝገብ')}</div>
                <div className="text-[11px] text-slate-500">
                  {t('The assets are added under ', 'ንብረቶቹ የሚጨመሩት በ')}
                  <Link href="/dashboard/property/assets" className="font-semibold text-blue-600 hover:underline">{t('Property → Assets', 'ንብረት → ንብረቶች')}</Link>
                  {t('. A disposed or lost asset leaves the books by itself.', ' ስር ነው። የተወገደ ወይም የጠፋ ንብረት በራሱ ከመዝገቡ ይወጣል።')}
                </div>
              </div>
              {(
                [
                  ['ALL', `${t('All', 'ሁሉም')} (${assets.length})`],
                  ['DEPRECIATING', `${t('Depreciating', 'ቅናሽ የሚሰላላቸው')} (${depreciating.length})`],
                  ['NOT_SET', `${t('Not set up', 'ያልተዘጋጁ')} (${assets.length - depreciating.length})`],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
              <ExportButton onExport={doExport} disabled={assets.length === 0} />
            </div>
            {shown.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">{t('No assets here.', 'እዚህ ንብረት የለም።')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="px-4 py-2 font-semibold">{t('Asset', 'ንብረት')}</th>
                      <th className="px-2 py-2 font-semibold">{t('Account', 'ሂሳብ')}</th>
                      <th className="px-2 py-2 font-semibold text-right">{t('Cost', 'ዋጋ')}</th>
                      <th className="px-2 py-2 font-semibold text-center">{t('Life', 'ዘመን')}</th>
                      <th className="px-2 py-2 font-semibold text-right">{t('Depreciated', 'የተቀነሰ')}</th>
                      <th className="px-2 py-2 font-semibold text-right">{t('Book value', 'የመዝገብ ዋጋ')}</th>
                      <th className="px-2 py-2 font-semibold">{t('In the books', 'በመዝገብ')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {shown.map((a) => {
                      const acc = assetAccount(a);
                      const bv = bookValue(a);
                      return (
                        <tr key={a.id} className={a.disposal_no ? 'opacity-60' : ''}>
                          <td className="px-4 py-2">
                            <div className="font-semibold text-slate-900">{locale === 'am' ? a.name_am : a.name_en}</div>
                            <div className="text-slate-400"><span className="font-mono">{a.tag}</span> · {assetCategoryLabel(a.category, locale)}{a.acquired_on ? ` · ${formatEthiopianDate(a.acquired_on, locale)}` : ''}</div>
                          </td>
                          <td className="px-2 py-2 text-slate-600">{acc ? <><span className="font-mono">{acc.code}</span> {accountName(acc, locale)}</> : '—'}</td>
                          <td className="px-2 py-2 text-right font-mono">{a.cost === null ? '—' : fmtAmount(a.cost)}</td>
                          <td className="px-2 py-2 text-center">{a.useful_life_months ? lifeText(a.useful_life_months, t) : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2 py-2 text-right font-mono">{a.accumulated ? fmtAmount(a.accumulated) : ''}</td>
                          <td className="px-2 py-2 text-right font-mono font-semibold">{bv === null ? '' : fmtAmount(bv)}</td>
                          <td className="px-2 py-2">
                            {a.disposal_no ? (
                              <span className="badge">{t('Disposed', 'ተወግዷል')} · {a.disposal_no}</span>
                            ) : a.entry_no ? (
                              <span className="badge badge-success">{a.entry_no}</span>
                            ) : (
                              <span className="text-slate-400">{t('No', 'አይደለም')}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {data.canManage && (
                              <button onClick={() => setEditing(a)} className="btn btn-secondary text-[11px] px-2 py-1 inline-flex items-center gap-1">
                                <Pencil size={12} /> {a.useful_life_months !== null || a.entry_no ? t('Edit', 'አርትዕ') : t('Set up', 'አዘጋጅ')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {editing && data && (
        <SetupModal
          asset={editing}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            say('success', t('Saved — the asset’s entries are up to date', 'ተቀምጧል — የንብረቱ ምዝገባዎች ተስተካክለዋል'));
            reload();
          }}
        />
      )}
    </div>
  );
}

function lifeText(months: number, t: (en: string, am: string) => string): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return t(`${y} y ${m} m`, `${y} ዓ ${m} ወ`);
  if (y) return t(`${y} years`, `${y} ዓመት`);
  return t(`${m} months`, `${m} ወር`);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 font-mono">{value}</div>
    </div>
  );
}

function DepreciationCard({ data, say, onPosted }: { data: FixedAssetsData; say: (k: 'success' | 'error', text: string) => void; onPosted: () => void }) {
  const { t } = useLang();
  const ended = lastEndedMonth(todayIso());
  const latest = data.runs[0]?.month ?? null;
  // The next month to post: after the latest one, up to the last month that has ended
  const suggested = latest ? (nextMonth(latest) <= ended ? nextMonth(latest) : latest) : ended;
  const [month, setMonth] = useState(suggested);
  const [lines, setLines] = useState<DepreciationLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const preview = async (m = month) => {
    setBusy(true);
    setErr('');
    const res = await previewDepreciation(m);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setLines(res.lines);
  };
  const post = async () => {
    const already = data.runs.some((r) => r.month === month);
    if (!window.confirm(already
      ? t(`Post the depreciation of ${monthLabel(month)} again with the current asset details?`, `የ${monthLabel(month)} የእርጅና ቅናሽ በአሁኑ የንብረት መረጃ እንደገና ይመዝገብ?`)
      : t(`Post the depreciation of ${monthLabel(month)}?`, `የ${monthLabel(month)} የእርጅና ቅናሽ ይመዝገብ?`))) return;
    setBusy(true);
    setErr('');
    const res = await postDepreciation(month);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setLines(null);
    say('success', res.total > 0 ? t(`Posted: ${fmtAmount(res.total)} for ${monthLabel(month)}`, `ተመዝግቧል፦ ${fmtAmount(res.total)} ለ${monthLabel(month)}`) : t('Nothing to depreciate for this month', 'ለዚህ ወር የሚቀነስ የለም'));
    onPosted();
  };
  const undo = async (m: string) => {
    if (!window.confirm(t(`Remove the depreciation entry of ${monthLabel(m)}? You can post it again after correcting the assets.`, `የ${monthLabel(m)} የእርጅና ቅናሽ ምዝገባ ይነሣ? ንብረቶቹን ካስተካከሉ በኋላ እንደገና መመዝገብ ይችላሉ።`))) return;
    setBusy(true);
    const res = await undoDepreciation(m);
    setBusy(false);
    if (!res.ok) return say('error', res.error);
    say('success', t('Removed', 'ተነሥቷል'));
    onPosted();
  };

  const total = (lines ?? []).reduce((s, l) => s + l.amount, 0);
  const month7 = month.slice(0, 7);
  return (
    <div className="card p-4 space-y-4">
      <div>
        <div className="font-bold text-slate-900 inline-flex items-center gap-2"><Calculator size={16} /> {t('Monthly depreciation', 'ወርሃዊ የእርጅና ቅናሽ')}</div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {t(
            'One entry per month: Depreciation expense / Accumulated depreciation, one line pair per asset. Months go in order; a month that was skipped is caught up in the next one. Administration → Automation can post each month by itself.',
            'በወር አንድ ምዝገባ፦ የእርጅና ቅናሽ ወጪ / የተጠራቀመ ቅናሽ፣ ለእያንዳንዱ ንብረት ጥንድ መስመር። ወሮቹ በቅደም ተከተል ይመዘገባሉ፤ የተዘለለ ወር በሚቀጥለው ይካካሳል። በ«አስተዳደር → አውቶሜሽን» በየወሩ በራሱ እንዲመዘገብ ማድረግ ይቻላል።'
          )}
        </p>
      </div>
      {err && <ErrorBox text={err} />}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('Month', 'ወር')}>
          <input
            type="month"
            value={month7}
            max={ended.slice(0, 7)}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(`${e.target.value}-01`);
              setLines(null);
            }}
            className="form-input text-sm"
          />
        </Field>
        <button onClick={() => preview()} disabled={busy} className="btn btn-secondary text-xs disabled:opacity-60">{t('Preview', 'ቅድመ ዕይታ')}</button>
        {data.canManage && (
          <button onClick={post} disabled={busy || month > ended} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Working…', 'በሂደት ላይ…') : t('Post depreciation', 'የእርጅና ቅናሽ መዝግብ')}
          </button>
        )}
      </div>

      {lines && (
        lines.length === 0 ? (
          <p className="text-sm text-slate-500">{t('Nothing to depreciate for this month.', 'ለዚህ ወር የሚቀነስ የለም።')}</p>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-2 font-semibold">{t('Asset', 'ንብረት')}</th>
                  <th className="px-2 py-2 font-semibold text-right">{t('Cost − salvage', 'ዋጋ − ቀሪ ዋጋ')}</th>
                  <th className="px-2 py-2 font-semibold text-center">{t('Month', 'ወር')}</th>
                  <th className="px-2 py-2 font-semibold text-right">{t('Before', 'ከዚህ በፊት')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('This month', 'የዚህ ወር')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map((l) => (
                  <tr key={l.asset_id}>
                    <td className="px-3 py-1.5"><span className="font-mono text-slate-500">{l.tag}</span> {l.name_en}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtAmount(l.cost - l.salvage)}</td>
                    <td className="px-2 py-1.5 text-center">{l.months} / {l.life}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtAmount(l.booked, true)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtAmount(l.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="px-3 py-1.5" colSpan={4}>{t('Total', 'ድምር')}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtAmount(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}

      {data.runs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">{t('Posted months', 'የተመዘገቡ ወሮች')}</div>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {data.runs.slice(0, 12).map((r, i) => (
              <div key={r.month} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-800 w-32">{monthLabel(r.month)}</span>
                <Link href={`/dashboard/finance/accounting/journal?source=DEPRECIATION&from=${r.month}&to=${r.entry_date}`} className="font-mono text-blue-600 hover:underline">{r.entry_no}</Link>
                <span className="ml-auto font-mono">{fmtAmount(r.total)}</span>
                {data.canManage && i === 0 && (!data.lockDate || r.entry_date > data.lockDate) && (
                  <button onClick={() => undo(r.month)} disabled={busy} title={t('Remove this month', 'ይህን ወር አንሣ')} className="text-slate-400 hover:text-red-600 disabled:opacity-50">
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SetupModal({ asset, data, onClose, onSaved }: { asset: FixedAsset; data: FixedAssetsData; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useLang();
  const firstTime = asset.useful_life_months === null && !asset.entry_no;
  const [cost, setCost] = useState(asset.cost === null ? '' : String(asset.cost));
  const [depreciate, setDepreciate] = useState(firstTime || asset.useful_life_months !== null);
  const [years, setYears] = useState(asset.useful_life_months ? String(Math.floor(asset.useful_life_months / 12)) : '5');
  const [months, setMonths] = useState(asset.useful_life_months ? String(asset.useful_life_months % 12) : '0');
  const [salvage, setSalvage] = useState(String(asset.salvage_value || 0));
  const [start, setStart] = useState(asset.depreciation_start ?? '');
  const [account, setAccount] = useState(asset.gl_account_id ?? '');
  const suggestedAgainst = asset.acquisition_type === 'DONATION' ? data.suggestions.donations : data.suggestions.opening;
  const [against, setAgainst] = useState(firstTime ? suggestedAgainst ?? '' : asset.booked_against_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const fixed = data.accounts.filter((a) => a.type === 'ASSET' && a.sub_type === 'FIXED_ASSET' && a.normal_balance === 'DEBIT');
  const ruleAccount = data.accounts.find((a) => a.id === (data.categoryAccount[asset.category] ?? data.defaultAccount));
  const groups: [string, GlAccount[]][] = [
    [t('Net assets (owned before the books started)', 'የተጣራ ሀብት (መዝገቡ ከመጀመሩ በፊት የነበረ)'), data.accounts.filter((a) => a.type === 'EQUITY')],
    [t('Income (a donated asset)', 'ገቢ (በስጦታ የተገኘ ንብረት)'), data.accounts.filter((a) => a.type === 'INCOME')],
    [t('Expense (bought and recorded as an expense — moves it out of that expense)', 'ወጪ (ተገዝቶ እንደ ወጪ የተመዘገበ — ከዚያ ወጪ ያወጣዋል)'), data.accounts.filter((a) => a.type === 'EXPENSE')],
    [t('Liability (bought on credit)', 'ዕዳ (በዱቤ የተገዛ)'), data.accounts.filter((a) => a.type === 'LIABILITY')],
  ];
  const lifeMonths = (Number(years) || 0) * 12 + (Number(months) || 0);
  const monthly = depreciate && lifeMonths > 0 && Number(cost) > Number(salvage) ? (Number(cost) - Number(salvage)) / lifeMonths : 0;

  const save = async () => {
    setBusy(true);
    setErr('');
    const res = await saveAssetSetup(asset.id, {
      cost: cost || '0',
      depreciate,
      life_months: depreciate ? lifeMonths : 1,
      salvage: salvage || '0',
      start,
      gl_account_id: account,
      booked_against_id: against,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${asset.tag} · ${locale === 'am' ? asset.name_am : asset.name_en}`}
      subtitle={t('Cost, depreciation and accounts', 'ዋጋ፣ የእርጅና ቅናሽና ሂሳቦች')}
      maxWidth="lg"
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={save} disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && <ErrorBox text={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Cost (Birr)', 'ዋጋ (ብር)')}>
            <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Fixed-asset account', 'የቋሚ ንብረት ሂሳብ')}>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="form-input text-sm">
              <option value="">— {t('By category', 'በዓይነቱ')}{ruleAccount ? `: ${ruleAccount.code} ${accountName(ruleAccount, locale)}` : ''} —</option>
              {fixed.map((a) => <option key={a.id} value={a.id}>{a.code} · {accountName(a, locale)}</option>)}
            </select>
          </Field>
        </div>

        <Field label={t('Put the cost in the books against', 'ዋጋውን በመዝገቡ ውስጥ የሚያስገባው ተቃራኒ ሂሳብ')}>
          <select value={against} onChange={(e) => setAgainst(e.target.value)} className="form-input text-sm">
            <option value="">— {t('Nothing: it is already in the books (or not needed)', 'ምንም፦ ቀድሞ በመዝገቡ አለ (ወይም አያስፈልግም)')} —</option>
            {groups.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((a) => <option key={a.id} value={a.id}>{a.code} · {accountName(a, locale)}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            {t(
              'Writes one entry: the fixed-asset account is debited with the cost, this account credited. Choose “Nothing” if the purchase was already recorded to a fixed-asset account.',
              'አንድ ምዝገባ ይጽፋል፦ የቋሚ ንብረት ሂሳቡ በዋጋው ዴቢት፣ ይህ ሂሳብ ክሬዲት ይደረጋል። ግዢው ቀድሞ ወደ ቋሚ ንብረት ሂሳብ ከተመዘገበ «ምንም» ይምረጡ።'
            )}
          </p>
        </Field>

        <label className="flex items-center gap-2 font-semibold text-slate-800">
          <input type="checkbox" checked={depreciate} onChange={(e) => setDepreciate(e.target.checked)} className="h-4 w-4" />
          {t('Depreciate this asset', 'ይህ ንብረት የእርጅና ቅናሽ ይሰላለት')}
        </label>
        {depreciate && (
          <div className="grid gap-3 sm:grid-cols-3 rounded-lg bg-slate-50 p-3">
            <Field label={t('Useful life', 'የአገልግሎት ዘመን')}>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={years} onChange={(e) => setYears(e.target.value)} className="form-input text-sm w-16" />
                <span className="text-xs text-slate-500">{t('y', 'ዓ')}</span>
                <input type="number" min={0} max={11} value={months} onChange={(e) => setMonths(e.target.value)} className="form-input text-sm w-16" />
                <span className="text-xs text-slate-500">{t('m', 'ወ')}</span>
              </div>
            </Field>
            <Field label={t('Salvage value (Birr)', 'ቀሪ ዋጋ (ብር)')}>
              <input type="number" min={0} step="0.01" value={salvage} onChange={(e) => setSalvage(e.target.value)} className="form-input text-sm" />
            </Field>
            <Field label={t('Depreciation starts', 'ቅናሹ የሚጀምረው')}>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="form-input text-sm" />
              {!start && asset.acquired_on && <p className="text-[11px] text-slate-500 mt-1">{t('Empty: from the acquisition date', 'ባዶ ከሆነ፦ ከተገኘበት ቀን')} ({formatEthiopianDate(asset.acquired_on, locale)})</p>}
            </Field>
            <p className="sm:col-span-3 text-xs text-slate-600">
              {monthly > 0
                ? t(`About ${fmtAmount(monthly)} a month, counted from the start month.`, `በወር ወደ ${fmtAmount(monthly)} ገደማ፣ ከመጀመሪያው ወር ጀምሮ።`)
                : t('Enter the cost and a useful life.', 'ዋጋውንና የአገልግሎት ዘመኑን ያስገቡ።')}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
