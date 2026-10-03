// ─────────────────────────────────────────────────────────────────────────────
// Shared chart colours and axis labels (Reports + Dashboard)
// ─────────────────────────────────────────────────────────────────────────────

// Categorical slots 1–2 (validated: CVD ΔE 24.7, contrast ≥ 3:1 on white)
export const SERIES_BLUE = '#2a78d6';
export const SERIES_ORANGE = '#eb6834';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09" → "Sep 26" */
export const monthLabel = (key: string) => `${SHORT_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** "2026-09-27" → "Sep 27" */
export const dayLabel = (iso: string) => `${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** 145000 → "145K" */
export const compactETB = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${+(n / 1_000).toFixed(1)}K` : String(Math.round(n));
