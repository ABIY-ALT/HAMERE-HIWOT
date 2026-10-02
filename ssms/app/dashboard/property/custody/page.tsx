'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2, FileSignature } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ASSETS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface CustodyItem {
  id: string;
  custodian: string;
  dept: string;
  name_en: string;
  name_am: string;
  tag: string;
  purchase_date: string;
  condition: string;
  slip_ref?: string;
}

export default function CustodyPage() {
  const { t, locale } = useLang();
  const [custodies, setCustodies] = useState<CustodyItem[]>(MOCK_ASSETS as CustodyItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustody, setSelectedCustody] = useState<CustodyItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [custodian, setCustodian] = useState('');
  const [dept, setDept] = useState('Property Department');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [tag, setTag] = useState('');
  const [custodyDate, setCustodyDate] = useState(new Date().toISOString().slice(0, 10));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAssignCustody = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: CustodyItem = {
      id: `cst-${Date.now()}`,
      custodian,
      dept,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      tag: tag || `AST-2026-${Math.floor(100 + Math.random() * 900)}`,
      purchase_date: custodyDate,
      condition: 'Excellent / Active',
      slip_ref: `SLP-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    setCustodies([newItem, ...custodies]);
    setIsAddModalOpen(false);
    showToast(t(`Asset custody assigned to ${custodian}!`, `የንብረት ኃላፊነት ለ${custodian} ተሰጥቷል!`));

    // Reset
    setCustodian('');
    setNameEn('');
    setNameAm('');
    setTag('');
  };

  const filtered = custodies.filter((a) =>
    a.custodian.toLowerCase().includes(search.toLowerCase()) ||
    a.tag.toLowerCase().includes(search.toLowerCase()) ||
    (locale === 'am' ? a.name_am : a.name_en).toLowerCase().includes(search.toLowerCase())
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
            {t('Asset Custody & Accountability Registry', 'የንብረት ኃላፊነትና ተረካቢዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school individual custodial accountability and signed equipment acceptance',
              'የግል ኃላፊነት የተሰጣቸው ንብረቶችና የርክክብ ሰነዶች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Assign Custody', 'ኃላፊነት መድብ')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search custodians, items, or tags...', 'ተረካቢዎችን ወይም ንብረቶችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('assigned assets', 'የተመደቡ ንብረቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Custodian Name', 'ተረካቢ / ያዥ')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Assigned Asset', 'የተረከበው ንብረት')}</th>
                <th>{t('Asset Tag', 'የንብረት መለያ')}</th>
                <th>{t('Custody Date', 'የተረከበበት ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Voucher', 'የርክክብ ሰነድ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="font-semibold text-slate-900">{a.custodian}</td>
                  <td className="text-slate-600 text-xs">{a.dept}</td>
                  <td className="text-slate-800 font-medium">
                    {locale === 'am' ? a.name_am : a.name_en}
                  </td>
                  <td className="font-mono text-xs text-blue-600 font-semibold">{a.tag}</td>
                  <td className="text-slate-500 text-xs font-mono">{a.purchase_date}</td>
                  <td>
                    <span className="badge badge-success">{t('In Custody', 'በኃላፊነት ላይ')}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedCustody(a)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Sign-off Slip', 'የርክክብ ቅጽ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Custody Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Assign Asset Custodial Handover', 'የንብረት ኃላፊነት ርክክብ መዝግብ')}
        subtitle={t('Delegate accountable custody of Sunday school property', 'የሰንበት ት/ቤት ንብረትን ለተረካቢ አገልጋይ ይመድቡ')}
      >
        <form onSubmit={handleAssignCustody} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Custodian Full Name', 'የተረካቢው ሙሉ ስም')} *
              </label>
              <input
                type="text"
                required
                value={custodian}
                onChange={(e) => setCustodian(e.target.value)}
                placeholder="e.g. Deacon Solomon Girma"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Department / Coordination', 'ክፍል / ቅንጅት')} *
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Property Department">Property Department (የንብረት ክፍል)</option>
                <option value="Education Department">Education Department (የትምህርት ክፍል)</option>
                <option value="Choir Department">Choir Department (የዝማሬ ክፍል)</option>
                <option value="Finance Department">Finance Department (የፋይናንስ ክፍል)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name (English)', 'የንብረቱ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Yamaha Audio Mixer 16-Ch"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name (Amharic)', 'የንብረቱ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ያማሃ ድምፅ ማደባለቂያ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Tag / Inventory Code', 'የንብረት መለያ ቁጥር')}
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="AST-2026-..."
                className="form-input text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Custodial Handover Date', 'የተረከበበት ቀን')} *
              </label>
              <input
                type="date"
                required
                value={custodyDate}
                onChange={(e) => setCustodyDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
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
              {t('Confirm Handover', 'ርክክብ አረጋግጥ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Sign-off Slip Modal */}
      {selectedCustody && (
        <Modal
          isOpen={Boolean(selectedCustody)}
          onClose={() => setSelectedCustody(null)}
          title={t('Asset Custodial Handover Slip', 'የንብረት ርክክብ ማረጋገጫ ሰነድ')}
          subtitle={`${selectedCustody.tag} • ${selectedCustody.custodian}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Asset Name', 'የንብረት ስም')}:</span>
                <span className="font-semibold text-slate-900">{locale === 'am' ? selectedCustody.name_am : selectedCustody.name_en}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Asset Tag', 'የንብረት መለያ')}:</span>
                <span className="font-mono text-blue-600 font-bold">{selectedCustody.tag}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Accountable Custodian', 'ተረካቢ')}:</span>
                <span className="font-semibold text-slate-900">{selectedCustody.custodian} ({selectedCustody.dept})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Handover Date', 'የተረከበበት ቀን')}:</span>
                <span className="font-mono text-slate-700">{selectedCustody.purchase_date}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2.5 text-xs text-blue-900">
              <FileSignature size={16} className="text-blue-600 flex-shrink-0" />
              <span>
                {t(
                  'The custodian hereby accepts statutory fiduciary accountability to safeguard and maintain this parish property in accordance with Category 2 asset bylaws.',
                  'ተረካቢው ይህን የአጥቢያ ሰንበት ት/ቤት ንብረት በታማኝነት የመጠበቅና በአግባቡ የመያዝ ሙሉ ኃላፊነት ወስዷል።'
                )}
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCustody(null)}
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
