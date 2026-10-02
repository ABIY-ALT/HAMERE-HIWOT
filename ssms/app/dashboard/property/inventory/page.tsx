'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ASSETS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface InventoryItem {
  id: string;
  tag: string;
  name_en: string;
  name_am: string;
  dept: string;
  condition: string;
  custodian: string;
  verified: boolean;
}

export default function InventoryPage() {
  const { t, locale } = useLang();
  const [items, setItems] = useState<InventoryItem[]>(
    MOCK_ASSETS.map((a) => ({ ...a, verified: true }))
  );
  const [search, setSearch] = useState('');
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [cycleName, setCycleName] = useState('2026 Q3 Annual Parish Property Audit');
  const [auditor, setAuditor] = useState('Performance Audit Committee');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleStartCycle = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCycleModalOpen(false);
    showToast(t(`New stocktake cycle "${cycleName}" initiated!`, `አዲስ የንብረት ቆጠራ ዙር "${cycleName}" ተጀምሯል!`));
  };

  const filtered = items.filter((a) =>
    a.tag.toLowerCase().includes(search.toLowerCase()) ||
    (locale === 'am' ? a.name_am : a.name_en).toLowerCase().includes(search.toLowerCase()) ||
    a.dept.toLowerCase().includes(search.toLowerCase())
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
            {t('Physical Inventory & Annual Stocktake', 'የንብረት ቆጠራና ዝርዝር')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school property audit reconciliation, missing items detection, and verification',
              'ዓመታዊ የንብረት ቆጠራ፣ ማረጋገጫና የጎደሉ ንብረቶች ክትትል'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsCycleModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Start New Stocktake Cycle', 'አዲስ ቆጠራ ጀምር')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{items.length} / {items.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Assets Verified Present', 'የተገኙ ንብረቶች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">0</div>
          <div className="text-xs text-slate-500 mt-1">{t('Unaccounted / Missing Items', 'የጠፉ ዕቃዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Stocktake Audit Coverage', 'የቆጠራ ሽፋን')}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search inventory items...', 'ንብረቶችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('items verified', 'የተረጋገጡ ንብረቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Asset Tag', 'የንብረት መለያ')}</th>
                <th>{t('Item Name', 'የንብረት ስም')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Physical Verification', 'የአካል ቆጠራ')}</th>
                <th>{t('Condition Verified', 'የተረጋገጠ ሁኔታ')}</th>
                <th>{t('Audited By', 'የቆጠረው')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{a.tag}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? a.name_am : a.name_en}
                  </td>
                  <td className="text-slate-600 text-xs">{a.dept}</td>
                  <td>
                    <span className="badge badge-success inline-flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      {t('Verified Present', 'ተረጋግጧል')}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs font-medium text-slate-700">{a.condition}</span>
                  </td>
                  <td className="text-slate-600 text-xs font-medium">Audit Committee</td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedItem(a)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('View', 'እይ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Start Stocktake Modal */}
      <Modal
        isOpen={isCycleModalOpen}
        onClose={() => setIsCycleModalOpen(false)}
        title={t('Initiate Statutory Stocktake Cycle', 'አዲስ የንብረት ቆጠራ ጀምር')}
        subtitle={t('Activate physical audit for Category 2 parish property', 'የአጥቢያ ሰንበት ት/ቤት የንብረት ቆጠራ ሂደት ይክፈቱ')}
      >
        <form onSubmit={handleStartCycle} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Audit Cycle Name', 'የቆጠራ ዙር ስም')} *
            </label>
            <input
              type="text"
              required
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              className="form-input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Supervising Audit Body', 'ኃላፊ የኦዲት አካል')} *
              </label>
              <input
                type="text"
                required
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Commencement Date', 'የሚጀምርበት ቀን')} *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCycleModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs py-2 px-4">
              {t('Launch Audit Cycle', 'ቆጠራውን ጀምር')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Item Verification Details Modal */}
      {selectedItem && (
        <Modal
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          title={locale === 'am' ? selectedItem.name_am : selectedItem.name_en}
          subtitle={`Tag: ${selectedItem.tag} • ${selectedItem.dept}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Physical Status', 'የአካል ሁኔታ')}:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 size={14} /> Verified Present in Parish
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Condition Grade', 'የንብረቱ ጥራት')}:</span>
                <span className="font-semibold text-slate-900">{selectedItem.condition}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Designated Custodian', 'ተረካቢ')}:</span>
                <span className="font-semibold text-slate-900">{selectedItem.custodian}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedItem(null)}
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
