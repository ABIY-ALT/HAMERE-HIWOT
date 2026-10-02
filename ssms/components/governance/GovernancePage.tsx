'use client';

import React, { useState } from 'react';
import { Users, Crown, AlertTriangle, CheckCircle, Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { cn, formatDate, statusColor } from '@/lib/utils';
import {
  MOCK_GOVERNANCE_BODIES,
  MOCK_GOVERNANCE_MEMBERSHIPS_BY_BODY,
  MOCK_GOVERNANCE_POSITIONS,
  MOCK_GOVERNANCE_RULES,
  MOCK_PERSONS,
} from '@/lib/mock/governance';
import { Modal } from '@/components/ui/Modal';
import type { GovernanceMembership } from '@/types';

interface GovernancePageProps {
  bodyCode: string;
}

export default function GovernancePage({ bodyCode }: GovernancePageProps) {
  const { t, locale } = useLang();

  const body = MOCK_GOVERNANCE_BODIES.find((b) => b.organization_unit?.code === bodyCode);
  const rule = MOCK_GOVERNANCE_RULES.find((r) => r.body_id === body?.id);

  const initialMemberships = body ? (MOCK_GOVERNANCE_MEMBERSHIPS_BY_BODY[body.id] ?? []) : [];
  const [memberships, setMemberships] = useState<GovernanceMembership[]>(initialMemberships);

  const [isAppointModalOpen, setIsAppointModalOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<GovernanceMembership | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [personId, setPersonId] = useState(MOCK_PERSONS[0]?.id ?? '');
  const [positionId, setPositionId] = useState(MOCK_GOVERNANCE_POSITIONS[0]?.id ?? '');
  const [termStart, setTermStart] = useState('2026-01-01');
  const [termEnd, setTermEnd] = useState('2028-01-01');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAppoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body) return;

    const newMembership: GovernanceMembership = {
      id: `gm-${Date.now()}`,
      body_id: body.id,
      person_id: personId,
      position_id: positionId,
      appointment_date: new Date().toISOString().slice(0, 10),
      term_start: termStart,
      term_end: termEnd,
      status: 'ACTIVE',
      appointed_by: 'Super Admin',
      remarks: 'Official appointment ratified by General Assembly',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setMemberships([newMembership, ...memberships]);
    setIsAppointModalOpen(false);

    const appointedPerson = MOCK_PERSONS.find((p) => p.id === personId);
    showToast(t(`Appointment confirmed for ${appointedPerson?.full_name_en ?? 'Member'}!`, `የአባል ሹመት ጸድቋል!`));
  };

  const activeCount = memberships.filter((m) => m.status === 'ACTIVE').length;
  const requiredCount = rule ? parseInt(rule.rule_value) : null;
  const ruleViolated = requiredCount !== null && activeCount !== requiredCount;

  return (
    <div>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">
            {body ? (locale === 'am' ? body.name_am : body.name_en) : t(bodyCode, bodyCode)}
          </h1>
          <p className="page-subtitle">
            {body ? (locale === 'am' ? body.description_am : body.description_en) ?? '' : ''}
          </p>
        </div>

        <button
          onClick={() => setIsAppointModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('Appoint Member', 'አባል ሹም')}
        </button>
      </div>

      {/* Rule alert */}
      {rule && (
        <div
          className={cn(
            'rounded-xl p-4 mb-6 flex items-center gap-3',
            ruleViolated
              ? 'bg-red-50 border border-red-200'
              : 'bg-emerald-50 border border-emerald-200'
          )}
        >
          {ruleViolated ? (
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          ) : (
            <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
          )}
          <div>
            <div className={cn('font-semibold text-sm', ruleViolated ? 'text-red-700' : 'text-emerald-700')}>
              {ruleViolated
                ? t('Membership Rule Violation!', 'የአባልነት ደንብ ጥሰት!')
                : t('Membership Rule Satisfied', 'የአባልነት ደንብ ተሟልቷል')}
            </div>
            <div className={cn('text-xs mt-0.5', ruleViolated ? 'text-red-600' : 'text-emerald-600')}>
              {locale === 'am' ? rule.description_am : rule.description_en}
              {' — '}
              {t(`Current: ${activeCount} / Required: ${requiredCount}`, `ያሉ: ${activeCount} / ያስፈልጋል: ${requiredCount}`)}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50"><Users size={20} className="text-blue-600" /></div>
          <div>
            <div className="text-2xl font-bold">{activeCount}</div>
            <div className="text-sm text-slate-500">{t('Active Members', 'ንቁ አባላት')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-violet-50"><Crown size={20} className="text-violet-600" /></div>
          <div>
            <div className="text-2xl font-bold">{MOCK_GOVERNANCE_POSITIONS.length}</div>
            <div className="text-sm text-slate-500">{t('Positions', 'ሥልጣኖች')}</div>
          </div>
        </div>
      </div>

      {/* Members table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-700">{t('Members', 'አባላት')}</h2>
          <span className="text-xs text-slate-400 font-medium">{memberships.length} {t('members appointed', 'የተሾሙ አባላት')}</span>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Member', 'አባል')}</th>
                <th>{t('Position', 'ቦታ')}</th>
                <th>{t('Appointment Date', 'የሹመት ቀን')}</th>
                <th>{t('Term Period', 'የአገልግሎት ዘመን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {memberships.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    {t('No members assigned yet', 'ምንም አባል አልተመደበም')}
                  </td>
                </tr>
              ) : (
                memberships.map((m) => {
                  const person = MOCK_PERSONS.find((p) => p.id === m.person_id);
                  const position = MOCK_GOVERNANCE_POSITIONS.find((pos) => pos.id === m.position_id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div>
                          <div className="font-medium text-slate-900">{person?.full_name_en ?? '—'}</div>
                          <div className="text-xs text-slate-400" lang="am">
                            {person?.full_name_am ?? ''}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {position
                            ? (locale === 'am' ? position.name_am : position.name_en)
                            : '—'}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-slate-600">{formatDate(m.appointment_date)}</td>
                      <td className="text-xs text-slate-600">
                        {formatDate(m.term_start)} → {m.term_end ? formatDate(m.term_end) : 'Indefinite'}
                      </td>
                      <td>
                        <span className={cn('badge', statusColor(m.status))}>
                          {m.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => setSelectedMembership(m)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          {t('Details', 'ዝርዝር')}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Appoint Member Modal */}
      <Modal
        isOpen={isAppointModalOpen}
        onClose={() => setIsAppointModalOpen(false)}
        title={t('Appoint Governance Member', 'የአስተዳደር አባል ሹም')}
        subtitle={body ? (locale === 'am' ? body.name_am : body.name_en) : ''}
      >
        <form onSubmit={handleAppoint} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Select Person', 'ሰው ምረጥ')} *
            </label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="form-input text-sm"
              required
            >
              {MOCK_PERSONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name_en} ({p.membership_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Select Governance Position', 'የሥራ ኃላፊነት ምረጥ')} *
            </label>
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className="form-input text-sm"
              required
            >
              {MOCK_GOVERNANCE_POSITIONS.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {locale === 'am' ? pos.name_am : pos.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Term Start', 'የአገልግሎት ጅምር')} *
              </label>
              <input
                type="date"
                required
                value={termStart}
                onChange={(e) => setTermStart(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Term End', 'የአገልግሎት ፍፃሜ')}
              </label>
              <input
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAppointModalOpen(false)}
              className="btn btn-secondary text-xs"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs">
              {t('Confirm Appointment', 'ሹመት አጽድቅ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Member Details Modal */}
      {selectedMembership && (
        <Modal
          isOpen={Boolean(selectedMembership)}
          onClose={() => setSelectedMembership(null)}
          title={t('Appointment Dossier', 'የሹመት ማህደር')}
          subtitle={selectedMembership.id}
        >
          {(() => {
            const p = MOCK_PERSONS.find((person) => person.id === selectedMembership.person_id);
            const pos = MOCK_GOVERNANCE_POSITIONS.find((position) => position.id === selectedMembership.position_id);
            return (
              <div className="space-y-4 text-sm">
                <div className="p-4 bg-blue-50 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{p?.full_name_en}</h4>
                    <span className="text-xs text-blue-700 font-semibold">{locale === 'am' ? pos?.name_am : pos?.name_en}</span>
                  </div>
                  <span className="badge badge-success">{selectedMembership.status}</span>
                </div>

                <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">{t('Appointment Date', 'የተሾመበት ቀን')}</span>
                    <span className="font-mono">{formatDate(selectedMembership.appointment_date)}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">{t('Term Start', 'የአገልግሎት ጅምር')}</span>
                    <span className="font-mono">{formatDate(selectedMembership.term_start)}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">{t('Term End', 'የአገልግሎት ፍፃሜ')}</span>
                    <span className="font-mono">{selectedMembership.term_end ? formatDate(selectedMembership.term_end) : 'Indefinite'}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-slate-500">{t('Ratified By', 'ያጸደቀው')}</span>
                    <span className="font-medium">{selectedMembership.appointed_by || 'General Assembly'}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={() => setSelectedMembership(null)} className="btn btn-secondary text-xs">
                    {t('Close', 'ዝጋ')}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
