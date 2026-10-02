'use client';

import React from 'react';
import { useLang } from '@/contexts/LangContext';
import {
  daysInEthiopianMonth,
  ethiopianMonthName,
  ethiopianToIso,
  formatEthiopianDate,
  isSunday,
  isoToEthiopian,
  todayIso,
  weekdayName,
  weekdayOfIso,
} from '@/lib/utils/ethiopian-calendar';

interface Props {
  /** Gregorian ISO date, "YYYY-MM-DD". The value stored and sent to the database. */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  /** Show a soft hint when the chosen day is not a Sunday. */
  hintIfNotSunday?: boolean;
}

/**
 * Date picker that works in the Ethiopian calendar but speaks Gregorian ISO
 * to the rest of the app, so storage and sorting are unaffected.
 */
export function EthiopianDateInput({ value, onChange, id, hintIfNotSunday = false }: Props) {
  const { t, locale } = useLang();

  const current = isoToEthiopian(value) ?? isoToEthiopian(todayIso())!;
  const thisYear = isoToEthiopian(todayIso())!.year;
  const years: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - 10; y--) years.push(y);
  if (!years.includes(current.year)) years.push(current.year);

  const days = Array.from({ length: daysInEthiopianMonth(current.year, current.month) }, (_, i) => i + 1);

  const update = (next: Partial<{ year: number; month: number; day: number }>) => {
    const year = next.year ?? current.year;
    const month = next.month ?? current.month;
    // Clamp the day when switching to a shorter month (e.g. into Pagume)
    const day = Math.min(next.day ?? current.day, daysInEthiopianMonth(year, month));
    const iso = ethiopianToIso({ year, month, day });
    if (iso) onChange(iso);
  };

  const weekday = weekdayOfIso(value);

  return (
    <div>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2" id={id}>
        <select
          aria-label={t('Day', 'ቀን')}
          value={current.day}
          onChange={(e) => update({ day: Number(e.target.value) })}
          className="form-input text-sm"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          aria-label={t('Month', 'ወር')}
          value={current.month}
          onChange={(e) => update({ month: Number(e.target.value) })}
          className="form-input text-sm"
        >
          {Array.from({ length: 13 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{ethiopianMonthName(m, locale)}</option>
          ))}
        </select>
        <select
          aria-label={t('Year', 'ዓመተ ምሕረት')}
          value={current.year}
          onChange={(e) => update({ year: Number(e.target.value) })}
          className="form-input text-sm"
        >
          {years.sort((a, b) => b - a).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">
        {weekday !== null && `${weekdayName(weekday, locale)} · `}
        {formatEthiopianDate(value, locale)} {t('E.C.', 'ዓ.ም')} = {value}
      </p>
      {hintIfNotSunday && value && !isSunday(value) && (
        <p className="text-[11px] text-amber-600 mt-0.5">
          {t('This date is not a Sunday.', 'ይህ ቀን እሑድ አይደለም።')}
        </p>
      )}
    </div>
  );
}
