'use client';

import React, { useState } from 'react';
import { AlertCircle, BookOpen, Download, Plus, Printer, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { runChoir, useChoir } from '@/lib/choir/client';
import { HYMN_CATEGORIES, type Hymn, type HymnCategory } from '@/lib/choir/types';
import { saveHymn, type HymnInput } from '@/app/dashboard/sacred-arts/actions';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const EMPTY: HymnInput = { title_am: '', title_en: '', category: 'MEZMUR', feast: '', lyrics: '', notes: '', is_active: true };

/** Feasts of the church year, offered as suggestions; any text is allowed. */
const FEASTS = ['መስቀል', 'ልደት', 'ጥምቀት', 'ቃና ዘገሊላ', 'ደብረ ዘይት', 'ሆሣዕና', 'ስቅለት', 'ትንሣኤ', 'ዕርገት', 'ጰራቅሊጦስ', 'ደብረ ታቦር', 'ፍልሰታ', 'ቅዱስ ዮሐንስ', 'ኪዳነ ምሕረት'];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function HymnLibraryPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const choir = useChoir();
  const canManage = can('CHOIR_MANAGE');
  const pair = (p: [string, string]) => t(p[0], p[1]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'ALL' | HymnCategory>('ALL');
  const [feast, setFeast] = useState('ALL');
  const [showRetired, setShowRetired] = useState(false);
  const [viewing, setViewing] = useState<Hymn | null>(null);
  const [editing, setEditing] = useState<Hymn | 'new' | null>(null);
  const [form, setForm] = useState<HymnInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const active = choir.hymns.filter((h) => h.is_active);
  const feasts = [...new Set(choir.hymns.map((h) => h.feast).filter(Boolean))].sort();
  const needle = search.trim().toLowerCase();
  const rows = choir.hymns
    .filter((h) => showRetired || h.is_active)
    .filter((h) => category === 'ALL' || h.category === category)
    .filter((h) => feast === 'ALL' || h.feast === feast)
    .filter((h) => !needle || [h.title_am, h.title_en, h.feast, h.lyrics].some((v) => v.toLowerCase().includes(needle)));

  const title = (h: Hymn) => (locale === 'am' ? h.title_am : h.title_en || h.title_am);
  const subtitle = (h: Hymn) => (locale === 'am' ? h.title_en : h.title_en ? h.title_am : '');

  const open = (h: Hymn | 'new') => {
    setError('');
    setViewing(null);
    setEditing(h);
    setForm(h === 'new' ? EMPTY : { title_am: h.title_am, title_en: h.title_en, category: h.category, feast: h.feast, lyrics: h.lyrics, notes: h.notes, is_active: h.is_active });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runChoir(() => saveHymn(editing === 'new' ? null : (editing as Hymn).id, form));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    setToast({ kind: 'success', text: editing === 'new' ? t('Hymn added to the library', 'መዝሙሩ ወደ ማውጫው ገብቷል') : t('Saved', 'ተቀምጧል') });
    setTimeout(() => setToast(null), 3000);
  };

  const printLyrics = (h: Hymn) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const meta = [pair(HYMN_CATEGORIES[h.category]), h.feast].filter(Boolean).join(' · ');
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(h.title_am)}</title>` +
        `<style>body{font-family:'Noto Sans Ethiopic','Nyala','Abyssinica SIL',sans-serif;max-width:640px;margin:40px auto;padding:0 24px;color:#111}` +
        `h1{font-size:24px;margin:0}h2{font-size:15px;font-weight:normal;color:#555;margin:4px 0 0}p.meta{font-size:12px;color:#777;margin:6px 0 24px}` +
        `pre{font:inherit;font-size:17px;line-height:1.9;white-space:pre-wrap}</style></head><body>` +
        `<h1>${escapeHtml(h.title_am)}</h1>${h.title_en ? `<h2>${escapeHtml(h.title_en)}</h2>` : ''}<p class="meta">${escapeHtml(meta)}</p>` +
        `<pre>${escapeHtml(h.lyrics || '—')}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const exportExcel = async () => {
    const header = [t('Title (Amharic)', 'ርዕስ (አማርኛ)'), t('Title (English)', 'ርዕስ (እንግሊዝኛ)'), t('Category', 'ዓይነት'), t('Feast', 'በዓል'), t('Times sung', 'የተዘመረበት ብዛት'), t('Last sung', 'መጨረሻ የተዘመረው'), t('Active', 'ንቁ'), t('Lyrics', 'ግጥም')].map(headerCell);
    const body = rows.map((h) => [cell(h.title_am), h.title_en, pair(HYMN_CATEGORIES[h.category]), h.feast, h.times_sung, h.last_sung ?? '', h.is_active ? t('Yes', 'አዎ') : t('No', 'አይ'), h.lyrics]);
    await downloadXlsx(`hymns_${todayIso()}`, [header, ...body], { sheet: 'Hymns', widths: [30, 30, 18, 16, 12, 14, 8, 60] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Hymn Library', 'የመዝሙራት ማውጫ')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Kidase, mezmur, wedase and chants with their lyrics and how often they are sung', 'ቅዳሴ፣ መዝሙር፣ ውዳሴና ዜማዎች ከግጥማቸውና ከተዘመሩበት ብዛት ጋር')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => open('new')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Plus size={14} /> {t('Add Hymn', 'መዝሙር ጨምር')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={choir.mode} error={choir.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={active.length} label={t('Hymns in use', 'በአገልግሎት ላይ ያሉ')} />
        <Kpi value={active.filter((h) => h.category === 'KIDASE').length} label={pair(HYMN_CATEGORIES.KIDASE)} />
        <Kpi value={active.filter((h) => h.category === 'MEZMUR').length} label={pair(HYMN_CATEGORIES.MEZMUR)} />
        <Kpi value={active.filter((h) => h.times_sung === 0).length} label={t('Not sung yet', 'ገና ያልተዘመሩ')} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search title, feast or words…', 'ርዕስ፣ በዓል ወይም ቃል ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All categories', 'ሁሉም ዓይነት')}</option>
            {(Object.keys(HYMN_CATEGORIES) as HymnCategory[]).map((c) => <option key={c} value={c}>{pair(HYMN_CATEGORIES[c])}</option>)}
          </select>
          <select value={feast} onChange={(e) => setFeast(e.target.value)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All feasts', 'ሁሉም በዓላት')}</option>
            {feasts.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> {t('Show retired', 'ከአገልግሎት የወጡትንም አሳይ')}</label>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Hymn', 'መዝሙር')}</th>
                <th>{t('Category', 'ዓይነት')}</th>
                <th>{t('Feast', 'በዓል')}</th>
                <th className="text-right">{t('Sung', 'የተዘመረ')}</th>
                <th>{t('Last sung', 'መጨረሻ የተዘመረው')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className={h.is_active ? '' : 'opacity-60'}>
                  <td>
                    <button onClick={() => setViewing(h)} className="text-left">
                      <div className="font-medium text-slate-900 hover:text-blue-700">{title(h)}</div>
                      {subtitle(h) && <div className="text-[11px] text-slate-400">{subtitle(h)}</div>}
                    </button>
                  </td>
                  <td className="text-xs text-slate-700">{pair(HYMN_CATEGORIES[h.category])}</td>
                  <td className="text-xs text-slate-600">{h.feast || '—'}</td>
                  <td className="text-right text-xs tabular-nums text-slate-700">{h.times_sung}</td>
                  <td className="text-xs text-slate-600">{h.last_sung ? formatEthiopianDate(h.last_sung, locale) : '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => setViewing(h)} className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-2 py-1 rounded hover:bg-slate-50">{t('Lyrics', 'ግጥም')}</button>
                    {canManage && <button onClick={() => open(h)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50">{t('Edit', 'አርትዕ')}</button>}
                  </td>
                </tr>
              ))}
              {choir.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-8"><BookOpen size={18} className="inline mr-1" /> {choir.hymns.length ? t('No hymns match.', 'የሚዛመድ መዝሙር የለም።') : t('The library is empty — add the first hymn.', 'ማውጫው ባዶ ነው — የመጀመሪያውን መዝሙር ይጨምሩ።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && (
        <Modal isOpen onClose={() => setViewing(null)} title={viewing.title_am} subtitle={[viewing.title_en, pair(HYMN_CATEGORIES[viewing.category]), viewing.feast].filter(Boolean).join(' · ')} maxWidth="xl">
          <div className="space-y-4">
            {viewing.lyrics ? (
              <pre className="whitespace-pre-wrap font-sans text-base leading-8 text-slate-800">{viewing.lyrics}</pre>
            ) : (
              <p className="text-sm text-slate-400">{t('No lyrics recorded yet.', 'ግጥሙ ገና አልተመዘገበም።')}</p>
            )}
            {viewing.notes && <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">{viewing.notes}</p>}
            <div className="text-[11px] text-slate-400">
              {t('Sung', 'የተዘመረ')} {viewing.times_sung} {t('times', 'ጊዜ')}{viewing.last_sung && ` · ${t('last on', 'መጨረሻ')} ${formatEthiopianDate(viewing.last_sung, locale)}`}
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              {viewing.lyrics && <button onClick={() => printLyrics(viewing)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Printer size={14} /> {t('Print', 'አትም')}</button>}
              {canManage && <button onClick={() => open(viewing)} className="btn btn-primary text-xs">{t('Edit', 'አርትዕ')}</button>}
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing === 'new' ? t('Add Hymn', 'መዝሙር ጨምር') : editing.title_am} maxWidth="2xl">
          <form onSubmit={save} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16} /> {error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Title in Amharic', 'ርዕስ በአማርኛ') + ' *'}>
                <input type="text" required value={form.title_am} onChange={(e) => setForm((f) => ({ ...f, title_am: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Title in English', 'ርዕስ በእንግሊዝኛ')}>
                <input type="text" value={form.title_en} onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Category', 'ዓይነት')}>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as HymnCategory }))} className="form-input text-sm">
                  {(Object.keys(HYMN_CATEGORIES) as HymnCategory[]).map((c) => <option key={c} value={c}>{pair(HYMN_CATEGORIES[c])}</option>)}
                </select>
              </Field>
              <Field label={t('Feast or season', 'በዓል ወይም ወቅት')}>
                <input type="text" list="hymn-feasts" value={form.feast} onChange={(e) => setForm((f) => ({ ...f, feast: e.target.value }))} className="form-input text-sm" />
                <datalist id="hymn-feasts">
                  {[...new Set([...FEASTS, ...feasts])].map((f) => <option key={f} value={f} />)}
                </datalist>
              </Field>
            </div>
            <Field label={t('Lyrics', 'ግጥም')}>
              <textarea rows={10} value={form.lyrics} onChange={(e) => setForm((f) => ({ ...f, lyrics: e.target.value }))} className="form-input text-sm leading-7" />
            </Field>
            <Field label={t('Notes (tune, who taught it…)', 'ማስታወሻ (ዜማ፣ ያስተማረው…)')}>
              <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="form-input text-sm" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              {t('In use (untick to retire it from new sessions)', 'በአገልግሎት ላይ (ለአዲስ መርሐ ግብር እንዳይመረጥ ምልክቱን ያንሱ)')}
            </label>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="card p-5">
      <div className="text-2xl font-bold tabular-nums text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
