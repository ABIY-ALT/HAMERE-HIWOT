'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_EXPENSES } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface ExpenseItem {
  id: string;
  date: string;
  category: string;
  category_am: string;
  amount: number;
  currency: string;
  paid_by: string;
  description: string;
  status: string;
  approved_by: string;
}

export default function ExpensesPage() {
  const { t, locale } = useLang();
  const [expenses, setExpenses] = useState<ExpenseItem[]>(MOCK_EXPENSES as ExpenseItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Educational Materials');
  const [categoryAm, setCategoryAm] = useState('የማስተማሪያ ቁሳቁስ');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [description, setDescription] = useState('');
  const [approvedBy, setApprovedBy] = useState('Board Treasurer');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const newExp: ExpenseItem = {
      id: `exp-${Date.now()}`,
      date,
      category,
      category_am: categoryAm || category,
      amount: Number(amount) || 0,
      currency: 'ETB',
      paid_by: paidBy || 'Parish Cashier',
      description: description || 'Operational expenditure',
      status: 'APPROVED',
      approved_by: approvedBy,
    };

    setExpenses([newExp, ...expenses]);
    setIsAddModalOpen(false);
    showToast(t(`Expense voucher of ETB ${Number(amount).toLocaleString()} disbursed!`, `የ${Number(amount).toLocaleString()} ብር ወጪ ቫውቸር ተመዝግቧል!`));

    // Reset
    setAmount('');
    setDescription('');
    setPaidBy('');
  };

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);

  const filtered = expenses.filter((e) =>
    (locale === 'am' ? e.category_am : e.category).toLowerCase().includes(search.toLowerCase()) ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.paid_by.toLowerCase().includes(search.toLowerCase())
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
            {t('Expenditure & Disbursements', 'የወጪ መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school operational expenses, teaching materials, utility disbursements, and receipts',
              'የሰንበት ት/ቤቱ ሥራ ማስኬጃ፣ የማስተማሪያ ቁሳቁሶችና ሌሎች ወጪዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('New Expense Claim', 'አዲስ ወጪ መዝግብ')}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-red-600">
            {totalExpense.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Disbursed', 'አጠቃላይ የወጣ ወጪ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{expenses.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Vouchers Processed', 'የተከናወኑ ቫውቸሮች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-600">
            {expenses.filter((e) => e.status === 'PENDING').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Pending Verification', 'ማረጋገጫ የሚጠብቁ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search expenses...', 'ወጪዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('records', 'መዝገቦች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Category', 'የወጪ ዓይነት')}</th>
                <th>{t('Amount', 'መጠን')}</th>
                <th>{t('Paid By', 'ከፋይ')}</th>
                <th>{t('Description', 'ዝርዝር ማብራሪያ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th>{t('Approved By', 'ያጸደቀው')}</th>
                <th className="text-right">{t('Voucher', 'ቫውቸር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs text-slate-600">{e.date}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? e.category_am : e.category}
                  </td>
                  <td className="font-bold text-red-600 font-mono">
                    -{e.amount.toLocaleString()} {e.currency}
                  </td>
                  <td className="text-slate-600 text-xs">{e.paid_by}</td>
                  <td className="text-slate-700 text-xs">{e.description}</td>
                  <td>
                    <span className={e.status === 'APPROVED' ? 'badge badge-success' : 'badge badge-warning'}>
                      {e.status}
                    </span>
                  </td>
                  <td className="text-slate-600 text-xs font-medium">{e.approved_by}</td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedExpense(e)}
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

      {/* New Expense Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Issue New Expenditure Voucher', 'አዲስ የወጪ ቫውቸር መዝግብ')}
        subtitle={t('Record authorized parish expense and budget line allocation', 'የተፈቀደ ወጪ፣ የበጀት መስመር እና ከፋይ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Voucher Date', 'የተከናወነበት ቀን')} *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Amount in ETB (ብር)', 'የገንዘብ መጠን (በብር)')} *
              </label>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="3500"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Expense Category (English)', 'የወጪ ዓይነት (እንግሊዝኛ)')} *
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value === 'Educational Materials') setCategoryAm('የማስተማሪያ ቁሳቁስ');
                  if (e.target.value === 'Utilities & Electricity') setCategoryAm('የውሃና መብራት ክፍያ');
                  if (e.target.value === 'Event Logistics') setCategoryAm('የበዓል ዝግጅት ወጪ');
                  if (e.target.value === 'Maintenance & Repairs') setCategoryAm('የጥገና ወጪ');
                }}
                className="form-input text-sm"
              >
                <option value="Educational Materials">Educational Materials</option>
                <option value="Utilities & Electricity">Utilities & Electricity</option>
                <option value="Event Logistics">Event Logistics</option>
                <option value="Maintenance & Repairs">Maintenance & Repairs</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Expense Category (Amharic)', 'የወጪ ዓይነት (አማርኛ)')}
              </label>
              <input
                type="text"
                value={categoryAm}
                onChange={(e) => setCategoryAm(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Paid By / Disbursed By', 'ከፋይ አካል')} *
              </label>
              <input
                type="text"
                required
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="e.g. Parish Cashier"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Authorizing Officer', 'ያጸደቀው ኃላፊ')} *
              </label>
              <input
                type="text"
                required
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder="e.g. Board of Management Treasurer"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Expenditure Justification / Notes', 'የወጪው ዝርዝር ምክንያት')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Purchase of textbooks and exercise books for Term II"
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
              {t('Disburse Voucher', 'ቫውቸር መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Expense Voucher Modal */}
      {selectedExpense && (
        <Modal
          isOpen={Boolean(selectedExpense)}
          onClose={() => setSelectedExpense(null)}
          title={t('Expenditure Payment Voucher', 'የክፍያ ማዘዣ ቫውቸር')}
          subtitle={`${selectedExpense.id} • ${selectedExpense.date}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs text-red-700 font-semibold">{t('Total Disbursed Amount', 'የወጣው የገንዘብ መጠን')}</div>
                <div className="text-2xl font-black text-red-800 font-mono mt-0.5">
                  -{selectedExpense.amount.toLocaleString()} {selectedExpense.currency}
                </div>
              </div>
              <span className="badge badge-success text-xs">{selectedExpense.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Category', 'የወጪ ዓይነት')}:</span>
                <span className="font-semibold text-slate-900">{locale === 'am' ? selectedExpense.category_am : selectedExpense.category}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Disbursed By', 'ከፋይ')}:</span>
                <span className="font-semibold text-slate-900">{selectedExpense.paid_by}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Authorized By', 'ያጸደቀው')}:</span>
                <span className="font-semibold text-blue-700">{selectedExpense.approved_by}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Purpose & Notes', 'ዝርዝር ማብራሪያ')}:</span>
                <span className="text-slate-700">{selectedExpense.description}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedExpense(null)}
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
