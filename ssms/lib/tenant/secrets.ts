// ─────────────────────────────────────────────────────────────────────────────
// Per-tenant secrets (server only), e.g. a Sunday school's Telegram bot token.
// Stored in tenant_secrets (migration 040) encrypted with AES-256-GCM under
// TENANT_SECRETS_KEY (32 random bytes, base64 — `openssl rand -base64 32`),
// so a database dump alone does not reveal them. Read through a short cache.
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { platformClient } from './db';

export type TenantSecretName = 'telegram_bot_token';

const CACHE_MS = 60_000;
const cache = new Map<string, { value: string | null; at: number }>();

function key(): Buffer {
  const raw = env.tenantSecretsKey();
  if (!raw) throw new Error('Missing environment variable TENANT_SECRETS_KEY');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('TENANT_SECRETS_KEY must be 32 bytes, base64 (openssl rand -base64 32)');
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith('v1:')) throw new Error('Unknown secret format');
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export async function getTenantSecret(tenantId: string, name: TenantSecretName): Promise<string | null> {
  const id = `${tenantId}:${name}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { data, error } = await platformClient()
    .from('tenant_secrets')
    .select('value_enc')
    .eq('tenant_id', tenantId)
    .eq('name', name)
    .maybeSingle();
  let value: string | null = null;
  if (!error && data?.value_enc) {
    try {
      value = decryptSecret(data.value_enc as string);
    } catch (e) {
      console.error('tenant secret unreadable', name, e instanceof Error ? e.message : e);
    }
  }
  cache.set(id, { value, at: Date.now() });
  return value;
}

/** Saves (or with null removes) a secret. */
export async function setTenantSecret(tenantId: string, name: TenantSecretName, value: string | null): Promise<void> {
  const db = platformClient();
  const { error } = value
    ? await db.from('tenant_secrets').upsert(
        { tenant_id: tenantId, name, value_enc: encryptSecret(value), updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,name' }
      )
    : await db.from('tenant_secrets').delete().eq('tenant_id', tenantId).eq('name', name);
  if (error) throw new Error(error.message);
  cache.delete(`${tenantId}:${name}`);
}
