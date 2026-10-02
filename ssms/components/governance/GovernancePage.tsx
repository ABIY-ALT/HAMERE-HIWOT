'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, Crown, AlertTriangle, CheckCircle, Plus, AlertCircle, History, UserMinus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatDate } from '@/lib/utils';
import {
  MOCK_GOVERNANCE_BODIES,
  MOCK_GOVERNANCE_MEMBERSHIPS_BY_BODY,
  MOCK_GOVERNANCE_POSITIONS,
  MOCK_GOVERNANCE_RULES,
  MOCK_PERSONS,
} from '@/lib/mock/governance';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { appointMember, endMembership, loadGovernanceBody } from '@/app/dashboard/governance/actions';
import {
  SINGLE_HOLDER_POSITIONS,
  type GovBodyView,
  type GovMembership,
  type MembershipStatus,
} from '@/lib/governance/types';
import type { LoadMode } from '@/lib/admin/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

interface GovernancePageProps {
  bodyCode: string;
}

/** Sample data for demo mode. */
function demoView(bodyCode: string): GovBodyView {
  const body = MOCK_GOVERNANCE_BODIES.find((b) => b.organization_unit?.code === bodyCode);
  const rule = MOCK_GOVERNANCE_RULES.find((r) => r.body_id === body?.id);
  const positions = MOCK_GOVERNANCE_POSITIONS.map((p) => ({
    id: p.id, code: p.code, name_en: p.name_en, name_am: p.name_am, authority_level: p.authority_level,
  }));
  const memberships: GovMembership[] = (body ? MOCK_GOVERNANCE_MEMBERSHIPS_BY_BODY[body.id] ?? [] : []).map((m) => {
    const p = MOCK_PERSONS.find((x) => x.id === m.person_id);
    const pos = positions.find((x) => x.id === m.position_id);
    return {
      id: m.id, person_id: m.person_id, person: p?.full_name_en ?? '—', person_am: p?.full_name_am ?? p?.full_name_en ?? '—',
      member_code: p?.membership_code ?? '', phone: p?.phone_primary ?? '', position_id: m.position_id,
      position: pos?.name_en ?? '—', position_am: pos?.name_am ?? '—', position_code: pos?.code ?? '',
      authority_level: pos?.authority_level ?? 9, appointment_date: m.appointment_date, term_start: m.term_start,
      term_end: m.term_end, status: m.status as MembershipStatus, appointed_by: '', remarks: m.remarks ?? '',
    };
  });
  return {
    body: body
      ? { id: body.id, name_en: body.name_en, name_am: body.name_am, description_en: body.description_en ?? '', description_am: body.description_am ?? '' }
      : null,
    seatLimit: rule?.is_enforced ? Number(rule.rule_value) : null,
    ruleText_en: rule?.description_en ?? '',
    ruleText_am: rule?.description_am ?? '',
    positions,
    memberships,
    candidates: MOCK_PERSONS.map((p) => ({ id: p.id, name_en: p.full_name_en, name_am: p.full_name_am ?? p.full_name_en, code: p.membership_code })),
  };
}

type EndReason = Exclude<MembershipStatus, 'ACTIVE'>;
const END_REASONS: EndReason[] = ['EXPIRED', 'RESIGNED', 'REMOVED', 'INACTIVE'];

