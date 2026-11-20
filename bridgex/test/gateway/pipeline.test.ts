import { describe, expect, it } from 'vitest';
import { INTEGRATION_DOCUMENTS } from '../../src/config/integrations';
import { createRegistry } from '../../src/config/registry';
import { createGatewayApp } from '../../src/gateway/app';
import type { FetchLike } from '../../src/gateway/http-client';
import type { GatewayDeps } from '../../src/gateway/pipeline';
import { InMemoryIdempotencyStore, InMemoryRequestLog, type RequestRecord } from '../../src/gateway/store';
import { InMemoryChaosStore } from '../../src/shared/chaos';
import { inProcessFetch } from '../../src/shared/in-process-fetch';
import { parseSoap } from '../../src/transform/soap';
import { CORE_CREDS, createTestSimulators, FINTECH_TOKEN, request } from '../helpers';

const API_KEY = 'test-client-key-0123456789';

function setup(opts: { docs?: unknown[]; simSleep?: (ms: number) => Promise<void> } = {}) {
  const chaos = new InMemoryChaosStore();
  const simulators = createTestSimulators(chaos, opts.simSleep);
  const log = new InMemoryRequestLog();
  const lines: string[] = [];
  const sleeps: number[] = [];
  let downstreamCalls = 0;
  const realFetch = inProcessFetch(simulators);
  const fetch: FetchLike = (url, init) => {
    downstreamCalls += 1;
    return realFetch(url, init);
  };
  const deps: GatewayDeps = {
    registry: createRegistry(opts.docs ?? INTEGRATION_DOCUMENTS, { CORE_BANKING_URL: 'http://sim.test/core-banking', FINTECH_URL: 'http://sim.test/fintech' }),
    apiKey: async () => API_KEY,
    downstreamCredentials: async () => ({ coreBanking: CORE_CREDS, fintechToken: FINTECH_TOKEN }),
    log,
    idempotency: new InMemoryIdempotencyStore(),
    chaos,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => new Date(),
    random: () => 0.5,
    emit: (line) => lines.push(line),
  };
  const app = createGatewayApp(deps);
  return { app, deps, log, chaos, lines, sleeps, calls: () => downstreamCalls };
}

const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request('POST', path, typeof body === 'string' ? body : JSON.stringify(body), { 'content-type': 'application/json', 'x-api-key': API_KEY, ...headers });

const soapCall = (body: string, headers: Record<string, string> = {}) =>
  request('POST', '/soap/v1/LoanService', body, { 'content-type': 'text/xml', 'x-api-key': API_KEY, ...headers });

