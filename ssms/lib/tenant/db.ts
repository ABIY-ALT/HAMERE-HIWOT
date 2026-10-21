// ─────────────────────────────────────────────────────────────────────────────
// Database clients — SERVER ONLY
//
// tenantClient(tenantId)  what all Sunday-school code uses. It looks like a
//   normal Supabase client, but every query is held to one tenant:
//   • select / update / delete get  tenant_id = <tenant>  added;
//   • insert / upsert rows get tenant_id set (a different one is refused);
//   • tables that are not tenant tables cannot be reached at all;
//   • storage only inside the tenant's folder "<tenant id>/…";
//   • auth.admin may only change logins used by this tenant alone;
//   • read-only tenants (unpaid / expired) cannot write.
//   It also sends x-ssms-tenant, so the database itself (040: tenant_guard,
//   composite foreign keys) refuses any write to another tenant's rows.
//
// platformClient()  unrestricted service-role client. Only for platform code
//   (lib/platform, lib/billing, lib/tenant), sign-in and tenant resolution —
//   eslint blocks importing createAdminClient anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/server';
import {
  GLOBAL_READ_TABLES,
  READ_ONLY_WRITABLE,
  TENANT_BUCKETS,
  TENANT_KEYED_CONFLICTS,
  TENANT_RPCS,
  TENANT_TABLES,
} from './tables';

export const DEFAULT_TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

export class ReadOnlyError extends Error {
  constructor() {
    super('READ_ONLY');
  }
}

