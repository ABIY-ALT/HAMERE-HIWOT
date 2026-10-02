'use client';

import React, { useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, CalendarPlus, ClipboardCheck, Download, MapPin, Music, X } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { runChoir, useChoir } from '@/lib/choir/client';
import { SESSION_KINDS, VOICE_PARTS, type ChoirMember, type ChoirSession, type SessionKind, type SessionStatus } from '@/lib/choir/types';
import { cancelChoirSession, saveChoirAttendance, saveChoirSession, type ChoirSessionInput } from '@/app/dashboard/sacred-arts/actions';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/attendance/store';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const MARK_STYLE: Record<AttendanceStatus, { on: string; label: [string, string] }> = {
  PRESENT: { on: 'bg-emerald-600 text-white border-emerald-600', label: ['Present', 'የተገኘ'] },
  ABSENT: { on: 'bg-red-600 text-white border-red-600', label: ['Absent', 'የቀረ'] },
  LATE: { on: 'bg-amber-500 text-white border-amber-500', label: ['Late', 'የዘገየ'] },
  EXCUSED: { on: 'bg-blue-600 text-white border-blue-600', label: ['Excused', 'በፈቃድ'] },
};

const SESSION_STATUS: Record<SessionStatus, { cls: string; label: [string, string] }> = {
  PLANNED: { cls: 'badge badge-info', label: ['Planned', 'የታቀደ'] },
  HELD: { cls: 'badge badge-success', label: ['Held', 'የተካሄደ'] },
  CANCELLED: { cls: 'badge badge-warning', label: ['Cancelled', 'የተሰረዘ'] },
};

const VOICE_ORDER = ['SOPRANO', 'ALTO', 'TENOR', 'BASS', 'NOT_SET'];
const EMPTY: ChoirSessionInput = { date: '', start_time: '', kind: 'REHEARSAL', title: '', location: '', program_id: '', lead_member_id: '', notes: '', hymn_ids: [] };

function tally(s: ChoirSession) {
  const marks = Object.values(s.attendance);
  const count = (st: AttendanceStatus) => marks.filter((m) => m === st).length;
  return { marked: marks.length, present: count('PRESENT'), late: count('LATE'), absent: count('ABSENT'), excused: count('EXCUSED') };
}

