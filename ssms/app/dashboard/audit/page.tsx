'use client';

import React, { useState } from 'react';
import { Search, Download } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_AUDIT_TRAIL } from '@/lib/mock/modules';

export default function AuditTrailPage() {
  const { t } = useLang();
  const [search, setSearch] = useState('');

  const filtered = MOCK_AUDIT_TRAIL.filter((a) =>
    a.user.toLowerCase().includes(search.toLowerCase()) ||
    a.table.toLowerCase().includes(search.toLowerCase()) ||
    a.changes.toLowerCase().includes(search.toLowerCase()) ||
    a.action.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('System Audit Trail & Immutability Log', 'የስርዓት ኦዲት ታሪክ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Autonomous Performance Audit Committee read-only cross-organizational mutation logs',
              'የአፈጻጸም ክትትል ጉባኤ ራሱን የቻለ የማይቀየር የስርዓት ክትትል መዝገብ'
            )}
          </p>
        </div>
        <button className="btn btn-secondary self-start sm:self-auto inline-flex items-center gap-2 text-xs">
          <Download size={14} />
          {t('Export Cryptographic Audit Log', 'የኦዲት መዝገብ አውርድ')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{MOCK_AUDIT_TRAIL.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('Total Audit Records', 'አጠቃላይ የኦዲት መዝገቦች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-emerald-600">100%</div>
          <div className="text-xs text-slate-500 mt-1">{t('Append-Only Immutability', 'የማይቀየር ታማኝነት')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">4</div>
          <div className="text-xs text-slate-500 mt-1">{t('Active Operator Sessions', 'የተጠቃሚ ክፍለ-ጊዜዎች')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-purple-600">0</div>
          <div className="text-xs text-slate-500 mt-1">{t('Security Anomalies', 'የደህንነት ስጋቶች')}</div>
        </div>
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('Search audit logs...', 'የኦዲት መዝገቦችን ፈልግ...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} {t('events', 'ክስተቶች')}
          </span>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Timestamp', 'የተከናወነበት ሰዓት')}</th>
                <th>{t('Operator User', 'ተጠቃሚ')}</th>
                <th>{t('Action Type', 'የተግባር ዓይነት')}</th>
                <th>{t('Target Schema / Table', 'የተቀየረ ሰንጠረዥ')}</th>
                <th>{t('Record ID', 'የመዝገብ መለያ')}</th>
                <th>{t('Diff Details', 'የተደረገ ለውጥ')}</th>
                <th>{t('IP Address', 'የአይፒ አድራሻ')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td className="font-mono text-[11px] text-slate-500">{log.timestamp}</td>
                  <td className="font-semibold text-xs text-slate-900">{log.user}</td>
                  <td>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                        log.action === 'INSERT'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.action === 'UPDATE'
                          ? 'bg-blue-50 text-blue-700'
                          : log.action === 'APPROVE'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-slate-600">{log.table}</td>
                  <td className="font-mono text-xs text-blue-600 font-semibold">{log.record}</td>
                  <td className="text-xs text-slate-800">{log.changes}</td>
                  <td className="font-mono text-[11px] text-slate-400">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
