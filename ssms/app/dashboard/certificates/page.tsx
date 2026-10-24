'use client';

// Certificates and spiritual courses. Courses (with who completed them) give
// course certificates; graduation, service, membership and appreciation
// certificates are given to chosen people. Certificates print one per A4
// page (landscape) with a QR code that opens the public /verify page.
// Server work: ./actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, Pencil, Plus, Printer, Search, Trash2, X, XCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { QrCode } from '@/components/common/QrCode';
import { ErrorBox, Field } from '@/components/finance/GlShared';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  CERTIFICATE_KINDS,
  COURSE_KINDS,
  RESULTS,
  fillReason,
  type Certificate,
  type CertificateKind,
  type CertificatesData,
  type CompletionResult,
  type Course,
  type CourseKind,
  type PersonOption,
} from '@/lib/certificates/types';
import {
  deleteCourse,
  findPeople,
  issueCertificates,
  loadCertificates,
  recordCompletions,
  removeCompletion,
  revokeCertificate,
  saveCourse,
} from './actions';

type Tr = (en: string, am: string) => string;
type Tab = 'certificates' | 'courses';
type IssueForm = {
  kind: CertificateKind;
  people: PersonOption[];
  completion_ids: string[];
  subject_en: string;
  subject_am: string;
  title_en: string;
  title_am: string;
  issued_on: string;
};
type CourseForm = { id: string; name_en: string; name_am: string; kind: CourseKind; hours: string; description: string; is_active: boolean };

const EMPTY: CertificatesData = { courses: [], completions: [], certificates: [], school: ['', ''], canManage: false };

