// ─────────────────────────────────────────────────────────────────────────────
// Auth Context — provides current user throughout the app
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { AuthUser, PermissionCode } from '@/types';
import { hasPermission, hasAnyPermission } from '@/lib/permissions';

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  isAuthenticated: boolean;
  can: (permission: PermissionCode) => boolean;
  canAny: (permissions: PermissionCode[]) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  // Accept serialized (array) or live (Set) permissions from server
  initialUser: (Omit<AuthUser, 'permissions'> & { permissions: AuthUser['permissions'] | string[] }) | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (!initialUser) return null;
    // Convert array → Set when crossing server/client boundary
    const perms = initialUser.permissions instanceof Set
      ? initialUser.permissions
      : new Set(initialUser.permissions as import('@/types').PermissionCode[]);
    return { ...initialUser, permissions: perms } as AuthUser;
  });

  const can = useCallback(
    (permission: PermissionCode) => hasPermission(user, permission),
    [user]
  );

  const canAny = useCallback(
    (permissions: PermissionCode[]) => hasAnyPermission(user, permissions),
    [user]
  );

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, setUser, isAuthenticated: !!user, can, canAny, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Like useAuth, but null outside the signed-in area (e.g. the exam page) */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
