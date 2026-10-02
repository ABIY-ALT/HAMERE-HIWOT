'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronDown,
  CornerUpLeft,
  FilePlus2,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import {
  cancelRequest,
  markRequestPaid,
  resubmitRequest,
  reviewRequest,
  submitRequest,
  useFinance,
} from '@/lib/finance/client';
import {
  EXPENSE_CATEGORIES,
  categoryLabel,
  formatETB,
  type FinanceRequest,
  type RequestPriority,
  type RequestStatus,
} from '@/lib/finance/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

type Toast = { kind: 'success' | 'error'; text: string } | null;
type Tab = 'mine' | 'review' | 'pay' | 'all';

const STATUS_STYLE: Record<RequestStatus, string> = {
  PENDING: 'badge badge-warning',
  APPROVED: 'badge badge-info',
  REJECTED: 'badge badge-danger',
  RETURNED: 'badge badge-warning',
  COMPLETED: 'badge badge-success',
  CANCELLED: 'badge bg-slate-100 text-slate-500',
};

const PRIORITY_STYLE: Record<RequestPriority, string> = {
  LOW: 'text-slate-500',
  NORMAL: 'text-slate-700',
  HIGH: 'text-amber-600 font-semibold',
  URGENT: 'text-red-600 font-bold',
};

const EMPTY_FORM = {
  unit_id: '',
  title: '',
  category: EXPENSE_CATEGORIES[0][0],
  amount: '',
  needed_by: '',
  justification: '',
  priority: 'NORMAL' as RequestPriority,
};

