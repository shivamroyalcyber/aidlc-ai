import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { timingSafeEqual, createHash } from 'node:crypto';

export interface DownstreamCredentials {
  coreBanking: { username: string; password: string };
  fintechToken: string;
}

/** Caches a loader's result for `ttlMs`. A failed load is not cached. */
export function cached<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let value: T | undefined;
  let expires = 0;
  return async () => {
    if (value !== undefined && now() < expires) return value;
    value = await load();
    expires = now() + ttlMs;
    return value;
  };
}

/** Reads a secret string from AWS Secrets Manager. Only the ARN is ever passed around, never the value. */
export function secretString(client: SecretsManagerClient, secretArn: string): () => Promise<string> {
  return async () => {
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    if (!result.SecretString) throw new Error('Secret has no string value');
    return result.SecretString;
  };
}

export function coreBankingCredentials(load: () => Promise<string>): () => Promise<{ username: string; password: string }> {
  return async () => {
    const parsed = JSON.parse(await load()) as { username?: unknown; password?: unknown };
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') throw new Error('Core banking secret is malformed');
    return { username: parsed.username, password: parsed.password };
  };
}

/** Constant-time string comparison (NFR-01). Hashing first makes the inputs equal length. */
export function safeEqual(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
