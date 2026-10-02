'use client';

import React, { useState } from 'react';
import { Download, Printer, Search, CheckCircle2, Check } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_STUDENTS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface StudentResult {
  id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
  class: string;
  avgScore: number;
  rank: number;
  isPassed: boolean;
}

export default function ResultsPage() {
  const { t, locale } = useLang();
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const results: StudentResult[] = MOCK_STUDENTS.map((s, idx) => {
    const avgScore = 82 + ((idx * 7) % 16);
    return {
      id: s.id,
      reg_no: s.reg_no,
      name_en: s.name_en,
      name_am: s.name_am,
      class: s.class,
      avgScore,
      rank: idx + 1,
      isPassed: avgScore >= 60,
    };
  });

  const filtered = results.filter((s) =>
    (locale === 'am' ? s.name_am : s.name_en).toLowerCase().includes(search.toLowerCase()) ||
    s.reg_no.toLowerCase().includes(search.toLowerCase()) ||
    s.class.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportExcel = () => {
    showToast(t('Consolidated grade sheets exported to Excel (.xlsx) successfully!', 'የተማሪዎች አጠቃላይ ውጤት ወደ ኤክሴል ተልኳል!'));
  };

  const handlePrintAll = () => {
    setIsPrintModalOpen(true);
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
            {t('Term Results & Report Cards', 'የሩብ ዓመት ውጤቶችና ሪፖርት ካርድ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Consolidated grade reports, academic standings, rank computation, and promotion certificates',
              'አጠቃላይ ውጤት፣ ደረጃ እና የማለፊያ የምስክር ወረቀት'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintAll}
            className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <Printer size={14} />
            {t('Print All Cards', 'ሁሉንም አትም')}
          </button>
          <button
            onClick={handleExportExcel}
            className="btn btn-primary text-xs inline-flex items-center gap-1.5"
          >
            <Download size={14} />
            {t('Export Excel', 'ኤክሴል አውርድ')}
          </button>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search student or class...', 'ተማሪ ወይም ክፍል ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {filtered.length} {t('students evaluated', 'የተገመገሙ ተማሪዎች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Reg No', 'የምዝገባ ቁጥር')}</th>
                <th>{t('Student', 'ተማሪ')}</th>
                <th>{t('Class', 'ክፍል')}</th>
                <th>{t('Average Score', 'አማካይ ውጤት')}</th>
                <th>{t('Rank', 'ደረጃ')}</th>
                <th>{t('Promotion Status', 'የማለፍ ሁኔታ')}</th>
                <th className="text-right">{t('Report Card', 'ሪፖርት ካርድ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-blue-600 font-semibold">{s.reg_no}</td>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? s.name_am : s.name_en}
                  </td>
                  <td className="text-slate-600 text-xs">{s.class}</td>
                  <td className="font-bold text-slate-800">{s.avgScore}%</td>
                  <td>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      #{s.rank}
                    </span>
                  </td>
                  <td>
                    <span className={s.isPassed ? 'badge badge-success' : 'badge badge-danger'}>
                      {s.isPassed ? t('Promoted', 'አልፏል') : t('Detained', 'ደግሟል')}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedStudent(s)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      <Download size={12} />
                      {t('View Card', 'ካርድ እይ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Individual Student Report Card Modal */}
      {selectedStudent && (
        <Modal
          isOpen={Boolean(selectedStudent)}
          onClose={() => setSelectedStudent(null)}
          title={t('Sunday School Academic Report Card', 'የሰንበት ት/ቤት የትምህርት ውጤት ካርድ')}
          subtitle={`${selectedStudent.name_en} (${selectedStudent.reg_no})`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  {locale === 'am' ? selectedStudent.name_am : selectedStudent.name_en}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedStudent.class} • Rank: #{selectedStudent.rank} of {results.length}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-blue-700 font-mono">
                  {selectedStudent.avgScore}%
                </div>
                <span className={selectedStudent.isPassed ? 'badge badge-success mt-1' : 'badge badge-danger mt-1'}>
                  {selectedStudent.isPassed ? t('Promoted', 'አልፏል') : t('Detained', 'ደግሟል')}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="p-2.5 text-left">{t('Subject', 'የትምህርት ዓይነት')}</th>
                    <th className="p-2.5 text-center">{t('Continuous', 'ተከታታይ')} (30%)</th>
                    <th className="p-2.5 text-center">{t('Final', 'የመጨረሻ')} (70%)</th>
                    <th className="p-2.5 text-right">{t('Total', 'ድምር')} (100%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 font-medium">Holy Scriptures (መጽሐፍ ቅዱስ)</td>
                    <td className="p-2.5 text-center font-mono">27</td>
                    <td className="p-2.5 text-center font-mono">61</td>
                    <td className="p-2.5 text-right font-mono font-bold text-blue-600">88% (A)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium">Church History (የቤተ ክርስቲያን ታሪክ)</td>
                    <td className="p-2.5 text-center font-mono">25</td>
                    <td className="p-2.5 text-center font-mono">58</td>
                    <td className="p-2.5 text-right font-mono font-bold text-blue-600">83% (A-)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium">Liturgy & Worship (ሥርዓተ አምልኮ)</td>
                    <td className="p-2.5 text-center font-mono">28</td>
                    <td className="p-2.5 text-center font-mono">63</td>
                    <td className="p-2.5 text-right font-mono font-bold text-blue-600">91% (A+)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium">Orthodox Hymnody (ዜማ)</td>
                    <td className="p-2.5 text-center font-mono">24</td>
                    <td className="p-2.5 text-center font-mono">59</td>
                    <td className="p-2.5 text-right font-mono font-bold text-blue-600">83% (A-)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  showToast(t(`Report card for ${selectedStudent.name_en} printed!`, `የ${selectedStudent.name_am || selectedStudent.name_en} ሪፖርት ካርድ ታትሟል!`));
                  setSelectedStudent(null);
                }}
                className="btn btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <Printer size={13} />
                {t('Print Report Card', 'ካርድ አትም')}
              </button>
              <button
                onClick={() => setSelectedStudent(null)}
                className="btn btn-secondary text-xs"
              >
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Batch Print Modal */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title={t('Batch Print Term Report Cards', 'ሁሉንም የሩብ ዓመት ሪፖርት ካርዶች አትም')}
        subtitle={t('Generate official print queue for all enrolled students', 'ለሁሉም ተማሪዎች ህጋዊ የህትመት ቅደም ተከተል ያዘጋጁ')}
      >
        <div className="space-y-4 text-sm">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">{t('Total Report Cards', 'ጠቅላላ ሪፖርት ካርዶች')}:</span>
              <span className="font-bold text-slate-900">{results.length} students</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('Academic Term', 'የትምህርት ክፍለ ጊዜ')}:</span>
              <span className="font-semibold text-blue-600">Term II, 2026</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('Parish Seal Included', 'የሰንበት ት/ቤት ማህተም')}:</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check size={14} /> Yes
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPrintModalOpen(false);
                showToast(t('Sent 10 report cards to print queue!', '10 ሪፖርት ካርዶች ወደ ህትመት ተልከዋል!'));
              }}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5"
            >
              <Printer size={13} />
              {t('Confirm & Send to Printer', 'አረጋግጥና አትም')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
