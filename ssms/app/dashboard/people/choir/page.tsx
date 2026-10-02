'use client';

import React, { useState } from 'react';
import { AlertCircle, Download, Music, Phone, Search, UserPlus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { runChoir, useChoir } from '@/lib/choir/client';
import { INSTRUMENTS, VOICE_PARTS, type ChoirMember, type VoicePart } from '@/lib/choir/types';
import { saveChoirMember, type ChoirMemberInput } from '@/app/dashboard/sacred-arts/actions';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

const EMPTY: ChoirMemberInput = { person_id: '', voice_part: 'NOT_SET', instruments: [], vestment_id: '', joined_on: '', status: 'ACTIVE', notes: '' };

export default function ChoirMembersPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const choir = useChoir();
  const canManage = can('CHOIR_MANAGE');
  const pair = (p: [string, string]) => t(p[0], p[1]);

  const [search, setSearch] = useState('');
  const [voice, setVoice] = useState<'ALL' | VoicePart>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ChoirMember | 'new' | null>(null);
  const [form, setForm] = useState<ChoirMemberInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const active = choir.members.filter((m) => m.status === 'ACTIVE');
  const needle = search.toLowerCase();
  const rows = choir.members
    .filter((m) => showInactive || m.status === 'ACTIVE')
    .filter((m) => voice === 'ALL' || m.voice_part === voice)
    .filter((m) => (locale === 'am' ? m.name_am : m.name).toLowerCase().includes(needle) || m.vestment.toLowerCase().includes(needle));
  const rate = (m: ChoirMember) => (m.sessions ? Math.round((m.attended / m.sessions) * 100) : null);

  const open = (m: ChoirMember | 'new') => {
    setError('');
    setEditing(m);
    setForm(
      m === 'new'
        ? { ...EMPTY, joined_on: todayIso() }
        : { person_id: m.person_id, voice_part: m.voice_part, instruments: m.instruments, vestment_id: m.vestment_id ?? '', joined_on: m.joined_on ?? '', status: m.status, notes: m.notes }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runChoir(() => saveChoirMember(editing === 'new' ? null : (editing as ChoirMember).id, form));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    setToast({ kind: 'success', text: editing === 'new' ? t('Added to the choir', 'ወደ መዘምራን ተጨምሯል') : t('Saved', 'ተቀምጧል') });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleInstrument = (code: string) =>
    setForm((f) => ({ ...f, instruments: f.instruments.includes(code) ? f.instruments.filter((i) => i !== code) : [...f.instruments, code] }));

  const exportExcel = async () => {
    const header = [t('Name', 'ስም'), t('Voice', 'ድምፅ'), t('Instruments', 'መሣሪያዎች'), t('Vestment', 'አልባሳት'), t('Phone', 'ስልክ'), t('Joined', 'የገባበት'), t('Attendance %', 'ተገኝነት %'), t('Status', 'ሁኔታ')].map(headerCell);
    const body = rows.map((m) => [cell(locale === 'am' ? m.name_am : m.name), pair(VOICE_PARTS[m.voice_part]), m.instruments.map((i) => pair(INSTRUMENTS[i] ?? [i, i])).join(', '), m.vestment, m.phone, m.joined_on ?? '', rate(m), m.status]);
    await downloadXlsx(`choir_${todayIso()}`, [header, ...body], { sheet: 'Choir', widths: [26, 10, 30, 24, 14, 12, 12, 10] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Choir Members', 'የመዘምራን አባላት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Voice parts, instruments, vestments and rehearsal attendance', 'የድምፅ ክፍል፣ መሣሪያዎች፣ አልባሳትና የልምምድ ተገኝነት')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => open('new')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><UserPlus size={14} /> {t('Add to Choir', 'ወደ መዘምራን ጨምር')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={choir.mode} error={choir.error} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card p-5"><div className="text-2xl font-bold text-slate-800">{active.length}</div><div className="text-xs text-slate-500 mt-1">{t('Active members', 'ንቁ አባላት')}</div></div>
        {(['SOPRANO', 'ALTO', 'TENOR', 'BASS'] as VoicePart[]).map((v) => (
          <div key={v} className="card p-5"><div className="text-2xl font-bold text-slate-800">{active.filter((m) => m.voice_part === v).length}</div><div className="text-xs text-slate-500 mt-1">{pair(VOICE_PARTS[v])}</div></div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search name…', 'ስም ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <select value={voice} onChange={(e) => setVoice(e.target.value as typeof voice)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All voices', 'ሁሉም ድምፆች')}</option>
            {(Object.keys(VOICE_PARTS) as VoicePart[]).map((v) => <option key={v} value={v}>{pair(VOICE_PARTS[v])}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('Show inactive', 'የቦዘኑትንም አሳይ')}</label>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Name', 'ስም')}</th>
                <th>{t('Voice', 'ድምፅ')}</th>
                <th>{t('Instruments', 'መሣሪያዎች')}</th>
                <th>{t('Vestment', 'አልባሳት')}</th>
                <th className="text-right">{t('Attendance', 'ተገኝነት')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const r = rate(m);
                return (
                  <tr key={m.id} className={m.status === 'INACTIVE' ? 'opacity-60' : ''}>
                    <td>
                      <div className="font-medium text-slate-900">{locale === 'am' ? m.name_am : m.name}</div>
                      {m.phone && <a href={`tel:${m.phone}`} className="text-[11px] font-mono text-blue-600 inline-flex items-center gap-1"><Phone size={10} />{m.phone}</a>}
                    </td>
                    <td className="text-xs text-slate-700">{pair(VOICE_PARTS[m.voice_part])}</td>
                    <td className="text-xs text-slate-600">{m.instruments.map((i) => (INSTRUMENTS[i] ? (locale === 'am' ? INSTRUMENTS[i][1] : INSTRUMENTS[i][0]) : i)).join(', ') || '—'}</td>
                    <td className="text-xs font-mono text-slate-500">{m.vestment || '—'}</td>
                    <td className={`text-right text-xs tabular-nums ${r !== null && r < 60 ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>{r === null ? '—' : `${r}% (${m.attended}/${m.sessions})`}</td>
                    <td className="text-right">{canManage && <button onClick={() => open(m)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50">{t('Edit', 'አርትዕ')}</button>}</td>
                  </tr>
                );
              })}
              {choir.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-8"><Music size={18} className="inline mr-1" /> {t('No choir members yet.', 'እስካሁን የመዘምራን አባል የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing === 'new' ? t('Add to Choir', 'ወደ መዘምራን ጨምር') : (locale === 'am' ? editing.name_am : editing.name)} maxWidth="xl">
          <form onSubmit={save} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16} /> {error}</div>}
            {editing === 'new' && (
              <Field label={t('Member', 'አባል') + ' *'}>
                <select required value={form.person_id} onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))} className="form-input text-sm">
                  <option value="">{t('— Choose a registered member —', '— የተመዘገበ አባል ይምረጡ —')}</option>
                  {choir.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">{t('Register new people first under People → Members.', 'አዳዲስ ሰዎችን በመጀመሪያ በሰዎች → አባላት ይመዝግቡ።')}</p>
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Voice part', 'የድምፅ ክፍል')}>
                <select value={form.voice_part} onChange={(e) => setForm((f) => ({ ...f, voice_part: e.target.value as VoicePart }))} className="form-input text-sm">
                  {(Object.keys(VOICE_PARTS) as VoicePart[]).map((v) => <option key={v} value={v}>{pair(VOICE_PARTS[v])}</option>)}
                </select>
              </Field>
              <Field label={t('Joined the choir', 'የገባበት ቀን')}>
                <input type="date" max={todayIso()} value={form.joined_on} onChange={(e) => setForm((f) => ({ ...f, joined_on: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Vestment (from the property register)', 'አልባሳት (ከንብረት መዝገብ)')}>
                <select value={form.vestment_id} onChange={(e) => setForm((f) => ({ ...f, vestment_id: e.target.value }))} className="form-input text-sm">
                  <option value="">—</option>
                  {choir.vestments.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </Field>
              <Field label={t('Status', 'ሁኔታ')}>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))} className="form-input text-sm">
                  <option value="ACTIVE">{t('Active', 'ንቁ')}</option>
                  <option value="INACTIVE">{t('Inactive (left / resting)', 'የቦዘነ')}</option>
                </select>
              </Field>
            </div>
            <Field label={t('Instruments played', 'የሚጫወታቸው መሣሪያዎች')}>
              <div className="flex flex-wrap gap-2">
                {Object.entries(INSTRUMENTS).map(([code, label]) => (
                  <label key={code} className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${form.instruments.includes(code) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                    <input type="checkbox" className="sr-only" checked={form.instruments.includes(code)} onChange={() => toggleInstrument(code)} />
                    {locale === 'am' ? label[1] : label[0]}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={t('Notes', 'ማስታወሻ')}>
              <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="form-input text-sm" />
            </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
