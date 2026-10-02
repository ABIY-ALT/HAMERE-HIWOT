'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_MAINTENANCE } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface MaintenanceItem {
  id: string;
  asset: string;
  asset_tag: string;
  type: string;
  description: string;
  date: string;
  cost: number;
  assigned_to: string;
  status: string;
}

export default function MaintenancePage() {
  const { t } = useLang();
  const [orders, setOrders] = useState<MaintenanceItem[]>(MOCK_MAINTENANCE as MaintenanceItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [asset, setAsset] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [serviceType, setServiceType] = useState('Electronic Repair');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('1500');
  const [assignedTo, setAssignedTo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const newOrder: MaintenanceItem = {
      id: `MNT-2026-${String(orders.length + 1).padStart(3, '0')}`,
      asset,
      asset_tag: assetTag || `AST-${Math.floor(100 + Math.random() * 900)}`,
      type: serviceType,
      description,
      date,
      cost: Number(cost) || 0,
      assigned_to: assignedTo || 'Certified Parish Technician',
      status: 'IN_PROGRESS',
    };

    setOrders([newOrder, ...orders]);
    setIsAddModalOpen(false);
    showToast(t(`Work order ${newOrder.id} opened for ${asset}!`, `የጥገና ትዕዛዝ ${newOrder.id} ተከፍቷል!`));

    // Reset
    setAsset('');
    setAssetTag('');
    setDescription('');
    setAssignedTo('');
  };

  const filtered = orders.filter((m) =>
    m.asset.toLowerCase().includes(search.toLowerCase()) ||
    m.asset_tag.toLowerCase().includes(search.toLowerCase()) ||
    m.assigned_to.toLowerCase().includes(search.toLowerCase())
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
            {t('Property Maintenance & Repairs', 'የንብረት ጥገና')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Preventative maintenance, electronic repairs, furniture restorations, and service orders',
              'የቋሚ ዕቃዎች፣ ኤሌክትሮኒክስና የቢሮ ዕቃዎች ጥገና መዝገብ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Open Work Order', 'አዲስ የጥገና ትዕዛዝ')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search maintenance orders...', 'የጥገና ትዕዛዞችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('orders', 'ትዕዛዞች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Order #', 'የትዕዛዝ ቁጥር')}</th>
                <th>{t('Asset Tag & Name', 'የንብረት ስም')}</th>
                <th>{t('Service Type', 'የጥገና ዓይነት')}</th>
                <th>{t('Issue Description', 'የብልሽቱ ዝርዝር')}</th>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Cost (ETB)', 'ወጪ (ብር)')}</th>
                <th>{t('Assigned Technician', 'ቴክኒሻን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs font-bold text-blue-600">{m.id}</td>
                  <td>
                    <div className="font-semibold text-slate-900">{m.asset}</div>
                    <div className="text-[11px] font-mono text-slate-400">{m.asset_tag}</div>
                  </td>
                  <td>
                    <span className="badge badge-info">{m.type}</span>
                  </td>
                  <td className="text-slate-700 text-xs">{m.description}</td>
                  <td className="font-mono text-xs text-slate-500">{m.date}</td>
                  <td className="font-mono text-xs font-semibold text-slate-800">
                    {m.cost.toLocaleString()} ETB
                  </td>
                  <td className="text-slate-600 text-xs">{m.assigned_to}</td>
                  <td>
                    <span className={m.status === 'COMPLETED' ? 'badge badge-success' : 'badge badge-warning'}>
                      {m.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedOrder(m)}
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

      {/* Open Work Order Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Open Maintenance Work Order', 'አዲስ የጥገና ትዕዛዝ ክፈት')}
        subtitle={t('Issue work order for parish equipment diagnostics and repair', 'የተበላሸ ንብረት ጥገና ትዕዛዝ መዝግብ')}
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Name', 'የንብረት ስም')} *
              </label>
              <input
                type="text"
                required
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="e.g. Stage Loudspeaker #2"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Asset Tag', 'የንብረት መለያ')}
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
                {t('Service Type', 'የጥገና ዓይነት')} *
              </label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Electronic Repair">Electronic Repair (ኤሌክትሮኒክስ ጥገና)</option>
                <option value="Audio System Calibration">Audio Calibration (የድምፅ መስተካከል)</option>
                <option value="Furniture Restoration">Furniture Restoration (የእንጨት ዕቃዎች ጥገና)</option>
                <option value="Preventative Service">Preventative Service (መደበኛ ክትትል)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Estimated Cost (ETB)', 'የተገመተ ወጪ (ብር)')} *
              </label>
              <input
                type="number"
                min="0"
                required
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="form-input text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assigned Technician', 'የተመደበ ቴክኒሻን')} *
              </label>
              <input
                type="text"
                required
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. Elias Technical Works"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Order Date', 'የትዕዛዝ ቀን')} *
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
              {t('Issue Description / Symptoms', 'የብልሽቱ ዝርዝር')} *
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Audio distortion on high frequencies, loose connector"
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
              {t('Issue Work Order', 'ትዕዛዝ አውጣ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Work Order Details Modal */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`${selectedOrder.asset} (${selectedOrder.asset_tag})`}
          subtitle={`Order #${selectedOrder.id} • ${selectedOrder.type}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Technician Assigned', 'የተመደበ ቴክኒሻን')}:</span>
                <span className="font-semibold text-slate-900">{selectedOrder.assigned_to}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Repair Cost', 'የጥገና ወጪ')}:</span>
                <span className="font-bold text-slate-900 font-mono">{selectedOrder.cost.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Date Issued', 'የተመዘገበበት ቀን')}:</span>
                <span className="font-mono text-slate-700">{selectedOrder.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Status', 'ሁኔታ')}:</span>
                <span className="badge badge-info">{selectedOrder.status}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                {t('Issue Diagnosis & Repair Notes', 'የብልሽት ምርመራና የጥገና ማስታወሻ')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl">
                {selectedOrder.description}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedOrder(null)}
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
