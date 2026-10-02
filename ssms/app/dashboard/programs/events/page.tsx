'use client';

import React, { useState } from 'react';
import { Calendar, Plus, CheckCircle2, FileCheck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_EVENTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface EventItem {
  id: string;
  title_en: string;
  title_am: string;
  date: string;
  type: string;
  responsible: string;
  status: string;
  plan_details?: string;
}

export default function EventsPage() {
  const { t, locale } = useLang();
  const [events, setEvents] = useState<EventItem[]>(MOCK_EVENTS as EventItem[]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [titleEn, setTitleEn] = useState('');
  const [titleAm, setTitleAm] = useState('');
  const [date, setDate] = useState('2026-10-10');
  const [type, setType] = useState('Liturgical Feast');
  const [responsible, setResponsible] = useState('Parish Liturgical Committee');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const newEvt: EventItem = {
      id: `evt-${Date.now()}`,
      title_en: titleEn,
      title_am: titleAm || titleEn,
      date,
      type,
      responsible,
      status: 'PLANNED',
      plan_details: 'Parish liturgical protocols, procession route coordination, choir chants rehearsal, and community agape feast preparations.',
    };

    setEvents([newEvt, ...events]);
    setIsAddModalOpen(false);
    showToast(t(`Parish event "${titleEn}" added!`, `የአጥቢያ ዝግጅት "${titleAm || titleEn}" ተመዝግቧል!`));

    // Reset
    setTitleEn('');
    setTitleAm('');
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
            {t('Feasts & Major Parish Events', 'በዓላት እና ዋና ዋና ዝግጅቶች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Orthodox liturgical feasts, annual patronal days, graduation ceremonies, and holidays',
              'የተቀደሱ በዓላት፣ የንግሥ ቀናት፣ የምረቃ በዓላት እና ሌሎች ዝግጅቶች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Add Parish Event', 'ዝግጅት መዝግብ')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {events.map((evt) => (
          <div key={evt.id} className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="badge badge-primary">{evt.type}</span>
                <span className={evt.status === 'COMPLETED' ? 'badge badge-success' : 'badge badge-info'}>
                  {evt.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                {locale === 'am' ? evt.title_am : evt.title_en}
              </h3>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span>{evt.date}</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{t('Lead Org', 'ኃላፊ')}: {evt.responsible}</span>
              <button
                onClick={() => setSelectedEvent(evt)}
                className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                {t('Plan →', 'እቅድ →')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Parish Event Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Add Major Parish Feast or Event', 'አዲስ የደብር በዓል ወይም ዝግጅት መዝግብ')}
        subtitle={t('Schedule patronal day, graduation ceremony, or liturgical celebration', 'የንግሥ በዓል፣ የምረቃ ዝግጅት ወይም የተቀደሰ በዓል ይመዝግቡ')}
      >
        <form onSubmit={handleAddEvent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Event Title (English)', 'የዝግጅት ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Feast of St. Gabriel Patronal Day"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Event Title (Amharic)', 'የዝግጅት ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={titleAm}
                onChange={(e) => setTitleAm(e.target.value)}
                placeholder="ለምሳሌ: የቅዱስ ገብርኤል ዓመታዊ የንግሥ በዓል"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Event Category', 'የዝግጅት ዓይነት')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Liturgical Feast">Liturgical Feast (የቤተ ክርስቲያን በዓል)</option>
                <option value="Patronal Day">Patronal Day (ዓመታዊ የንግሥ በዓል)</option>
                <option value="Ceremony">Graduation / Ceremony (ምረቃ / ሥነ-ሥርዓት)</option>
                <option value="Pilgrimage">Pilgrimage (መንፈሳዊ ጉዞ)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Event Date', 'ቀን')} *
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
              {t('Responsible Department / Unit', 'ኃላፊ ክፍል / አካል')} *
            </label>
            <input
              type="text"
              required
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="e.g. Parish Liturgical Committee"
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
              {t('Save Event', 'ዝግጅት መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Event Plan Modal */}
      {selectedEvent && (
        <Modal
          isOpen={Boolean(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
          title={locale === 'am' ? selectedEvent.title_am : selectedEvent.title_en}
          subtitle={`${selectedEvent.date} • ${selectedEvent.type}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Event Date', 'የተያዘበት ቀን')}:</span>
                <span className="font-semibold text-slate-900">{selectedEvent.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Lead Committee', 'ኃላፊ አካል')}:</span>
                <span className="font-semibold text-slate-900">{selectedEvent.responsible}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Current Status', 'ሁኔታ')}:</span>
                <span className="badge badge-info">{selectedEvent.status}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileCheck size={14} className="text-blue-600" />
                {t('Operational Logistics & Execution Plan', 'የሥራ ዝግጅትና ማስፈጸሚያ እቅድ')}
              </h4>
              <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl leading-relaxed">
                {selectedEvent.plan_details ||
                  t(
                    'Parish celebration plan: security coordination, guest reception protocols, choir and deacon vestments inspection, sacred instruments setup, and agape meal distribution.',
                    'የበዓል አከባበር እቅድ: የጸጥታና ሥርዓት ጥበቃ፣ የእንግዶች አቀባበል፣ የአልባሳትና ንዋያተ ቅድሳት ዝግጅት፣ እና የአጋፔ ማዕድ ማስተናገድ።'
                  )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEvent(null)}
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
