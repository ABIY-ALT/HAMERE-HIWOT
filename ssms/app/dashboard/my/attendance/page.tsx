'use client';

import React from 'react';
import { useLang } from '@/contexts/LangContext';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { ATTENDANCE_STYLE, PortalNotice, attendanceCounts, useAttendanceLabel, useMyPortal } from '@/components/student/portal';

/** The student's own roll-call record for this year. */
export default function MyAttendancePage() {
  const { t, locale } = useLang();
  const label = useAttendanceLabel();
  const { mode, data, error } = useMyPortal();

  if (!data) return <PortalNotice mode={mode} error={error} />;
  const c = attendanceCounts(data.attendance);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('My attendance', 'የእኔ ክትትል')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Late counts as attended; excused days are not counted.', 'የዘገየ እንደተገኘ ይቆጠራል፤ በፈቃድ የቀሩ አይቆጠሩም።')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          [t('Rate', 'ምጣኔ'), c.rate === null ? '—' : `${c.rate}%`],
          [t('Present', 'ተገኝቷል'), c.present],
          [t('Late', 'ዘግይቷል'), c.late],
          [t('Absent', 'ቀርቷል'), c.absent],
          [t('Excused', 'በፈቃድ'), c.excused],
        ].map(([l, v]) => (
          <div key={String(l)} className="card p-4">
            <div className="text-xl font-semibold text-slate-900">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Lesson', 'ትምህርት')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
              </tr>
            </thead>
            <tbody>
              {data.attendance.map((r) => (
                <tr key={r.date}>
                  <td className="text-xs text-slate-700 whitespace-nowrap">{formatEthiopianDate(r.date, locale, { weekday: true })}</td>
                  <td className="text-xs text-slate-600">{(locale === 'am' ? r.topic_am : r.topic) || '—'}</td>
                  <td>
                    <span className={ATTENDANCE_STYLE[r.status]}>{label(r.status)}</span>
                  </td>
                </tr>
              ))}
              {data.attendance.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-sm text-slate-400 py-8">{t('No roll calls recorded yet.', 'እስካሁን የተመዘገበ ክትትል የለም።')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
