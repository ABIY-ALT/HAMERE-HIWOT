'use client';

import React, { useState } from 'react';
import { Plus, Calendar, MapPin, CheckCircle2, FileText } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PROGRAMS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface AssemblyItem {
  id: string;
  title_en: string;
  title_am: string;
  type: string;
  date: string;
  time: string;
  location: string;
  participants: number;
  coordinator: string;
  status: string;
  agenda?: string;
  minutes?: string;
}

export default function AssembliesPage() {
  const { t, locale } = useLang();
  const [assemblies, setAssemblies] = useState<AssemblyItem[]>(
    MOCK_PROGRAMS.filter((p) => p.type === 'Assembly' || p.type === 'Conference') as AssemblyItem[]
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAssembly, setSelectedAssembly] = useState<AssemblyItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [titleEn, setTitleEn] = useState('');
  const [titleAm, setTitleAm] = useState('');
  const [date, setDate] = useState('2026-09-20');
  const [time, setTime] = useState('09:00 AM - 12:30 PM');
  const [location, setLocation] = useState('Parish Main Assembly Hall');
  const [coordinator, setCoordinator] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddAssembly = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: AssemblyItem = {
      id: `asm-${Date.now()}`,
      title_en: titleEn,
      title_am: titleAm || titleEn,
      type: 'Assembly',
      date,
      time,
      location,
      participants: 200,
      coordinator: coordinator || 'General Assembly Secretariat',
      status: 'SCHEDULED',
      agenda: '1. Opening prayer & hymn\n2. Annual financial & performance review\n3. Next fiscal year roadmap\n4. Closing benediction',
      minutes: 'Meeting agendas ratified by statutory quorum. Resolutions registered in official parish archives.',
    };

    setAssemblies([newItem, ...assemblies]);
    setIsAddModalOpen(false);
    showToast(t(`Assembly "${titleEn}" convened!`, `ጉባኤ "${titleAm || titleEn}" ተጠርቷል!`));

    // Reset
    setTitleEn('');
    setTitleAm('');
    setCoordinator('');
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
            {t('General & Spiritual Assemblies', 'መንፈሳዊ ጉባኤያትና ስብሰባዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish assemblies, annual reviews, Sunday school general meetings, and spiritual sessions',
              'ጠቅላላ ስብሰባዎች፣ ዓመታዊ ግምገማዎችና መንፈሳዊ ጉባኤዎች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Convene Assembly', 'ጉባኤ ጥራ')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assemblies.map((item) => (
          <div key={item.id} className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="badge badge-info">{item.type}</span>
                <span className="badge badge-success">{item.status}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                {locale === 'am' ? item.title_am : item.title_en}
              </h3>
              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-slate-400" />
                  <span>{item.date} — {item.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-slate-400" />
                  <span>{item.location}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">{t('Coordinator', 'አስተባባሪ')}: {item.coordinator}</span>
              <button
                onClick={() => setSelectedAssembly(item)}
                className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                {t('Minutes & Agendas →', 'ቃለ ጉባኤና አጀንዳ →')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Convene Assembly Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Convene Parish General Assembly', 'ጠቅላላ ጉባኤ ጥራ')}
        subtitle={t('Issue statutory summons, agenda points, and logistics', 'ህጋዊ የጉባኤ ጥሪ፣ አጀንዳዎችንና የቦታ መረጃ ያስገቡ')}
      >
        <form onSubmit={handleAddAssembly} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assembly Title (English)', 'የስብሰባው ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Annual General Members Assembly"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assembly Title (Amharic)', 'የስብሰባው ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={titleAm}
                onChange={(e) => setTitleAm(e.target.value)}
                placeholder="ለምሳሌ: ዓመታዊ የጠቅላላ አባላት ጉባኤ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Convocation Date', 'የጉባኤው ቀን')} *
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
                {t('Time Window', 'የሰዓት ገደብ')} *
              </label>
              <input
                type="text"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g. 09:00 AM - 12:30 PM"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Location Venue', 'ቦታ / አዳራሽ')} *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Presiding Officer / Secretariat', 'ሰብሳቢ / ጸሐፊ')}
              </label>
              <input
                type="text"
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
                placeholder="መምህር / ዲያቆን..."
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
              {t('Issue Summons', 'ጥሪ አስተላልፍ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Minutes & Agendas Modal */}
      {selectedAssembly && (
        <Modal
          isOpen={Boolean(selectedAssembly)}
          onClose={() => setSelectedAssembly(null)}
          title={locale === 'am' ? selectedAssembly.title_am : selectedAssembly.title_en}
          subtitle={`${selectedAssembly.date} • ${selectedAssembly.location}`}
        >
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={14} className="text-blue-600" />
                {t('Official Agendas & Deliberations', 'ይፋዊ አጀንዳዎች')}
              </h4>
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs font-mono text-slate-700 whitespace-pre-line leading-relaxed">
                {selectedAssembly.agenda ||
                  '1. ጸሎትና የመክፈቻ ዝማሬ\n2. የዓመታዊ የሥራና የፋይናንስ አፈጻጸም ሪፖርት ማዳመጥ\n3. የክትትል ጉባኤ ግኝቶች ውይይት\n4. የቀጣይ በጀት ዓመት እቅድ ማጽደቅ\n5. የጋራ ጸሎትና ቡራኬ'}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                {t('Approved Minutes & Quorum Confirmation', 'የጸደቀ ቃለ ጉባኤና ምልዓተ ጉባኤ')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl leading-relaxed">
                {selectedAssembly.minutes ||
                  t(
                    'Statutory quorum verified by Performance Audit Committee. All resolutions passed with unanimous general assembly consensus and logged into ecclesiastical records.',
                    'በአፈጻጸም ክትትል ጉባኤ ህጋዊ ምልዓተ ጉባኤ ተረጋግጧል። ሁሉም ውሳኔዎች በጠቅላላ ጉባኤው ድምፅ ተቀባይነት አግኝተው በሰነድ ተመዝግበዋል።'
                  )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAssembly(null)}
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
