'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_DISCIPLINE_RECORDS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface DisciplineItem {
  id: string;
  person: string;
  type: string;
  reason: string;
  date: string;
  status: string;
  resolved_by: string;
  resolution_notes?: string;
}

export default function DisciplinePage() {
  const { t } = useLang();
  const [records, setRecords] = useState<DisciplineItem[]>(MOCK_DISCIPLINE_RECORDS as DisciplineItem[]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<DisciplineItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [person, setPerson] = useState('');
  const [recordType, setRecordType] = useState('Ethical Warning');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [resolvedBy, setResolvedBy] = useState('Parish Ethics Committee');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddCase = (e: React.FormEvent) => {
    e.preventDefault();
    const newCase: DisciplineItem = {
      id: `dsc-${Date.now()}`,
      person,
      type: recordType,
      reason,
      date,
      status: 'UNDER_REVIEW',
      resolved_by: resolvedBy,
      resolution_notes: 'Spiritual guidance provided by confession father and formal written commitment signed.',
    };

    setRecords([newCase, ...records]);
    setIsAddModalOpen(false);
    showToast(t(`Disciplinary case opened for ${person}!`, `ለ${person} የዲሲፕሊን ጉዳይ ተመዝግቧል!`));

    // Reset
    setPerson('');
    setReason('');
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
            {t('Disciplinary & Ethics Committee Records', 'የዲሲፕሊንና ሥነ-ምግባር መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school spiritual ethics counseling, warnings, and case resolutions',
              'የመንፈሳዊ ሥነ-ምግባር ምክክር፣ ማስጠንቀቂያዎችና ውሳኔዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Open Disciplinary Case', 'የዲሲፕሊን ጉዳይ መዝግብ')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Individual', 'ግለሰብ')}</th>
                <th>{t('Record Type', 'ዓይነት')}</th>
                <th>{t('Grounds / Reason', 'ምክንያት')}</th>
                <th>{t('Date Logged', 'የተመዘገበበት ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th>{t('Resolved By', 'የፈታው አካል')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold text-slate-900">{r.person}</td>
                  <td>
                    <span className="badge badge-warning">{r.type}</span>
                  </td>
                  <td className="text-slate-700 text-xs">{r.reason}</td>
                  <td className="text-slate-500 text-xs font-mono">{r.date}</td>
                  <td>
                    <span className={r.status === 'RESOLVED' ? 'badge badge-success' : 'badge badge-warning'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="text-slate-600 text-xs">{r.resolved_by || '—'}</td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedCase(r)}
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

      {/* Open Disciplinary Case Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Log Disciplinary or Ethical Inquiry', 'አዲስ የሥነ-ምግባር ጉዳይ መዝግብ')}
        subtitle={t('Record spiritual counseling, ethics warning, or committee resolution', 'የመንፈሳዊ ምክክር ወይም ማስጠንቀቂያ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddCase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Individual / Servant Name', 'የአገልጋዩ ስም')} *
              </label>
              <input
                type="text"
                required
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="e.g. Deacon Solomon"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Record Classification', 'ዓይነት')} *
              </label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Ethical Warning">Ethical Warning (የሥነ-ምግባር ማስጠንቀቂያ)</option>
                <option value="Spiritual Counseling">Spiritual Counseling (መንፈሳዊ ምክክር)</option>
                <option value="Service Suspension">Service Suspension (ከአገልግሎት ማገድ)</option>
                <option value="Reconciliation">Reconciliation (የዕርቅ ውሳኔ)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Inquiry Date', 'የተመዘገበበት ቀን')} *
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
                {t('Presiding Committee / Father', 'ጉዳዩን የያዘው አካል')} *
              </label>
              <input
                type="text"
                required
                value={resolvedBy}
                onChange={(e) => setResolvedBy(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Grounds & Context Description', 'የጉዳዩ ዝርዝር ምክንያት')} *
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated unauthorized absence from Sunday liturgical service"
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
              {t('Record Case', 'ጉዳዩን መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Case Details Modal */}
      {selectedCase && (
        <Modal
          isOpen={Boolean(selectedCase)}
          onClose={() => setSelectedCase(null)}
          title={`${selectedCase.person} — ${selectedCase.type}`}
          subtitle={`Logged on ${selectedCase.date} • Status: ${selectedCase.status}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Presiding Committee', 'የያዘው አካል')}:</span>
                <span className="font-semibold text-slate-900">{selectedCase.resolved_by}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Classification', 'ዓይነት')}:</span>
                <span className="badge badge-warning">{selectedCase.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Grounds', 'ምክንያት')}:</span>
                <span className="font-medium text-slate-900">{selectedCase.reason}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                {t('Resolution & Spiritual Guidance', 'የተሰጠ ውሳኔና መንፈሳዊ ምክር')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl">
                {selectedCase.resolution_notes ||
                  t(
                    'Spiritual guidance provided in accordance with the Holy Church canons and parish Sunday school bylaws. Brotherly reconciliation achieved.',
                    'በቤተ ክርስቲያን ቀኖና እና በሰንበት ት/ቤቱ ደንብ መሠረት መንፈሳዊ ምክር ተሰጥቶ ጉዳዩ በሰላም ተፈትቷል።'
                  )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCase(null)}
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