export default function CertificatesPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<CertificatesData>(EMPTY);
  const [tab, setTab] = useState<Tab>('certificates');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [printing, setPrinting] = useState<Certificate[]>([]);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadCertificates>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  const reload = useCallback(async () => apply(await loadCertificates()), [apply]);
  useEffect(() => {
    loadCertificates().then(apply);
  }, [apply]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const print = (list: Certificate[]) => {
    setPrinting(list);
    setTimeout(() => window.print(), 300);
  };

  // Issuing, shared by both tabs
  const [issue, setIssue] = useState<IssueForm | null>(null);
  const openIssue = (kind: CertificateKind, people: PersonOption[] = [], completion_ids: string[] = []) => {
    const k = CERTIFICATE_KINDS[kind];
    setIssue({ kind, people, completion_ids, subject_en: '', subject_am: '', title_en: k.title[0], title_am: k.title[1], issued_on: todayIso() });
  };

  return (
    <>
      <div className="space-y-5 print:hidden">
        <AdminToast toast={toast} />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Certificates and courses', 'የምስክር ወረቀቶችና ኮርሶች')}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {t('Spiritual courses and who completed them, and certificates that anyone can check with their QR code', 'መንፈሳዊ ኮርሶችና ያጠናቀቁ፣ እንዲሁም በQR ኮዳቸው ማንም ሊያረጋግጣቸው የሚችሉ የምስክር ወረቀቶች')}
            </p>
          </div>
          {data.canManage && tab === 'certificates' && (
            <button onClick={() => openIssue('GRADUATION')} disabled={mode !== 'live'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
              <Award size={14} /> {t('Give certificates', 'የምስክር ወረቀት ስጥ')}
            </button>
          )}
        </div>

        <div className="flex gap-1">
          {(
            [
              ['certificates', t('Certificates', 'የምስክር ወረቀቶች'), Award],
              ['courses', t('Courses and completions', 'ኮርሶችና ያጠናቀቁ'), BookOpen],
            ] as [Tab, string, React.ElementType][]
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${tab === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <AdminModeNotice mode={mode} error={error} />

        {mode === 'live' && tab === 'certificates' && <CertificatesTab data={data} t={t} locale={locale} onPrint={print} onChanged={reload} say={say} />}
        {mode === 'live' && tab === 'courses' && (
          <CoursesTab data={data} t={t} locale={locale} onChanged={reload} say={say} onIssue={(ids) => openIssue('COURSE', [], ids)} />
        )}

        {issue && (
          <IssueModal
            form={issue}
            setForm={setIssue}
            t={t}
            locale={locale}
            onDone={async (ids) => {
              setIssue(null);
              say('success', t(`${ids.length} certificate(s) given`, `${ids.length} የምስክር ወረቀት ተሰጥቷል`));
              const res = await loadCertificates();
              apply(res);
              if (res.mode === 'live' && window.confirm(t('Print them now?', 'አሁን ይታተሙ?'))) {
                print(res.data.certificates.filter((c) => ids.includes(c.id)));
              }
            }}
          />
        )}
      </div>

      {/* What prints: one certificate per page */}
      <div className="hidden print:block">
        {printing.map((c) => (
          <CertificateSheet key={c.id} c={c} school={data.school} />
        ))}
      </div>
    </>
  );
}

// ── Certificates ─────────────────────────────────────────────────────────────

function CertificatesTab({
  data,
  t,
  locale,
  onPrint,
  onChanged,
  say,
}: {
  data: CertificatesData;
  t: Tr;
  locale: string;
  onPrint: (list: Certificate[]) => void;
  onChanged: () => Promise<void>;
  say: (kind: 'success' | 'error', text: string) => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<CertificateKind | ''>('');
  const [showRevoked, setShowRevoked] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState<{ id: string; no: string; reason: string } | null>(null);

  const s = q.trim().toLowerCase();
  const list = data.certificates.filter(
    (c) =>
      (showRevoked || !c.revoked_at) &&
      (!kind || c.kind === kind) &&
      (!s || c.certificate_no.toLowerCase().includes(s) || c.person_name_en.toLowerCase().includes(s) || c.person_name_am.includes(q.trim()) || c.title_en.toLowerCase().includes(s))
  );
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="card overflow-hidden">
      <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search number, name or title', 'ቁጥር፣ ስም ወይም ርዕስ ፈልግ')} className="form-input text-sm pl-8" />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as CertificateKind | '')} className="form-input text-sm w-auto">
          <option value="">{t('All kinds', 'ሁሉም ዓይነቶች')}</option>
          {(Object.keys(CERTIFICATE_KINDS) as CertificateKind[]).map((k) => (
            <option key={k} value={k}>{t(...CERTIFICATE_KINDS[k].title)}</option>
          ))}
        </select>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} /> {t('Show revoked', 'የተሰረዙትንም አሳይ')}
        </label>
        <button
          onClick={() => onPrint(data.certificates.filter((c) => picked.has(c.id) && !c.revoked_at))}
          disabled={picked.size === 0}
          className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Printer size={14} /> {t('Print chosen', 'የተመረጡትን አትም')} ({picked.size})
        </button>
      </div>
      <div className="table-container rounded-none border-0">
        <table>
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={list.length > 0 && list.every((c) => picked.has(c.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(list.filter((c) => !c.revoked_at).map((c) => c.id)) : new Set())}
                />
              </th>
              <th>{t('No.', 'ቁጥር')}</th>
              <th>{t('Name', 'ስም')}</th>
              <th className="hidden md:table-cell">{t('Certificate', 'የምስክር ወረቀት')}</th>
              <th>{t('Given', 'የተሰጠበት')}</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={c.revoked_at ? 'opacity-60' : ''}>
                <td>{!c.revoked_at && <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />}</td>
                <td className="font-mono text-xs whitespace-nowrap">{c.certificate_no}</td>
                <td className="text-sm">
                  {locale === 'am' ? c.person_name_am : c.person_name_en}
                  {c.revoked_at && <div className="text-[11px] text-red-600">{t('Revoked', 'ተሰርዟል')}: {c.revoked_reason}</div>}
                </td>
                <td className="hidden md:table-cell text-xs text-slate-600">
                  {locale === 'am' ? c.title_am || c.title_en : c.title_en}
                  <div className="text-[11px] text-slate-400">{locale === 'am' ? c.reason_am || c.reason_en : c.reason_en}</div>
                </td>
                <td className="text-xs whitespace-nowrap">{formatEthiopianDate(c.issued_on, locale as 'en' | 'am')}</td>
                <td className="text-right whitespace-nowrap">
                  {!c.revoked_at && (
                    <>
                      <button onClick={() => onPrint([c])} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={t('Print', 'አትም')}>
                        <Printer size={14} />
                      </button>
                      {data.canManage && (
                        <button onClick={() => setRevoking({ id: c.id, no: c.certificate_no, reason: '' })} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title={t('Revoke', 'ሰርዝ')}>
                          <XCircle size={14} />
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('No certificates yet', 'እስካሁን የምስክር ወረቀት የለም')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={Boolean(revoking)} onClose={() => setRevoking(null)} title={t('Revoke certificate', 'የምስክር ወረቀቱን ሰርዝ')} subtitle={revoking?.no}>
        {revoking && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t('It stays on record; its verify page will say it is no longer valid.', 'በመዝገብ ይቆያል፤ የማረጋገጫ ገጹ ከእንግዲህ የማይሠራ መሆኑን ያሳያል።')}</p>
            <textarea rows={2} value={revoking.reason} onChange={(e) => setRevoking({ ...revoking, reason: e.target.value })} placeholder={t('Why?', 'ለምን?')} className="form-input text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRevoking(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ተው')}</button>
              <button
                onClick={async () => {
                  const r = revoking;
                  const res = await revokeCertificate(r.id, r.reason);
                  if (!res.ok) return say('error', res.error);
                  setRevoking(null);
                  say('success', t('Revoked', 'ተሰርዟል'));
                  await onChanged();
                }}
                className="btn btn-primary text-xs"
              >
                {t('Revoke', 'ሰርዝ')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Courses ──────────────────────────────────────────────────────────────────

function CoursesTab({
  data,
  t,
  locale,
  onChanged,
  say,
  onIssue,
}: {
  data: CertificatesData;
  t: Tr;
  locale: string;
  onChanged: () => Promise<void>;
  say: (kind: 'success' | 'error', text: string) => void;
  onIssue: (completionIds: string[]) => void;
}) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const [form, setForm] = useState<CourseForm | null>(null);
  const [formError, setFormError] = useState('');
  const [record, setRecord] = useState<{ people: PersonOption[]; completed_on: string; result: CompletionResult; note: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const course = data.courses.find((c) => c.id === courseId) ?? null;
  const done = data.completions.filter((c) => c.course_id === courseId);
  const cname = (c: Pick<Course, 'name_en' | 'name_am'>) => (locale === 'am' ? c.name_am || c.name_en : c.name_en);

  const submitCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError('');
    const res = await saveCourse(form);
    if (!res.ok) return setFormError(res.error);
    setForm(null);
    say('success', t('Course saved', 'ኮርሱ ተቀምጧል'));
    await onChanged();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
      <div className="card overflow-hidden self-start">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">{t('Courses', 'ኮርሶች')}</span>
          {data.canManage && (
            <button
              onClick={() => {
                setFormError('');
                setForm({ id: '', name_en: '', name_am: '', kind: 'COURSE', hours: '', description: '', is_active: true });
              }}
              className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1"
            >
              <Plus size={13} /> {t('Add', 'ጨምር')}
            </button>
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {data.courses.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  setCourseId(c.id);
                  setPicked(new Set());
                }}
                className={`w-full text-left px-3 py-2.5 ${c.id === courseId ? 'bg-blue-50' : 'hover:bg-slate-50'} ${c.is_active ? '' : 'opacity-50'}`}
              >
                <div className="text-sm font-semibold text-slate-800">{cname(c)}</div>
                <div className="text-[11px] text-slate-500">
                  {t(...COURSE_KINDS[c.kind])}
                  {c.hours ? ` · ${c.hours} ${t('hours', 'ሰዓት')}` : ''} · {c.completed} {t('completed', 'አጠናቀዋል')}
                </div>
              </button>
            </li>
          ))}
          {data.courses.length === 0 && <li className="p-4 text-sm text-slate-400">{t('No courses yet', 'እስካሁን ኮርስ የለም')}</li>}
        </ul>
      </div>

      {course && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-bold text-slate-900">{cname(course)}</div>
              {course.description && <div className="text-xs text-slate-500 mt-0.5">{course.description}</div>}
            </div>
            {data.canManage && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setFormError('');
                    setForm({ id: course.id, name_en: course.name_en, name_am: course.name_am, kind: course.kind, hours: course.hours ? String(course.hours) : '', description: course.description, is_active: course.is_active });
                  }}
                  className="btn btn-secondary text-xs inline-flex items-center gap-1"
                >
                  <Pencil size={12} /> {t('Edit', 'አርትዕ')}
                </button>
                {course.completed === 0 && (
                  <button
                    onClick={async () => {
                      if (!window.confirm(t('Delete this course?', 'ይህ ኮርስ ይሰረዝ?'))) return;
                      const res = await deleteCourse(course.id);
                      if (!res.ok) return say('error', res.error);
                      await onChanged();
                    }}
                    className="btn btn-secondary text-xs text-red-600 inline-flex items-center gap-1"
                  >
                    <Trash2 size={12} /> {t('Delete', 'ሰርዝ')}
                  </button>
                )}
                <button onClick={() => setRecord({ people: [], completed_on: todayIso(), result: 'COMPLETED', note: '' })} className="btn btn-primary text-xs inline-flex items-center gap-1">
                  <Plus size={12} /> {t('Record who completed it', 'ያጠናቀቁትን መዝግብ')}
                </button>
              </div>
            )}
          </div>
          {data.canManage && picked.size > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between text-sm">
              <span>{picked.size} {t('chosen', 'ተመርጠዋል')}</span>
              <button onClick={() => onIssue([...picked])} className="btn btn-primary text-xs inline-flex items-center gap-1">
                <Award size={13} /> {t('Give certificates', 'የምስክር ወረቀት ስጥ')}
              </button>
            </div>
          )}
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  {data.canManage && <th className="w-8" />}
                  <th>{t('Name', 'ስም')}</th>
                  <th>{t('Completed', 'ያጠናቀቀበት')}</th>
                  <th>{t('Result', 'ውጤት')}</th>
                  <th>{t('Certificate', 'የምስክር ወረቀት')}</th>
                  {data.canManage && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {done.map((c) => (
                  <tr key={c.id}>
                    {data.canManage && (
                      <td>
                        {!c.certificate_no && (
                          <input
                            type="checkbox"
                            checked={picked.has(c.id)}
                            onChange={() =>
                              setPicked((p) => {
                                const n = new Set(p);
                                if (n.has(c.id)) n.delete(c.id);
                                else n.add(c.id);
                                return n;
                              })
                            }
                          />
                        )}
                      </td>
                    )}
                    <td className="text-sm">
                      {locale === 'am' ? c.name_am : c.name}
                      <div className="text-[10px] font-mono text-slate-400">{c.code}</div>
                    </td>
                    <td className="text-xs">{formatEthiopianDate(c.completed_on, locale as 'en' | 'am')}</td>
                    <td className="text-xs">{t(...RESULTS[c.result])}</td>
                    <td className="font-mono text-xs">{c.certificate_no || '—'}</td>
                    {data.canManage && (
                      <td className="text-right">
                        {!c.certificate_no && (
                          <button
                            onClick={async () => {
                              const res = await removeCompletion(c.id);
                              if (!res.ok) return say('error', res.error);
                              await onChanged();
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {done.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('No one recorded yet', 'እስካሁን የተመዘገበ የለም')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? t('Edit course', 'ኮርስ አርትዕ') : t('New course', 'አዲስ ኮርስ')}>
        {form && (
          <form onSubmit={submitCourse} className="space-y-3">
            {formError && <ErrorBox text={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('Name (English)', 'ስም (እንግሊዝኛ)') + ' *'}>
                <input required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Name (Amharic)', 'ስም (አማርኛ)')}>
                <input value={form.name_am} onChange={(e) => setForm({ ...form, name_am: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Kind', 'ዓይነት')}>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CourseKind })} className="form-input text-sm">
                  {(Object.keys(COURSE_KINDS) as CourseKind[]).map((k) => (
                    <option key={k} value={k}>{t(...COURSE_KINDS[k])}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Hours', 'ሰዓት')}>
                <input type="number" min="0" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className="form-input text-sm" />
              </Field>
            </div>
            <Field label={t('Description', 'መግለጫ')}>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-input text-sm" />
            </Field>
            {form.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> {t('Active', 'ንቁ')}
              </label>
            )}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ተው')}</button>
              <button type="submit" className="btn btn-primary text-xs">{t('Save', 'አስቀምጥ')}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(record)} onClose={() => setRecord(null)} title={t('Record who completed it', 'ያጠናቀቁትን መዝግብ')} subtitle={course ? cname(course) : ''}>
        {record && course && (
          <div className="space-y-3">
            <PeoplePicker value={record.people} onChange={(people) => setRecord({ ...record, people })} t={t} locale={locale} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Completed on', 'ያጠናቀቁበት ቀን')}>
                <input type="date" value={record.completed_on} onChange={(e) => setRecord({ ...record, completed_on: e.target.value })} className="form-input text-sm" />
              </Field>
              <Field label={t('Result', 'ውጤት')}>
                <select value={record.result} onChange={(e) => setRecord({ ...record, result: e.target.value as CompletionResult })} className="form-input text-sm">
                  {(Object.keys(RESULTS) as CompletionResult[]).map((r) => (
                    <option key={r} value={r}>{t(...RESULTS[r])}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => setRecord(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ተው')}</button>
              <button
                disabled={record.people.length === 0}
                onClick={async () => {
                  const res = await recordCompletions({ course_id: course.id, person_ids: record.people.map((p) => p.id), completed_on: record.completed_on, result: record.result, note: record.note });
                  if (!res.ok) return say('error', res.error);
                  setRecord(null);
                  say('success', t(`${res.added} recorded`, `${res.added} ተመዝግበዋል`));
                  await onChanged();
                }}
                className="btn btn-primary text-xs disabled:opacity-50"
              >
                {t('Save', 'አስቀምጥ')} ({record.people.length})
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function PeoplePicker({ value, onChange, t, locale }: { value: PersonOption[]; onChange: (p: PersonOption[]) => void; t: Tr; locale: string }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PersonOption[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const res = await findPeople(q);
      setFound(res.ok ? res.people : []);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const chosen = new Set(value.map((p) => p.id));
  const shown = q.trim().length < 2 ? [] : found.filter((p) => !chosen.has(p.id));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a name, code or phone', 'ስም፣ ኮድ ወይም ስልክ ፈልግ')} className="form-input text-sm pl-8" />
      </div>
      {shown.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange([...value, p])} className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50">
                {locale === 'am' ? p.name_am : p.name} <span className="text-[10px] font-mono text-slate-400">{p.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 text-xs px-2 py-1">
              {locale === 'am' ? p.name_am : p.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== p.id))} aria-label={t('Remove', 'አስወግድ')}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function IssueModal({
  form,
  setForm,
  t,
  locale,
  onDone,
}: {
  form: IssueForm;
  setForm: (f: IssueForm | null) => void;
  t: Tr;
  locale: string;
  onDone: (ids: string[]) => Promise<void>;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const byCompletion = form.completion_ids.length > 0;
  const k = CERTIFICATE_KINDS[form.kind];
  const reasonEn = byCompletion ? k.reason[0] : fillReason(k.reason[0], form.subject_en);
  const reasonAm = byCompletion ? k.reason[1] : fillReason(k.reason[1], form.subject_am || form.subject_en);
  const preview = useMemo(() => (byCompletion ? fillReason(k.reason[locale === 'am' ? 1 : 0], t('(the course)', '(ኮርሱ)')) : locale === 'am' ? reasonAm : reasonEn), [byCompletion, k, locale, reasonAm, reasonEn, t]);

  const submit = async () => {
    setBusy(true);
    setErr('');
    const res = await issueCertificates({
      kind: form.kind,
      person_ids: form.people.map((p) => p.id),
      completion_ids: form.completion_ids,
      title_en: form.title_en,
      title_am: form.title_am,
      reason_en: reasonEn,
      reason_am: reasonAm,
      issued_on: form.issued_on,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    await onDone(res.ids);
  };

  return (
    <Modal isOpen onClose={() => setForm(null)} title={t('Give certificates', 'የምስክር ወረቀት ስጥ')} maxWidth="lg">
      <div className="space-y-3">
        {err && <ErrorBox text={err} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('Kind', 'ዓይነት')}>
            <select
              value={form.kind}
              disabled={byCompletion}
              onChange={(e) => {
                const kind = e.target.value as CertificateKind;
                setForm({ ...form, kind, title_en: CERTIFICATE_KINDS[kind].title[0], title_am: CERTIFICATE_KINDS[kind].title[1] });
              }}
              className="form-input text-sm disabled:bg-slate-50"
            >
              {(Object.keys(CERTIFICATE_KINDS) as CertificateKind[]).map((x) => (
                <option key={x} value={x}>{t(...CERTIFICATE_KINDS[x].title)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('Date given', 'የተሰጠበት ቀን')}>
            <input type="date" value={form.issued_on} onChange={(e) => setForm({ ...form, issued_on: e.target.value })} className="form-input text-sm" />
          </Field>
          <Field label={t('Title (English)', 'ርዕስ (እንግሊዝኛ)')}>
            <input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} className="form-input text-sm" />
          </Field>
          <Field label={t('Title (Amharic)', 'ርዕስ (አማርኛ)')}>
            <input value={form.title_am} onChange={(e) => setForm({ ...form, title_am: e.target.value })} className="form-input text-sm" />
          </Field>
          {!byCompletion && (
            <>
              <Field label={t('For what / where (English)', 'ለምን / የት (እንግሊዝኛ)')}>
                <input value={form.subject_en} onChange={(e) => setForm({ ...form, subject_en: e.target.value })} placeholder={t('e.g. the Children’s Department, 2018 E.C.', 'ለምሳሌ the Children’s Department')} className="form-input text-sm" />
              </Field>
              <Field label={t('For what / where (Amharic)', 'ለምን / የት (አማርኛ)')}>
                <input value={form.subject_am} onChange={(e) => setForm({ ...form, subject_am: e.target.value })} placeholder="ለምሳሌ፡ የሕፃናት ክፍል" className="form-input text-sm" />
              </Field>
            </>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
          <span className="text-[11px] text-slate-400 block">{t('Will read', 'የሚነበበው')}</span>
          {preview}
        </div>
        {byCompletion ? (
          <p className="text-xs text-slate-500">{t(`${form.completion_ids.length} people who completed the course`, `ኮርሱን ያጠናቀቁ ${form.completion_ids.length} ሰዎች`)}</p>
        ) : (
          <PeoplePicker value={form.people} onChange={(people) => setForm({ ...form, people })} t={t} locale={locale} />
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={() => setForm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ተው')}</button>
          <button onClick={submit} disabled={busy || (!byCompletion && form.people.length === 0)} className="btn btn-primary text-xs disabled:opacity-50">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Give', 'ስጥ')} ({byCompletion ? form.completion_ids.length : form.people.length})
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** One certificate on an A4 page (landscape) */
function CertificateSheet({ c, school }: { c: Certificate; school: [string, string] }) {
  const verify = typeof window !== 'undefined' ? `${window.location.origin}/verify/${c.verify_code}` : '';
  return (
    <section className="print-landscape break-after-page h-[180mm] p-[6mm] bg-white">
      <div className="h-full border-[5px] border-double border-[#1e2770] p-[10mm] flex flex-col items-center text-center relative">
        <TenantLogo size={70} />
        <div className="mt-2 text-[15px] font-bold text-slate-800 leading-snug">{school[1].split(' · ').join(' — ')}</div>
        <div className="text-[11px] text-slate-500">{school[0]}</div>
        <div className="mt-5 text-[30px] font-black tracking-wide text-[#1e2770]">{c.title_am || c.title_en}</div>
        {c.title_am && <div className="text-[16px] font-semibold uppercase tracking-[0.2em] text-slate-600">{c.title_en}</div>}
        <div className="mt-5 text-[13px] text-slate-600">ይህ የምስክር ወረቀት የተሰጠው ለ · This is to certify that</div>
        <div className="mt-2 text-[28px] font-bold text-slate-900 border-b border-slate-300 px-10 pb-1">{c.person_name_am}</div>
        {c.person_name_am !== c.person_name_en && <div className="text-[15px] text-slate-700 mt-1">{c.person_name_en}</div>}
        {(c.reason_am || c.reason_en) && (
          <div className="mt-4 text-[14px] text-slate-700 max-w-[200mm]">
            {c.reason_am && <div>{c.reason_am}</div>}
            {c.reason_en && <div className="text-slate-600">{c.reason_en}</div>}
          </div>
        )}
        <div className="mt-3 text-[12px] text-slate-600">
          {formatEthiopianDate(c.issued_on, 'am')} ዓ.ም. · {formatEthiopianDate(c.issued_on, 'en')} ({c.issued_on})
        </div>
        <div className="mt-auto w-full flex items-end justify-between gap-6">
          <div className="flex-1 grid grid-cols-2 gap-10 text-[11px] text-slate-600">
            <div className="border-t border-slate-500 pt-1">ሰብሳቢ · Chairperson</div>
            <div className="border-t border-slate-500 pt-1">ጸሐፊ · Secretary</div>
          </div>
          <div className="flex flex-col items-center">
            {verify && <QrCode value={verify} size={72} />}
            <div className="mt-1 font-mono text-[10px] text-slate-600">{c.certificate_no}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
