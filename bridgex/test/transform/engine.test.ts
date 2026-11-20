import { describe, expect, it } from 'vitest';
import { INTEGRATION_DOCUMENTS } from '../../src/config/integrations';
import { createRegistry } from '../../src/config/registry';
import type { Integration } from '../../src/config/types';
import { previewTransform, renderError, transformRequest, transformResponse } from '../../src/transform/engine';
import { BridgeError } from '../../src/transform/errors';
import { parseSoap, readUsernameToken } from '../../src/transform/soap';

const registry = createRegistry(INTEGRATION_DOCUMENTS, { CORE_BANKING_URL: 'https://sim/core-banking', FINTECH_URL: 'https://sim/fintech' });
const integration = (id: string): Integration => {
  const found = registry.get(id);
  if (!found) throw new Error(id);
  return found;
};

describe('U1 Req 6 – end-to-end transformation (FR-01 to FR-04, FR-15)', () => {
  it('6.3 reproduces the proposal balance example exactly', () => {
    const balance = integration('account-balance');
    const response = transformResponse(balance, 200, balance.samples.response);
    expect(response.body).toBe('{"accountId":"ACC101","availableBalance":50000,"currency":"INR"}');
  });

  it('6.1 rest-to-soap request: JSON becomes a SOAP envelope with WS-Security', () => {
    const balance = integration('account-balance');
    const request = transformRequest(balance, '{"accountId":"ACC101"}', { usernameToken: { username: 'svc', password: 'pw-123456' } });
    expect(request.headers).toEqual({ 'content-type': 'text/xml; charset=utf-8', soapaction: '"http://legacybank.example.com/corebanking/GetAccountBalance"' });
    const parsed = parseSoap(request.body);
    expect(parsed.operation).toBe('GetAccountBalance');
    expect(parsed.content).toEqual({ AccountNumber: 'ACC101' });
    expect(readUsernameToken(parsed.header)).toEqual({ username: 'svc', password: 'pw-123456' });
    expect(request.sensitive).toEqual(['ACC101']);
  });

  it('6.1 transaction history: dates, codes, numbers and repeating elements', () => {
    const history = integration('transaction-history');
    const request = parseSoap(transformRequest(history, history.samples.request).body);
    expect(request.content).toEqual({ AccountNumber: 'ACC101', FromDate: '20261101', ToDate: '20261120', MaxRecords: '5' });

    const response = JSON.parse(transformResponse(history, 200, history.samples.response).body);
    expect(response).toEqual({
      accountId: 'ACC101',
      count: 2,
      transactions: [
        { id: 'TXN90001', date: '2026-11-18', amount: 2500, type: 'debit', description: 'UPI/Coffee Day', balanceAfter: 50000 },
        { id: 'TXN89977', date: '2026-11-15', amount: 45000, type: 'credit', description: 'Salary November', balanceAfter: 52500 },
      ],
    });
  });

  it('6.1 transfer: defaults are applied and the response is mapped', () => {
    const transfer = integration('fund-transfer');
    const request = parseSoap(transformRequest(transfer, '{"fromAccountId":"ACC101","toAccountId":"ACC102","amount":10}').body);
    expect(request.content).toEqual({ FromAccount: 'ACC101', ToAccount: 'ACC102', Amount: '10', Currency: 'INR', Reference: 'BridgeX transfer' });
    expect(JSON.parse(transformResponse(transfer, 200, transfer.samples.response).body)).toEqual({
      transactionId: 'TXN20261120000123',
      status: 'completed',
      fromAccountId: 'ACC101',
      toAccountId: 'ACC102',
      amount: 2500,
      currency: 'INR',
      valueDate: '2026-11-20',
    });
  });

  it('6.2 soap-to-rest: SOAP request becomes JSON with a Bearer token, JSON response becomes SOAP', () => {
    const credit = integration('credit-score');
    const request = transformRequest(credit, credit.samples.request, { bearerToken: 'tok-123456' });
    expect(JSON.parse(request.body)).toEqual({ customerId: 'CUST1001', requestedAmount: 500000 });
    expect(request.headers['authorization']).toBe('Bearer tok-123456');

    const response = parseSoap(transformResponse(credit, 200, credit.samples.response).body);
    expect(response.operation).toBe('GetCreditScoreResponse');
    expect(response.content).toEqual({
      CustomerId: 'CUST1001',
      CreditScore: '742',
      RiskGrade: 'B',
      ReportDate: '20261120',
      Factors: { Factor: ['On-time repayments for 36 months', 'Credit utilisation 28%'] },
    });
  });

  it('6.1 maps a SOAP fault through the faults table', () => {
    const balance = integration('account-balance');
    const fault = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring>Account not found</faultstring><detail><ErrorCode>ACCOUNT_NOT_FOUND</ErrorCode><ErrorMessage>Account not found</ErrorMessage></detail></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
    expect(() => transformResponse(balance, 500, fault)).toThrow(expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND', status: 404, source: 'downstream' }));
  });

  it('6.2 maps a REST error to a fault code for SOAP clients', () => {
    const credit = integration('credit-score');
    expect(() => transformResponse(credit, 404, '{"error":{"code":"CUSTOMER_NOT_FOUND","message":"No such customer"}}')).toThrow(
      expect.objectContaining({ code: 'CUSTOMER_NOT_FOUND', status: 404 }),
    );
  });

  it('rejects invalid client payloads with every failing field', () => {
    const balance = integration('account-balance');
    expect(() => transformRequest(balance, '{"accountId":"12"}')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: ['accountId: does not match pattern ^ACC[0-9]{3,12}$'] }));
    expect(() => transformRequest(balance, 'not json')).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
  });

  it('renders errors as SOAP faults for SOAP clients and JSON otherwise', () => {
    const error = new BridgeError('VALIDATION_FAILED', 'Request validation failed', 400, ['CustomerId: is required']);
    const soap = renderError('soap', error, 'req-1');
    expect(soap.status).toBe(400);
    expect(parseSoap(soap.body).fault?.errorCode).toBe('VALIDATION_FAILED');
    expect(JSON.parse(renderError('json', error, 'req-1').body)).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Request validation failed', requestId: 'req-1', details: ['CustomerId: is required'] },
    });
  });

  it('6.4 every sample transforms in both stages without errors', () => {
    for (const item of registry.list()) {
      expect(previewTransform(item, 'request', item.samples.request).errors, `${item.id} request`).toEqual([]);
      expect(previewTransform(item, 'response', item.samples.response).errors, `${item.id} response`).toEqual([]);
    }
  });

  it('6.4 preview masks downstream credentials and reports errors', () => {
    const balance = integration('account-balance');
    expect(previewTransform(balance, 'request', balance.samples.request).output).toContain('<wsse:Password>[masked]</wsse:Password>');
    const bad = previewTransform(balance, 'request', '{"accountId":1}');
    expect(bad.status).toBe(400);
    expect(bad.errors[0]).toBe('VALIDATION_FAILED: Request validation failed');
  });
});
