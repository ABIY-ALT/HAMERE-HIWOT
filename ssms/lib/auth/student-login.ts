// ─────────────────────────────────────────────────────────────────────────────
// Student sign-in: registration number (REG-2026-0001) + a 6-digit PIN.
// Like staff phone logins, each account is stored under an internal e-mail
// alias built from the registration number (never shown, never sent mail).
// ─────────────────────────────────────────────────────────────────────────────

/** "reg 2026 1", "reg-2026-0001", "REG20260001" → "REG-2026-0001"; null when it is not a registration number. */
export function normalizeRegNo(input: string): string | null {
  const m = /^REG[\s-]*(\d{4})[\s-]*(\d{1,6})$/i.exec(input.trim());
  if (!m) return null;
  return `REG-${m[1]}-${m[2].padStart(4, '0')}`;
}

export function regNoToAuthEmail(regNo: string): string {
  const domain = process.env.AUTH_EMAIL_DOMAIN || 'users.hamere-hiwot.org';
  return `${regNo.toLowerCase()}@${domain}`;
}

/** Student accounts use the registration number as their username. */
export function isStudentLogin(username: string): boolean {
  return /^REG-\d{4}-\d{4,6}$/.test(username);
}

/** A random 6-digit PIN for a new or reset student login. */
export function newPin(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}
