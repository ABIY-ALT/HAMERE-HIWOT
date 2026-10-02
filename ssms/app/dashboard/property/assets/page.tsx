'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ASSETS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

export default function AssetsPage() {
  const { t, locale } = useLang();
  const [assets, setAssets] = useState(MOCK_ASSETS);
  const [search, setSearch] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<typeof MOCK_ASSETS[0] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Asset State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [category, setCategory] = useState('IT Equipment');
  const [serial, setSerial] = useState('');
  const [custodian, setCustodian] = useState('');
  const [dept, setDept] = useState('Admin');
  const [value, setValue] = useState(15000);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const newAsset = {
      id: `ast-${Date.now()}`,
      tag: `AST-GEN-${String(assets.length + 1).padStart(4, '0')}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      category,
      category_am: category,
      serial: serial || `SN${Date.now()}`,
      condition: 'GOOD',
      custodian,
      dept,
      purchase_date: new Date().toISOString().slice(0, 10),
      value: Number(value),
      status: 'IN_USE',
    };

    setAssets([newAsset, ...assets]);
    setIsAddModalOpen(false);
    showToast(t(`Asset ${nameEn} registered successfully!`, `ንብረት ${nameAm || nameEn} ተመዝግቧል!`));

    setNameEn('');
    setNameAm('');
    setSerial('');
    setCustodian('');
  };

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);

  const filtered = assets.filter((a) =>
    (locale === 'am' ? a.name_am : a.name_en).toLowerCase().includes(search.toLowerCase()) ||
    a.tag.toLowerCase().includes(search.toLowerCase()) ||
    a.custodian.toLowerCase().includes(search.toLowerCase()) ||
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
            {t('Fixed Assets & Property Registry', 'የንብረት መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school capital inventory: IT gear, AV electronics, furniture, and musical instruments',
              'የሰንበት ት/ቤት ቋሚ ንብረቶች: ኮምፒውተሮች፣ የድምፅና ምስል እቃዎች፣ የቢሮ ዕቃዎች እና የሙዚቃ መሳሪያዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Register New Asset', 'አዲስ ንብረት መዝግብ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{assets.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Asset Items', 'አጠቃላይ ንብረቶች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {totalValue.toLocaleString()} ETB
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Book Value (ETB)', 'የንብረት ጠቅላላ ዋጋ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {assets.filter((a) => a.condition === 'GOOD' || a.condition === 'EXCELLENT').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('In Good Condition', 'በጥሩ ሁኔታ ላይ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Barcoded & Tagged', 'መለያ የተለጠፈባቸው')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search assets by tag, name or custodian...', 'በመለያ፣ በስም ወይም በያዥ ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('assets', 'ንብረቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Asset Tag', 'የንብረት መለያ')}</th>
                <th>{t('Item Description', 'የንብረት ስም')}</th>
                <th>{t('Category', 'ምድብ')}</th>
                <th>{t('Custodian', 'ተረካቢ / ያዥ')}</th>
                <th>{t('Department', 'ክፍል')}</th>
                <th>{t('Book Value', 'የመዝገብ ዋጋ')}</th>
                <th>{t('Condition', 'ሁኔታ')}</th>
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
                  <td className="text-slate-600 text-xs">
                    {locale === 'am' ? a.category_am : a.category}
                  </td>
                  <td className="text-slate-700 text-xs font-medium">{a.custodian}</td>
                  <td className="text-slate-500 text-xs">{a.dept}</td>
                  <td className="font-mono text-xs font-semibold text-slate-800">
                    {a.value.toLocaleString()} ETB
                  </td>
                  <td>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        a.condition === 'EXCELLENT' || a.condition === 'GOOD'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {a.condition}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedAsset(a)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
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

      {/* Add Asset Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Register New Fixed Asset', 'አዲስ ቋሚ ንብረት መዝግብ')}
        subtitle={t('Assign barcode tag, designated custodian, and acquisition value', 'የንብረት መለያ፣ ያዥና ዋጋ ያስገቡ')}
      >
        <form onSubmit={handleAddAsset} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name (English)', 'የንብረት ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Yamaha Acoustic Guitar"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name (Amharic)', 'የንብረት ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ያማሃ አኮስቲክ ጊታር"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Category', 'ምድብ')} *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-input text-sm"
              >
                <option value="IT Equipment">IT Equipment</option>
                <option value="AV Equipment">AV Equipment</option>
                <option value="Furniture">Furniture</option>
                <option value="Musical Instruments">Musical Instruments</option>
                <option value="Liturgical Vessels">Liturgical Vessels</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Serial Number', 'የሴሪያል ቁጥር')}
              </label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="SN-..."
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assigned Custodian', 'ተረካቢ')} *
              </label>
              <input
                type="text"
                required
                value={custodian}
                onChange={(e) => setCustodian(e.target.value)}
                placeholder="e.g. Choir Lead"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Department', 'ክፍል')} *
              </label>
              <input
                type="text"
                required
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                placeholder="Sacred Arts"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Book Value (ETB)', 'ዋጋ (ብር)')} *
              </label>
              <input
                type="number"
                required
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="form-input text-sm"
              />
            </div>
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
              {t('Register Asset', 'ንብረት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Asset Details Modal */}
      {selectedAsset && (
        <Modal
          isOpen={Boolean(selectedAsset)}
          onClose={() => setSelectedAsset(null)}
          title={locale === 'am' ? selectedAsset.name_am : selectedAsset.name_en}
          subtitle={`${selectedAsset.tag} • ${selectedAsset.category}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t('Book Value', 'የመዝገብ ዋጋ')}</span>
                <span className="text-xl font-black text-slate-900">{selectedAsset.value.toLocaleString()} ETB</span>
              </div>
              <span className="badge badge-success">{selectedAsset.condition}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Serial Number', 'የሴሪያል ቁጥር')}</span>
                <span className="font-mono text-slate-800">{selectedAsset.serial}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Current Custodian', 'የአሁኑ ያዥ')}</span>
                <span className="font-semibold text-blue-600">{selectedAsset.custodian}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Department', 'ክፍል')}</span>
                <span className="text-slate-800">{selectedAsset.dept}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Acquisition Date', 'የተገዛበት ቀን')}</span>
                <span className="font-mono text-slate-700">{selectedAsset.purchase_date}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAsset(null)}
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
