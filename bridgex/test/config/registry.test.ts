import { describe, expect, it } from 'vitest';
import { INTEGRATION_DOCUMENTS } from '../../src/config/integrations';
import { createRegistry, validateIntegration } from '../../src/config/registry';

const env = { CORE_BANKING_URL: 'https://sim.example.com/core-banking/', FINTECH_URL: 'https://sim.example.com/fintech' };

describe('U1 Req 5 – integration registry (FR-06, NFR-06)', () => {
  it('5.1 every bundled integration document is valid', () => {
    for (const doc of INTEGRATION_DOCUMENTS) {
      expect(validateIntegration(doc), (doc as { id: string }).id).toEqual([]);
    }
  });

  it('5.1 the file name matches the id (integration-mapping checklist)', async () => {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(new URL('../../src/config/integrations/', import.meta.url)).filter((f) => f.endsWith('.json'));
    const ids = INTEGRATION_DOCUMENTS.map((d) => `${(d as { id: string }).id}.json`);
    expect(files.sort()).toEqual(ids.sort());
  });

  it('5.1 throws with the integration id and problem for an invalid document', () => {
    const broken = { ...(INTEGRATION_DOCUMENTS[0] as object), id: 'broken', direction: 'sideways' };
    expect(() => createRegistry([broken], env)).toThrow(/Invalid integration broken: direction must be/);
  });

  it('5.1 rejects a non-idempotent integration that retries', () => {
    const doc = { ...(INTEGRATION_DOCUMENTS[2] as object), retry: { maxAttempts: 3, baseDelayMs: 100 } };
    expect(validateIntegration(doc)).toContain('non-idempotent integrations must not retry');
  });

  it('5.2 resolves URL placeholders and trims trailing slashes', () => {
    const registry = createRegistry(INTEGRATION_DOCUMENTS, env);
    expect(registry.get('account-balance')?.target.url).toBe('https://sim.example.com/core-banking/CoreBankingService');
    expect(registry.get('credit-score')?.target.url).toBe('https://sim.example.com/fintech/v1/credit-scores');
  });

  it('5.2 throws when a placeholder has no value', () => {
    expect(() => createRegistry(INTEGRATION_DOCUMENTS, { CORE_BANKING_URL: 'x' })).toThrow(/needs environment variable FINTECH_URL/);
  });

  it('5.3 matches REST routes by method and path, SOAP routes by path and operation', () => {
    const registry = createRegistry(INTEGRATION_DOCUMENTS, env);
    expect(registry.matchRest('POST', '/api/v1/accounts/balance')?.id).toBe('account-balance');
    expect(registry.matchRest('GET', '/api/v1/accounts/balance')).toBeUndefined();
    expect(registry.matchSoap('/soap/v1/LoanService', 'GetCreditScore')?.id).toBe('credit-score');
    expect(registry.matchSoap('/soap/v1/LoanService', 'DeleteEverything')).toBeUndefined();
    expect(registry.hasSoapPath('/soap/v1/LoanService')).toBe(true);
  });

  it('5.4 the public view keeps placeholders instead of resolved URLs', () => {
    const registry = createRegistry(INTEGRATION_DOCUMENTS, env);
    expect(registry.publicView('account-balance')?.target.url).toBe('${CORE_BANKING_URL}/CoreBankingService');
  });
});
