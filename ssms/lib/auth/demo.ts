// ─────────────────────────────────────────────────────────────────────────────
// Demo accounts — used only when Supabase is not configured (demo mode).
// Kept server-side so the passwords are not shipped to the browser.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_COOKIE = 'ssms_user';

export const DEMO_ACCOUNTS = [
  { username: 'admin', phone: '0912345678', password: 'admin123', systemUserId: 'sysuser-001' },
  { username: 'board_chair', phone: '0911000002', password: 'board123', systemUserId: 'sysuser-002' },
  { username: 'audit_inspector', phone: '0911000003', password: 'audit123', systemUserId: 'sysuser-003' },
];

export function findDemoAccount(login: string, password: string) {
  const id = login.trim().toLowerCase();
  return DEMO_ACCOUNTS.find(
    (a) => (a.phone === id || a.username === id) && a.password === password
  );
}
