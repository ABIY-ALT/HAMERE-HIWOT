'use client';

import React, { useState } from 'react';
import { AlertCircle, CalendarCheck, Plus, Trash2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { saveAssessmentScheme } from '@/lib/education/client';
import { MAX_PARTS, partKey, type AssessmentPart } from '@/lib/education/types';

interface Row {
  key: string; // '' for a part added here
  name_en: string;
  name_am: string;
  weight: string;
  attendance: boolean;
}

const toRows = (scheme: AssessmentPart[]): Row[] =>
  scheme.map((p) => ({ key: p.key, name_en: p.name_en, name_am: p.name_am, weight: String(p.weight), attendance: p.source === 'attendance' }));

const EXAMPLE: Row[] = [
  { key: '', name_en: 'Attendance', name_am: 'ተገኝነት', weight: '10', attendance: true },
  { key: '', name_en: 'Assignments & class work', name_am: 'የቤት ሥራና የክፍል ሥራ', weight: '15', attendance: false },
  { key: '', name_en: 'Mid exam', name_am: 'የአጋማሽ ፈተና', weight: '25', attendance: false },
  { key: '', name_en: 'Final exam', name_am: 'የማጠቃለያ ፈተና', weight: '50', attendance: false },
];

/** Edit how grades are made up in the active academic year. */
export function AssessmentSchemeModal({
  scheme,
  yearName,
  onClose,
  onSaved,
}: {
  scheme: AssessmentPart[];
  yearName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[]>(() => toRows(scheme));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const total = Math.round(rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0) * 100) / 100;
  const set = (i: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r, j) => {
        if (j === i) return { ...r, ...patch };
        // Only one part can come from attendance
        return patch.attendance ? { ...r, attendance: false } : r;
      })
    );

  // Reuse the key of an existing part with the same English name, so earlier grades still line up
  const applyExample = () =>
    setRows(EXAMPLE.map((r) => ({ ...r, key: scheme.find((p) => p.name_en.toLowerCase() === r.name_en.toLowerCase())?.key ?? '' })));

  const save = async () => {
    setError('');
    if (rows.some((r) => r.name_en.trim().length < 2)) {
      return setError(t('Name every part in English.', 'እያንዳንዱን ምዘና በእንግሊዝኛ ይሰይሙ።'));
    }
    if (rows.some((r) => !(Number(r.weight) > 0))) {
      return setError(t('Every part needs marks above 0.', 'እያንዳንዱ ምዘና ከ0 በላይ ነጥብ ያስፈልገዋል።'));
    }
    if (total !== 100) {
      return setError(t(`The parts add up to ${total}; they must add up to 100.`, `ድምሩ ${total} ነው፤ 100 መሆን አለበት።`));
    }
    const taken: string[] = rows.filter((r) => r.key).map((r) => r.key);
    const parts: AssessmentPart[] = rows.map((r) => {
      const key = r.key || partKey(r.name_en, taken);
      taken.push(key);
      return {
        key,
        name_en: r.name_en.trim(),
        name_am: r.name_am.trim() || r.name_en.trim(),
        weight: Number(r.weight),
        ...(r.attendance ? { source: 'attendance' as const } : {}),
      };
    });
    setBusy(true);
    const res = await saveAssessmentScheme(parts);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved(t('Assessment weights saved', 'የምዘና ክፍፍሉ ተቀምጧል'));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="2xl"
      title={t('Assessment weights', 'የምዘና ክፍፍል')}
      subtitle={t(
        `How the 100 marks of every subject are shared out in ${yearName}`,
        `በ${yearName} የእያንዳንዱ ትምህርት 100 ነጥብ እንዴት እንደሚከፋፈል`
      )}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_150px_36px] gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <span>{t('Part (English)', 'ምዘና (እንግሊዝኛ)')}</span>
            <span>{t('Part (Amharic)', 'ምዘና (አማርኛ)')}</span>
            <span>{t('Marks', 'ነጥብ')}</span>
            <span />
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_80px_150px_36px] gap-2 items-center p-2 sm:p-0 rounded-lg border sm:border-0 border-slate-200">
              <input
                value={r.name_en}
                onChange={(e) => set(i, { name_en: e.target.value })}
                placeholder={t('e.g. Mid exam', 'ለምሳሌ Mid exam')}
                className="form-input text-sm"
              />
              <input
                value={r.name_am}
                onChange={(e) => set(i, { name_am: e.target.value })}
                placeholder="የአጋማሽ ፈተና"
                className="form-input text-sm"
              />
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                value={r.weight}
                onChange={(e) => set(i, { weight: e.target.value })}
                className="form-input text-sm font-mono"
              />
              <label
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap ${
                  r.attendance ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'
                }`}
                title={t('Suggest this part from the student’s roll calls', 'ይህን ምዘና ከተማሪው የክትትል መዝገብ አስላ')}
              >
                <input
                  type="checkbox"
                  checked={r.attendance}
                  onChange={(e) => set(i, { attendance: e.target.checked })}
                  className="accent-emerald-600"
                />
                <CalendarCheck size={13} />
                {t('From attendance', 'ከተገኝነት')}
              </label>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
                className="justify-self-end p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                aria-label={t('Remove part', 'ምዘናውን አስወግድ')}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { key: '', name_en: '', name_am: '', weight: '', attendance: false }])}
              disabled={rows.length >= MAX_PARTS}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} />
              {t('Add part', 'ምዘና ጨምር')}
            </button>
            <button type="button" onClick={applyExample} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded">
              {t('Use example 10 · 15 · 25 · 50', 'ምሳሌ ተጠቀም 10 · 15 · 25 · 50')}
            </button>
          </div>
          <span className={`text-sm font-bold font-mono ${total === 100 ? 'text-emerald-600' : 'text-red-600'}`}>
            {t('Total', 'ድምር')}: {total} / 100
          </span>
        </div>

        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {t(
            'A part “from attendance” is filled in for each student from their roll calls (present and late count, excused days are left out); the teacher can still change it. Grades already entered keep the weights they were entered with until they are edited and saved again.',
            '“ከተገኝነት” የሚለው ምዘና ከተማሪው የክትትል መዝገብ ይሞላል (የተገኘና የዘገየ ይቆጠራል፣ በፈቃድ የቀረ አይቆጠርም)፤ አስተማሪው ሊያስተካክለው ይችላል። ቀድሞ የገቡ ውጤቶች እንደገና እስኪስተካከሉ ድረስ በገቡበት ክፍፍል ይቆያሉ።'
          )}
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs py-2">
            {t('Cancel', 'ሰርዝ')}
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary text-xs py-2 px-4 disabled:opacity-60">
            {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save weights', 'ክፍፍሉን አስቀምጥ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