const creditRequest = (customerId: string, operation = 'GetCreditScore') =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ln="http://legacybank.example.com/loans"><soapenv:Body><ln:${operation}><ln:CustomerId>${customerId}</ln:CustomerId><ln:LoanAmount>500000</ln:LoanAmount></ln:${operation}></soapenv:Body></soapenv:Envelope>`;

async function lastRecord(log: InMemoryRequestLog): Promise<RequestRecord> {
  const [summary] = await log.recent(1);
  const record = summary ? await log.get(summary.id) : undefined;
  if (!record) throw new Error('no record');
  return record;
}

describe('U3 Req 1 – authentication and routing (FR-09)', () => {
  it('1.1 rejects a missing API key with 401, makes no downstream call, and still records the request', async () => {
    const { app, log, calls } = setup();
    const response = await app(request('POST', '/api/v1/accounts/balance', '{"accountId":"ACC101"}'));
    expect(response.status).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe('UNAUTHORIZED');
    expect(calls()).toBe(0);
    const record = await lastRecord(log);
    expect(record.outcome).toBe('client_error');
    expect(record.stages.clientRequest).toBe('{"accountId":"***101"}');
  });

  it('1.1 health is open; admin routes need the key', async () => {
    const { app } = setup();
    expect((await app(request('GET', '/health'))).status).toBe(200);
    expect((await app(request('GET', '/admin/stats'))).status).toBe(401);
    expect((await app(request('GET', '/admin/stats', '', { 'x-api-key': 'wrong' }))).status).toBe(401);
  });

  it('1.3 returns 404 ROUTE_NOT_FOUND for unknown routes', async () => {
    const { app } = setup();
    const response = await app(json('/api/v1/accounts/close', {}));
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('U3 Req 2 – pipeline (FR-01 to FR-04, FR-07, FR-08, FR-10)', () => {
  it('2.7 balance: JSON in, SOAP to the core, JSON out, with tracing headers', async () => {
    const { app } = setup();
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      accountId: 'ACC101',
      accountName: 'Aarav Sharma',
      availableBalance: 50000,
      ledgerBalance: 50000,
      currency: 'INR',
      status: 'active',
      asOf: new Date().toISOString().slice(0, 10),
    });
    expect(response.headers['x-bridgex-request-id']).toMatch(/^[a-z0-9]{9}-[a-z0-9]{4}$/);
    expect(response.headers['x-bridgex-attempts']).toBe('1');
    expect(Number(response.headers['x-bridgex-latency-ms'])).toBeGreaterThanOrEqual(0);
  });

  it('2.3 sends WS-Security to the core and the record never holds the password or full account numbers (NFR-01)', async () => {
    const { app, log } = setup();
    await app(json('/api/v1/transfers', { fromAccountId: 'ACC101', toAccountId: 'ACC102', amount: 10 }, { 'idempotency-key': 'key-mask-0001' }));
    const record = await lastRecord(log);
    const stored = JSON.stringify(record);
    expect(record.stages.downstreamRequest).toContain('<wsse:Password>********</wsse:Password>');
    expect(stored).not.toContain(CORE_CREDS.password);
    expect(stored).not.toContain(API_KEY);
    expect(stored).not.toContain('ACC101');
    expect(stored).not.toContain('ACC102');
    expect(record.stages.clientResponse).toContain('***101');
  });

  it('2.2 rejects an invalid payload before any downstream call', async () => {
    const { app, calls } = setup();
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'savings' }));
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error).toMatchObject({ code: 'VALIDATION_FAILED', details: ['accountId: does not match pattern ^ACC[0-9]{3,12}$'] });
    expect(calls()).toBe(0);
  });

  it('2.1 rejects malformed and oversized bodies', async () => {
    const { app } = setup();
    expect((await app(json('/api/v1/accounts/balance', '{oops'))).status).toBe(400);
    expect((await app(json('/api/v1/accounts/balance', `{"accountId":"${'A'.repeat(70000)}"}`))).status).toBe(413);
  });

  it('2.4 maps a SOAP fault to the configured status and does not retry it', async () => {
    const { app, log } = setup();
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'ACC999' }));
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe('ACCOUNT_NOT_FOUND');
    const record = await lastRecord(log);
    expect(record.attempts).toHaveLength(1);
    expect(record.outcome).toBe('downstream_fault');
  });

  it('2.4 maps business faults for transfers', async () => {
    const { app } = setup();
    const response = await app(json('/api/v1/transfers', { fromAccountId: 'ACC103', toAccountId: 'ACC101', amount: 5000 }, { 'idempotency-key': 'key-funds-0001' }));
    expect(response.status).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('2.6 soap-to-rest: legacy SOAP in, REST to FinTech, SOAP out', async () => {
    const { app, log } = setup();
    const response = await app(soapCall(creditRequest('CUST1001')));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    const soap = parseSoap(response.body);
    expect(soap.operation).toBe('GetCreditScoreResponse');
    expect(soap.content).toMatchObject({ CustomerId: 'CUST1001', CreditScore: '742', RiskGrade: 'B' });
    const record = await lastRecord(log);
    expect(JSON.parse(record.stages.downstreamRequest ?? '{}')).toEqual({ customerId: '***001', requestedAmount: 500000 });
    expect(JSON.stringify(record)).not.toContain(FINTECH_TOKEN);
  });

  it('2.5/2.6 errors for SOAP clients are SOAP faults', async () => {
    const { app } = setup();
    const notFound = await app(soapCall(creditRequest('CUST9999')));
    expect(notFound.status).toBe(400);
    expect(parseSoap(notFound.body).fault?.errorCode).toBe('CUSTOMER_NOT_FOUND');

    const unknownOp = await app(soapCall(creditRequest('CUST1001', 'DeleteCustomer')));
    expect(parseSoap(unknownOp.body).fault?.errorCode).toBe('ROUTE_NOT_FOUND');

    const noKey = await app(request('POST', '/soap/v1/LoanService', creditRequest('CUST1001')));
    expect(noKey.status).toBe(401);
    expect(parseSoap(noKey.body).fault?.errorCode).toBe('UNAUTHORIZED');

    const xxe = await app(soapCall('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'));
    expect(parseSoap(xxe.body).fault?.errorCode).toBe('INVALID_PAYLOAD');
  });
});

describe('U3 Req 3 – timeouts and retries (FR-11, NFR-03)', () => {
  it('3.2 recovers from two injected failures on the third attempt, with backoff', async () => {
    const { app, chaos, log, sleeps } = setup();
    await chaos.set('core-banking', 'error', 2);
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(response.status).toBe(200);
    expect(response.headers['x-bridgex-attempts']).toBe('3');
    expect(sleeps).toEqual([250, 500]);
    const record = await lastRecord(log);
    expect(record.attempts.map((a) => a.kind)).toEqual(['http-error', 'http-error', 'ok']);
    expect(record.recovered).toBe(true);
  });

  it('3.4 returns 503 DOWNSTREAM_UNAVAILABLE when retries are exhausted', async () => {
    const { app, chaos } = setup();
    await chaos.set('core-banking', 'error', 5);
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body).error.code).toBe('DOWNSTREAM_UNAVAILABLE');
    expect(response.headers['x-bridgex-attempts']).toBe('3');
  });

  it('3.1/3.4 aborts slow attempts and returns 504 when every attempt times out', async () => {
    const fast = (INTEGRATION_DOCUMENTS as Array<{ id: string }>).map((d) => (d.id === 'account-balance' ? { ...d, timeoutMs: 100 } : d));
    const scaledSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms / 20));
    const { app, chaos } = setup({ docs: fast, simSleep: scaledSleep });

    await chaos.set('core-banking', 'timeout', 1);
    const recovered = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(recovered.status).toBe(200);
    expect(recovered.headers['x-bridgex-attempts']).toBe('2');

    await chaos.set('core-banking', 'timeout', 3);
    const failed = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(failed.status).toBe(504);
    expect(JSON.parse(failed.body).error.code).toBe('DOWNSTREAM_TIMEOUT');
  });

  it('3.3 never retries a non-idempotent transfer', async () => {
    const { app, chaos, calls } = setup();
    await chaos.set('core-banking', 'error', 1);
    const response = await app(json('/api/v1/transfers', { fromAccountId: 'ACC101', toAccountId: 'ACC102', amount: 10 }, { 'idempotency-key': 'key-noretry-1' }));
    expect(response.status).toBe(503);
    expect(calls()).toBe(1);
  });
});

describe('U3 Req 4 – idempotency (FR-12)', () => {
  const transfer = { fromAccountId: 'ACC101', toAccountId: 'ACC102', amount: 2500, reference: 'Rent' };

  it('4.1 requires an Idempotency-Key', async () => {
    const { app } = setup();
    const response = await app(json('/api/v1/transfers', transfer));
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('4.2 replays the stored result for the same key and body without calling the core again', async () => {
    const { app, calls, log } = setup();
    const first = await app(json('/api/v1/transfers', transfer, { 'idempotency-key': 'key-replay-0001' }));
    const second = await app(json('/api/v1/transfers', transfer, { 'idempotency-key': 'key-replay-0001' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toBe(first.body);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    expect(calls()).toBe(1);
    expect((await lastRecord(log)).outcome).toBe('replayed');
  });

  it('4.3 rejects the same key with a different body', async () => {
    const { app } = setup();
    await app(json('/api/v1/transfers', transfer, { 'idempotency-key': 'key-conflict-01' }));
    const response = await app(json('/api/v1/transfers', { ...transfer, amount: 9999 }, { 'idempotency-key': 'key-conflict-01' }));
    expect(response.status).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('4.4 releases the key when the core certainly did not act, so the client can retry', async () => {
    const { app, chaos } = setup();
    await chaos.set('core-banking', 'error', 1);
    expect((await app(json('/api/v1/transfers', transfer, { 'idempotency-key': 'key-release-01' }))).status).toBe(503);
    const retry = await app(json('/api/v1/transfers', transfer, { 'idempotency-key': 'key-release-01' }));
    expect(retry.status).toBe(200);
    expect(retry.headers['x-idempotent-replay']).toBeUndefined();
  });
});

describe('U3 Req 5 – request log and metrics (FR-13, NFR-04)', () => {
  it('5.1/5.4 records all four stages and emits one EMF line per request', async () => {
    const { app, log, lines } = setup();
    await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    const record = await lastRecord(log);
    expect(Object.keys(record.stages)).toEqual(['clientRequest', 'downstreamRequest', 'downstreamResponse', 'clientResponse']);
    expect(record.stages.downstreamResponse).toContain('<ns:AvailableBalance>50000.00</ns:AvailableBalance>');
    const emf = lines.map((l) => JSON.parse(l)).find((l) => l._aws);
    expect(emf).toMatchObject({ Integration: 'account-balance', Requests: 1, Failures: 0, Retries: 0 });
    expect(emf._aws.CloudWatchMetrics[0].Namespace).toBe('BridgeX');
  });

  it('5.5 a failing log store does not fail the client request', async () => {
    const { app, deps, lines } = setup();
    deps.log.put = async () => {
      throw Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' });
    };
    const response = await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    expect(response.status).toBe(200);
    expect(lines.some((l) => l.includes('request log write failed'))).toBe(true);
  });
});

describe('U3 Req 6 – admin API (FR-14 to FR-16)', () => {
  const admin = (method: string, path: string, body = '') => request(method, path, body, { 'x-api-key': API_KEY, 'content-type': 'application/json' });

  it('6.1 lists integrations without resolved URLs', async () => {
    const { app } = setup();
    const body = JSON.parse((await app(admin('GET', '/admin/integrations'))).body);
    expect(body.integrations.map((i: { id: string }) => i.id)).toEqual(['account-balance', 'transaction-history', 'fund-transfer', 'credit-score']);
    expect(JSON.stringify(body)).not.toContain('sim.test');
  });

  it('6.2/6.3 returns stats, recent requests and one request in full', async () => {
    const { app, chaos } = setup();
    await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));
    await app(json('/api/v1/accounts/balance', { accountId: 'ACC999' }));
    await chaos.set('core-banking', 'error', 1);
    await app(json('/api/v1/accounts/balance', { accountId: 'ACC101' }));

    const stats = JSON.parse((await app(admin('GET', '/admin/stats'))).body);
    expect(stats).toMatchObject({ total: 3, succeeded: 2, failed: 1, retried: 1, recovered: 1, downstreamErrors: 1 });
    expect(stats.series).toHaveLength(30);

    const list = JSON.parse((await app(admin('GET', '/admin/requests?limit=2'))).body);
    expect(list.requests).toHaveLength(2);
    expect(list.requests[0].stages).toBeUndefined();

    const detail = JSON.parse((await app(admin('GET', `/admin/requests/${list.requests[0].id}`))).body);
    expect(detail.stages.clientRequest).toBeDefined();
    expect((await app(admin('GET', '/admin/requests/zzzzzzzzz-zzzz'))).status).toBe(404);
  });

  it('6.4 previews a transformation without calling the downstream', async () => {
    const { app, calls } = setup();
    const response = await app(admin('POST', '/admin/transform-preview', JSON.stringify({ integrationId: 'account-balance', stage: 'request', payload: '{"accountId":"ACC101"}' })));
    const body = JSON.parse(response.body);
    expect(body.output).toContain('<ns:AccountNumber>ACC101</ns:AccountNumber>');
    expect(body.errors).toEqual([]);
    expect(calls()).toBe(0);
  });

  it('6.5 sets and reads failure injection, and validates input', async () => {
    const { app } = setup();
    const set = await app(admin('POST', '/admin/chaos', JSON.stringify({ target: 'core-banking', mode: 'error', count: 2 })));
    expect(JSON.parse(set.body).chaos).toContainEqual({ target: 'core-banking', mode: 'error', remaining: 2 });
    expect((await app(admin('POST', '/admin/chaos', JSON.stringify({ target: 'mainframe', mode: 'error', count: 2 })))).status).toBe(400);
    expect((await app(admin('POST', '/admin/chaos', JSON.stringify({ target: 'fintech', mode: 'error', count: 99 })))).status).toBe(400);
  });

  it('mapping suggestions answer 501 when no model is configured', async () => {
    const { app } = setup();
    expect((await app(admin('POST', '/admin/mapping-suggestions', '{}'))).status).toBe(501);
  });
});
