'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_DONATIONS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface DonationItem {
  id: string;
  donor: string;
  amount: number;
  currency: string;
  date: string;
  purpose: string;
  receipt: string;
  status: string;
  type: string;
}

export default function DonationsPage() {
  const { t } = useLang();
  const [donations, setDonations] = useState<DonationItem[]>(MOCK_DONATIONS as DonationItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState<DonationItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [donor, setDonor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('Bank Transfer (CBE)');
  const [purpose, setPurpose] = useState('Church Building & Renovation Fund');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddDonation = (e: React.FormEvent) => {
    e.preventDefault();
    const newDonation: DonationItem = {
      id: `don-${Date.now()}`,
      donor,
      amount: Number(amount) || 0,
      currency: 'ETB',
      date,
      type,
      purpose,
      receipt: `DON-2026-${String(donations.length + 1).padStart(4, '0')}`,
      status: 'VERIFIED',
    };

    setDonations([newDonation, ...donations]);
    setIsAddModalOpen(false);
    showToast(t(`Donation of ETB ${Number(amount).toLocaleString()} from ${donor} registered!`, `የ${donor} የ${Number(amount).toLocaleString()} ብር ስጦታ ተመዝግቧል!`));

    // Reset
    setDonor('');
    setAmount('');
  };

  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);

  const filtered = donations.filter((d) =>
    d.donor.toLowerCase().includes(search.toLowerCase()) ||
    d.purpose.toLowerCase().includes(search.toLowerCase()) ||
    d.receipt.toLowerCase().includes(search.toLowerCase())
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
            {t('Donations & Philanthropic Contributions', 'ስጦታዎችና ምጽዋት')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school donor register: building funds, scholarships, library support, and general charity',
              'የሰንበት ት/ቤቱ ደጋፊዎች፣ የሕንፃ ማሰሪያ፣ የመጻሕፍት ድጋፍና የበጎ አድራጎት ስጦታዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Register Donation', 'ስጦታ መዝግብ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {totalDonations.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Pledged & Received', 'የተሰበሰበ ስጦታ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{donations.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Registered Benefactors', 'ለጋሾች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Official Receipts Issued', 'ደረሰኝ የተሰጣቸው')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search donations...', 'ስጦታዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('donations', 'ስጦታዎች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Receipt #', 'የደረሰኝ ቁጥር')}</th>
                <th>{t('Donor', 'ለጋሽ')}</th>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Method', 'ዘዴ')}</th>
                <th>{t('Designated Purpose', 'የተመደበለት ዓላማ')}</th>
                <th>{t('Amount', 'መጠን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{d.receipt}</td>
                  <td className="font-semibold text-slate-900">{d.donor}</td>
                  <td className="font-mono text-xs text-slate-500">{d.date}</td>
                  <td className="text-slate-700 text-xs">{d.type}</td>
                  <td className="text-slate-700 text-xs font-medium">{d.purpose}</td>
                  <td className="font-bold text-emerald-600 font-mono">
                    +{d.amount.toLocaleString()} {d.currency}
                  </td>
                  <td>
                    <span className="badge badge-success">{d.status}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedDonation(d)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Certificate', 'የምስክር ወረቀት')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Donation Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Register Philanthropic Donation', 'አዲስ የልገሳ ስጦታ መዝግብ')}
        subtitle={t('Record benefactor gift, designated church project, and receipt details', 'የለጋሽ ስም፣ የተመደበለት ዓላማና የገንዘብ መጠን ያስገቡ')}
      >
        <form onSubmit={handleAddDonation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Benefactor / Donor Name', 'የለጋሽ ሙሉ ስም')} *
              </label>
              <input
                type="text"
                required
                value={donor}
                onChange={(e) => setDonor(e.target.value)}
                placeholder="e.g. Deacon Solomon / Anonymous"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Donation Amount (ETB)', 'የስጦታው መጠን (ብር)')} *
              </label>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Payment Method', 'የክፍያ ዘዴ')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Bank Transfer (CBE)">Bank Transfer (CBE / ንግድ ባንክ)</option>
                <option value="Telebirr">Telebirr (ቴሌብር)</option>
                <option value="Cash Receipt">Cash Receipt (በጥሬ ገንዘብ)</option>
                <option value="Direct Cheque">Direct Cheque (በቼክ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Contribution Date', 'የተበረከተበት ቀን')} *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Designated Parish Purpose', 'የተመደበለት ዓላማ')} *
            </label>
            <input
              type="text"
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Library Expansion, Audio Equipment, Orphan Support"
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
              {t('Register Gift', 'ስጦታ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Donation Certificate Modal */}
      {selectedDonation && (
        <Modal
          isOpen={Boolean(selectedDonation)}
          onClose={() => setSelectedDonation(null)}
          title={t('Donation Acknowledgement & Receipt', 'የልገሳ ማረጋገጫና ደረሰኝ')}
          subtitle={`${selectedDonation.receipt} • ${selectedDonation.date}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 font-semibold">{t('Benefactor Contribution', 'የተበረከተ መጠን')}</div>
                <div className="text-2xl font-black text-emerald-800 font-mono mt-0.5">
                  +{selectedDonation.amount.toLocaleString()} {selectedDonation.currency}
                </div>
              </div>
              <span className="badge badge-success text-xs">{selectedDonation.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Benefactor Name', 'የለጋሽ ስም')}:</span>
                <span className="font-semibold text-slate-900">{selectedDonation.donor}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Payment Method', 'ዘዴ')}:</span>
                <span className="font-semibold text-slate-900">{selectedDonation.type}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Designated Purpose', 'ዓላማ')}:</span>
                <span className="font-medium text-slate-900">{selectedDonation.purpose}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 italic text-center">
              {t(
                '"Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver." — 2 Cor 9:7',
                '«እያንዳንዱ በልቡ እንዳሰበ ይስጥ፤ እግዚአብሔር በደስታ የሚሰጠውን ይወዳልና።» — ፪ ቆሮ ፱፥፯'
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDonation(null)}
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