export default function ChoirSessionsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const choir = useChoir();
  const canManage = can('CHOIR_MANAGE');
  const pair = (p: [string, string]) => t(p[0], p[1]);
  const today = todayIso();

  const [view, setView] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
  const [kind, setKind] = useState<'ALL' | SessionKind>('ALL');
  const [editing, setEditing] = useState<ChoirSession | 'new' | null>(null);
  const [form, setForm] = useState<ChoirSessionInput>(EMPTY);
  const [roll, setRoll] = useState<ChoirSession | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const hymnById = new Map(choir.hymns.map((h) => [h.id, h]));
  const hymnTitle = (id: string) => {
    const h = hymnById.get(id);
    return !h ? '—' : locale === 'am' ? h.title_am : h.title_en || h.title_am;
  };
  const memberName = (m: ChoirMember) => (locale === 'am' ? m.name_am : m.name);

  const isUpcoming = (s: ChoirSession) => s.status === 'PLANNED' && s.date >= today;
  const key = (s: ChoirSession) => `${s.date} ${s.start_time}`;
  const upcoming = choir.sessions.filter(isUpcoming).sort((a, b) => key(a).localeCompare(key(b)));
  const past = choir.sessions.filter((s) => !isUpcoming(s)).sort((a, b) => key(b).localeCompare(key(a)));
  const rows = (view === 'UPCOMING' ? upcoming : past).filter((s) => kind === 'ALL' || s.kind === kind);

  const held = choir.sessions.filter((s) => s.status === 'HELD');
  const heldTotals = held.map(tally).reduce(
    (acc, x) => ({ came: acc.came + x.present + x.late, counted: acc.counted + x.marked - x.excused }),
    { came: 0, counted: 0 }
  );
  const avgRate = heldTotals.counted ? Math.round((heldTotals.came / heldTotals.counted) * 100) : null;
  const awaiting = choir.sessions.filter((s) => s.status === 'PLANNED' && s.date < today).length;

  const notify = (text: string) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Plan / edit a session ──────────────────────────────────────────────────
  const openSession = (s: ChoirSession | 'new') => {
    setError('');
    setEditing(s);
    setForm(
      s === 'new'
        ? { ...EMPTY, date: today }
        : {
            date: s.date, start_time: s.start_time, kind: s.kind, title: s.title, location: s.location,
            program_id: s.program_id ?? '', lead_member_id: s.lead_member_id ?? '', notes: s.notes, hymn_ids: s.hymn_ids,
          }
    );
  };

  const saveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await runChoir(() => saveChoirSession(editing === 'new' ? null : (editing as ChoirSession).id, form));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    notify(editing === 'new' ? t('Session planned', 'መርሐ ግብሩ ተይዟል') : t('Saved', 'ተቀምጧል'));
  };

  const moveHymn = (i: number, step: -1 | 1) =>
    setForm((f) => {
      const list = [...f.hymn_ids];
      const j = i + step;
      if (j < 0 || j >= list.length) return f;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...f, hymn_ids: list };
    });

  // ── Attendance ─────────────────────────────────────────────────────────────
  const rollMembers = roll
    ? choir.members
        .filter((m) => m.status === 'ACTIVE' || roll.attendance[m.id])
        .sort((a, b) => VOICE_ORDER.indexOf(a.voice_part) - VOICE_ORDER.indexOf(b.voice_part) || a.name.localeCompare(b.name))
    : [];

  const openRoll = (s: ChoirSession) => {
    setError('');
    setRoll(s);
    setMarks({ ...s.attendance });
  };

  const saveRoll = async () => {
    if (!roll) return;
    setBusy(true);
    const res = await runChoir(() => saveChoirAttendance(roll.id, marks));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setRoll(null);
    notify(t('Attendance saved', 'ተገኝነት ተመዝግቧል'));
  };

  const cancel = async (s: ChoirSession) => {
    if (!window.confirm(t('Cancel this session?', 'ይህ መርሐ ግብር ይሰረዝ?'))) return;
    const res = await runChoir(() => cancelChoirSession(s.id));
    if (!res.ok) {
      setToast({ kind: 'error', text: res.error });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    notify(t('Session cancelled', 'መርሐ ግብሩ ተሰርዟል'));
  };

  const exportExcel = async () => {
    const header = [
      t('Date', 'ቀን'), t('Ethiopian date', 'የኢትዮጵያ ቀን'), t('Time', 'ሰዓት'), t('Kind', 'ዓይነት'), t('Title', 'ርዕስ'), t('Place', 'ቦታ'),
      t('Program', 'መርሐ ግብር'), t('Lead', 'መሪ'), t('Hymns', 'መዝሙራት'), t('Status', 'ሁኔታ'),
      t('Present', 'የተገኘ'), t('Late', 'የዘገየ'), t('Absent', 'የቀረ'), t('Excused', 'በፈቃድ'),
    ].map(headerCell);
    const body = rows.map((s) => {
      const x = tally(s);
      return [
        cell(s.date), formatEthiopianDate(s.date, locale), s.start_time, pair(SESSION_KINDS[s.kind]), s.title, s.location,
        s.program, s.lead, s.hymn_ids.map(hymnTitle).join('; '), pair(SESSION_STATUS[s.status].label),
        x.present, x.late, x.absent, x.excused,
      ];
    });
    await downloadXlsx(`choir_sessions_${today}`, [header, ...body], { sheet: 'Sessions', widths: [12, 18, 8, 14, 26, 18, 24, 20, 40, 10, 8, 8, 8, 8] });
  };

  const rollTally = Object.values(marks);

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Rehearsals & Services', 'ልምምድና አገልግሎት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Plan choir sessions, choose the hymns and take attendance', 'የመዘምራን መርሐ ግብር፣ የሚዘመሩ መዝሙራትና ተገኝነት')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => openSession('new')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><CalendarPlus size={14} /> {t('Plan a Session', 'መርሐ ግብር ያዝ')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={choir.mode} error={choir.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={upcoming.length} label={t('Upcoming', 'የሚመጡ')} />
        <Kpi value={held.length} label={t('Sessions held', 'የተካሄዱ')} />
        <Kpi value={avgRate === null ? '—' : `${avgRate}%`} label={t('Average attendance', 'አማካይ ተገኝነት')} />
        <Kpi value={awaiting} label={t('Attendance not taken', 'ተገኝነት ያልተያዘላቸው')} warn={awaiting > 0} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start">
            {(['UPCOMING', 'PAST'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${view === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {v === 'UPCOMING' ? `${t('Upcoming', 'የሚመጡ')} (${upcoming.length})` : `${t('Past', 'ያለፉ')} (${past.length})`}
              </button>
            ))}
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All kinds', 'ሁሉም ዓይነት')}</option>
            {(Object.keys(SESSION_KINDS) as SessionKind[]).map((k) => <option key={k} value={k}>{pair(SESSION_KINDS[k])}</option>)}
          </select>
        </div>

        <ul className="divide-y divide-slate-100">
          {rows.map((s) => {
            const x = tally(s);
            const overdue = s.status === 'PLANNED' && s.date < today;
            return (
              <li key={s.id} className={`p-4 flex flex-col lg:flex-row lg:items-start gap-3 ${s.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <div className="lg:w-48 shrink-0">
                  <div className="text-sm font-semibold text-slate-900">{formatEthiopianDate(s.date, locale, { weekday: true })}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{s.date}{s.start_time && ` · ${s.start_time}`}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{s.title || pair(SESSION_KINDS[s.kind])}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{pair(SESSION_KINDS[s.kind])}</span>
                    <span className={SESSION_STATUS[s.status].cls}>{pair(SESSION_STATUS[s.status].label)}</span>
                    {overdue && <span className="text-[11px] font-semibold text-amber-700">{t('Attendance not taken', 'ተገኝነት አልተያዘም')}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {s.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
                    {s.lead && <span>{t('Lead', 'መሪ')}: {s.lead}</span>}
                    {s.program && <span>{t('Program', 'መርሐ ግብር')}: {s.program}</span>}
                  </div>
                  {s.hymn_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.hymn_ids.map((id, i) => (
                        <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100">{i + 1}. {hymnTitle(id)}</span>
                      ))}
                    </div>
                  )}
                  {x.marked > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500 tabular-nums">
                      {t('Present', 'የተገኘ')} {x.present} · {t('Late', 'የዘገየ')} {x.late} · {t('Absent', 'የቀረ')} {x.absent} · {t('Excused', 'በፈቃድ')} {x.excused}
                    </div>
                  )}
                  {s.notes && <p className="mt-1 text-xs text-slate-500 italic">{s.notes}</p>}
                </div>
                {canManage && s.status !== 'CANCELLED' && (
                  <div className="flex flex-wrap gap-1.5 lg:justify-end shrink-0">
                    <button
                      onClick={() => openRoll(s)}
                      disabled={s.date > today}
                      title={s.date > today ? t('Attendance opens on the day', 'ተገኝነት በዕለቱ ይከፈታል') : undefined}
                      className="btn btn-secondary text-xs py-1.5 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <ClipboardCheck size={13} /> {s.status === 'HELD' ? t('Attendance', 'ተገኝነት') : t('Take attendance', 'ተገኝነት ያዝ')}
                    </button>
                    <button onClick={() => openSession(s)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50">{t('Edit', 'አርትዕ')}</button>
                    {s.status === 'PLANNED' && <button onClick={() => cancel(s)} className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50">{t('Cancel', 'ሰርዝ')}</button>}
                  </div>
                )}
              </li>
            );
          })}
          {choir.mode !== 'loading' && rows.length === 0 && (
            <li className="text-center text-sm text-slate-400 py-10">
              <Music size={18} className="inline mr-1" />
              {view === 'UPCOMING' ? t('Nothing planned yet.', 'እስካሁን የታቀደ መርሐ ግብር የለም።') : t('No past sessions.', 'ያለፈ መርሐ ግብር የለም።')}
            </li>
          )}
        </ul>
      </div>

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing === 'new' ? t('Plan a Session', 'መርሐ ግብር ያዝ') : t('Edit Session', 'መርሐ ግብር አርትዕ')} maxWidth="2xl">
          <form onSubmit={saveSession} className="space-y-4">
            {error && <ErrorBox text={error} />}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t('Date', 'ቀን') + ' *'}>
                <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="form-input text-sm" />
                {form.date && <p className="text-[11px] text-slate-400 mt-1">{formatEthiopianDate(form.date, locale, { weekday: true })}</p>}
              </Field>
              <Field label={t('Start time', 'የሚጀምርበት ሰዓት')}>
                <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Kind', 'ዓይነት')}>
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as SessionKind }))} className="form-input text-sm">
                  {(Object.keys(SESSION_KINDS) as SessionKind[]).map((k) => <option key={k} value={k}>{pair(SESSION_KINDS[k])}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Title', 'ርዕስ')}>
                <input type="text" value={form.title} placeholder={t('e.g. Meskel eve rehearsal', 'ለምሳሌ፦ የመስቀል ዋዜማ ልምምድ')} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Place', 'ቦታ')}>
                <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="form-input text-sm" />
              </Field>
              <Field label={t('Led by', 'የሚመራው')}>
                <select value={form.lead_member_id} onChange={(e) => setForm((f) => ({ ...f, lead_member_id: e.target.value }))} className="form-input text-sm">
                  <option value="">—</option>
                  {choir.members
                    .filter((m) => m.status === 'ACTIVE' || m.id === form.lead_member_id)
                    .map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                </select>
              </Field>
              <Field label={t('Part of a program', 'የመርሐ ግብሩ አካል')}>
                <select value={form.program_id} onChange={(e) => setForm((f) => ({ ...f, program_id: e.target.value }))} className="form-input text-sm">
                  <option value="">—</option>
                  {editing !== 'new' && editing.program_id && !choir.programs.some((p) => p.id === editing.program_id) && (
                    <option value={editing.program_id}>{editing.program}</option>
                  )}
                  {choir.programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('Hymns, in the order they are sung', 'የሚዘመሩ መዝሙራት በቅደም ተከተል')}>
              {form.hymn_ids.length > 0 && (
                <ol className="mb-2 border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {form.hymn_ids.map((id, i) => (
                    <li key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="text-slate-400 w-5 text-right text-xs">{i + 1}.</span>
                      <span className="flex-1 min-w-0 truncate text-slate-800">{hymnTitle(id)}</span>
                      <button type="button" aria-label={t('Move up', 'ወደ ላይ')} disabled={i === 0} onClick={() => moveHymn(i, -1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={14} /></button>
                      <button type="button" aria-label={t('Move down', 'ወደ ታች')} disabled={i === form.hymn_ids.length - 1} onClick={() => moveHymn(i, 1)} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={14} /></button>
                      <button type="button" aria-label={t('Remove', 'አስወግድ')} onClick={() => setForm((f) => ({ ...f, hymn_ids: f.hymn_ids.filter((h) => h !== id) }))} className="p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
                    </li>
                  ))}
                </ol>
              )}
              <select
                value=""
                onChange={(e) => e.target.value && setForm((f) => ({ ...f, hymn_ids: [...f.hymn_ids, e.target.value] }))}
                className="form-input text-sm"
              >
                <option value="">{choir.hymns.length ? t('+ Add a hymn from the library…', '+ ከማውጫው መዝሙር ጨምር…') : t('The hymn library is empty', 'የመዝሙራት ማውጫው ባዶ ነው')}</option>
                {choir.hymns
                  .filter((h) => h.is_active && !form.hymn_ids.includes(h.id))
                  .map((h) => <option key={h.id} value={h.id}>{locale === 'am' ? h.title_am : h.title_en || h.title_am}{h.feast ? ` — ${h.feast}` : ''}</option>)}
              </select>
            </Field>

            <Field label={t('Notes', 'ማስታወሻ')}>
              <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="form-input text-sm" />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}</button>
            </div>
          </form>
        </Modal>
      )}

      {roll && (
        <Modal
          isOpen
          onClose={() => setRoll(null)}
          title={t('Attendance', 'ተገኝነት') + ' — ' + (roll.title || pair(SESSION_KINDS[roll.kind]))}
          subtitle={formatEthiopianDate(roll.date, locale, { weekday: true })}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {error && <ErrorBox text={error} />}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600 tabular-nums">
                {rollTally.length} / {rollMembers.length} {t('marked', 'ተመዝግበዋል')} · {t('Present', 'የተገኘ')} {rollTally.filter((m) => m === 'PRESENT').length} · {t('Late', 'የዘገየ')} {rollTally.filter((m) => m === 'LATE').length} · {t('Absent', 'የቀረ')} {rollTally.filter((m) => m === 'ABSENT').length}
              </span>
              <button
                type="button"
                onClick={() => setMarks((cur) => Object.fromEntries(rollMembers.map((m) => [m.id, cur[m.id] ?? 'PRESENT'])))}
                disabled={rollMembers.length === 0}
                className="btn btn-secondary text-xs py-1.5"
              >
                {t('Mark the rest present', 'የቀሩትን የተገኘ አድርግ')}
              </button>
            </div>
            {rollMembers.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">{t('No active choir members. Add them under Choir Members.', 'ንቁ የመዘምራን አባል የለም። በመዘምራን አባላት ይጨምሩ።')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {rollMembers.map((m) => (
                  <li key={m.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{memberName(m)}</div>
                      <div className="text-[11px] text-slate-400">{pair(VOICE_PARTS[m.voice_part])}</div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap" role="group" aria-label={m.name}>
                      {ATTENDANCE_STATUSES.map((st) => {
                        const on = marks[m.id] === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setMarks((cur) => ({ ...cur, [m.id]: st }))}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${on ? MARK_STYLE[st].on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {pair(MARK_STYLE[st].label)}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-slate-400">{t('Saving marks the session as held. Members left unmarked are not counted.', 'ሲመዘገብ መርሐ ግብሩ እንደተካሄደ ይቆጠራል። ያልተመረጡ አባላት አይቆጠሩም።')}</p>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setRoll(null)} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
              <button type="button" onClick={saveRoll} disabled={busy || rollTally.length === 0} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save attendance', 'ተገኝነት መዝግብ')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ value, label, warn = false }: { value: React.ReactNode; label: string; warn?: boolean }) {
  return (
    <div className="card p-5">
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16} /> {text}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
