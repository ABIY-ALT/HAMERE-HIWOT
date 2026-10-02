'use client';

import React, { useState } from 'react';
import { Plus, Search, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_CHOIR_MEMBERS } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface ChoirItem {
  id: string;
  name_en: string;
  name_am: string;
  baptismal: string;
  voice: string;
  instrument: string;
  hymn_categories?: string[];
  hymns?: string;
  vestment: string;
  status: string;
}

export default function SacredArtsChoirPage() {
  const { t, locale } = useLang();
  const [members, setMembers] = useState<ChoirItem[]>(MOCK_CHOIR_MEMBERS as unknown as ChoirItem[]);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ChoirItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [baptismal, setBaptismal] = useState('');
  const [voice, setVoice] = useState('Tenor');
  const [instrument, setInstrument] = useState('Kebero & Tsenatsil');
  const [vestment, setVestment] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const newCh: ChoirItem = {
      id: `choir-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      baptismal: baptismal || 'ወልደ...',
      voice,
      instrument: instrument || 'None',
      hymns: 'Kidasie & Mahlet',
      vestment: vestment || `VST-${Math.floor(100 + Math.random() * 900)}`,
      status: 'ACTIVE',
    };

    setMembers([newCh, ...members]);
    setIsAddModalOpen(false);
    showToast(t(`Choir vocalist ${nameEn} registered!`, `ዘማሪ ${nameAm || nameEn} ተመዝግቧል!`));

    // Reset
    setNameEn('');
    setNameAm('');
    setBaptismal('');
    setVestment('');
  };

  const filtered = members.filter((c) =>
    (locale === 'am' ? c.name_am : c.name_en).toLowerCase().includes(search.toLowerCase()) ||
    c.voice.toLowerCase().includes(search.toLowerCase())
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
            {t('Hymnody, Choir & Sacred Arts Department', 'ዜማ፣ ዘማሪ እና ቅዱስ ጥበብ ክፍል')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish choir organization, vocal section management, vestments, and liturgical practice',
              'የዘማሪዎች አደረጃጀት፣ የድምፅ ክፍሎች፣ አልባሳት እና የዝማሬ ልምምድ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Add Choir Member', 'ዘማሪ ጨምር')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{members.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Choristers', 'አጠቃላይ ዘማሪዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">4</div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Sections', 'የድምፅ ክፍሎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">12</div>
          <div className="text-xs text-slate-500 mt-1">{t('Instruments Maintained', 'የሙዚቃ መሳሪያዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Vestment Assigned', 'አልባሳት የተሟሉ')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search choir members...', 'ዘማሪዎችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('members', 'አባላት')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Name', 'ስም')}</th>
                <th>{t('Voice Section', 'የድምፅ ክፍል')}</th>
                <th>{t('Liturgical Instrument', 'የሚያገለግሉበት መሳሪያ')}</th>
                <th>{t('Vestment Tag', 'የአልባሳት ቁጥር')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? c.name_am : c.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{c.voice}</span>
                  </td>
                  <td className="text-slate-700 text-xs">{c.instrument}</td>
                  <td className="font-mono text-xs text-slate-500">{c.vestment}</td>
                  <td>
                    <span className={c.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-warning'}>
                      {c.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => setSelectedMember(c)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Dossier', 'መዝገብ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Choir Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Register Sacred Arts Chorister', 'አዲስ ዘማሪ መዝግብ')}
        subtitle={t('Assign vocal section, sacred instrument, and liturgical vestment', 'የድምፅ ክፍል፣ የዜማ መሣሪያና የአልባሳት ቁጥር ያስገቡ')}
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Vocalist Name (English)', 'የዘማሪ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Martha Haile"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Vocalist Name (Amharic)', 'የዘማሪ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ማርታ ኃይሌ"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Baptismal Name', 'የክርስትና ስም')}
              </label>
              <input
                type="text"
                value={baptismal}
                onChange={(e) => setBaptismal(e.target.value)}
                placeholder="ወለተ..."
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Voice Section', 'የድምፅ ክፍል')} *
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Soprano">Soprano (ሶፕራኖ)</option>
                <option value="Alto">Alto (አልቶ)</option>
                <option value="Tenor">Tenor (ቴነር)</option>
                <option value="Bass">Bass (ባስ)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Sacred Instrument', 'የዜማ መሣሪያ')}
              </label>
              <input
                type="text"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="e.g. Kebero, Tsenatsil, Begena"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Assigned Vestment Tag', 'የአልባሳት መለያ ቁጥር')}
              </label>
              <input
                type="text"
                value={vestment}
                onChange={(e) => setVestment(e.target.value)}
                placeholder="e.g. VST-301"
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
              {t('Save Chorister', 'ዘማሪ መዝግብ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Choir Member Dossier Modal */}
      {selectedMember && (
        <Modal
          isOpen={Boolean(selectedMember)}
          onClose={() => setSelectedMember(null)}
          title={locale === 'am' ? selectedMember.name_am : selectedMember.name_en}
          subtitle={`${selectedMember.voice} Section • Tag: ${selectedMember.vestment}`}
        >
          <div className="space-y-4 text-sm">
            <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-purple-700 font-semibold">{t('Voice Classification', 'የድምፅ ደረጃ')}</div>
                <div className="text-xl font-bold text-purple-900 mt-0.5">{selectedMember.voice}</div>
              </div>
              <span className="badge badge-success text-xs">{selectedMember.status}</span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Baptismal Name', 'የክርስትና ስም')}:</span>
                <span className="font-semibold text-slate-900">{selectedMember.baptismal}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Liturgical Instrument', 'የሚያገለግሉበት መሳሪያ')}:</span>
                <span className="font-semibold text-slate-900">{selectedMember.instrument}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Assigned Vestment Tag', 'የአልባሳት ቁጥር')}:</span>
                <span className="font-mono text-blue-600 font-semibold">{selectedMember.vestment}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">{t('Chant Disciplines', 'የሚያውቋቸው ዜማዎች')}:</span>
                <span className="font-medium text-slate-900">{selectedMember.hymns}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedMember(null)}
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