export default function GovernancePage({ bodyCode }: GovernancePageProps) {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('GOVERNANCE_MANAGE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [view, setView] = useState<GovBodyView | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Appoint form
  const [appointOpen, setAppointOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [termStart, setTermStart] = useState(todayIso());
  const [termEnd, setTermEnd] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // End-term form
  const [ending, setEnding] = useState<GovMembership | null>(null);
  const [endReason, setEndReason] = useState<EndReason>('EXPIRED');
  const [endDate, setEndDate] = useState(todayIso());
  const [endRemarks, setEndRemarks] = useState('');

  const apply = useCallback(
    (res: Awaited<ReturnType<typeof loadGovernanceBody>>) => {
      if (res.mode === 'live') setView(res.data);
      else if (res.mode === 'demo') setView((v) => v ?? demoView(bodyCode));
      else setError(res.error);
      setMode(res.mode);
    },
    [bodyCode]
  );

  useEffect(() => {
    loadGovernanceBody(bodyCode).then(apply);
  }, [bodyCode, apply]);

  const statusLabel = (s: MembershipStatus) =>
    ({
      ACTIVE: t('Active', 'ንቁ'),
      INACTIVE: t('Inactive', 'የቦዘነ'),
      EXPIRED: t('Term ended', 'ዘመኑ ያበቃ'),
      RESIGNED: t('Resigned', 'የለቀቀ'),
      REMOVED: t('Removed', 'የተነሳ'),
    })[s];

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const body = view?.body ?? null;
  const memberships = view?.memberships ?? [];
  const active = memberships
    .filter((m) => m.status === 'ACTIVE')
    .sort((a, b) => a.authority_level - b.authority_level || a.person.localeCompare(b.person));
  const past = memberships.filter((m) => m.status !== 'ACTIVE');
  const seatLimit = view?.seatLimit ?? null;
  const seatsFull = seatLimit !== null && active.length >= seatLimit;
  const today = todayIso();
  const overdue = active.filter((m) => m.term_end && m.term_end < today);

  const takenPositionIds = new Set(
    active.filter((m) => SINGLE_HOLDER_POSITIONS.includes(m.position_code)).map((m) => m.position_id)
  );
  const activePersonIds = new Set(active.map((m) => m.person_id));

  const openAppoint = () => {
    setPersonId('');
    setPositionId(view?.positions.find((p) => p.code === 'MEMBER')?.id ?? '');
    setTermStart(todayIso());
    setTermEnd('');
    setRemarks('');
    setFormError('');
    setAppointOpen(true);
  };

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body) return;
    setFormError('');
    const input = { person_id: personId, position_id: positionId, term_start: termStart, term_end: termEnd, remarks };
    if (mode === 'live') {
      setBusy(true);
      const res = await appointMember(body.id, input);
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadGovernanceBody(bodyCode));
    } else {
      if (seatsFull) return setFormError(t('All seats are filled.', 'ሁሉም ወንበሮች ተይዘዋል።'));
      const p = view?.candidates.find((c) => c.id === personId);
      const pos = view?.positions.find((x) => x.id === positionId);
      setView((v) =>
        v && {
          ...v,
          memberships: [
            {
              id: `gm-${Date.now()}`, person_id: personId, person: p?.name_en ?? '—', person_am: p?.name_am ?? '—',
              member_code: p?.code ?? '', phone: '', position_id: positionId, position: pos?.name_en ?? '—',
              position_am: pos?.name_am ?? '—', position_code: pos?.code ?? '', authority_level: pos?.authority_level ?? 9,
              appointment_date: todayIso(), term_start: termStart, term_end: termEnd || null, status: 'ACTIVE',
              appointed_by: '', remarks,
            },
            ...v.memberships,
          ],
        }
      );
    }
    setAppointOpen(false);
    showToast('success', t('Appointment recorded', 'ሹመቱ ተመዝግቧል'));
  };

  const handleEnd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ending) return;
    setFormError('');
    if (mode === 'live') {
      setBusy(true);
      const res = await endMembership(ending.id, { status: endReason, end_date: endDate, remarks: endRemarks });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadGovernanceBody(bodyCode));
    } else {
      setView((v) =>
        v && { ...v, memberships: v.memberships.map((m) => (m.id === ending.id ? { ...m, status: endReason, term_end: endDate } : m)) }
      );
    }
    setEnding(null);
    showToast('success', t('Term ended — kept in the history', 'ዘመኑ አብቅቷል — በታሪክ ውስጥ ተቀምጧል'));
  };

  const memberRow = (m: GovMembership, showActions: boolean) => (
    <tr key={m.id}>
      <td>
        <div className="font-medium text-slate-900">{locale === 'am' ? m.person_am : m.person}</div>
        <div className="text-xs text-slate-400 font-mono">{m.member_code}</div>
      </td>
      <td>
        <span className={cn('badge', m.authority_level <= 3 ? 'badge-warning' : 'badge-info')}>
          {locale === 'am' ? m.position_am : m.position}
        </span>
      </td>
      <td className="text-xs text-slate-600">
        {formatDate(m.term_start)} → {m.term_end ? formatDate(m.term_end) : t('open-ended', 'ያልተወሰነ')}
        {m.status === 'ACTIVE' && m.term_end && m.term_end < today && (
          <div className="text-[11px] text-red-600 font-semibold">{t('Term date has passed', 'የአገልግሎት ዘመኑ አልፏል')}</div>
        )}
      </td>
      <td>
        <span className={cn('badge', m.status === 'ACTIVE' ? 'badge-success' : 'bg-slate-100 text-slate-600')}>
          {statusLabel(m.status)}
        </span>
      </td>
      <td className="text-xs text-slate-500">{m.remarks || '—'}</td>
      {showActions && (
        <td className="text-right">
          {canManage && m.status === 'ACTIVE' && (
            <button
              onClick={() => {
                setEnding(m);
                setEndReason(m.term_end && m.term_end < today ? 'EXPIRED' : 'RESIGNED');
                setEndDate(todayIso());
                setEndRemarks('');
                setFormError('');
              }}
              className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50 inline-flex items-center gap-1"
            >
              <UserMinus size={12} /> {t('End term', 'ዘመን አብቃ')}
            </button>
          )}
        </td>
      )}
    </tr>
  );

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{body ? (locale === 'am' ? body.name_am : body.name_en) : bodyCode}</h1>
          <p className="page-subtitle">{body ? (locale === 'am' ? body.description_am : body.description_en) : ''}</p>
        </div>
        {canManage && body && (
          <button
            onClick={openAppoint}
            disabled={seatsFull || mode === 'loading'}
            title={seatsFull ? t('All seats are filled', 'ሁሉም ወንበሮች ተይዘዋል') : undefined}
            className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} />
            {t('Appoint Member', 'አባል ሹም')}
          </button>
        )}
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && !body && (
        <p className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">
          {t(
            'This body is not set up in the database yet. Run database migration 010 (governance).',
            'ይህ አካል ገና በዳታቤዝ ውስጥ አልተዘጋጀም። ማይግሬሽን 010 ያስኪዱ።'
          )}
        </p>
      )}

      {/* Seat rule */}
      {seatLimit !== null && (
        <div className={cn('rounded-xl p-4 flex items-center gap-3 border', active.length === seatLimit ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>
          {active.length === seatLimit ? (
            <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
          )}
          <div>
            <div className={cn('font-semibold text-sm', active.length === seatLimit ? 'text-emerald-700' : 'text-amber-800')}>
              {active.length === seatLimit
                ? t('All seats are filled', 'ሁሉም ወንበሮች ተሞልተዋል')
                : t(`${seatLimit - active.length} seat(s) still empty`, `${seatLimit - active.length} ወንበር(ዎች) ክፍት ናቸው`)}
            </div>
            <div className="text-xs mt-0.5 text-slate-600">
              {locale === 'am' ? view?.ruleText_am : view?.ruleText_en}
              {' — '}
              {t(`${active.length} of ${seatLimit} seats filled`, `ከ${seatLimit} ወንበሮች ${active.length} ተይዘዋል`)}
            </div>
          </div>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="rounded-xl p-3 border border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          {t(
            `${overdue.length} member(s) are past their term end date. End their terms or record a renewal.`,
            `${overdue.length} አባል(ላት) የአገልግሎት ዘመናቸው አልፏል። ዘመናቸውን ያብቁ ወይም እንደገና ይሹሙ።`
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50"><Users size={20} className="text-blue-600" /></div>
          <div>
            <div className="text-2xl font-bold">{seatLimit !== null ? `${active.length} / ${seatLimit}` : active.length}</div>
            <div className="text-sm text-slate-500">{t('Active Members', 'ንቁ አባላት')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-violet-50"><Crown size={20} className="text-violet-600" /></div>
          <div>
            <div className="text-2xl font-bold">{active.filter((m) => SINGLE_HOLDER_POSITIONS.includes(m.position_code)).length}</div>
            <div className="text-sm text-slate-500">{t('Officers', 'ኃላፊዎች')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-slate-50"><History size={20} className="text-slate-500" /></div>
          <div>
            <div className="text-2xl font-bold">{past.length}</div>
            <div className="text-sm text-slate-500">{t('Past appointments', 'ያለፉ ሹመቶች')}</div>
          </div>
        </div>
      </div>

      {/* Active members */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-700">{t('Current Members', 'የአሁኑ አባላት')}</h2>
          <span className="text-xs text-slate-400 font-medium">{active.length}</span>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Member', 'አባል')}</th>
                <th>{t('Position', 'ቦታ')}</th>
                <th>{t('Term', 'የአገልግሎት ዘመን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th>{t('Remarks', 'ማስታወሻ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    {mode === 'loading' ? '…' : t('No members appointed yet', 'እስካሁን የተሾመ አባል የለም')}
                  </td>
                </tr>
              ) : (
                active.map((m) => memberRow(m, true))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History */}
      {past.length > 0 && (
        <div className="card">
          <button onClick={() => setShowPast((s) => !s)} className="w-full px-5 py-4 flex items-center justify-between text-left">
            <h2 className="text-base font-bold text-slate-700">{t('Past Members (history)', 'ያለፉ አባላት (ታሪክ)')}</h2>
            <span className="text-xs text-blue-600 font-semibold">{showPast ? t('Hide', 'ደብቅ') : t(`Show ${past.length}`, `${past.length} አሳይ`)}</span>
          </button>
          {showPast && (
            <div className="table-container rounded-none border-0 border-t border-slate-100">
              <table>
                <tbody>{past.map((m) => memberRow(m, false))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Appoint Member Modal */}
      <Modal
        isOpen={appointOpen}
        onClose={() => setAppointOpen(false)}
        title={t('Appoint Member', 'አባል ሹም')}
        subtitle={body ? (locale === 'am' ? body.name_am : body.name_en) : ''}
      >
        <form onSubmit={handleAppoint} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Person (registered member)', 'ሰው (የተመዘገበ አባል)')} *</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="form-input text-sm" required>
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {(view?.candidates ?? [])
                .filter((c) => !activePersonIds.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'am' ? c.name_am : c.name_en} ({c.code})
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {t('Only registered members can be appointed (People → Members).', 'የተመዘገቡ አባላት ብቻ ሊሾሙ ይችላሉ (ሰዎች → አባላት)።')}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Position', 'የሥራ ኃላፊነት')} *</label>
            <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="form-input text-sm" required>
              <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
              {(view?.positions ?? []).map((pos) => (
                <option key={pos.id} value={pos.id} disabled={takenPositionIds.has(pos.id)}>
                  {locale === 'am' ? pos.name_am : pos.name_en}
                  {takenPositionIds.has(pos.id) ? ` — ${t('already held', 'ተይዟል')}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Term Start', 'የአገልግሎት ጅምር')} *</label>
              <input type="date" required value={termStart} onChange={(e) => setTermStart(e.target.value)} className="form-input text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Term End', 'የአገልግሎት ፍፃሜ')}</label>
              <input type="date" min={termStart} value={termEnd} onChange={(e) => setTermEnd(e.target.value)} className="form-input text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Remarks (e.g. elected by the General Assembly on…)', 'ማስታወሻ (ለምሳሌ፡ በጠቅላላ ጉባኤ የተመረጠበት ቀን…)')}</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="form-input text-sm" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setAppointOpen(false)} className="btn btn-secondary text-xs">
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Confirm Appointment', 'ሹመት አጽድቅ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* End term Modal */}
      {ending && (
        <Modal
          isOpen
          onClose={() => setEnding(null)}
          title={t('End Term', 'የአገልግሎት ዘመን አብቃ')}
          subtitle={`${locale === 'am' ? ending.person_am : ending.person} — ${locale === 'am' ? ending.position_am : ending.position}`}
        >
          <form onSubmit={handleEnd} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={16} /> {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Reason', 'ምክንያት')} *</label>
                <select value={endReason} onChange={(e) => setEndReason(e.target.value as EndReason)} className="form-input text-sm">
                  {END_REASONS.map((r) => (
                    <option key={r} value={r}>{statusLabel(r)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('End date', 'ያበቃበት ቀን')} *</label>
                <input type="date" required min={ending.term_start} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Remarks', 'ማስታወሻ')}</label>
              <input type="text" value={endRemarks} onChange={(e) => setEndRemarks(e.target.value)} className="form-input text-sm" />
            </div>
            <p className="text-xs text-slate-500">
              {t('The appointment stays in the history; the seat becomes free.', 'ሹመቱ በታሪክ ውስጥ ይቀመጣል፤ ወንበሩ ክፍት ይሆናል።')}
            </p>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEnding(null)} className="btn btn-secondary text-xs">
                {t('Cancel', 'ሰርዝ')}
              </button>
              <button type="submit" disabled={busy} className="btn btn-danger text-xs disabled:opacity-60">
                {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('End Term', 'ዘመን አብቃ')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
