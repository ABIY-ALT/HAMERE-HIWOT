// ─────────────────────────────────────────────────────────────────────────────
// Demo-mode data for the admin pages (used when Supabase is not configured)
// ─────────────────────────────────────────────────────────────────────────────

import {
  MOCK_ORG_UNITS,
  MOCK_PERMISSIONS,
  MOCK_ROLE_PERMISSIONS,
  MOCK_ROLES,
} from '@/lib/mock/data';
import { MOCK_SYSTEM_USERS_FULL } from '@/lib/mock/modules';
import type { AdminPermissionRow, AdminRoleRow, AdminUnitRow, AdminUserRow } from './types';

export function demoPermissions(): AdminPermissionRow[] {
  return MOCK_PERMISSIONS.map((p) => ({
    id: p.id,
    code: p.code,
    name_en: p.name_en,
    name_am: p.name_am,
    category: p.category,
    is_active: p.is_active,
  }));
}

export function demoRoles(): AdminRoleRow[] {
  return MOCK_ROLES.map((r) => {
    const permIds = new Set(
      MOCK_ROLE_PERMISSIONS.filter((rp) => rp.role_id === r.id).map((rp) => rp.permission_id)
    );
    return {
      id: r.id,
      code: r.code,
      name_en: r.name_en,
      name_am: r.name_am,
      description_en: r.description_en,
      description_am: r.description_am,
      is_system_role: r.is_system_role,
      is_active: r.is_active,
      permissions: MOCK_PERMISSIONS.filter((p) => permIds.has(p.id)).map((p) => p.code),
    };
  });
}

export function demoUnits(): AdminUnitRow[] {
  return MOCK_ORG_UNITS.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am }));
}

export function demoUsers(): AdminUserRow[] {
  const roles = demoRoles();
  return MOCK_SYSTEM_USERS_FULL.map((u) => {
    const role = roles.find((r) => r.name_en === u.role || r.name_en.startsWith(u.role));
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      name_am: u.name_am,
      role_id: role?.id ?? null,
      role: u.role,
      role_am: u.role_am,
      org_id: null,
      org: u.org,
      org_am: u.org,
      last_login: u.last_login,
      is_active: u.is_active,
      permissions: role?.permissions ?? [],
    };
  });
}