export interface TenantClientOptions {
  /** system_users id of the person acting — recorded by the audit trail */
  actorId?: string;
  /** Unpaid / expired subscription: refuse writes */
  readOnly?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenantOfClient = new WeakMap<object, string>();

/** The tenant a scoped client belongs to (null for the platform client). */
export function tenantIdOf(db: SupabaseClient): string | null {
  return tenantOfClient.get(db) ?? null;
}

/** Storage path inside the tenant's folder: tenantPath(db, 'abc', 'x.jpg') → "<tenant>/abc/x.jpg". */
export function tenantPath(db: SupabaseClient, ...parts: string[]): string {
  const tenantId = tenantIdOf(db);
  if (!tenantId) throw new Error('tenantPath needs a tenant-scoped client');
  return [tenantId, ...parts].join('/');
}

export function platformClient(): SupabaseClient {
  return createAdminClient();
}

export function tenantClient(tenantId: string, options: TenantClientOptions = {}): SupabaseClient {
  if (!UUID.test(tenantId)) throw new Error('Invalid tenant');
  const headers: Record<string, string> = { 'x-ssms-tenant': tenantId };
  if (options.actorId) headers['x-ssms-actor'] = options.actorId;

  const raw = createClient(
    requireEnv('supabaseUrl', 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('supabaseServiceKey', 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } }
  );

  const canWrite = (table: string) => {
    if (options.readOnly && !READ_ONLY_WRITABLE.has(table)) throw new ReadOnlyError();
  };

  const scoped = new Proxy(raw, {
    get(target, prop) {
      if (prop === 'from') return (table: string) => scopeTable(target, table, tenantId, canWrite);
      if (prop === 'rpc') {
        return (fn: string, args?: Record<string, unknown>, opts?: Record<string, unknown>) => {
          if (!TENANT_RPCS.has(fn)) throw new Error(`Database function ${fn} is not available here`);
          return target.rpc(fn, args, opts as never);
        };
      }
      if (prop === 'storage') return scopeStorage(target, tenantId, options);
      if (prop === 'auth') return scopeAuth(target, tenantId);
      if (prop === 'schema' || prop === 'channel' || prop === 'realtime') {
        throw new Error(`${String(prop)} is not available on the tenant client`);
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as SupabaseClient;

  tenantOfClient.set(scoped, tenantId);
  return scoped;
}

// ── Tables ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function scopeTable(target: SupabaseClient, table: string, tenantId: string, canWrite: (t: string) => void) {
  if (GLOBAL_READ_TABLES.has(table)) {
    const qb = target.from(table);
    return {
      select: (...args: Parameters<typeof qb.select>) => qb.select(...args),
    } as unknown as typeof qb;
  }
  if (!TENANT_TABLES.has(table)) throw new Error(`Table ${table} is not available here`);

  const qb = target.from(table);
  const stamp = (values: Row | Row[]) => {
    const stampOne = (row: Row) => {
      if (row.tenant_id !== undefined && row.tenant_id !== tenantId) throw new Error('Cross-tenant write refused');
      return { ...row, tenant_id: tenantId };
    };
    return Array.isArray(values) ? values.map(stampOne) : stampOne(values);
  };

  return {
    select: (columns?: string, opts?: Parameters<typeof qb.select>[1]) =>
      qb.select(columns, opts).eq('tenant_id', tenantId),
    insert: (values: Row | Row[], opts?: Record<string, unknown>) => {
      canWrite(table);
      return qb.insert(stamp(values) as never, opts as never);
    },
    upsert: (values: Row | Row[], opts?: { onConflict?: string } & Record<string, unknown>) => {
      canWrite(table);
      let o = opts;
      if (o?.onConflict && TENANT_KEYED_CONFLICTS[table]?.includes(o.onConflict.replace(/\s+/g, ''))) {
        o = { ...o, onConflict: `tenant_id,${o.onConflict}` };
      }
      return qb.upsert(stamp(values) as never, o as never);
    },
    update: (values: Row, opts?: Record<string, unknown>) => {
      canWrite(table);
      if (values.tenant_id !== undefined && values.tenant_id !== tenantId) throw new Error('Cross-tenant write refused');
      const { tenant_id: _drop, ...rest } = values;
      void _drop;
      return qb.update(rest as never, opts as never).eq('tenant_id', tenantId);
    },
    delete: (opts?: Record<string, unknown>) => {
      canWrite(table);
      return qb.delete(opts as never).eq('tenant_id', tenantId);
    },
  } as unknown as typeof qb;
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Paths this tenant may touch: its own folder; the default tenant also its files from before 040. */
function ownsPath(tenantId: string, path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith(`${tenantId}/`)) return true;
  return tenantId === DEFAULT_TENANT_ID && !UUID.test(path.split('/')[0] ?? '');
}

function scopeStorage(target: SupabaseClient, tenantId: string, options: TenantClientOptions) {
  const check = (paths: string[]) => {
    for (const p of paths) if (!ownsPath(tenantId, p)) throw new Error('File not found');
  };
  return {
    from(bucket: string) {
      if (!TENANT_BUCKETS.has(bucket)) throw new Error(`Storage bucket ${bucket} is not available here`);
      const api = target.storage.from(bucket);
      return {
        upload: (path: string, ...rest: unknown[]) => {
          if (options.readOnly) throw new ReadOnlyError();
          // New files always go in the tenant's own folder
          if (!path.startsWith(`${tenantId}/`)) throw new Error('Upload path must start with the tenant folder (tenantPath)');
          return (api.upload as (...a: unknown[]) => unknown)(path, ...rest);
        },
        remove: (paths: string[]) => {
          check(paths);
          return api.remove(paths);
        },
        createSignedUrl: (path: string, ...rest: unknown[]) => {
          check([path]);
          return (api.createSignedUrl as (...a: unknown[]) => unknown)(path, ...rest);
        },
        createSignedUrls: (paths: string[], ...rest: unknown[]) => {
          check(paths);
          return (api.createSignedUrls as (...a: unknown[]) => unknown)(paths, ...rest);
        },
        download: (path: string, ...rest: unknown[]) => {
          check([path]);
          return (api.download as (...a: unknown[]) => unknown)(path, ...rest);
        },
        getPublicUrl: (path: string, ...rest: unknown[]) => {
          check([path]);
          return (api.getPublicUrl as (...a: unknown[]) => unknown)(path, ...rest);
        },
      };
    },
  } as unknown as SupabaseClient['storage'];
}

// ── Logins ───────────────────────────────────────────────────────────────────

/**
 * A login (auth user) can belong to several Sunday schools (the same phone).
 * One tenant may change or remove it only when no other tenant — and no
 * platform admin — uses it; otherwise a tenant admin could take over an
 * account in another tenant by resetting its password.
 */
export async function assertExclusiveLogin(authUserId: string, tenantId: string): Promise<void> {
  const db = platformClient();
  const [{ data: accounts, error }, { data: admin }] = await Promise.all([
    db.from('system_users').select('tenant_id').eq('auth_user_id', authUserId),
    db.from('platform_admins').select('id').eq('auth_user_id', authUserId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const others = (accounts ?? []).some((a) => a.tenant_id !== tenantId);
  if (others || admin) throw new Error('SHARED_LOGIN');
  if (!(accounts ?? []).length) throw new Error('Not found');
}

function scopeAuth(target: SupabaseClient, tenantId: string) {
  const admin = target.auth.admin;
  return {
    admin: {
      createUser: admin.createUser.bind(admin),
      updateUserById: async (id: string, attributes: Parameters<typeof admin.updateUserById>[1]) => {
        await assertExclusiveLogin(id, tenantId);
        return admin.updateUserById(id, attributes);
      },
      deleteUser: async (id: string, soft?: boolean) => {
        // A login this tenant just created and could not finish setting up has no accounts yet
        const db = platformClient();
        const [{ data }, { data: platformAdmin }] = await Promise.all([
          db.from('system_users').select('tenant_id').eq('auth_user_id', id),
          db.from('platform_admins').select('id').eq('auth_user_id', id).maybeSingle(),
        ]);
        if (platformAdmin) throw new Error('SHARED_LOGIN');
        if ((data ?? []).length) await assertExclusiveLogin(id, tenantId);
        return admin.deleteUser(id, soft);
      },
      getUserById: async (id: string) => {
        const { data } = await platformClient().from('system_users').select('id').eq('auth_user_id', id).eq('tenant_id', tenantId).maybeSingle();
        if (!data) throw new Error('Not found');
        return admin.getUserById(id);
      },
    },
  } as unknown as SupabaseClient['auth'];
}
