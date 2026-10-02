'use client';

import React, { useState } from 'react';
import { Calendar, Plus, Search, MapPin, Users, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PROGRAMS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface ProgramItem {
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
  description?: string;
}

export default function ProgramsPage() {
  const { t, locale } = useLang();
  const [programs, setPrograms] = useState<ProgramItem[]>(MOCK_PROGRAMS as ProgramItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [titleEn, setTitleEn] = useState('');
  const [titleAm, setTitleAm] = useState('');
  const [type, setType] = useState('Conference');
  const [date, setDate] = useState('2026-09-15');
  const [time, setTime] = useState('02:00 PM - 05:00 PM');
  const [location, setLocation] = useState('Parish Main Hall');
  const [participants, setParticipants] = useState('150');
  const [coordinator, setCoordinator] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddProgram = (e: React.FormEvent) => {
    e.preventDefault();
    const newPrg: ProgramItem = {
      id: `prg-${Date.now()}`,
      title_en: titleEn,
      title_am: titleAm || titleEn,
      type,
      date,
      time,
      location,
      participants: Number(participants) || 50,
      coordinator: coordinator || 'Parish Executive Committee',
      status: 'SCHEDULED',
      description: 'Annual liturgical and spiritual conference organized for Sunday school members.',
    };

    setPrograms([newPrg, ...programs]);
    setIsAddModalOpen(false);
    showToast(t(`Program "${titleEn}" scheduled successfully!`, `ፕሮግራም "${titleAm || titleEn}" ተመዝግቧል!`));

    // Reset
    setTitleEn('');
    setTitleAm('');
    setCoordinator('');
  };

  const filtered = programs.filter((p) =>
    (locale === 'am' ? p.title_am : p.title_en).toLowerCase().includes(search.toLowerCase()) ||
    p.type.toLowerCase().includes(search.toLowerCase()) ||
    p.location.toLowerCase().includes(search.toLowerCase())
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
            {t('Programs & Assemblies Registry', 'ፕሮግራሞች እና ጉባኤያት መዝገብ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish spiritual conferences, educational workshops, assemblies, and fellowships',
              'መንፈሳዊ ጉባኤዎች፣ የትምህርት አውደ ጥናቶች፣ ስብሰባዎች እና ዝግጅቶች'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Schedule Program', 'አዲስ ፕሮግራም መርሐግብር')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{programs.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Programs', 'አጠቃላይ ፕሮግራሞች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">
            {programs.filter((p) => p.status === 'SCHEDULED' || p.status === 'APPROVED').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Upcoming Scheduled', 'የተያዙ ፕሮግራሞች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">
            {programs.reduce((s, p) => s + p.participants, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('Projected Attendees', 'ተሳታፊዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">5</div>
          <div className="text-xs text-slate-500 mt-1">{t('Venues Used', 'አዳራሾች')}</div>
        </div>
      </div>

      {/* Programs List */}
      <div className="card p-5 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={t('Search programs...', 'ፕሮግራሞችን ፈልግ...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filtered.map((prg) => (
            <div key={prg.id} className="border border-slate-200/80 rounded-xl p-5 bg-white hover:shadow-sm transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="badge badge-primary">{prg.type}</span>
                  <span className="badge badge-success">{prg.status}</span>
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-2">
                  {locale === 'am' ? prg.title_am : prg.title_en}
                </h3>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{prg.date} at {prg.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-slate-400" />
                    <span>{prg.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users size={13} className="text-slate-400" />
                    <span>{prg.participants} {t('Expected Attendees', 'ተሳታፊዎች')}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('Lead', 'አስተባባሪ')}: {prg.coordinator}</span>
                <button
                  onClick={() => setSelectedProgram(prg)}
                  className="text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  {t('Details →', 'ዝርዝር →')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Program Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Schedule New Parish Program', 'አዲስ ፕሮግራም መርሐግብር ያዘጋጁ')}
        subtitle={t('Convene fellowship conference, spiritual workshop, or assembly', 'መንፈሳዊ ጉባኤ፣ አውደ ጥናት ወይም ስብሰባ ያዘጋጁ')}
      >
        <form onSubmit={handleAddProgram} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Program Title (English)', 'የፕሮግራም ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Annual Youth Spiritual Revival"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Program Title (Amharic)', 'የፕሮግራም ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={titleAm}
                onChange={(e) => setTitleAm(e.target.value)}
                placeholder="ለምሳሌ: ዓመታዊ የወጣቶች መንፈሳዊ ጉባኤ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Program Classification', 'የፕሮግራም ዓይነት')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Conference">Spiritual Conference (መንፈሳዊ ጉባኤ)</option>
                <option value="Workshop">Educational Workshop (አውደ ጥናት)</option>
                <option value="Assembly">Assembly / Meeting (ጠቅላላ ስብሰባ)</option>
                <option value="Fellowship">Fellowship & Outreach (የሕብረት መርሐግብር)</option>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Time Window', 'የሰዓት ገደብ')} *
              </label>
              <input
                type="text"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g. 02:00 PM - 05:00 PM"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Venue / Location', 'ቦታ / አዳራሽ')} *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Parish Main Auditorium"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Expected Attendees', 'የሚጠበቁ ተሳታፊዎች')}
              </label>
              <input
                type="number"
                min="10"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lead Coordinator / Department', 'ዋና አስተባባሪ')}
              </label>
              <input
                type="text"
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
                placeholder="e.g. Education Coordination"
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
              {t('Schedule Program', 'መርሐግብር መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Program Details Modal */}
      {selectedProgram && (
        <Modal
          isOpen={Boolean(selectedProgram)}
          onClose={() => setSelectedProgram(null)}
          title={locale === 'am' ? selectedProgram.title_am : selectedProgram.title_en}
          subtitle={`${selectedProgram.type} • ${selectedProgram.status}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Date & Time', 'ቀንና ሰዓት')}:</span>
                <span className="font-semibold text-slate-900">{selectedProgram.date} ({selectedProgram.time})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Venue', 'አዳራሽ')}:</span>
                <span className="font-semibold text-slate-900">{selectedProgram.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Expected Attendees', 'ተሳታፊዎች')}:</span>
                <span className="badge badge-info">{selectedProgram.participants} attendees</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Lead Coordinator', 'አስተባባሪ')}:</span>
                <span className="font-semibold text-slate-900">{selectedProgram.coordinator}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-white border border-slate-200 p-3.5 rounded-xl">
              {selectedProgram.description ||
                t(
                  'Parish church Sunday school gathering focusing on spiritual teachings, hymns, fellowship, and administrative coordination.',
                  'መንፈሳዊ ትምህርት፣ ዝማሬ፣ የኅብረት ጸሎትና አስተዳደራዊ አጀንዳዎችን የሚያካትት የሰንበት ት/ቤት ጉባኤ።'
                )}
            </p>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedProgram(null)}
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
