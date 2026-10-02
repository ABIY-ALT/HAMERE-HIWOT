'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_BUDGET_ITEMS, MOCK_EXPENSES } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';
import { SampleDataNotice } from '@/components/common/SampleDataNotice';

export default function BudgetPage() {
  const { t, locale } = useLang();
  const [budgetItems, setBudgetItems] = useState(MOCK_BUDGET_ITEMS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<typeof MOCK_BUDGET_ITEMS[0] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Budget State
  const [catEn, setCatEn] = useState('');
  const [catAm, setCatAm] = useState('');
  const [allocated, setAllocated] = useState(50000);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem = {
      id: `bdg-${Date.now()}`,
      category: catEn,
      category_am: catAm || catEn,
      allocated: Number(allocated),
      spent: 0,
      remaining: Number(allocated),
      percent: 0,
    };
    setBudgetItems([...budgetItems, newItem]);
    setIsAddModalOpen(false);
    showToast(t(`Budget line ${catEn} allocated successfully!`, `የበጀት መስመር ${catAm || catEn} ተመድቧል!`));

    setCatEn('');
    setCatAm('');
  };

  const totalAllocated = budgetItems.reduce((sum, item) => sum + item.allocated, 0);
  const totalSpent = budgetItems.reduce((sum, item) => sum + item.spent, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const overallPct = Math.round((totalSpent / totalAllocated) * 100);

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
            {t('Annual Budget Allocation & Utilization', 'ዓመታዊ በጀት እና አጠቃቀም')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school statutory budget breakdown by ministry departments',
              'የሰንበት ት/ቤቱ ዓመታዊ የበጀት ድልድልና አጠቃቀም'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Allocate Budget Line', 'የበጀት መስመር ጨምር')}
        </button>
      </div>

      <SampleDataNotice />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">
            {totalAllocated.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Budget Allocated', 'የተመደበ ጠቅላላ በጀት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {totalSpent.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Spent to Date', 'እስካሁን የወጣ ወጪ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {totalRemaining.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Remaining Unspent', 'የቀረ ቀሪ በጀት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">{overallPct}%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Budget Utilization', 'የበጀት አጠቃቀም ምጣኔ')}</div>
        </div>
      </div>

      {/* Budget Breakdown Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-800">{t('Departmental Budget Lines', 'የክፍሎች የበጀት ዝርዝር')}</h2>
          <span className="text-xs text-slate-400">{budgetItems.length} {t('Categories', 'ምድቦች')}</span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Category / Department', 'የበጀት ምድብ')}</th>
                <th>{t('Allocated (ETB)', 'የተመደበ (ብር)')}</th>
                <th>{t('Spent (ETB)', 'የወጣ (ብር)')}</th>
                <th>{t('Remaining (ETB)', 'የቀረ (ብር)')}</th>
                <th>{t('Utilization Bar', 'የአጠቃቀም ግስጋሴ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {budgetItems.map((item) => (
                <tr key={item.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? item.category_am : item.category}
                  </td>
                  <td className="font-mono text-slate-800 font-medium">{item.allocated.toLocaleString()}</td>
                  <td className="font-mono text-blue-600 font-medium">{item.spent.toLocaleString()}</td>
                  <td className="font-mono text-emerald-600 font-semibold">{item.remaining.toLocaleString()}</td>
                  <td className="w-48">
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>{item.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.percent > 75 ? 'bg-amber-500' : 'bg-blue-600'}`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedBudget(item)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Ledger', 'መዝገብ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocate Budget Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Allocate Departmental Budget Line', 'የበጀት መስመር መድብ')}
        subtitle={t('Enter budget category title and approved allocation cap', 'የበጀት ምድብ እና የተፈቀደውን ጣሪያ ያስገቡ')}
      >
        <form onSubmit={handleAddBudget} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Category Title (English)', 'የበጀት ርዕስ (እንግሊዝኛ)')} *
            </label>
            <input
              type="text"
              required
              value={catEn}
              onChange={(e) => setCatEn(e.target.value)}
              placeholder="e.g. Diaconal Liturgical Supplies"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Category Title (Amharic)', 'የበጀት ርዕስ (አማርኛ)')}
            </label>
            <input
              type="text"
              value={catAm}
              onChange={(e) => setCatAm(e.target.value)}
              placeholder="ለምሳሌ: የዲቁናና የቅዳሴ አገልግሎት ቁሳቁስ"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Approved Allocation Amount (ETB)', 'የተመደበ በጀት (ብር)')} *
            </label>
            <input
              type="number"
              required
              min="1000"
              step="500"
              value={allocated}
              onChange={(e) => setAllocated(Number(e.target.value))}
              className="form-input text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Authorize Budget', 'በጀት መድብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Budget Ledger Modal */}
      {selectedBudget && (
        <Modal
          isOpen={Boolean(selectedBudget)}
          onClose={() => setSelectedBudget(null)}
          title={`${t('Ledger', 'መዝገብ')}: ${locale === 'am' ? selectedBudget.category_am : selectedBudget.category}`}
          subtitle={`${t('Allocated', 'የተመደበ')}: ${selectedBudget.allocated.toLocaleString()} ETB • ${t('Spent', 'የወጣ')}: ${selectedBudget.spent.toLocaleString()} ETB`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-400 block">{t('Allocated Cap', 'የተመደበ ጣሪያ')}</span>
                <span className="text-base font-bold text-slate-800">{selectedBudget.allocated.toLocaleString()} ETB</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <span className="text-xs text-blue-600 block">{t('Total Disbursed', 'የወጣ ወጪ')}</span>
                <span className="text-base font-bold text-blue-700">{selectedBudget.spent.toLocaleString()} ETB</span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <span className="text-xs text-emerald-600 block">{t('Remaining Balance', 'ቀሪ በጀት')}</span>
                <span className="text-base font-bold text-emerald-700">{selectedBudget.remaining.toLocaleString()} ETB</span>
              </div>
            </div>

            <div className="table-container border border-slate-100 rounded-xl overflow-hidden">
              <table>
                <thead>
                  <tr>
                    <th>{t('Date', 'ቀን')}</th>
                    <th>{t('Voucher / Description', 'ማብራሪያ')}</th>
                    <th>{t('Amount', 'መጠን')}</th>
                    <th>{t('Status', 'ሁኔታ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_EXPENSES.slice(0, 3).map((exp) => (
                    <tr key={exp.id}>
                      <td className="font-mono text-xs text-slate-500">{exp.date}</td>
                      <td className="text-slate-800 text-xs font-medium">{exp.description}</td>
                      <td className="font-mono text-xs font-bold text-red-600">-{exp.amount.toLocaleString()} ETB</td>
                      <td>
                        <span className="badge badge-success">{exp.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedBudget(null)}
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
