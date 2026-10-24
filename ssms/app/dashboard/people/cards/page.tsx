'use client';

// Member ID cards: choose members, a class's students or a department's
// servants, tick who gets a card, print them at bank-card size (85.6 × 54 mm,
// eight to an A4 page) with photo, name, role and a QR code holding the member
// code — check-in and the library find people by scanning it.
// Server work: ./actions.

import React, { useCallback, useEffect, useState } from 'react';
import { IdCard, Printer, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { QrCode } from '@/components/common/QrCode';
import type { LoadMode } from '@/lib/admin/types';
import { loadCards, type CardGroup, type CardPerson, type CardsData } from './actions';

const GROUP_LABEL: Record<CardGroup, [string, string]> = {
  members: ['Members', 'አባላት'],
  students: ['Students', 'ተማሪዎች'],
  servants: ['Servants', 'አገልጋዮች'],
};
const PER_PAGE = 8;

export default function IdCardsPage() {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const color = user?.tenant?.brand?.color ?? '#1e2770';

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<CardsData | null>(null);
  const [query, setQuery] = useState<{ group?: CardGroup; classId?: string; unitId?: string }>({});
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const apply = useCallback((res: Awaited<ReturnType<typeof loadCards>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadCards(query).then(apply);
  }, [apply, query]);

  const choose = (next: typeof query) => {
    setMode('loading');
    setPicked(new Set());
    setQuery(next);
  };

  const group = query.group ?? data?.groups[0];
  const s = q.trim().toLowerCase();
  const list = (data?.people ?? []).filter((p) => !s || p.name_en.toLowerCase().includes(s) || p.name_am.includes(q.trim()) || p.code.toLowerCase().includes(s));
  const toPrint = (data?.people ?? []).filter((p) => picked.has(p.id));
  const pages: CardPerson[][] = [];
  for (let i = 0; i < toPrint.length; i += PER_PAGE) pages.push(toPrint.slice(i, i + PER_PAGE));

  return (
    <>
      <div className="space-y-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('ID cards', 'መታወቂያ ካርዶች')}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {t('Bank-card size, eight to a page. The QR code is the member code — scan it at check-in and in the library.', 'የባንክ ካርድ መጠን፣ በአንድ ገጽ ስምንት። QR ኮዱ የአባልነት ኮዱ ነው — በመገኘት መመዝገቢያና በቤተ መጻሕፍት ይቃኙት።')}
            </p>
          </div>
          <button onClick={() => window.print()} disabled={picked.size === 0} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
            <Printer size={14} /> {t('Print cards', 'ካርዶቹን አትም')} ({picked.size})
          </button>
        </div>

        <AdminModeNotice mode={mode} error={error} />

        {data && (
          <div className="card p-3 flex flex-wrap items-end gap-3">
            <div className="flex gap-1">
              {data.groups.map((g) => (
                <button
                  key={g}
                  onClick={() => choose({ group: g })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${group === g ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                >
                  {t(...GROUP_LABEL[g])}
                </button>
              ))}
            </div>
            {group === 'students' && (
              <select value={query.classId ?? ''} onChange={(e) => choose({ group, classId: e.target.value || undefined })} className="form-input text-sm w-auto">
                <option value="">{t('All classes', 'ሁሉም ክፍሎች')}</option>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
                ))}
              </select>
            )}
            {group === 'servants' && (
              <select value={query.unitId ?? ''} onChange={(e) => choose({ group, unitId: e.target.value || undefined })} className="form-input text-sm w-auto">
                <option value="">{t('All departments', 'ሁሉም ክፍሎች')}</option>
                {data.units.map((u) => (
                  <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                ))}
              </select>
            )}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search name or code', 'በስም ወይም በኮድ ፈልግ')} className="form-input text-sm pl-8" />
            </div>
          </div>
        )}

        {mode === 'live' && data && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-5 items-start">
            <div className="card overflow-hidden">
              <div className="table-container rounded-none border-0">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          checked={list.length > 0 && list.every((p) => picked.has(p.id))}
                          onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...list.map((p) => p.id)]) : new Set())}
                        />
                      </th>
                      <th>{t('Name', 'ስም')}</th>
                      <th className="hidden sm:table-cell">{t('Role', 'ሚና')}</th>
                      <th>{t('Code', 'ኮድ')}</th>
                      <th className="hidden sm:table-cell">{t('Photo', 'ፎቶ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={picked.has(p.id)}
                            onChange={() =>
                              setPicked((x) => {
                                const n = new Set(x);
                                if (n.has(p.id)) n.delete(p.id);
                                else n.add(p.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="text-sm">{locale === 'am' ? p.name_am : p.name_en}</td>
                        <td className="hidden sm:table-cell text-xs text-slate-500">{locale === 'am' ? p.role_am : p.role_en}</td>
                        <td className="font-mono text-xs">{p.code}</td>
                        <td className="hidden sm:table-cell text-xs">{p.has_photo ? '✓' : <span className="text-amber-600">{t('none', 'የለም')}</span>}</td>
                      </tr>
                    ))}
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-sm text-slate-400 py-8">{t('No one here', 'ማንም የለም')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1"><IdCard size={13} /> {t('Preview', 'ቅድመ እይታ')}</div>
              {(toPrint[0] ?? list[0]) && <Card p={toPrint[0] ?? list[0]} school={data.school} valid={data.valid} color={color} />}
            </div>
          </div>
        )}
      </div>

      {/* What prints */}
      {data && (
        <div className="hidden print:block">
          {pages.map((page, i) => (
            <div key={i} className="grid grid-cols-2 gap-[4mm] justify-center content-start break-after-page">
              {page.map((p) => (
                <Card key={p.id} p={p} school={data.school} valid={data.valid} color={color} />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Card({ p, school, valid, color }: { p: CardPerson; school: [string, string]; valid: string; color: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[3mm] border border-slate-300 bg-white text-slate-900 break-inside-avoid"
      style={{ width: '85.6mm', height: '54mm', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <div className="flex items-center gap-[2mm] px-[3mm] text-white" style={{ background: color, height: '12mm' }}>
        <span className="rounded-full bg-white p-[0.5mm] shrink-0">
          <TenantLogo size={34} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-[8.5pt] font-bold truncate">{school[1]}</div>
          <div className="text-[6.5pt] opacity-90 truncate">{school[0]}</div>
        </div>
      </div>
      <div className="flex gap-[3mm] px-[3mm] pt-[2.5mm]">
        <div className="shrink-0 rounded-[1.5mm] border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center" style={{ width: '20mm', height: '25mm' }}>
          {p.has_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/dashboard/people/members/photo/${p.id}`} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[18pt] font-bold text-slate-400">{p.name_am.slice(0, 1)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10pt] font-bold truncate">{p.name_am}</div>
          {p.name_am !== p.name_en && <div className="text-[7.5pt] text-slate-600 truncate">{p.name_en}</div>}
          {p.christian_name && <div className="text-[6.5pt] text-slate-500 truncate">የክርስትና ስም · {p.christian_name}</div>}
          <div className="mt-[1mm] text-[7pt] font-semibold truncate" style={{ color }}>{p.role_am}</div>
          <div className="text-[6.5pt] text-slate-500 truncate">{p.role_en}</div>
          <div className="mt-[1mm] font-mono text-[7.5pt] font-semibold">{p.code}</div>
          {p.reg_no && <div className="font-mono text-[6.5pt] text-slate-500">{p.reg_no}</div>}
        </div>
      </div>
      <div className="absolute right-[3mm] bottom-[3mm] flex flex-col items-center">
        <QrCode value={p.code} size={64} />
      </div>
      {valid && <div className="absolute left-[3mm] bottom-[2mm] text-[6pt] text-slate-500">{valid}</div>}
    </div>
  );
}
