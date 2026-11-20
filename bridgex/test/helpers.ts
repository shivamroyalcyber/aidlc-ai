import { InMemoryChaosStore } from '../src/shared/chaos';
import type { HttpRequest } from '../src/shared/http';
import { createSimulatorsApp } from '../src/simulators/app';
import { buildSoapEnvelope, type UsernameToken } from '../src/transform/soap';

export const CORE_CREDS = { username: 'bridgex-svc', password: 'test-Passw0rd-123' };
export const FINTECH_TOKEN = 'test-fintech-token-123';
export const FIXED_NOW = new Date('2026-11-20T09:00:00Z');

export function createTestSimulators(chaos = new InMemoryChaosStore(), sleep: (ms: number) => Promise<void> = async () => {}) {
  return createSimulatorsApp({
    coreBankingCredentials: async () => CORE_CREDS,
    fintechToken: async () => FINTECH_TOKEN,
    chaos,
    now: () => FIXED_NOW,
    random: () => 0.5,
    sleep,
  });
}

/** Builds a request the way the adapters do: the query string is split off the path. */
export function request(method: string, pathAndQuery: string, body = '', headers: Record<string, string> = {}): HttpRequest {
  const url = new URL(pathAndQuery, 'http://test.local');
  return { method, path: url.pathname, headers, query: Object.fromEntries(url.searchParams), body };
}

export function coreBankingCall(operation: string, body: Record<string, string>, token: UsernameToken | null = CORE_CREDS): HttpRequest {
  const prefixed = Object.fromEntries(Object.entries(body).map(([k, v]) => [`ns:${k}`, v]));
  const xml = buildSoapEnvelope({
    namespace: 'http://legacybank.example.com/corebanking',
    element: operation,
    body: prefixed,
    ...(token ? { usernameToken: token } : {}),
  });
  return request('POST', '/core-banking/CoreBankingService', xml, { 'content-type': 'text/xml' });
}
