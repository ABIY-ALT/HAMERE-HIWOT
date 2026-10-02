'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ASSET_TRANSFERS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface TransferItem {
  id: string;
  asset: string;
  asset_tag: string;
  from_dept: string;
  to_dept: string;
  from_custodian: string;
  to_custodian: string;
  date: string;
  status: string;
}

export default function TransfersPage() {
  const { t } = useLang();
  const [transfers, setTransfers] = useState<TransferItem[]>(MOCK_ASSET_TRANSFERS as TransferItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [asset, setAsset] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [fromDept, setFromDept] = useState('Education Department');
  const [toDept, setToDept] = useState('Youth Fellowship');
  const [fromCustodian, setFromCustodian] = useState('');
  const [toCustodian, setToCustodian] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleInitiateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const newTransfer: TransferItem = {
      id: `TRF-${Math.floor(100 + Math.random() * 900)}`,
      asset,
      asset_tag: assetTag || `AST-${Math.floor(100 + Math.random() * 900)}`,
      from_dept: fromDept,
      to_dept: toDept,
      from_custodian: fromCustodian || 'Current Custodian',
      to_custodian: toCustodian || 'New Custodian',
      date,
      status: 'COMPLETED',
    };

    setTransfers([newTransfer, ...transfers]);
    setIsAddModalOpen(false);
    showToast(t(`Asset transfer ${newTransfer.id} completed!`, `የንብረት ዝውውር ${newTransfer.id} ተጠናቋል!`));

    // Reset
    setAsset('');
    setAssetTag('');
    setFromCustodian('');
    setToCustodian('');
  };

  const filtered = transfers.filter((tr) =>
    tr.asset.toLowerCase().includes(search.toLowerCase()) ||
    tr.asset_tag.toLowerCase().includes(search.toLowerCase()) ||
    tr.to_custodian.toLowerCase().includes(search.toLowerCase())
  );

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
            {t('Internal Asset Transfers & Movement', 'የንብረት ዝውውር')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Inter-departmental Sunday school equipment reassignment, handovers, and relocation',
              'በክፍሎች መካከል የተደረጉ የንብረት ዝውውሮችና የርክክብ ሰነዶች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Initiate Transfer', 'አዲስ ዝውውር ጀምር')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search transfers...', 'ዝውውሮችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('transfers', 'ዝውውሮች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Transfer #', 'የዝውውር ቁጥር')}</th>
                <th>{t('Asset Item', 'ንብረት')}</th>
                <th>{t('From Department', 'ከክፍል')}</th>
                <th>{t('To Department', 'ወደ ክፍል')}</th>
                <th>{t('Relinquished By', 'ያስረከበው')}</th>
                <th>{t('Received By', 'የተረከበው')}</th>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tr) => (
                <tr key={tr.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{tr.id}</td>
                  <td>
                    <div className="font-semibold text-slate-900">{tr.asset}</div>
                    <div className="text-[11px] font-mono text-slate-400">{tr.asset_tag}</div>
                  </td>
                  <td className="text-slate-600 text-xs">{tr.from_dept}</td>
                  <td className="text-slate-800 text-xs font-semibold">{tr.to_dept}</td>
                  <td className="text-slate-600 text-xs">{tr.from_custodian}</td>
                  <td className="text-slate-800 text-xs font-medium">{tr.to_custodian}</td>
                  <td className="font-mono text-xs text-slate-500">{tr.date}</td>
                  <td>
                    <span className={tr.status === 'COMPLETED' ? 'badge badge-success' : 'badge badge-warning'}>
                      {tr.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedTransfer(tr)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Details', 'ዝርዝር')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Initiate Transfer Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Initiate Internal Asset Transfer', 'አዲስ የንብረት ዝውውር ጀምር')}
        subtitle={t('Handover parish equipment between departments and custodians', 'በክፍሎችና አገልጋዮች መካከል ንብረት ያዛውሩ')}
      >
        <form onSubmit={handleInitiateTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name', 'የንብረቱ ስም')} *
              </label>
              <input
                type="text"
                required
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="e.g. Epson Multimedia Projector"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Tag', 'የንብረት መለያ ቁጥር')}
              </label>
              <input
                type="text"
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="AST-2026-..."
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Source Department', 'ከየትኛው ክፍል')} *
              </label>
              <input
                type="text"
                required
                value={fromDept}
                onChange={(e) => setFromDept(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Target Department', 'ወደ የትኛው ክፍል')} *
              </label>
              <input
                type="text"
                required
                value={toDept}
                onChange={(e) => setToDept(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Relinquished By (Current Custodian)', 'ያስረከበው አገልጋይ')} *
              </label>
              <input
                type="text"
                required
                value={fromCustodian}
                onChange={(e) => setFromCustodian(e.target.value)}
                placeholder="መምህር / ዲያቆን..."
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Received By (New Custodian)', 'የተረከበው አገልጋይ')} *
              </label>
              <input
                type="text"
                required
                value={toCustodian}
                onChange={(e) => setToCustodian(e.target.value)}
                placeholder="መምህር / ዲያቆን..."
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Transfer Date', 'የዝውውር ቀን')} *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
              {t('Execute Transfer', 'ዝውውሩን አጽድቅ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Transfer Details Modal */}
      {selectedTransfer && (
        <Modal
          isOpen={Boolean(selectedTransfer)}
          onClose={() => setSelectedTransfer(null)}
          title={`${selectedTransfer.asset} (${selectedTransfer.asset_tag})`}
          subtitle={`Transfer Reference: ${selectedTransfer.id}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('From Department', 'ከክፍል')}:</span>
                <span className="font-semibold text-slate-900">{selectedTransfer.from_dept} ({selectedTransfer.from_custodian})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('To Department', 'ወደ ክፍል')}:</span>
                <span className="font-semibold text-slate-900">{selectedTransfer.to_dept} ({selectedTransfer.to_custodian})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Date Executed', 'የተከናወነበት ቀን')}:</span>
                <span className="font-mono text-slate-700">{selectedTransfer.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Status', 'ሁኔታ')}:</span>
                <span className="badge badge-success">{selectedTransfer.status}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTransfer(null)}
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
