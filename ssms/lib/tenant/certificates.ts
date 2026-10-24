// ─────────────────────────────────────────────────────────────────────────────
// Public certificate check (server only): /verify/<code> finds a certificate by
// its unguessable verify code without knowing the Sunday school, so it reads
// across tenants — and returns only what is printed on the certificate.
// ─────────────────────────────────────────────────────────────────────────────

import type { VerifiedCertificate } from '@/lib/certificates/types';
import { platformClient } from './db';

export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  if (!/^[0-9a-f]{32}$/i.test(code)) return null;
  const { data, error } = await platformClient()
    .from('certificates')
    .select('certificate_no, person_name_en, person_name_am, title_en, title_am, reason_en, reason_am, issued_on, revoked_at, tenant:tenants(name_en, name_am, is_default, status)')
    .eq('verify_code', code.toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as {
    certificate_no: string; person_name_en: string; person_name_am: string | null; title_en: string; title_am: string | null;
    reason_en: string | null; reason_am: string | null; issued_on: string; revoked_at: string | null;
    tenant: { name_en: string; name_am: string | null; is_default: boolean; status: string } | null;
  };
  if (!r.tenant || r.tenant.status === 'TEMPLATE') return null;
  return {
    school: r.tenant.is_default
      ? ['Hamere Hiwot Sunday School · Sallo Debre Tsehay St. George Church', 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት · ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን']
      : [r.tenant.name_en, r.tenant.name_am || r.tenant.name_en],
    certificate_no: r.certificate_no,
    person_name_en: r.person_name_en,
    person_name_am: r.person_name_am || r.person_name_en,
    title_en: r.title_en,
    title_am: r.title_am || r.title_en,
    reason_en: r.reason_en ?? '',
    reason_am: r.reason_am ?? '',
    issued_on: r.issued_on,
    revoked: Boolean(r.revoked_at),
  };
}
