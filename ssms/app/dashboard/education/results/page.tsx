'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Search, FileText } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminToast } from '@/components/admin/AdminModeNotice';
import { EducationNotice } from '@/components/education/EducationNotice';
import { useEducation } from '@/lib/education/client';
import { PASS_MARK, letterGrade } from '@/lib/education/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

interface StudentResult {
  id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
  class: string;
  class_id: string;
  subjects: number; // approved grades counted
  pending: number;
  average: number | null;
  rank: number | null; // within class, among students with results
  classSize: number;
}

export default function ResultsPage() {
  const { t, locale } = useLang();
  const { students, grades, classes, years, activeYearId, mode } = useEducation();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const year = years.find((y) => y.id === activeYearId);

  // Average of approved grades per student; rank within the class.
  const results: StudentResult[] = useMemo(() => {
    const rows = students
      .filter((s) => s.status === 'ACTIVE')
      .map((s) => {
        const mine = grades.filter((g) => g.student_id === s.id);
        const approved = mine.filter((g) => g.status === 'APPROVED');
        const average = approved.length
          ? Math.round((approved.reduce((sum, g) => sum + g.total, 0) / approved.length) * 10) / 10
          : null;
        return {
          id: s.id,
          reg_no: s.reg_no,
          name_en: s.name_en,
          name_am: s.name_am,
          class: s.class,
          class_id: s.class_id,
          subjects: approved.length,
          pending: mine.length - approved.length,
          average,
          rank: null as number | null,
          classSize: 0,
        };
      });

    const byClass = new Map<string, StudentResult[]>();
    for (const r of rows) byClass.set(r.class_id, [...(byClass.get(r.class_id) ?? []), r]);
    for (const group of byClass.values()) {
      const ranked = group.filter((r) => r.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
      ranked.forEach((r, i) => {
        // Equal averages share a rank
        r.rank = i > 0 && ranked[i - 1].average === r.average ? ranked[i - 1].rank : i + 1;
      });
      for (const r of group) r.classSize = ranked.length;
    }
    return rows.sort(
      (a, b) => a.class.localeCompare(b.class) || (a.rank ?? 9999) - (b.rank ?? 9999) || a.name_en.localeCompare(b.name_en)
    );
  }, [students, grades]);

  const needle = search.toLowerCase();
  const filtered = results.filter(
    (s) =>
      (classFilter === 'ALL' || s.class_id === classFilter) &&
      ((locale === 'am' ? s.name_am : s.name_en).toLowerCase().includes(needle) ||
        s.reg_no.toLowerCase().includes(needle) ||
        s.class.toLowerCase().includes(needle))
  );

  const withResults = filtered.filter((r) => r.average !== null);
  const passed = withResults.filter((r) => (r.average ?? 0) >= PASS_MARK).length;

  const exportExcel = async () => {
    const header = [
      t('Reg. No', 'የምዝገባ ቁጥር'), t('Name', 'ስም'), t('Name (Amharic)', 'ስም (አማርኛ)'), t('Class', 'ክፍል'),
      t('Subjects graded', 'የተመዘኑ ትምህርቶች'), t('Average %', 'አማካይ %'), t('Grade', 'ደረጃ'),
      t('Rank in class', 'በክፍል ደረጃ'), t('Status', 'ሁኔታ'),
    ].map(headerCell);
    const body = filtered.map((r) => [
      r.reg_no, r.name_en, cell(r.name_am), r.class, r.subjects,
      r.average, r.average === null ? null : letterGrade(r.average),
      r.rank === null ? null : `${r.rank} / ${r.classSize}`,
      r.average === null ? t('No results', 'ውጤት የለም') : r.average >= PASS_MARK ? t('Promoted', 'አልፏል') : t('Detained', 'ደግሟል'),
    ]);
    try {
      await downloadXlsx(`results_${year?.name.replace('/', '-') ?? ''}_${todayIso()}`, [header, ...body], {
        sheet: 'Results',
        widths: [16, 24, 24, 24, 10, 10, 8, 12, 12],
      });
    } catch {
      setToast({ kind: 'error', text: t('Could not create the Excel file.', 'የኤክሴል ፋይሉን መፍጠር አልተቻለም።') });
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Term Results & Report Cards', 'የሩብ ዓመት ውጤቶችና ሪፖርት ካርድ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              `Averages from approved grades${year ? ` — ${year.name}` : ''}. Pass mark ${PASS_MARK}%.`,
              `ከጸደቁ ውጤቶች የተሰላ አማካይ${year ? ` — ${year.name}` : ''}። ማለፊያ ${PASS_MARK}%።`
            )}
          </p>
        </div>
        <button
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <Download size={14} />
          {t('Export Excel', 'ኤክሴል አውርድ')}
        </button>
      </div>

      <EducationNotice needs="year" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{withResults.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Students with results', 'ውጤት ያላቸው ተማሪዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{passed}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Promoted', 'ያለፉ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-red-500">{withResults.length - passed}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Below pass mark', 'ከማለፊያ በታች')}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search student or class...', 'ተማሪ ወይም ክፍል ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-input text-xs py-1.5 px-3"
            >
              <option value="ALL">{t('All Classes', 'ሁሉም ክፍሎች')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400 font-medium">
              {filtered.length} {t('students', 'ተማሪዎች')}
            </span>
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Reg No', 'የምዝገባ ቁጥር')}</th>
                <th>{t('Student', 'ተማሪ')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Subjects', 'ትምህርቶች')}</th>
                <th>{t('Average Score', 'አማካይ ውጤት')}</th>
                <th>{t('Rank in Class', 'በክፍል ደረጃ')}</th>
                <th>{t('Promotion Status', 'የማለፍ ሁኔታ')}</th>
                <th className="text-right">{t('Report Card', 'ሪፖርት ካርድ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-blue-600 font-semibold">{s.reg_no}</td>
                  <td className="font-semibold text-slate-900">{locale === 'am' ? s.name_am : s.name_en}</td>
                  <td className="text-slate-600 text-xs">{s.class}</td>
                  <td className="text-xs text-slate-600">
                    {s.subjects}
                    {s.pending > 0 && (
                      <span className="text-amber-600"> (+{s.pending} {t('pending', 'በመጠባበቅ')})</span>
                    )}
                  </td>
                  <td className="font-bold text-slate-800">
                    {s.average === null ? '—' : `${s.average}% (${letterGrade(s.average)})`}
                  </td>
                  <td>
                    {s.rank === null ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        #{s.rank} / {s.classSize}
                      </span>
                    )}
                  </td>
                  <td>
                    {s.average === null ? (
                      <span className="badge badge-info">{t('No results yet', 'ገና ውጤት የለም')}</span>
                    ) : (
                      <span className={s.average >= PASS_MARK ? 'badge badge-success' : 'badge badge-danger'}>
                        {s.average >= PASS_MARK ? t('Promoted', 'አልፏል') : t('Detained', 'ደግሟል')}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/people/students/${s.id}/report-card`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      <FileText size={12} />
                      {t('View Card', 'ካርድ እይ')}
                    </Link>
                  </td>
                </tr>
              ))}
              {mode !== 'loading' && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-slate-400 py-8">
                    {t('No students found', 'ምንም ተማሪ አልተገኘም')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
