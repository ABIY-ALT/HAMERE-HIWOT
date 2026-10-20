'use client';

// A department gives a task to one of its own people (migration 035): from the
// Tasks page, as a part of a bigger task, or from an activity of its plan.

import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { createDepartmentTask } from '@/app/dashboard/tasks/actions';
import { PRIORITY, type TaskPerson, type TaskPriority } from '@/lib/tasks/types';

export interface OwnTaskUnit {
  id: string;
  name: string;
  people: TaskPerson[];
}

export function OwnTaskForm({
  units,
  unitId,
  parent,
  activity,
  defaultTitle = '',
  run,
  onClose,
  onDone,
}: {
  /** Departments this user may give tasks in, with their people */
  units: OwnTaskUnit[];
  unitId?: string;
  /** Part of this bigger task */
  parent?: { id: string; label: string };
  /** Carries out this plan activity */
  activity?: { id: string; label: string };
  defaultTitle?: string;
  /** Runs the save (e.g. through the Tasks store, which reloads) */
  run?: (save: () => ReturnType<typeof createDepartmentTask>) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useLang();
  const [unit, setUnit] = useState(unitId ?? units[0]?.id ?? '');
  const [person, setPerson] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const people = units.find((u) => u.id === unit)?.people ?? [];
  const personName = people.find((p) => p.id === person)?.name ?? '';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const action = () =>
      createDepartmentTask({
        unit_id: unit,
        title,
        details,
        priority,
        due_date: due,
        assignee_person_id: person,
        parent_task_id: parent?.id ?? '',
        plan_activity_id: activity?.id ?? '',
      });
    const res = run ? await run(action) : await action();
    setBusy(false);
    if (!res.ok) return setError(res.error ?? '');
    onDone(t(`Given to ${personName} — they were told`, `ለ${personName} ተሰጥቷል — ተነግሯቸዋል`));
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="lg" title={t('Give a task to someone in the department', 'በክፍሉ ውስጥ ላለ ሰው ተግባር ስጥ')}>
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        {(parent || activity) && (
          <p className="text-xs rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
            {parent && <span className="block">🧩 {t('Part of', 'የዚህ አካል')}: <b>{parent.label}</b></span>}
            {activity && <span className="block">🎯 {t('Plan activity', 'የእቅድ ተግባር')}: <b>{activity.label}</b></span>}
          </p>
        )}
        {units.length > 1 && (
          <Field label={t('Department', 'ክፍል')}>
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setPerson('');
              }}
              className="form-input text-sm"
            >
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('Who will do it', 'የሚሠራው ሰው') + ' *'}>
          {people.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {t(
                'Nobody is listed in this department yet. Set “Assigned department” on members’ forms, or assign servants under HR.',
                'በዚህ ክፍል ገና ማንም አልተመዘገበም። በአባላት ቅጽ «የተመደበበት ክፍል» ያስገቡ፣ ወይም በሰው ኃይል አገልጋዮችን ይመድቡ።'
              )}
            </p>
          ) : (
            <select required value={person} onChange={(e) => setPerson(e.target.value)} className="form-input text-sm">
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('What has to be done', 'የሚሠራው') + ' *'}>
          <input required minLength={3} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className="form-input text-sm" />
        </Field>
        <Field label={t('Details (optional)', 'ዝርዝር (ካለ)')}>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={4000} className="form-input text-sm" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Due date', 'የማጠናቀቂያ ቀን')}>
            <EthiopianDateInput value={due} onChange={setDue} optional />
          </Field>
          <Field label={t('Priority', 'ቅድሚያ')}>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="form-input text-sm">
              {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => <option key={p} value={p}>{t(...PRIORITY[p].label)}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-slate-500">
          {t(
            'They are told on Telegram (and on the website if they have an account), report progress from “My tasks”, and you review it when they say it is done.',
            'በቴሌግራም (አካውንት ካላቸው በድረ-ገጹም) ይነገራቸዋል፤ ከ«ተግባሮቼ» ሂደቱን ያሳውቃሉ፤ ሲጨርሱ እርስዎ ይገመግማሉ።'
          )}
        </p>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy || !person || title.trim().length < 3} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <UserCheck size={14} /> {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Give the task', 'ተግባሩን ስጥ')}
          </button>
        </div>
      </form>
    </Modal>
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
