'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_ATTENDANCE_SESSIONS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface AttendanceSession {
  id: string;
  date: string;
  class: string;
  topic: string;
  topic_am: string;
  teacher: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export default function AttendancePage() {
  const { t, locale } = useLang();
  const [sessions, setSessions] = useState<AttendanceSession[]>(MOCK_ATTENDANCE_SESSIONS as AttendanceSession[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [className, setClassName] = useState('Grade 1A');
  const [topicEn, setTopicEn] = useState('');
  const [topicAm, setTopicAm] = useState('');
  const [teacher, setTeacher] = useState('');
  const [presentCount, setPresentCount] = useState('25');
  const [absentCount, setAbsentCount] = useState('2');
  const [lateCount, setLateCount] = useState('1');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddSession = (e: React.FormEvent) => {
    e.preventDefault();
    const newSession: AttendanceSession = {
      id: `att-${Date.now()}`,
      date,
      class: className,
      topic: topicEn,
      topic_am: topicAm || topicEn,
      teacher: teacher || 'Assigned Instructor',
      present: Number(presentCount) || 0,
      absent: Number(absentCount) || 0,
      late: Number(lateCount) || 0,
      excused: 0,
    };

    setSessions([newSession, ...sessions]);
    setIsAddModalOpen(false);
    showToast(t(`Attendance recorded for ${className}!`, `ለ${className} የክትትል መዝገብ ተቀምጧል!`));

    // Reset
    setTopicEn('');
    setTopicAm('');
    setTeacher('');
  };

  const filtered = sessions.filter((att) =>
    att.class.toLowerCase().includes(search.toLowerCase()) ||
    (locale === 'am' ? att.topic_am : att.topic).toLowerCase().includes(search.toLowerCase()) ||
    att.teacher.toLowerCase().includes(search.toLowerCase())
  );

  const totalPresent = sessions.reduce((s, a) => s + a.present, 0);
  const totalAbsent = sessions.reduce((s, a) => s + a.absent, 0);
  const totalLate = sessions.reduce((s, a) => s + a.late, 0);
  const grandTotal = totalPresent + totalAbsent + totalLate;
  const overallRate = grandTotal > 0 ? Math.round((totalPresent / grandTotal) * 100) : 100;

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
            {t('Class Attendance Tracking', 'የክፍል ተማሪዎች ክትትል')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Session-by-session student presence, absenteeism tracking, and lesson topics',
              'የተማሪዎች ክፍለ-ጊዜያዊ ተገኝነት፣ መቅረት እና የተማሩት ርዕስ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Take New Attendance', 'ክትትል መዝግብ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{overallRate}%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Average Attendance', 'አማካይ ተገኝነት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">{totalPresent}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Present', 'የተገኙ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-red-500">{totalAbsent}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Absent', 'የቀሩ')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-amber-500">{totalLate}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Late Arrivals', 'የዘገዩ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search sessions...', 'ክፍለ-ጊዜያትን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('sessions', 'ክፍለ-ጊዜያት')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Lesson Topic', 'የትምህርት ርዕስ')}</th>
                <th>{t('Teacher', 'አስተማሪ')}</th>
                <th>{t('Present', 'የተገኙ')}</th>
                <th>{t('Absent', 'የቀሩ')}</th>
                <th>{t('Late', 'የዘገዩ')}</th>
                <th>{t('Rate', 'ምጣኔ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((att) => {
                const total = att.present + att.absent + att.late + (att.excused || 0);
                const pct = total > 0 ? Math.round((att.present / total) * 100) : 100;
                return (
                  <tr key={att.id}>
                    <td className="font-mono text-xs text-slate-600">{att.date}</td>
                    <td className="font-semibold text-slate-900">{att.class}</td>
                    <td className="text-slate-700">{locale === 'am' ? att.topic_am : att.topic}</td>
                    <td className="text-slate-600 text-xs">{att.teacher}</td>
                    <td>
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {att.present}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                        {att.absent}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        {att.late}
                      </span>
                    </td>
                    <td>
                      <span className="font-bold text-xs text-slate-800">{pct}%</span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setSelectedSession(att)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {t('Details', 'ዝርዝር')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Take Attendance Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Take New Attendance Session', 'አዲስ የክፍል ክትትል መዝግብ')}
        subtitle={t('Record student attendance, session date, and lesson topic', 'የተማሪዎችን ተገኝነት፣ ቀንና የተማሩትን ርዕስ ያስገቡ')}
      >
        <form onSubmit={handleAddSession} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Class Session Date', 'የክፍለ-ጊዜ ቀን')} *
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
                {t('Class Group', 'ክፍል')} *
              </label>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Grade 1A">Grade 1A (ክፍል 1ሀ)</option>
                <option value="Grade 1B">Grade 1B (ክፍል 1ለ)</option>
                <option value="Grade 2A">Grade 2A (ክፍል 2ሀ)</option>
                <option value="Grade 3A">Grade 3A (ክፍል 3ሀ)</option>
                <option value="Youth Fellowship">Youth Fellowship (የወጣቶች ክፍል)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lesson Topic (English)', 'የትምህርት ርዕስ (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={topicEn}
                onChange={(e) => setTopicEn(e.target.value)}
                placeholder="e.g. The Creation of the World"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Lesson Topic (Amharic)', 'የትምህርት ርዕስ (አማርኛ)')}
              </label>
              <input
                type="text"
                value={topicAm}
                onChange={(e) => setTopicAm(e.target.value)}
                placeholder="ለምሳሌ: ሥነ-ፍጥረት"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Teacher / Proctor Name', 'አስተማሪ / ተቆጣጣሪ')} *
            </label>
            <input
              type="text"
              required
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="መምህር..."
              className="form-input text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Present Count', 'የተገኙ')}
              </label>
              <input
                type="number"
                min="0"
                value={presentCount}
                onChange={(e) => setPresentCount(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Absent Count', 'የቀሩ')}
              </label>
              <input
                type="number"
                min="0"
                value={absentCount}
                onChange={(e) => setAbsentCount(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Late Count', 'የዘገዩ')}
              </label>
              <input
                type="number"
                min="0"
                value={lateCount}
                onChange={(e) => setLateCount(e.target.value)}
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
              {t('Save Attendance', 'ክትትል መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Session Details Modal */}
      {selectedSession && (
        <Modal
          isOpen={Boolean(selectedSession)}
          onClose={() => setSelectedSession(null)}
          title={`${selectedSession.class} — ${selectedSession.date}`}
          subtitle={locale === 'am' ? selectedSession.topic_am : selectedSession.topic}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div className="text-2xl font-bold text-emerald-600">{selectedSession.present}</div>
                <div className="text-xs text-emerald-700 font-medium mt-0.5">{t('Present', 'የተገኙ')}</div>
              </div>
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <div className="text-2xl font-bold text-red-600">{selectedSession.absent}</div>
                <div className="text-xs text-red-700 font-medium mt-0.5">{t('Absent', 'የቀሩ')}</div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="text-2xl font-bold text-amber-600">{selectedSession.late}</div>
                <div className="text-xs text-amber-700 font-medium mt-0.5">{t('Late', 'የዘገዩ')}</div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Lead Teacher', 'አስተማሪ')}:</span>
                <span className="font-semibold text-slate-900">{selectedSession.teacher}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Lesson Topic', 'የትምህርት ርዕስ')}:</span>
                <span className="font-medium text-slate-900">{locale === 'am' ? selectedSession.topic_am : selectedSession.topic}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Attendance Rate', 'የተገኝነት ምጣኔ')}:</span>
                <span className="font-bold text-blue-600 font-mono">
                  {Math.round((selectedSession.present / (selectedSession.present + selectedSession.absent + selectedSession.late || 1)) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSession(null)}
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
