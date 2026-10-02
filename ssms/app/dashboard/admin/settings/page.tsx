'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Save, Shield, Database, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { DEFAULT_PARISH_SETTINGS, type LoadMode, type ParishSettings } from '@/lib/admin/types';
import { loadSettings, saveSettings } from '../actions';

export default function SettingsPage() {
  const { t, locale, setLocale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<ParishSettings>(DEFAULT_PARISH_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadSettings().then((res) => {
      if (res.mode === 'live') setSettings(res.data);
      else if (res.mode === 'error') setLoadError(res.error);
      setMode(res.mode);
    });
  }, []);

  const update = (key: keyof ParishSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    setSaveError('');
    if (mode === 'live') {
      setSaving(true);
      const res = await saveSettings(settings);
      setSaving(false);
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('System & Parish Configuration', 'የስርዓት ቅንብሮች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Parish Sunday school profile, Category 2 compliance parameters, and localization',
              'የአጥቢያ ሰንበት ት/ቤት መረጃ፣ የምድብ ሁለት ተገዢነት እና ቋንቋ ቅንብሮች'
            )}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || mode === 'loading' || mode === 'error'}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Configuration', 'ቅንብሮችን መዝግብ')}
        </button>
      </div>

      <AdminModeNotice mode={mode} error={loadError} />

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-sm font-medium">
          <CheckCircle2 size={18} className="text-emerald-600" />
          {mode === 'live'
            ? t('Settings saved successfully!', 'ቅንብሮች በሚገባ ተመዝግበዋል!')
            : t('Demo mode — settings were not saved.', 'የሙከራ ሁኔታ — ቅንብሮቹ አልተቀመጡም።')}
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm font-medium">
          <AlertCircle size={18} />
          {saveError}
        </div>
      )}

      {/* Category 2 Parish Profile */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Shield className="text-blue-600" size={20} />
          <h2 className="text-base font-bold text-slate-900">
            {t('Category 2 Parish Profile', 'የምድብ ሁለት አጥቢያ መረጃ')}
          </h2>
        </div>

        {/* Official Sunday School Seal & Emblem */}
        <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200/70">
          <div
            className="w-24 h-24 rounded-full p-1 shrink-0 shadow-lg relative"
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #d97706)',
              boxShadow: '0 4px 16px rgba(251,191,36,0.3)',
            }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ሐመረ ሕይወት ሰንበት ትምህርት ቤት ማኅተም"
                width={96}
                height={96}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
              {t('Official Sunday School Seal & Emblem', 'ይፋዊ የሰንበት ት/ቤት ማኅተም እና አርማ')}
            </span>
            <h3 className="font-bold text-slate-900 text-base" lang="am">
              ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን ሐመረ ሕይወት ሰንበት ትምህርት ቤት
            </h3>
            <p className="text-xs text-slate-600 font-medium">
              Sallo Debre Tsehay Saint George Church Hamere Hiwot Sabbath School
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-xs text-slate-600 font-mono">
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                ፲፱፻፺፪ ዓ.ም ተመሠረተ (Est. 1992 E.C.)
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                መሪ ጥቅስ: ነህ 2፥20 (Nehemiah 2:20)
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Parish Church Name (English)', 'የአጥቢያ ቤተ ክርስቲያን ስም (እንግሊዝኛ)')}
            </label>
            <input
              type="text"
              value={settings.parish_name_en}
              onChange={update('parish_name_en')}
              className="form-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Parish Church Name (Amharic)', 'የአጥቢያ ቤተ ክርስቲያን ስም (አማርኛ)')}
            </label>
            <input
              type="text"
              value={settings.parish_name_am}
              onChange={update('parish_name_am')}
              className="form-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Parish Category Classification', 'የአጥቢያ ደረጃ ምደባ')}
            </label>
            <input
              type="text"
              readOnly
              value="Category 2 (ምድብ ሁለት)"
              className="form-input text-sm bg-slate-50 text-slate-500 font-semibold"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Diocese Jurisdiction', 'ሀገረ ስብከት')}
            </label>
            <input
              type="text"
              value={settings.diocese}
              onChange={update('diocese')}
              className="form-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Foundation Year (Ethiopian Calendar)', 'የተመሠረተበት ዓመተ ምሕረት')}
            </label>
            <input
              type="text"
              value={settings.foundation_year}
              onChange={update('foundation_year')}
              className="form-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Sunday School Motto / Verse', 'መሪ ጥቅስ')}
            </label>
            <input
              type="text"
              value={settings.motto}
              onChange={update('motto')}
              className="form-input text-sm"
            />
          </div>
        </div>
      </div>

      {/* Statutory Governance Enforcement Rules */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Database className="text-amber-600" size={20} />
          <h2 className="text-base font-bold text-slate-900">
            {t('Statutory Architecture Governance Rules', 'ሕጋዊ የአስተዳደር ደንቦች')}
          </h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <div className="font-semibold text-sm text-slate-900">
                {t('Board of Management 9-Member Quota Enforcement', 'የሥራ አመራር ጉባኤ ባለ 9 አባላት ደንብ')}
              </div>
              <div className="text-xs text-slate-500">
                {t('Strict validation blocking any appointment beyond or below 9 members', 'በትክክል 9 አባላት መሆናቸውን ያረጋግጣል')}
              </div>
            </div>
            <span className="badge badge-success">{t('Enforced', 'ተፈጻሚ')}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <div className="font-semibold text-sm text-slate-900">
                {t('Audit Committee Autonomous Read-Only Access', 'የአፈጻጸም ክትትል ጉባኤ ራሱን የቻለ የቁጥጥር ስልጣን')}
              </div>
              <div className="text-xs text-slate-500">
                {t('Cryptographic cross-organizational mutation monitoring', 'ሁሉን አቀፍ የክትትልና ቁጥጥር ስልጣን')}
              </div>
            </div>
            <span className="badge badge-success">{t('Enforced', 'ተፈጻሚ')}</span>
          </div>
        </div>
      </div>

      {/* Localization Settings */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Globe className="text-purple-600" size={20} />
          <h2 className="text-base font-bold text-slate-900">
            {t('Language & Localization', 'ቋንቋና አካባቢ')}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setLocale('am')}
            className={`px-4 py-2 rounded-lg font-medium text-sm border transition-all ${
              locale === 'am'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            አማርኛ (Amharic)
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`px-4 py-2 rounded-lg font-medium text-sm border transition-all ${
              locale === 'en'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
