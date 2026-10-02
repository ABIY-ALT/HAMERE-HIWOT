'use client';

import React, { useState } from 'react';
import { AlertCircle, ArrowRightLeft, Phone, ShieldAlert, UserMinus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { runHr, useHr, type HrState } from '@/lib/hr/client';
import {
  activeSuspension,
  addDays,
  CASE_KINDS,
  CASE_STATUS,
  END_REASONS,
  ROLE_KINDS,
  roleLabel,
  tally,
  type EndReason,
  type RoleKind,
  type ServiceAssignment,
} from '@/lib/hr/types';
import {
  endAssignment,
  saveAssignment,
  transferAssignment,
  type AssignmentInput,
  type EndAssignmentInput,
  type TransferInput,
} from '@/app/dashboard/hr/actions';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import type { ActionResult } from '@/lib/admin/types';

type Done = (message: string) => void;
type Preset = Partial<Pick<AssignmentInput, 'person_id' | 'unit_id' | 'role_kind' | 'class_id'>>;
type View =
  | { kind: 'person'; personId: string }
  | { kind: 'new'; preset: Preset }
  | { kind: 'edit' | 'end' | 'move'; assignmentId: string };

const MARK_DOT: Record<string, string> = { PRESENT: 'bg-emerald-500', LATE: 'bg-amber-400', ABSENT: 'bg-red-500', EXCUSED: 'bg-blue-400' };

/** Opens the HR dialogs from any page. */
export function useHrDialogs(onDone: Done) {
  const hr = useHr();
  const [view, setView] = useState<View | null>(null);
  const close = () => setView(null);
  const done = (message: string) => {
    setView(null);
    onDone(message);
  };

  let node: React.ReactNode = null;
  if (view?.kind === 'person') {
    node = (
      <ServantDossier
        hr={hr}
        personId={view.personId}
        onClose={close}
        onNew={() => setView({ kind: 'new', preset: { person_id: view.personId } })}
        onAction={(kind, assignmentId) => setView({ kind, assignmentId })}
      />
    );
  } else if (view?.kind === 'new') {
    node = <AssignmentForm hr={hr} preset={view.preset} onClose={close} onDone={done} />;
  } else if (view) {
    const a = hr.assignments.find((x) => x.id === view.assignmentId);
    if (a && view.kind === 'edit') node = <AssignmentForm hr={hr} assignment={a} onClose={close} onDone={done} />;
    if (a && view.kind === 'end') node = <EndDialog hr={hr} assignment={a} onClose={close} onDone={done} />;
    if (a && view.kind === 'move') node = <MoveDialog hr={hr} assignment={a} onClose={close} onDone={done} />;
  }

  return {
    node,
    openPerson: (personId: string) => setView({ kind: 'person', personId }),
    newAssignment: (preset: Preset = {}) => setView({ kind: 'new', preset }),
    editAssignment: (a: ServiceAssignment) => setView({ kind: 'edit', assignmentId: a.id }),
    endAssignment: (a: ServiceAssignment) => setView({ kind: 'end', assignmentId: a.id }),
    moveAssignment: (a: ServiceAssignment) => setView({ kind: 'move', assignmentId: a.id }),
  };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

export function personName(hr: HrState, id: string, locale: string): string {
  const p = hr.people.find((x) => x.id === id);
  if (p) return locale === 'am' ? p.name_am : p.name;
  return hr.candidates.find((x) => x.id === id)?.name ?? '—';
}

export function UnitOptions({ hr }: { hr: HrState }) {
  const { t, locale } = useLang();
  const groups: [string, (type: string) => boolean][] = [
    [t('Departments', 'ክፍሎች'), (type) => type === 'DEPARTMENT'],
    [t('Coordinations', 'አስተባባሪዎች'), (type) => type === 'COORDINATION'],
    [t('Other bodies', 'ሌሎች አካላት'), (type) => type !== 'DEPARTMENT' && type !== 'COORDINATION'],
  ];
  return (
    <>
      {groups.map(([label, match]) => {
        const units = hr.units.filter((u) => match(u.type));
        return units.length ? (
          <optgroup key={label} label={label}>
            {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm"><AlertCircle size={16} /> {text}</div>;
}

function Buttons({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
      <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
      <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በመመዝገብ ላይ…') : label}</button>
    </div>
  );
}

function useSubmit(onDone: Done) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (action: () => Promise<ActionResult>, message: string) => {
    setBusy(true);
    setError('');
    const res = await runHr(action);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(message);
  };
  return { busy, error, submit };
}

function ClassSelect({ hr, value, onChange }: { hr: HrState; value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  return (
    <Field label={t('Class taught', 'የሚያስተምረው ክፍል')} hint={hr.classes.length ? undefined : t('No classes in the active academic year yet.', 'በዚህ ዓመት ገና ክፍል አልተከፈተም።')}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="form-input text-sm">
        <option value="">{t('— Not tied to one class —', '— ለአንድ ክፍል ያልተመደበ —')}</option>
        {hr.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </Field>
  );
}

// ── New / edit assignment ────────────────────────────────────────────────────

function AssignmentForm({ hr, assignment, preset = {}, onClose, onDone }: { hr: HrState; assignment?: ServiceAssignment; preset?: Preset; onClose: () => void; onDone: Done }) {
  const { t, locale } = useLang();
  const { busy, error, submit } = useSubmit(onDone);
  const [form, setForm] = useState<AssignmentInput>(
    assignment
      ? { person_id: assignment.person_id, unit_id: assignment.unit_id, role_kind: assignment.role_kind, title: assignment.title, class_id: assignment.class_id ?? '', start_date: assignment.start_date, notes: assignment.notes }
      : { person_id: preset.person_id ?? '', unit_id: preset.unit_id ?? '', role_kind: preset.role_kind ?? 'SERVANT', title: '', class_id: preset.class_id ?? '', start_date: todayIso(), notes: '' }
  );
  const set = (patch: Partial<AssignmentInput>) => setForm((f) => ({ ...f, ...patch }));
  const presetOutside = preset.person_id && !hr.candidates.some((c) => c.id === preset.person_id);

  return (
    <Modal isOpen onClose={onClose} title={assignment ? t('Edit Assignment', 'ምደባ አርትዕ') : t('Assign a Servant', 'አገልጋይ መድብ')} subtitle={assignment ? personName(hr, assignment.person_id, locale) : undefined} maxWidth="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => saveAssignment(assignment?.id ?? null, form), assignment ? t('Assignment saved', 'ምደባው ተቀምጧል') : t('Servant assigned', 'አገልጋዩ ተመድቧል'));
        }}
        className="space-y-4"
      >
        {error && <ErrorBox text={error} />}
        {!assignment && (
          <Field label={t('Servant', 'አገልጋይ') + ' *'} hint={t('Register new people first under People → Members.', 'አዳዲስ ሰዎችን በመጀመሪያ በሰዎች → አባላት ይመዝግቡ።')}>
            <select required value={form.person_id} onChange={(e) => set({ person_id: e.target.value })} className="form-input text-sm">
              <option value="">{t('— Choose a registered member —', '— የተመዘገበ አባል ይምረጡ —')}</option>
              {presetOutside && <option value={preset.person_id}>{personName(hr, preset.person_id!, locale)}</option>}
              {hr.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Department / coordination', 'ክፍል / አስተባባሪ') + ' *'}>
            <select required value={form.unit_id} onChange={(e) => set({ unit_id: e.target.value })} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              <UnitOptions hr={hr} />
            </select>
          </Field>
          <Field label={t('Role', 'ኃላፊነት')}>
            <select value={form.role_kind} onChange={(e) => set({ role_kind: e.target.value as RoleKind })} className="form-input text-sm">
              {(Object.keys(ROLE_KINDS) as RoleKind[]).map((k) => <option key={k} value={k}>{t(...ROLE_KINDS[k])}</option>)}
            </select>
          </Field>
          <Field label={t('Title (optional)', 'የኃላፊነት ስም (አማራጭ)')}>
            <input type="text" value={form.title} placeholder={t('e.g. Media servant', 'ለምሳሌ፦ የሚዲያ አገልጋይ')} onChange={(e) => set({ title: e.target.value })} className="form-input text-sm" />
          </Field>
          <Field label={t('Serving since', 'ከ… ጀምሮ') + ' *'} hint={form.start_date ? formatEthiopianDate(form.start_date, locale) : undefined}>
            <input type="date" required value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} className="form-input text-sm" />
          </Field>
        </div>
        {form.role_kind === 'TEACHER' && <ClassSelect hr={hr} value={form.class_id} onChange={(class_id) => set({ class_id })} />}
        <Field label={t('Notes', 'ማስታወሻ')}>
          <input type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="form-input text-sm" />
        </Field>
        <Buttons busy={busy} onClose={onClose} label={assignment ? t('Save', 'መዝግብ') : t('Assign', 'መድብ')} />
      </form>
    </Modal>
  );
}

// ── End an assignment ────────────────────────────────────────────────────────

function EndDialog({ hr, assignment, onClose, onDone }: { hr: HrState; assignment: ServiceAssignment; onClose: () => void; onDone: Done }) {
  const { t, locale } = useLang();
  const { busy, error, submit } = useSubmit(onDone);
  const [form, setForm] = useState<EndAssignmentInput>({ end_date: todayIso(), end_reason: 'COMPLETED', note: '' });
  return (
    <Modal isOpen onClose={onClose} title={t('End Assignment', 'ምደባ አጠናቅ')} subtitle={`${personName(hr, assignment.person_id, locale)} · ${roleLabel(assignment, t)} · ${locale === 'am' ? assignment.unit_am : assignment.unit}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => endAssignment(assignment.id, form), t('Assignment ended', 'ምደባው ተጠናቋል'));
        }}
        className="space-y-4"
      >
        {error && <ErrorBox text={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Last day', 'የመጨረሻ ቀን') + ' *'} hint={formatEthiopianDate(form.end_date, locale)}>
            <input type="date" required min={assignment.start_date} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="form-input text-sm" />
          </Field>
          <Field label={t('Reason', 'ምክንያት')}>
            <select value={form.end_reason} onChange={(e) => setForm((f) => ({ ...f, end_reason: e.target.value as EndReason }))} className="form-input text-sm">
              {(Object.keys(END_REASONS) as EndReason[]).filter((r) => r !== 'TRANSFERRED').map((r) => <option key={r} value={r}>{t(...END_REASONS[r])}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('Note', 'ማስታወሻ')}>
          <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="form-input text-sm" />
        </Field>
        <p className="text-[11px] text-slate-400">{t('To move this servant to another unit, use Move instead — it keeps the history linked.', 'አገልጋዩን ወደ ሌላ ክፍል ለማዛወር "አዛውር"ን ይጠቀሙ።')}</p>
        <Buttons busy={busy} onClose={onClose} label={t('End assignment', 'ምደባውን አጠናቅ')} />
      </form>
    </Modal>
  );
}

// ── Move to another unit / role ──────────────────────────────────────────────

function MoveDialog({ hr, assignment, onClose, onDone }: { hr: HrState; assignment: ServiceAssignment; onClose: () => void; onDone: Done }) {
  const { t, locale } = useLang();
  const { busy, error, submit } = useSubmit(onDone);
  const [form, setForm] = useState<TransferInput>({ unit_id: '', role_kind: assignment.role_kind, title: '', class_id: '', date: todayIso() });
  const set = (patch: Partial<TransferInput>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Modal isOpen onClose={onClose} title={t('Move Servant', 'አገልጋይ አዛውር')} subtitle={`${personName(hr, assignment.person_id, locale)} · ${t('now', 'አሁን')}: ${roleLabel(assignment, t)}, ${locale === 'am' ? assignment.unit_am : assignment.unit}`} maxWidth="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => transferAssignment(assignment.id, form), t('Servant moved', 'አገልጋዩ ተዛውሯል'));
        }}
        className="space-y-4"
      >
        {error && <ErrorBox text={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('New department / coordination', 'አዲሱ ክፍል') + ' *'}>
            <select required value={form.unit_id} onChange={(e) => set({ unit_id: e.target.value })} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              <UnitOptions hr={hr} />
            </select>
          </Field>
          <Field label={t('New role', 'አዲሱ ኃላፊነት')}>
            <select value={form.role_kind} onChange={(e) => set({ role_kind: e.target.value as RoleKind })} className="form-input text-sm">
              {(Object.keys(ROLE_KINDS) as RoleKind[]).map((k) => <option key={k} value={k}>{t(...ROLE_KINDS[k])}</option>)}
            </select>
          </Field>
          <Field label={t('Title (optional)', 'የኃላፊነት ስም (አማራጭ)')}>
            <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className="form-input text-sm" />
          </Field>
          <Field label={t('Moves on', 'የሚዛወርበት ቀን') + ' *'} hint={formatEthiopianDate(form.date, locale)}>
            <input type="date" required min={assignment.start_date} value={form.date} onChange={(e) => set({ date: e.target.value })} className="form-input text-sm" />
          </Field>
        </div>
        {form.role_kind === 'TEACHER' && <ClassSelect hr={hr} value={form.class_id} onChange={(class_id) => set({ class_id })} />}
        <Buttons busy={busy} onClose={onClose} label={t('Move', 'አዛውር')} />
      </form>
    </Modal>
  );
}

// ── A servant's record ───────────────────────────────────────────────────────

function ServantDossier({
  hr, personId, onClose, onNew, onAction,
}: { hr: HrState; personId: string; onClose: () => void; onNew: () => void; onAction: (kind: 'edit' | 'end' | 'move', assignmentId: string) => void }) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('HR_MANAGE');
  const today = todayIso();
  const person = hr.people.find((p) => p.id === personId);
  const mine = hr.assignments.filter((a) => a.person_id === personId);
  const current = mine.filter((a) => a.status === 'ACTIVE');
  const past = mine.filter((a) => a.status === 'ENDED').sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
  const marks = hr.attendance.filter((m) => m.person_id === personId && m.date >= addDays(today, -84)).sort((a, b) => b.date.localeCompare(a.date));
  const x = tally(marks);
  const cases = hr.cases.filter((c) => c.person_id === personId);
  const suspension = activeSuspension(hr.cases, personId, today);
  const homeroom = hr.homeroom.filter((h) => h.person_id === personId);
  const unitName = (a: ServiceAssignment) => (locale === 'am' ? a.unit_am : a.unit);

  return (
    <Modal isOpen onClose={onClose} title={personName(hr, personId, locale)} subtitle={person?.baptismal_name ? `${t('Baptismal name', 'የክርስትና ስም')}: ${person.baptismal_name}` : undefined} maxWidth="2xl">
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {person?.phone && <a href={`tel:${person.phone}`} className="text-xs font-mono text-blue-600 inline-flex items-center gap-1"><Phone size={12} />{person.phone}</a>}
          {person && person.status !== 'ACTIVE' && <span className="badge badge-warning">{person.status}</span>}
          {suspension && (
            <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 inline-flex items-center gap-1">
              <ShieldAlert size={12} /> {t('Suspended', 'ታግዷል')}{suspension.suspended_until && ` ${t('until', 'እስከ')} ${formatEthiopianDate(suspension.suspended_until, locale)}`}
            </span>
          )}
        </div>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t('Serving now', 'አሁን የሚያገለግልበት')}</h4>
            {canManage && <button onClick={onNew} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">{t('+ Add assignment', '+ ምደባ ጨምር')}</button>}
          </div>
          {current.length === 0 && homeroom.length === 0 ? (
            <p className="text-xs text-slate-400">{t('No current assignment.', 'የአሁን ምደባ የለም።')}</p>
          ) : (
            <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {current.map((a) => (
                <li key={a.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{roleLabel(a, t)}{a.class_name && ` · ${a.class_name}`}</div>
                    <div className="text-[11px] text-slate-500">{unitName(a)} · {t('since', 'ከ')} {formatEthiopianDate(a.start_date, locale)}</div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => onAction('edit', a.id)} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded">{t('Edit', 'አርትዕ')}</button>
                      <button onClick={() => onAction('move', a.id)} className="text-xs text-slate-600 hover:bg-slate-50 font-semibold px-2 py-1 rounded inline-flex items-center gap-1"><ArrowRightLeft size={12} />{t('Move', 'አዛውር')}</button>
                      <button onClick={() => onAction('end', a.id)} className="text-xs text-red-600 hover:bg-red-50 font-semibold px-2 py-1 rounded inline-flex items-center gap-1"><UserMinus size={12} />{t('End', 'አጠናቅ')}</button>
                    </div>
                  )}
                </li>
              ))}
              {homeroom.map((h) => (
                <li key={h.class_id} className="px-3 py-2">
                  <div className="font-medium text-slate-900">{t('Homeroom teacher', 'የክፍል ኃላፊ መምህር')} · {h.class_name}</div>
                  <div className="text-[11px] text-slate-500">{t('Set on the class (Education → Classes)', 'በክፍሉ ላይ የተመደበ (ትምህርት → ክፍሎች)')}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{t('Attendance — last 12 weeks', 'ተገኝነት — ያለፉት 12 ሳምንታት')}</h4>
          {marks.length === 0 ? (
            <p className="text-xs text-slate-400">{t('No attendance recorded.', 'ተገኝነት አልተመዘገበም።')}</p>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-600 tabular-nums">
                <span className="font-bold text-slate-900">{x.rate === null ? '—' : `${x.rate}%`}</span> · {t('Present', 'የተገኘ')} {x.present} · {t('Late', 'የዘገየ')} {x.late} · {t('Absent', 'የቀረ')} {x.absent} · {t('Excused', 'በፈቃድ')} {x.excused}
              </div>
              <div className="flex flex-wrap gap-1">
                {marks.map((m) => (
                  <span key={m.date} title={`${formatEthiopianDate(m.date, locale)} — ${m.status}${m.check_in ? ` ${m.check_in}` : ''}`} className={`w-3 h-3 rounded-sm ${MARK_DOT[m.status]}`} />
                ))}
              </div>
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{t('Earlier service', 'ቀደም ሲል ያገለገለበት')}</h4>
            <ul className="space-y-1 text-xs text-slate-600">
              {past.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-slate-800">{roleLabel(a, t)}</span> · {unitName(a)} · {formatEthiopianDate(a.start_date, locale)} – {formatEthiopianDate(a.end_date, locale)}
                  {a.end_reason && <span className="text-slate-400"> ({t(...END_REASONS[a.end_reason])})</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {hr.canSeeCases && cases.length > 0 && (
          <section>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{t('Discipline record', 'የዲሲፕሊን መዝገብ')}</h4>
            <ul className="space-y-1.5 text-xs">
              {cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className={CASE_STATUS[c.status].cls}>{t(...CASE_STATUS[c.status].label)}</span>
                  <span className="font-medium text-slate-800">{t(...CASE_KINDS[c.kind])}</span>
                  <span className="text-slate-500">{formatEthiopianDate(c.opened_on, locale)} — {c.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Close', 'ዝጋ')}</button>
        </div>
      </div>
    </Modal>
  );
}
