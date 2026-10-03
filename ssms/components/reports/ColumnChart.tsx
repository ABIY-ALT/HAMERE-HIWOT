'use client';

import React, { useState } from 'react';

export interface ChartSeries {
  name: string;
  /** Mark color (series identity). Text never uses it. */
  color: string;
  values: (number | null)[];
}

const TICK_COUNT = 4;

/** Axis maximum whose quarter-steps are clean numbers (1, 2, 2.5, 5 × 10^k each). */
function niceMax(value: number): number {
  if (value <= 0) return TICK_COUNT;
  const rawStep = value / TICK_COUNT;
  const exp = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = ([1, 2, 2.5, 5, 10].find((s) => s * exp >= rawStep) ?? 10) * exp;
  return step * TICK_COUNT;
}

/**
 * Column chart (one or two series): columns <= 24px with a 4px rounded top,
 * 2px gap between adjacent columns, hairline gridlines, legend for 2+ series,
 * and one tooltip per category listing every series (hover or keyboard focus).
 */
export function ColumnChart({
  categories,
  series,
  format,
  height = 200,
  fixedMax,
  label,
  emptyText = '—',
  labelEvery = 1,
}: {
  categories: string[];
  series: ChartSeries[];
  format: (n: number) => string;
  height?: number;
  fixedMax?: number;
  label: string;
  emptyText?: string;
  /** Show every Nth category under the axis (counted back from the latest) when space is tight; tooltips keep them all. */
  labelEvery?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const max = fixedMax ?? niceMax(dataMax);
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (max * i) / TICK_COUNT);

  return (
    <figure className="space-y-4" aria-label={label}>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: s.color, printColorAdjust: 'exact' }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}

      {/* pt-2 keeps the top tick label clear of the legend / title */}
      <div className="flex pt-2">
        {/* Y axis */}
        <div className="relative w-16 shrink-0 text-[10px] text-slate-400 tabular-nums" style={{ height }}>
          {ticks.map((tk) => (
            <span key={tk} className="absolute right-2 -translate-y-1/2" style={{ bottom: `${(tk / max) * 100}%` }}>
              {format(tk)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {ticks.map((tk) => (
            <div key={tk} className="absolute left-0 right-0 border-t border-slate-200" style={{ bottom: `${(tk / max) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex">
            {categories.map((cat, i) => (
              <div
                key={cat}
                tabIndex={0}
                role="img"
                aria-label={`${cat}: ${series.map((s) => `${s.name} ${s.values[i] === null ? emptyText : format(s.values[i] as number)}`).join(', ')}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                className={`relative flex-1 flex items-end justify-center gap-[2px] outline-none ${active === i ? 'bg-slate-50' : ''}`}
              >
                {series.map((s) =>
                  s.values[i] === null || s.values[i] === 0 ? (
                    <div key={s.name} className="w-[min(24px,40%)]" />
                  ) : (
                    <div
                      key={s.name}
                      className="w-[min(24px,40%)] rounded-t-[4px] transition-[filter]"
                      style={{
                        height: `${Math.max(1, ((s.values[i] as number) / max) * 100)}%`,
                        background: s.color,
                        filter: active === i ? 'brightness(1.1)' : undefined,
                        printColorAdjust: 'exact',
                      }}
                    />
                  )
                )}

                {active === i && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-white border border-slate-200 shadow-lg rounded-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none">
                    <div className="text-slate-500 mb-1">{cat}</div>
                    {series.map((s) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="inline-block w-3 h-[2px]" style={{ background: s.color }} />
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {s.values[i] === null ? emptyText : format(s.values[i] as number)}
                        </span>
                        <span className="text-slate-500">{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div className="flex pl-16 text-[10px] text-slate-500">
        {categories.map((cat, i) =>
          labelEvery > 1 ? (
            // Centred and allowed to spill into the unlabeled neighbours
            <span key={cat} className="flex-1 min-w-0 flex justify-center">
              {(categories.length - 1 - i) % labelEvery === 0 && <span className="whitespace-nowrap">{cat}</span>}
            </span>
          ) : (
            <span key={cat} className="flex-1 text-center truncate px-0.5">
              {cat}
            </span>
          )
        )}
      </div>
    </figure>
  );
}
