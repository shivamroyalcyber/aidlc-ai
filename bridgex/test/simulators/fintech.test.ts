import { describe, expect, it } from 'vitest';
import { createTestSimulators, FINTECH_TOKEN, request } from '../helpers';

const sim = createTestSimulators();
const call = (body: string, token: string | null = FINTECH_TOKEN) =>
  sim(request('POST', '/fintech/v1/credit-scores', body, token ? { authorization: `Bearer ${token}` } : {}));

describe('U2 Req 3 – FinTech credit score (FR-20)', () => {
  it('3.1 returns a score for a known customer', async () => {
    const response = await call('{"customerId":"CUST1001","requestedAmount":500000}');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      customerId: 'CUST1001',
      score: 742,
      band: 'GOOD',
      reportDate: '2026-11-20',
      factors: ['On-time repayments for 36 months', 'Credit utilisation 28%'],
    });
  });

  it('3.2 rejects a missing or wrong bearer token', async () => {
    expect((await call('{"customerId":"CUST1001"}', null)).status).toBe(401);
    const wrong = await call('{"customerId":"CUST1001"}', 'nope');
    expect(wrong.status).toBe(401);
    expect(JSON.parse(wrong.body).error.code).toBe('UNAUTHORIZED');
  });

  it('3.3 returns 404 for an unknown customer', async () => {
    const response = await call('{"customerId":"CUST9999"}');
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('3.4 returns 400 for bad bodies', async () => {
    expect((await call('nope')).status).toBe(400);
    expect((await call('{}')).status).toBe(400);
  });

  it('unknown simulator paths return 404', async () => {
    expect((await sim(request('POST', '/mainframe'))).status).toBe(404);
  });
});
