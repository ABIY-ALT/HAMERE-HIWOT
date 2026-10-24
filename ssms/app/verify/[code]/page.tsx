// /verify/<code> — the page a certificate's QR code opens: is it real, whose is
// it, from which Sunday school, and is it still valid. No sign-in.

import type { Metadata } from 'next';
import { CheckCircle2, ShieldX, XCircle } from 'lucide-react';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { verifyCertificate } from '@/lib/tenant/certificates';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

export const metadata: Metadata = {
  title: 'የምስክር ወረቀት ማረጋገጫ · Certificate check',
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = isSupabaseEnabled() ? await verifyCertificate(code) : null;

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center space-y-4">
        {!c ? (
          <>
            <ShieldX className="mx-auto text-red-500" size={44} />
            <h1 className="text-lg font-bold text-slate-900">የምስክር ወረቀቱ አልተገኘም · Certificate not found</h1>
            <p className="text-sm text-slate-600">
              ይህ ኮድ በመዝገብ ውስጥ የለም። የምስክር ወረቀቱን የሰጠውን ሰንበት ትምህርት ቤት ይጠይቁ።
              <br />
              This code is not on record. Please ask the Sunday school that gave the certificate.
            </p>
          </>
        ) : (
          <>
            {c.revoked ? <XCircle className="mx-auto text-red-500" size={44} /> : <CheckCircle2 className="mx-auto text-emerald-500" size={44} />}
            <h1 className={`text-lg font-bold ${c.revoked ? 'text-red-700' : 'text-emerald-700'}`}>
              {c.revoked ? 'ይህ የምስክር ወረቀት ተሰርዟል · This certificate was revoked' : 'ትክክለኛ የምስክር ወረቀት · Genuine certificate'}
            </h1>
            <div className="text-sm text-slate-500">
              {c.school[1]}
              <br />
              {c.school[0]}
            </div>
            <dl className="text-left text-sm divide-y divide-slate-100 border-y border-slate-100">
              <Row label="ስም · Name" value={c.person_name_am === c.person_name_en ? c.person_name_en : `${c.person_name_am} · ${c.person_name_en}`} />
              <Row label="ርዕስ · Title" value={c.title_am === c.title_en ? c.title_en : `${c.title_am} · ${c.title_en}`} />
              {(c.reason_am || c.reason_en) && <Row label="ምክንያት · For" value={[c.reason_am, c.reason_en].filter(Boolean).join(' · ')} />}
              <Row label="ቀን · Date" value={`${formatEthiopianDate(c.issued_on, 'am')} ዓ.ም. (${c.issued_on})`} />
              <Row label="ቁጥር · Number" value={c.certificate_no} />
            </dl>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
