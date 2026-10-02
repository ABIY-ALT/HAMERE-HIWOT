'use client';

import React, { useState } from 'react';
import { Plus, Calendar, User, CheckCircle2, BookOpen } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_HYMN_ASSIGNMENTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface HymnItem {
  id: string;
  title_en: string;
  title_am: string;
  type: string;
  date: string;
  lead: string;
  assigned_to: string;
  status: string;
  notes?: string;
}

export default function HymnsPage() {
  const { t, locale } = useLang();
  const [hymns, setHymns] = useState<HymnItem[]>(MOCK_HYMN_ASSIGNMENTS as HymnItem[]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedHymn, setSelectedHymn] = useState<HymnItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [titleEn, setTitleEn] = useState('');
  const [titleAm, setTitleAm] = useState('');
  const [type, setType] = useState('Liturgical Chant');
  const [date, setDate] = useState('2026-09-14');
  const [lead, setLead] = useState('');
  const [assignedTo, setAssignedTo] = useState('Full Choir');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAssignHymn = (e: React.FormEvent) => {
    e.preventDefault();
    const newHymn: HymnItem = {
      id: `hymn-${Date.now()}`,
      title_en: titleEn,
      title_am: titleAm || titleEn,
      type,
      date,
      lead: lead || 'Lead Cantor',
      assigned_to: assignedTo,
      status: 'ASSIGNED',
      notes: 'Practice vocal harmony, rhythmic beat (Kebero 3-stroke cadence), and liturgical text pronunciations according to Saint Yared melody rules.',
    };

    setHymns([newHymn, ...hymns]);
    setIsAddModalOpen(false);
    showToast(t(`Hymn "${titleEn}" assigned!`, `ዜማ "${titleAm || titleEn}" ተመድቧል!`));

    // Reset
    setTitleEn('');
    setTitleAm('');
    setLead('');
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
            {t('Hymn Assignments & Liturgical Chants', 'የዜማ ምደባ እና ዝማሬዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Schedule Kidasie hymns, Wedase Maryam canticles, festive mezmurs, and lead cantors',
              'የቅዳሴ ዜማዎች፣ ውዳሴ ማርያም፣ የበዓላት ዝማሬዎች እና መሪ ዘማሪዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Assign Hymn', 'ዜማ መድብ')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {hymns.map((h) => (
          <div key={h.id} className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="badge badge-primary">{h.type}</span>
                <span className={h.status === 'ASSIGNED' ? 'badge badge-info' : 'badge badge-warning'}>
                  {h.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                {locale === 'am' ? h.title_am : h.title_en}
              </h3>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span>{h.date}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  <span>{t('Lead', 'መሪ')}: <strong>{h.lead}</strong></span>
                </div>
                <div>
                  {t('Group', 'ቡድን')}: {h.assigned_to}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                onClick={() => setSelectedHymn(h)}
                className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                {t('Practice Notes →', 'የልምምድ ማስታወሻ →')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Assign Hymn Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Assign Liturgical Chant or Hymn', 'የዜማ ምደባ መዝግብ')}
        subtitle={t('Schedule hymn lead, vocal choir ensemble, and liturgy date', 'መሪ ዘማሪ፣ ዝማሬው የሚቀርብበትን ቀንና ቡድን ያስገቡ')}
      >
        <form onSubmit={handleAssignHymn} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Hymn Title (English)', 'የዝማሬው ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Egziabher Niguse Wist"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Hymn Title (Amharic)', 'የዝማሬው ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={titleAm}
                onChange={(e) => setTitleAm(e.target.value)}
                placeholder="ለምሳሌ: እግዚአብሔር ንጉሥ ውእቱ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Hymn Category', 'የዜማ ዓይነት')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Liturgical Chant">Liturgical Chant (የቅዳሴ ዜማ)</option>
                <option value="Wedase Maryam">Wedase Maryam (ውዳሴ ማርያም)</option>
                <option value="Patronal Festive Mezmur">Patronal Festive Mezmur (የንግሥ ዝማሬ)</option>
                <option value="General Sunday Mezmur">General Sunday Mezmur (የእሁድ ዝማሬ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Performance Date', 'የሚቀርብበት ቀን')} *
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lead Cantor / Vocalist', 'መሪ ዘማሪ')} *
              </label>
              <input
                type="text"
                required
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                placeholder="e.g. Deacon Solomon"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Ensemble / Group Assigned', 'የተመደበው ቡድን')}
              </label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Full Choir, Section A..."
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
              {t('Assign Hymn', 'ዜማ መድብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Practice Notes Modal */}
      {selectedHymn && (
        <Modal
          isOpen={Boolean(selectedHymn)}
          onClose={() => setSelectedHymn(null)}
          title={locale === 'am' ? selectedHymn.title_am : selectedHymn.title_en}
          subtitle={`${selectedHymn.type} • Lead: ${selectedHymn.lead}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Liturgical Date', 'ቀን')}:</span>
                <span className="font-semibold text-slate-900">{selectedHymn.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Assigned Ensemble', 'ቡድን')}:</span>
                <span className="badge badge-info">{selectedHymn.assigned_to}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Lead Cantor', 'መሪ')}:</span>
                <span className="font-semibold text-slate-900">{selectedHymn.lead}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BookOpen size={14} className="text-blue-600" />
                {t('Liturgical Practice Instructions & Yaredic Melody Notes', 'የልምምድ መመሪያና የያሬዳዊ ዜማ ማስታወሻ')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl leading-relaxed">
                {selectedHymn.notes ||
                  t(
                    'Practice vocal harmony, rhythmic beat (Kebero 3-stroke cadence), and liturgical text pronunciations according to Saint Yared melody rules.',
                    'የድምፅ ቅንጅት፣ የከበሮ አመታት ሥርዓት እና የቅዱስ ያሬድ ዜማ ህግጋትን መሰረት በማድረግ ዝማሬውን ልምምድ ማድረግ።'
                  )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedHymn(null)}
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