export default function FinanceRequestsPage() {
  const { t, locale } = useLang();
  const { user, can } = useAuth();
  const fin = useFinance();
  const myId = user?.systemUser.id ?? '';
  const myName = user?.person.full_name_en ?? '';

  const isApprover = can('FINANCE_APPROVE');
  const isPayer = can('FINANCE_CREATE');
  const isStaff = can('FINANCE_VIEW') || isApprover || isPayer;
  const canRequest = can('FINANCE_REQUEST') || isPayer;

  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [resubmitId, setResubmitId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fin.requests.find((r) => r.id === selectedId) ?? null;

  const statusLabel = (s: RequestStatus) =>
    ({
      PENDING: t('Awaiting approval', 'ማጽደቅ በመጠባበቅ ላይ'),
      APPROVED: t('Approved — to be paid', 'ጸድቋል — ክፍያ ይጠብቃል'),
      REJECTED: t('Rejected', 'ውድቅ ተደርጓል'),
      RETURNED: t('Returned for changes', 'ለማስተካከያ ተመልሷል'),
      COMPLETED: t('Paid', 'ተከፍሏል'),
      CANCELLED: t('Cancelled', 'ተሰርዟል'),
    })[s];
  const priorityLabel = (p: RequestPriority) =>
    ({ LOW: t('Low', 'ዝቅተኛ'), NORMAL: t('Normal', 'መደበኛ'), HIGH: t('High', 'ከፍተኛ'), URGENT: t('Urgent', 'አስቸኳይ') })[p];

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Tabs ──
  const mine = fin.requests.filter((r) => r.requested_by_id === myId);
  const pending = fin.requests.filter((r) => r.status === 'PENDING');
  const toPay = fin.requests.filter((r) => r.status === 'APPROVED');
  const tabs: { key: Tab; label: string; count: number }[] = [
    ...(canRequest ? [{ key: 'mine' as Tab, label: t('My requests', 'የእኔ ጥያቄዎች'), count: mine.length }] : []),
    ...(isApprover ? [{ key: 'review' as Tab, label: t('Awaiting approval', 'ማጽደቅ የሚጠብቁ'), count: pending.length }] : []),
    ...(isPayer ? [{ key: 'pay' as Tab, label: t('Ready to pay', 'ለክፍያ ዝግጁ'), count: toPay.length }] : []),
    {
      key: 'all' as Tab,
      label: isStaff ? t('All requests', 'ሁሉም ጥያቄዎች') : t('My department', 'የክፍሌ ጥያቄዎች'),
      count: fin.requests.length,
    },
  ];
  const defaultTab: Tab =
    isApprover && pending.length ? 'review' : isPayer && toPay.length ? 'pay' : canRequest ? 'mine' : 'all';
  const tab = chosenTab && tabs.some((x) => x.key === chosenTab) ? chosenTab : defaultTab;

  const base = tab === 'mine' ? mine : tab === 'review' ? pending : tab === 'pay' ? toPay : fin.requests;
  const needle = search.toLowerCase();
  const rows = base.filter(
    (r) =>
      r.request_no.toLowerCase().includes(needle) ||
      r.title.toLowerCase().includes(needle) ||
      (locale === 'am' ? r.unit_am : r.unit).toLowerCase().includes(needle) ||
      r.requested_by.toLowerCase().includes(needle)
  );

  const sum = (list: FinanceRequest[]) => list.reduce((s, r) => s + r.amount, 0);
  const year = String(new Date().getFullYear());
  const paidThisYear = fin.requests.filter((r) => r.status === 'COMPLETED' && (r.paid_at ?? '').startsWith(year));

  // ── Form ──
  const openNew = () => {
    setResubmitId(null);
    setForm({ ...EMPTY_FORM, unit_id: fin.units.length === 1 ? fin.units[0].id : '' });
    setFormError('');
    setFormOpen(true);
  };

  const openResubmit = (r: FinanceRequest) => {
    setSelectedId(null);
    setResubmitId(r.id);
    setForm({
      unit_id: r.unit_id,
      title: r.title,
      category: r.category,
      amount: String(r.amount),
      needed_by: r.needed_by ?? '',
      justification: r.justification,
      priority: r.priority,
    });
    setFormError('');
    setFormOpen(true);
  };

  const set = (key: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const input = { ...form, amount: Number(form.amount) };
    const res = resubmitId
      ? await resubmitRequest(resubmitId, input)
      : await submitRequest(input, { id: myId, name: myName });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setFormOpen(false);
    setTab('mine');
    showToast(
      'success',
      resubmitId
        ? t('Request resubmitted for approval', 'ጥያቄው ለማጽደቅ እንደገና ቀርቧል')
        : t(
            `Request ${'request_no' in res ? res.request_no : ''} sent to the finance office`,
            `ጥያቄ ${'request_no' in res ? res.request_no : ''} ለፋይናንስ ክፍል ተልኳል`
          )
    );
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Payment Requests', 'የክፍያ ጥያቄዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Departments request money from the finance office; the finance head approves; the treasurer pays.',
              'ክፍሎች ከፋይናንስ ክፍል ገንዘብ ይጠይቃሉ፤ የፋይናንስ ኃላፊው ያጸድቃል፤ ገንዘብ ያዡ ይከፍላል።'
            )}
          </p>
        </div>
        {canRequest && (
          <button
            onClick={openNew}
            disabled={fin.mode === 'loading' || fin.mode === 'error'}
            className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FilePlus2 size={16} />
            {t('New Request', 'አዲስ ጥያቄ')}
          </button>
        )}
      </div>

      <AdminModeNotice mode={fin.mode} error={fin.error} />

      {/* How it works */}
      <div className="card">
        <button
          onClick={() => setShowHelp((s) => !s)}
          className="w-full p-4 flex items-center justify-between text-sm font-semibold text-slate-700"
        >
          {t('How does a request work?', 'ጥያቄ እንዴት ይሠራል?')}
          <ChevronDown size={16} className={`transition-transform ${showHelp ? 'rotate-180' : ''}`} />
        </button>
        {showHelp && (
          <ol className="px-5 pb-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {[
              [t('1. Department head', '1. የክፍል ኃላፊ'), t('Clicks "New Request", fills in the amount and the reason, and sends it.', '"አዲስ ጥያቄ" ተጭኖ መጠኑንና ምክንያቱን ሞልቶ ይልካል።')],
              [t('2. Finance head', '2. የፋይናንስ ኃላፊ'), t('Approves it, rejects it, or returns it with a note asking for changes.', 'ያጸድቃል፣ ውድቅ ያደርጋል ወይም ማስተካከያ እንዲደረግ በማስታወሻ ይመልሳል።')],
              [t('3. Requester', '3. ጠያቂው'), t('Sees the decision. A returned request can be corrected and resubmitted.', 'ውሳኔውን ያያል። የተመለሰ ጥያቄ ተስተካክሎ እንደገና ሊቀርብ ይችላል።')],
              [t('4. Treasurer', '4. ገንዘብ ያዥ'), t('Pays the approved request and enters the receipt number. It is recorded as an expense.', 'የጸደቀውን ይከፍላል፣ የደረሰኝ ቁጥር ያስገባል። እንደ ወጪ ይመዘገባል።')],
            ].map(([title, text]) => (
              <li key={title} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-bold text-slate-800 mb-1">{title}</div>
                <div className="text-slate-600 leading-relaxed">{text}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-600">{pending.length}</div>
          <div className="text-xs text-slate-500 mt-1">
            {t('Awaiting approval', 'ማጽደቅ የሚጠብቁ')} · {formatETB(sum(pending))}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">{toPay.length}</div>
          <div className="text-xs text-slate-500 mt-1">
            {t('Approved, not yet paid', 'የጸደቁ፣ ገና ያልተከፈሉ')} · {formatETB(sum(toPay))}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{formatETB(sum(paidThisYear))}</div>
          <div className="text-xs text-slate-500 mt-1">{t(`Paid in ${year}`, `በ${year} የተከፈለ`)}</div>
        </div>
      </div>

      {/* Tabs + table */}
      <div className="card overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-100 flex flex-wrap gap-1">
          {tabs.map((x) => (
            <button
              key={x.key}
              onClick={() => setTab(x.key)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === x.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {x.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === x.key ? 'bg-blue-100' : 'bg-slate-100'}`}>
                {x.count}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search requests...', 'ጥያቄዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Request No', 'የጥያቄ ቁጥር')}</th>
                <th>{t('Title', 'ርዕስ')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Requested by', 'ጠያቂ')}</th>
                <th className="text-right">{t('Amount', 'መጠን')}</th>
                <th>{t('Priority', 'ቅድሚያ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs font-semibold text-blue-600">{r.request_no}</td>
                  <td>
                    <div className="font-medium text-slate-900">{r.title}</div>
                    <div className="text-[11px] text-slate-400">{categoryLabel(r.category, locale)}</div>
                  </td>
                  <td className="text-xs text-slate-600">{locale === 'am' ? r.unit_am : r.unit}</td>
                  <td className="text-xs text-slate-600">{r.requested_by}</td>
                  <td className="text-right font-mono text-sm font-semibold text-slate-900 whitespace-nowrap">{formatETB(r.amount)}</td>
                  <td className={`text-xs ${PRIORITY_STYLE[r.priority]}`}>{priorityLabel(r.priority)}</td>
                  <td><span className={STATUS_STYLE[r.status]}>{statusLabel(r.status)}</span></td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50"
                    >
                      {tab === 'review' ? t('Review', 'ገምግም') : tab === 'pay' ? t('Pay', 'ክፈል') : t('Open', 'ክፈት')}
                    </button>
                  </td>
                </tr>
              ))}
              {fin.mode !== 'loading' && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-slate-400 py-8">
                    {tab === 'review'
                      ? t('Nothing is waiting for approval.', 'ማጽደቅ የሚጠብቅ ጥያቄ የለም።')
                      : tab === 'pay'
                        ? t('No approved requests are waiting for payment.', 'ክፍያ የሚጠብቅ የጸደቀ ጥያቄ የለም።')
                        : t('No requests yet.', 'እስካሁን ጥያቄ የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / resubmit form */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={resubmitId ? t('Correct and Resubmit', 'አስተካክለህ እንደገና አቅርብ') : t('New Payment Request', 'አዲስ የክፍያ ጥያቄ')}
        subtitle={t('Sent to the finance office for approval', 'ለማጽደቅ ወደ ፋይናንስ ክፍል ይላካል')}
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}
          {fin.units.length === 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t(
                'Your account is not assigned to a department. Ask the administrator to assign you (Administration → System Users).',
                'መለያዎ ለምንም ክፍል አልተመደበም። አስተዳዳሪውን እንዲመድብዎ ይጠይቁ (አስተዳደር → የስርዓት ተጠቃሚዎች)።'
              )}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Requesting department', 'ጠያቂ ክፍል') + ' *'}>
              <select required value={form.unit_id} onChange={set('unit_id')} className="form-input text-sm">
                <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
                {fin.units.map((u) => (
                  <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Category', 'ዓይነት') + ' *'}>
              <select value={form.category} onChange={set('category')} className="form-input text-sm">
                {EXPENSE_CATEGORIES.map(([en, am]) => (
                  <option key={en} value={en}>{locale === 'am' ? am : en}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t('What is the money for? (title)', 'ገንዘቡ ለምንድን ነው? (ርዕስ)') + ' *'}>
            <input type="text" required value={form.title} onChange={set('title')} placeholder={t('e.g. Teaching materials for Grade 3', 'ለምሳሌ፡ ለ3ኛ ክፍል የማስተማሪያ ቁሳቁስ')} className="form-input text-sm" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('Amount (ETB)', 'መጠን (ብር)') + ' *'}>
              <input type="number" required min="1" step="0.01" value={form.amount} onChange={set('amount')} className="form-input text-sm font-mono" />
            </Field>
            <Field label={t('Needed by', 'የሚያስፈልግበት ቀን')}>
              <input type="date" min={todayIso()} value={form.needed_by} onChange={set('needed_by')} className="form-input text-sm" />
            </Field>
            <Field label={t('Priority', 'ቅድሚያ')}>
              <select value={form.priority} onChange={set('priority')} className="form-input text-sm">
                {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as RequestPriority[]).map((p) => (
                  <option key={p} value={p}>{priorityLabel(p)}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t('Reason / details', 'ምክንያት / ዝርዝር') + ' *'}>
            <textarea required rows={4} value={form.justification} onChange={set('justification')} placeholder={t('Explain why it is needed, what will be bought, quantities, etc.', 'ለምን እንደሚያስፈልግ፣ ምን እንደሚገዛ፣ ብዛቱን ወዘተ ያብራሩ።')} className="form-input text-sm" />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs">
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy || fin.units.length === 0} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
              <Send size={13} />
              {busy ? t('Sending…', 'በመላክ ላይ…') : resubmitId ? t('Resubmit', 'እንደገና አቅርብ') : t('Send Request', 'ጥያቄውን ላክ')}
            </button>
          </div>
        </form>
      </Modal>

      {selected && (
        <RequestDetails
          request={selected}
          myId={myId}
          myName={myName}
          isApprover={isApprover}
          isPayer={isPayer}
          statusLabel={statusLabel}
          priorityLabel={priorityLabel}
          onClose={() => setSelectedId(null)}
          onResubmit={() => openResubmit(selected)}
          onDone={(text) => {
            setSelectedId(null);
            showToast('success', text);
          }}
        />
      )}
    </div>
  );
}

function RequestDetails({
  request: r,
  myId,
  myName,
  isApprover,
  isPayer,
  statusLabel,
  priorityLabel,
  onClose,
  onResubmit,
  onDone,
}: {
  request: FinanceRequest;
  myId: string;
  myName: string;
  isApprover: boolean;
  isPayer: boolean;
  statusLabel: (s: RequestStatus) => string;
  priorityLabel: (p: RequestPriority) => string;
  onClose: () => void;
  onResubmit: () => void;
  onDone: (message: string) => void;
}) {
  const { t, locale } = useLang();
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [payee, setPayee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isMine = r.requested_by_id === myId;
  const canReview = isApprover && r.status === 'PENDING' && !isMine;
  const canPay = isPayer && r.status === 'APPROVED';
  const canCancel = isMine && (r.status === 'PENDING' || r.status === 'RETURNED');

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setError('');
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Error');
    else onDone(success);
  };

  return (
    <Modal isOpen onClose={onClose} title={`${r.request_no} — ${r.title}`} subtitle={locale === 'am' ? r.unit_am : r.unit} maxWidth="xl">
      <div className="space-y-4 text-sm">
        <div className="p-4 bg-slate-50 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">{t('Amount requested', 'የተጠየቀ መጠን')}</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">{formatETB(r.amount)}</div>
          </div>
          <span className={STATUS_STYLE[r.status]}>{statusLabel(r.status)}</span>
        </div>

        <dl className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
          <Line label={t('Category', 'ዓይነት')} value={categoryLabel(r.category, locale)} />
          <Line label={t('Requested by', 'ጠያቂ')} value={`${r.requested_by} · ${formatEthiopianDate(r.created_at.slice(0, 10), locale)}`} />
          <Line label={t('Needed by', 'የሚያስፈልግበት ቀን')} value={r.needed_by ? formatEthiopianDate(r.needed_by, locale) : '—'} />
          <Line label={t('Priority', 'ቅድሚያ')} value={priorityLabel(r.priority)} />
          {r.reviewed_by && (
            <Line
              label={t('Reviewed by', 'የገመገመው')}
              value={`${r.reviewed_by}${r.reviewed_at ? ` · ${formatEthiopianDate(r.reviewed_at.slice(0, 10), locale)}` : ''}`}
            />
          )}
          {r.status === 'COMPLETED' && (
            <Line
              label={t('Paid', 'የተከፈለበት')}
              value={`${r.paid_at ? formatEthiopianDate(r.paid_at, locale) : ''} · ${t('Receipt', 'ደረሰኝ')} ${r.payment_reference}`}
            />
          )}
        </dl>

        <div>
          <div className="text-xs font-bold text-slate-700 mb-1">{t('Reason / details', 'ምክንያት / ዝርዝር')}</div>
          <p className="text-xs text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">{r.justification || '—'}</p>
        </div>

        {r.review_note && (
          <div className={`text-xs rounded-lg p-3 border ${r.status === 'APPROVED' || r.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <div className="font-bold mb-0.5">{t('Finance office note', 'የፋይናንስ ክፍል ማስታወሻ')}</div>
            {r.review_note}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-xs">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Finance head: review */}
        {canReview && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-700 block">
              {t('Note to the requester (required to reject or return)', 'ለጠያቂው ማስታወሻ (ውድቅ ለማድረግ ወይም ለመመለስ አስፈላጊ)')}
            </label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="form-input text-sm" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => run(() => reviewRequest(r.id, 'APPROVED', note, myName), t('Request approved', 'ጥያቄው ጸድቋል'))} className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50">
                <Check size={14} /> {t('Approve', 'አጽድቅ')}
              </button>
              <button disabled={busy} onClick={() => run(() => reviewRequest(r.id, 'RETURNED', note, myName), t('Request returned for changes', 'ጥያቄው ለማስተካከያ ተመልሷል'))} className="btn btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50">
                <CornerUpLeft size={14} /> {t('Return for changes', 'ለማስተካከያ መልስ')}
              </button>
              <button disabled={busy} onClick={() => run(() => reviewRequest(r.id, 'REJECTED', note, myName), t('Request rejected', 'ጥያቄው ውድቅ ተደርጓል'))} className="btn btn-danger text-xs inline-flex items-center gap-1 disabled:opacity-50">
                <X size={14} /> {t('Reject', 'ውድቅ አድርግ')}
              </button>
            </div>
          </div>
        )}
        {isApprover && r.status === 'PENDING' && isMine && (
          <p className="text-xs text-slate-500">
            {t('This is your own request — another approver must review it.', 'ይህ የራስዎ ጥያቄ ነው — ሌላ አጽዳቂ መገምገም አለበት።')}
          </p>
        )}

        {/* Treasurer: pay */}
        {canPay && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label={t('Payment date', 'የተከፈለበት ቀን') + ' *'}>
                <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="form-input text-sm" />
              </Field>
              <Field label={t('Receipt / voucher no.', 'የደረሰኝ / ቫውቸር ቁጥር') + ' *'}>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Paid to', 'የተከፈለው ለ')}>
                <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} className="form-input text-sm" />
              </Field>
            </div>
            <button
              disabled={busy || !reference.trim()}
              onClick={() => run(() => markRequestPaid(r.id, { paid_at: paidAt, reference, payee }, myName), t('Payment recorded as an expense', 'ክፍያው እንደ ወጪ ተመዝግቧል'))}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Banknote size={14} /> {t('Mark as paid', 'እንደተከፈለ መዝግብ')}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex gap-2">
            {isMine && r.status === 'RETURNED' && (
              <button onClick={onResubmit} className="btn btn-primary text-xs">
                {t('Correct and resubmit', 'አስተካክለህ አቅርብ')}
              </button>
            )}
            {canCancel && (
              <button disabled={busy} onClick={() => run(() => cancelRequest(r.id), t('Request cancelled', 'ጥያቄው ተሰርዟል'))} className="btn btn-secondary text-xs disabled:opacity-50">
                {t('Cancel request', 'ጥያቄውን ሰርዝ')}
              </button>
            )}
          </div>
          <button onClick={onClose} className="btn btn-secondary text-xs">
            {t('Close', 'ዝጋ')}
          </button>
        </div>
      </div>
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right font-medium">{value}</dd>
    </div>
  );
}
