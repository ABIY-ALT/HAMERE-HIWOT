// Small display helpers for the platform pages (Gregorian dates — the owner's books).

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const dayTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const money = (amount: number | null | undefined, currency = 'ETB') =>
  amount === null || amount === undefined ? '—' : `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-success',
  TRIALING: 'badge-info',
  PENDING: 'badge-warning',
  PAST_DUE: 'badge-warning',
  SUSPENDED: 'badge-danger',
  DEACTIVATED: 'badge-danger',
  CANCELED: 'badge-danger',
  EXPIRED: 'badge-danger',
  OPEN: 'badge-warning',
  PAID: 'badge-success',
  VOID: 'badge-primary',
  UNCOLLECTIBLE: 'badge-danger',
  SUCCEEDED: 'badge-success',
  FAILED: 'badge-danger',
  REFUNDED: 'badge-info',
};

export const badge = (status: string) => STATUS_BADGE[status] ?? 'badge-primary';
