'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmPaymentAction, refundPaymentAction, rejectPaymentAction } from '@/app/platform/actions';

export function PaymentActions({ id, status, amount, refunded }: { id: string; status: string; amount: number; refunded: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) window.alert(res.error);
    router.refresh();
  };

  if (status === 'PENDING') {
    return (
      <div className="flex gap-1.5">
        <button
          disabled={busy}
          onClick={() => {
            const note = window.prompt('Confirm: the money is in the account. Note (optional):', '');
            if (note !== null) void run(() => confirmPaymentAction(id, note));
          }}
          className="btn btn-primary btn-sm"
        >
          Confirm
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const note = window.prompt('Why is it not accepted? (the Sunday school sees this)');
            if (note) void run(() => rejectPaymentAction(id, note));
          }}
          className="btn btn-secondary btn-sm"
        >
          Reject
        </button>
      </div>
    );
  }
  if (status === 'SUCCEEDED' && refunded < amount) {
    return (
      <button
        disabled={busy}
        onClick={() => {
          const value = window.prompt(`Refunded amount (up to ${amount - refunded}):`, String(amount - refunded));
          const note = value ? window.prompt('Reason for the refund:') : null;
          if (value && note) void run(() => refundPaymentAction(id, Number(value), note));
        }}
        className="text-xs text-slate-600 hover:underline"
      >
        Record refund
      </button>
    );
  }
  return null;
}
