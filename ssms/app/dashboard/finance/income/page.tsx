'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_INCOME } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface IncomeItem {
  id: string;
  date: string;
  category: string;
  category_am: string;
  amount: number;
  currency: string;
  received_by: string;
  description: string;
  status: string;
}

export default function IncomePage() {
  const { t, locale } = useLang();
  const [incomes, setIncomes] = useState<IncomeItem[]>(MOCK_INCOME as IncomeItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<IncomeItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('Member Monthly Dues');
  const [categoryAm, setCategoryAm] = useState('የአባላት ወርሃዊ መዋጮ');
  const [amount, setAmount] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [description, setDescription] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddIncome = (e: React.FormEvent) => {
    e.preventDefault();
    const newInc: IncomeItem = {
      id: `inc-${Date.now()}`,
      date,
      category,
      category_am: categoryAm || category,
      amount: Number(amount) || 0,
      currency: 'ETB',
      received_by: receivedBy || 'Parish Finance Office',
      description: description || 'Parish revenue collection',
      status: 'VERIFIED',
    };

    setIncomes([newInc, ...incomes]);
    setIsAddModalOpen(false);
    showToast(t(`Income receipt of ETB ${Number(amount).toLocaleString()} recorded!`, `የ${Number(amount).toLocaleString()} ብር ገቢ ተመዝግቧል!`));

    // Reset
    setAmount('');
    setDescription('');
    setReceivedBy('');
  };

  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

  const filtered = incomes.filter((i) =>
    (locale === 'am' ? i.category_am : i.category).toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    i.received_by.toLowerCase().includes(search.toLowerCase())
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
            {t('Revenue & Income Management', 'የገቢ መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school revenue collection: member dues, donations, muda ye mitsw\'at, and program fees',
              'የሰንበት ት/ቤቱ ገቢዎች: የአባልነት መዋጮ፣ ስጦታ፣ ምዕዳ የምጽዋት እና የፕሮግራም ክፍያዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Record Income Receipt', 'አዲስ ገቢ መዝግብ')}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {totalIncome.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Recorded Income', 'አጠቃላይ የተመዘገበ ገቢ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{incomes.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Income Transactions', 'የገቢ ልውውጦች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Receipts Audited', 'ደረሰኞች የተረጋገጡ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search receipts...', 'ገቢዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('transactions', 'ግብይቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Category', 'የገቢ ዓይነት')}</th>
                <th>{t('Amount', 'መጠን')}</th>
                <th>{t('Received By', 'ተቀባይ')}</th>
                <th>{t('Description', 'ዝርዝር ማብራሪያ')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td className="font-mono text-xs text-slate-600">{i.date}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? i.category_am : i.category}
                  </td>
                  <td className="font-bold text-emerald-600 font-mono">
                    +{i.amount.toLocaleString()} {i.currency}
                  </td>
                  <td className="text-slate-600 text-xs">{i.received_by}</td>
                  <td className="text-slate-700 text-xs">{i.description}</td>
                  <td>
                    <span className="badge badge-success">{i.status}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedIncome(i)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Receipt', 'ደረሰኝ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Income Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Record Official Revenue Receipt', 'አዲስ የገቢ ደረሰኝ መዝግብ')}
        subtitle={t('Enter parish collection amount, classification, and payer details', 'የተሰበሰበውን የገንዘብ መጠን፣ ዓይነትና ተቀባይ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddIncome} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Transaction Date', 'የተከናወነበት ቀን')} *
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
                placeholder="5000"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Revenue Category (English)', 'የገቢ ዓይነት (እንግሊዝኛ)')} *
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value === 'Member Monthly Dues') setCategoryAm('የአባላት ወርሃዊ መዋጮ');
                  if (e.target.value === 'Donations & Gifts') setCategoryAm('ስጦታ እና ምጽዋት');
                  if (e.target.value === 'Muda ye Mitswat') setCategoryAm('ሙዳየ ምጽዋት');
                  if (e.target.value === 'Publications & Books') setCategoryAm('የመጻሕፍት ሽያጭ');
                }}
                className="form-input text-sm"
              >
                <option value="Member Monthly Dues">Member Monthly Dues</option>
                <option value="Donations & Gifts">Donations & Gifts</option>
                <option value="Muda ye Mitswat">Muda ye Mitswat</option>
                <option value="Publications & Books">Publications & Books</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Revenue Category (Amharic)', 'የገቢ ዓይነት (አማርኛ)')}
              </label>
              <input
                type="text"
                value={categoryAm}
                onChange={(e) => setCategoryAm(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Received By / Cashier', 'ተቀባይ / ገንዘብ ያዥ')} *
            </label>
            <input
              type="text"
              required
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="e.g. Deacon Michael Tadesse"
              className="form-input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Description / Payer Notes', 'ዝርዝር ማብራሪያ')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly contributions batch from Choir Department"
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
              {t('Save Receipt', 'ደረሰኝ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Receipt Modal */}
      {selectedIncome && (
        <Modal
          isOpen={Boolean(selectedIncome)}
          onClose={() => setSelectedIncome(null)}
          title={t('Official Parish Income Receipt', 'ይፋዊ የሰንበት ት/ቤት ገቢ ደረሰኝ')}
          subtitle={`${selectedIncome.id} • ${selectedIncome.date}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 font-semibold">{t('Total Amount Received', 'የተሰበሰበው መጠን')}</div>
                <div className="text-2xl font-black text-emerald-800 font-mono mt-0.5">
                  +{selectedIncome.amount.toLocaleString()} {selectedIncome.currency}
                </div>
              </div>
              <span className="badge badge-success text-xs">{selectedIncome.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Category', 'የገቢ ዓይነት')}:</span>
                <span className="font-semibold text-slate-900">{locale === 'am' ? selectedIncome.category_am : selectedIncome.category}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Received By', 'ተቀባይ')}:</span>
                <span className="font-semibold text-slate-900">{selectedIncome.received_by}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Description', 'ማብራሪያ')}:</span>
                <span className="text-slate-700">{selectedIncome.description}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Audit Verification', 'የኦዲት ማረጋገጫ')}:</span>
                <span className="text-emerald-600 font-semibold">Verified by Internal Auditor</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedIncome(null)}
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
