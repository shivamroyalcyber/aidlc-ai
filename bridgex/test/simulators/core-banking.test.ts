import { describe, expect, it } from 'vitest';
import { InMemoryChaosStore } from '../../src/shared/chaos';
import { CHAOS_TIMEOUT_MS } from '../../src/simulators/app';
import { parseSoap } from '../../src/transform/soap';
import { coreBankingCall, createTestSimulators } from '../helpers';

const sim = createTestSimulators();

async function call(operation: string, body: Record<string, string>, token?: null) {
  const response = await sim(coreBankingCall(operation, body, token));
  return { status: response.status, soap: parseSoap(response.body) };
}

describe('U2 Req 1 – Core Banking operations (FR-19)', () => {
  it('1.1 returns a balance with legacy formats', async () => {
    const { status, soap } = await call('GetAccountBalance', { AccountNumber: 'ACC101' });
    expect(status).toBe(200);
    expect(soap.operation).toBe('GetAccountBalanceResponse');
    expect(soap.content).toEqual({
      AccountNumber: 'ACC101',
      AccountName: 'Aarav Sharma',
      AvailableBalance: '50000.00',
      LedgerBalance: '50000.00',
      Currency: 'INR',
      Status: 'A',
      AsOfDate: '20261120',
    });
  });

  it('1.2 filters transaction history by date and limit', async () => {
    const { soap } = await call('GetTransactionHistory', { AccountNumber: 'ACC101', FromDate: '20261101', ToDate: '20261120', MaxRecords: '3' });
    expect(soap.content['RecordCount']).toBe('3');
    const rows = (soap.content['Transactions'] as { Transaction: Array<{ PostingDate: string }> }).Transaction;
    expect(rows.map((r) => r.PostingDate)).toEqual(['20261118', '20261115', '20261112']);
  });

  it('1.3 confirms a valid transfer', async () => {
    const { soap } = await call('TransferFunds', { FromAccount: 'ACC101', ToAccount: 'ACC102', Amount: '2500', Currency: 'INR', Reference: 'Rent' });
    expect(soap.operation).toBe('TransferFundsResponse');
    expect(soap.content['Status']).toBe('S');
    expect(soap.content['TransactionReference']).toMatch(/^TXN20261120090000\d{3}$/);
  });

  it.each([
    ['GetAccountBalance', { AccountNumber: 'ACC999' }, 'ACCOUNT_NOT_FOUND'],
    ['TransferFunds', { FromAccount: 'ACC103', ToAccount: 'ACC101', Amount: '5000' }, 'INSUFFICIENT_FUNDS'],
    ['TransferFunds', { FromAccount: 'ACC104', ToAccount: 'ACC101', Amount: '10' }, 'ACCOUNT_FROZEN'],
    ['TransferFunds', { FromAccount: 'ACC101', ToAccount: 'ACC102', Amount: '-1' }, 'INVALID_AMOUNT'],
    ['CloseAllAccounts', {}, 'UNKNOWN_OPERATION'],
  ])('1.4/1.5 %s returns fault %s', async (operation, body, code) => {
    const { status, soap } = await call(operation, body as Record<string, string>);
    expect(status).toBe(500);
    expect(soap.fault?.errorCode).toBe(code);
  });
});

describe('U2 Req 2 – Core Banking authentication (FR-10)', () => {
  it('2.1 rejects a missing UsernameToken', async () => {
    const { status, soap } = await call('GetAccountBalance', { AccountNumber: 'ACC101' }, null);
    expect(status).toBe(500);
    expect(soap.fault?.errorCode).toBe('AUTH_FAILED');
  });

  it('2.1 rejects a wrong password', async () => {
    const response = await sim(coreBankingCall('GetAccountBalance', { AccountNumber: 'ACC101' }, { username: 'bridgex-svc', password: 'guess' }));
    expect(parseSoap(response.body).fault?.errorCode).toBe('AUTH_FAILED');
  });
});

describe('U2 Req 4 – failure injection (FR-16)', () => {
  it('4.1/4.2/4.4 fails exactly the next N calls with HTTP 503, then recovers', async () => {
    const chaos = new InMemoryChaosStore();
    const app = createTestSimulators(chaos);
    await chaos.set('core-banking', 'error', 2);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await app(coreBankingCall('GetAccountBalance', { AccountNumber: 'ACC101' }))).status);
    expect(statuses).toEqual([503, 503, 200]);
    expect(await chaos.list()).toContainEqual({ target: 'core-banking', mode: 'error', remaining: 0 });
  });

  it('4.3 delays the next call in timeout mode', async () => {
    const chaos = new InMemoryChaosStore();
    const sleeps: number[] = [];
    const app = createTestSimulators(chaos, async (ms) => {
      sleeps.push(ms);
    });
    await chaos.set('core-banking', 'timeout', 1);
    const response = await app(coreBankingCall('GetAccountBalance', { AccountNumber: 'ACC101' }));
    expect(response.status).toBe(200);
    expect(sleeps).toContain(CHAOS_TIMEOUT_MS);
  });

  it('chaos on one target does not affect the other', async () => {
    const chaos = new InMemoryChaosStore();
    await chaos.set('fintech', 'error', 5);
    const response = await createTestSimulators(chaos)(coreBankingCall('GetAccountBalance', { AccountNumber: 'ACC101' }));
    expect(response.status).toBe(200);
  });
});
