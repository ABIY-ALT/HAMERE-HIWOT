'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2, FileCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_APPROVALS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface ApprovalItem {
  id: string;
  ref: string;
  title: string;
  type: string;
  amount: number;
  requested_by: string;
  priority: string;
  status: string;
  justification?: string;
}

export default function ApprovalsPage() {
  const { t } = useLang();
  const [approvals, setApprovals] = useState<ApprovalItem[]>(MOCK_APPROVALS as ApprovalItem[]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Procurement');
  const [amount, setAmount] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [justification, setJustification] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleApprove = (id: string) => {
    const item = approvals.find((a) => a.id === id);
    setApprovals(approvals.map((a) => (a.id === id ? { ...a, status: 'APPROVED' } : a)));
    showToast(t(`Requisition ${item?.ref || ''} approved successfully!`, `የጥያቄ ቁጥር ${item?.ref || ''} ጸድቋል!`));
  };

  const handleReject = (id: string) => {
    const item = approvals.find((a) => a.id === id);
    setApprovals(approvals.map((a) => (a.id === id ? { ...a, status: 'REJECTED' } : a)));
    showToast(t(`Requisition ${item?.ref || ''} rejected!`, `የጥያቄ ቁጥር ${item?.ref || ''} ውድቅ ተደርጓል!`));
  };

  const handleCreateRequisition = (e: React.FormEvent) => {
    e.preventDefault();
    const newReq: ApprovalItem = {
      id: `appr-${Date.now()}`,
      ref: `REQ-2026-${String(approvals.length + 1).padStart(3, '0')}`,
      title,
      type,
      amount: Number(amount) || 0,
      requested_by: requestedBy || 'Parish Department',
      priority,
      status: 'PENDING',
      justification: justification || 'Statutory parish requirement under Category 2 budget bylaws.',
    };

    setApprovals([newReq, ...approvals]);
    setIsAddModalOpen(false);
    showToast(t(`Requisition "${title}" submitted to queue!`, `የፈቃድ ጥያቄ "${title}" ገብቷል!`));

    // Reset
    setTitle('');
    setAmount('');
    setRequestedBy('');
    setJustification('');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Financial & Requisition Approvals Queue', 'የፋይናንስና ወጪ ማጽደቂያዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Board & Executive Committee threshold-based financial authorization workflows',
              'የሥራ አመራርና ሥራ አስፈጻሚ ጉባኤ የፋይናንስ ፈቃድ ማጽደቂያ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('New Requisition', 'አዲስ የፈቃድ ጥያቄ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-500">
            {approvals.filter((a) => a.status === 'PENDING').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Pending Authorization', 'ማጽደቅ የሚጠብቁ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {approvals.filter((a) => a.status === 'APPROVED').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Approved Requisitions', 'የጸደቁ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {approvals
              .filter((a) => a.status === 'PENDING')
              .reduce((s, a) => s + a.amount, 0)
              .toLocaleString()}{' '}
            ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Pending Authorization Value', 'የሚጸድቀው ጠቅላላ ገንዘብ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Ref #', 'የማመሳከሪያ ቁጥር')}</th>
                <th>{t('Requisition Title', 'የጥያቄው ርዕስ')}</th>
                <th>{t('Type', 'ዓይነት')}</th>
                <th>{t('Amount', 'መጠን')}</th>
                <th>{t('Requested By', 'ጠያቂ')}</th>
                <th>{t('Priority', 'አስቸኳይነት')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Decision', 'ውሳኔ')}</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{a.ref}</td>
                  <td className="font-semibold text-slate-900">
                    <button
                      onClick={() => setSelectedApproval(a)}
                      className="text-left hover:text-blue-600 transition-colors"
                    >
                      {a.title}
                    </button>
                  </td>
                  <td>
                    <span className="badge badge-info">{a.type}</span>
                  </td>
                  <td className="font-bold text-slate-900 font-mono">
                    {a.amount > 0 ? `${a.amount.toLocaleString()} ETB` : '—'}
                  </td>
                  <td className="text-slate-600 text-xs">{a.requested_by}</td>
                  <td>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        a.priority === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {a.priority}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        a.status === 'APPROVED'
                          ? 'badge badge-success'
                          : a.status === 'REJECTED'
                          ? 'badge badge-danger'
                          : 'badge badge-warning'
                      }
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="text-right">
                    {a.status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleApprove(a.id)}
                          className="btn btn-primary btn-sm text-[11px] py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {t('Approve', 'አጽድቅ')}
                        </button>
                        <button
                          onClick={() => handleReject(a.id)}
                          className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 text-red-600 hover:bg-red-50"
                        >
                          {t('Reject', 'አትቀበል')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedApproval(a)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {t('Details', 'ዝርዝር')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Requisition Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Submit Financial Authorization Requisition', 'አዲስ የፋይናንስ ፈቃድ ጥያቄ አቅርብ')}
        subtitle={t('Submit formal expenditure requisition for Board or Executive approval', 'ለሥራ አመራር ወይም ሥራ አስፈጻሚ ጉባኤ የፈቃድ ጥያቄ ያስገቡ')}
      >
        <form onSubmit={handleCreateRequisition} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Requisition Title', 'የጥያቄው ርዕስ')} *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sound System Amplifier Replacement"
              className="form-input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Requisition Category', 'የጥያቄው ዓይነት')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Procurement">Procurement (ግዥ)</option>
                <option value="Expense Claim">Expense Claim (ወጪ ማካካሻ)</option>
                <option value="Facility Work">Facility Maintenance (ጥገና)</option>
                <option value="Event Logistics">Event Logistics (የዝግጅት ወጪ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Estimated Amount (ETB)', 'የተጠየቀው ገንዘብ መጠን')} *
              </label>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12000"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Requested By (Department/Person)', 'ጠያቂ ክፍል / አገልጋይ')} *
              </label>
              <input
                type="text"
                required
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="e.g. Property Department"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Priority Level', 'የአስቸኳይነት ደረጃ')}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="form-input text-sm"
              >
                <option value="HIGH">HIGH (ከፍተኛ)</option>
                <option value="NORMAL">NORMAL (መደበኛ)</option>
                <option value="URGENT">URGENT (አስቸኳይ)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Justification / Supporting Context', 'የወጪው አስፈላጊነት ዝርዝር')}
            </label>
            <textarea
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Detailed reasons why this requisition is necessary..."
              className="form-input text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs py-2 px-4">
              {t('Submit Requisition', 'ጥያቄ አቅርብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Requisition Details Modal */}
      {selectedApproval && (
        <Modal
          isOpen={Boolean(selectedApproval)}
          onClose={() => setSelectedApproval(null)}
          title={selectedApproval.title}
          subtitle={`${selectedApproval.ref} • ${selectedApproval.type}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Requested Amount', 'የተጠየቀው ገንዘብ')}:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {selectedApproval.amount > 0 ? `${selectedApproval.amount.toLocaleString()} ETB` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Originating Department', 'ጠያቂ')}:</span>
                <span className="font-semibold text-slate-900">{selectedApproval.requested_by}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Priority', 'አስቸኳይነት')}:</span>
                <span className="badge badge-info">{selectedApproval.priority}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Approval Status', 'ሁኔታ')}:</span>
                <span className={selectedApproval.status === 'APPROVED' ? 'badge badge-success' : selectedApproval.status === 'REJECTED' ? 'badge badge-danger' : 'badge badge-warning'}>
                  {selectedApproval.status}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileCheck size={14} className="text-blue-600" />
                {t('Formal Justification', 'የጥያቄው አስፈላጊነት')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl leading-relaxed">
                {selectedApproval.justification ||
                  t(
                    'Operational expenditure authorized pursuant to parish financial bylaws, subject to board quorum verification.',
                    'በአጥቢያ ሰንበት ት/ቤት የፋይናንስ ደንብ መሠረት ለሥራ አመራር ጉባኤ ውሳኔ የቀረበ ጥያቄ።'
                  )}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedApproval.status === 'PENDING' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleApprove(selectedApproval.id);
                      setSelectedApproval(null);
                    }}
                    className="btn btn-primary text-xs py-2 px-3 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {t('Approve Requisition', 'አጽድቅ')}
                  </button>
                  <button
                    onClick={() => {
                      handleReject(selectedApproval.id);
                      setSelectedApproval(null);
                    }}
                    className="btn btn-secondary text-xs py-2 px-3 text-red-600 hover:bg-red-50"
                  >
                    {t('Reject Requisition', 'አትቀበል')}
                  </button>
                </div>
              ) : (
                <div />
              )}
              <button
                onClick={() => setSelectedApproval(null)}
                className="btn btn-secondary text-xs"
              >
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
