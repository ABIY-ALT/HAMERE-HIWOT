'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Donations & pledges. A received cash/bank donation is also written to the
// ledger as INCOME (category 'Donations'); in-kind gifts are not cash income.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { Donation, DonationStatus, DonationType, DonorOption } from '@/lib/finance/donations';

type Db = Awaited<ReturnType<typeof authorize>>['db'];
type Row = Record<string, unknown> & { id: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

export async function loadDonations(): Promise<Loaded<{ donations: Donation[]; donors: DonorOption[] }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('FINANCE_VIEW');
    const [rows, persons, students] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('donations')
          .select('*, recorder:system_users!donations_recorded_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .order('created_at', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      selectAll<{ id: string; full_name_en: string; phone_primary: string | null }>((a, b) =>
        db.from('persons').select('id, full_name_en, phone_primary').eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
    ]);
    const studentPersons = new Set(students.map((s) => s.person_id));

    const donations: Donation[] = rows.map((d) => ({
      id: d.id,
      receipt_no: d.receipt_no as string,
      donor_name: d.donor_name as string,
      donor_phone: (d.donor_phone as string) ?? '',
      donor_person_id: (d.donor_person_id as string) ?? null,
      type: d.donation_type as DonationType,
      purpose: d.purpose as string,
      amount: Number(d.amount),
      item_description: (d.item_description as string) ?? '',
      status: d.status as DonationStatus,
      pledged_on: (d.pledged_on as string) ?? null,
      received_on: (d.received_on as string) ?? null,
      notes: (d.notes as string) ?? '',
      recorded_by: ((d.recorder as { person?: { full_name_en?: string } | null } | null)?.person?.full_name_en) ?? '',
      created_at: d.created_at as string,
    }));

    return {
      mode: 'live',
      data: {
        donations,
        donors: persons
          .filter((p) => !studentPersons.has(p.id))
          .map((p) => ({ id: p.id, name: p.full_name_en, phone: p.phone_primary ?? '' })),
      },
    };
  } catch (e) {
    const msg = errorMessage(e);
    return { mode: 'error', error: msg.includes('donations') ? 'Run database migration 012 (donations) first' : msg };
  }
}

/** Write the INCOME row for a received cash/bank donation and link it. */
async function bookIncome(
  db: Db,
  donation: { id: string; receipt_no: string; donor_name: string; purpose: string; amount: number },
  receivedOn: string,
  actorId: string
) {
  const txn = (await db.from('finance_transactions')
    .insert({
      txn_type: 'INCOME',
      category: 'Donations',
      amount: donation.amount,
      txn_date: receivedOn,
      party: donation.donor_name,
      receipt_no: donation.receipt_no,
      description: `${donation.receipt_no} — ${donation.purpose}`,
      recorded_by: actorId,
    })
    .select('id')
    .single()
    .then(check)) as { id: string };
  await db.from('donations').update({ transaction_id: txn.id }).eq('id', donation.id).then(check);
}

const DonationSchema = z
  .object({
    donor_name: z.string().trim().transform((v) => v || 'Anonymous'),
    donor_person_id: z.string(),
    donor_phone: z.string().trim(),
    type: z.enum(['CASH', 'BANK', 'IN_KIND']),
    purpose: z.string().trim().min(1, 'Choose what the donation is for'),
    amount: z.coerce.number().positive('Amount must be more than 0').max(100_000_000, 'Amount is too large'),
    item_description: z.string().trim(),
    status: z.enum(['PLEDGED', 'RECEIVED']),
    date: isoDate,
    notes: z.string().trim(),
  })
  .refine((d) => d.type !== 'IN_KIND' || d.item_description.length > 0, 'Describe the items that were given');

export type DonationInput = z.input<typeof DonationSchema>;

export async function recordDonation(
  input: DonationInput
): Promise<{ ok: true; receipt_no: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const d = DonationSchema.parse(input);
    const received = d.status === 'RECEIVED';

    const donation = (await db.from('donations')
      .insert({
        donor_name: d.donor_name,
        donor_person_id: d.donor_person_id || null,
        donor_phone: d.donor_phone || null,
        donation_type: d.type,
        purpose: d.purpose,
        amount: d.amount,
        item_description: d.item_description || null,
        status: d.status,
        pledged_on: received ? null : d.date,
        received_on: received ? d.date : null,
        notes: d.notes || null,
        recorded_by: me.systemUser.id,
      })
      .select('id, receipt_no, donor_name, purpose, amount')
      .single()
      .then(check)) as { id: string; receipt_no: string; donor_name: string; purpose: string; amount: number };

    if (received && d.type !== 'IN_KIND') {
      try {
        await bookIncome(db, donation, d.date, me.systemUser.id);
      } catch (e) {
        await db.from('donations').delete().eq('id', donation.id); // keep donations and the ledger consistent
        throw e;
      }
    }
    return { ok: true, receipt_no: donation.receipt_no };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A pledge has been paid: mark it received and book the income. */
export async function receivePledge(id: string, receivedOn: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('FINANCE_CREATE');
    const date = isoDate.parse(receivedOn);
    const donation = (await db.from('donations')
      .select('id, receipt_no, donor_name, purpose, amount, donation_type, status')
      .eq('id', id)
      .single()
      .then(check)) as { id: string; receipt_no: string; donor_name: string; purpose: string; amount: number; donation_type: DonationType; status: DonationStatus };
    if (donation.status !== 'PLEDGED') throw new Error('Only a pledge can be marked as received');

    const updated = (await db.from('donations')
      .update({ status: 'RECEIVED', received_on: date })
      .eq('id', id)
      .eq('status', 'PLEDGED')
      .select('id')
      .then(check)) as { id: string }[];
    if (!updated.length) throw new Error('This pledge was already updated');

    if (donation.donation_type !== 'IN_KIND') {
      try {
        await bookIncome(db, { ...donation, amount: Number(donation.amount) }, date, me.systemUser.id);
      } catch (e) {
        await db.from('donations').update({ status: 'PLEDGED', received_on: null }).eq('id', id);
        throw e;
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function cancelPledge(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('FINANCE_CREATE');
    const updated = (await db.from('donations')
      .update({ status: 'CANCELLED' })
      .eq('id', id)
      .eq('status', 'PLEDGED')
      .select('id')
      .then(check)) as { id: string }[];
    if (!updated.length) throw new Error('Only an open pledge can be cancelled');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
