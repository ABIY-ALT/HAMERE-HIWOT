// ─────────────────────────────────────────────────────────────────────────────
// Phone-number login helpers
//
// Users sign in with their phone number. Supabase Auth's phone provider needs an
// SMS gateway, so each account is stored under an internal e-mail alias built
// from the phone number (never shown to users, never sent mail).
// No imports: scripts/create-admin.mjs loads this file directly with Node.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise an Ethiopian number to the local 10-digit form, e.g. 0912345678. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+251')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('251') && digits.length === 12) digits = '0' + digits.slice(3);
  else if (/^[79]\d{8}$/.test(digits)) digits = '0' + digits;
  return digits;
}

/** 09XXXXXXXX (Ethio Telecom) or 07XXXXXXXX (Safaricom). */
export function isValidPhone(phone: string): boolean {
  return /^0[79]\d{8}$/.test(phone);
}

export function phoneToAuthEmail(phone: string): string {
  const domain = process.env.AUTH_EMAIL_DOMAIN || 'users.hamere-hiwot.org';
  return `${normalizePhone(phone)}@${domain}`;
}
