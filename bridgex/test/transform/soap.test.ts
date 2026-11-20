import { describe, expect, it } from 'vitest';
import { buildSoapEnvelope, buildSoapFault, parseSoap, readUsernameToken } from '../../src/transform/soap';

describe('U1 Req 2 – SOAP envelopes and faults (FR-01, FR-04, FR-08)', () => {
  it('2.1 builds a SOAP 1.1 envelope with the operation in the target namespace', () => {
    const xml = buildSoapEnvelope({
      namespace: 'http://legacybank.example.com/corebanking',
      element: 'GetAccountBalance',
      body: { 'ns:AccountNumber': 'ACC101' },
    });
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://legacybank.example.com/corebanking">',
        '  <soapenv:Header/>',
        '  <soapenv:Body>',
        '    <ns:GetAccountBalance>',
        '      <ns:AccountNumber>ACC101</ns:AccountNumber>',
        '    </ns:GetAccountBalance>',
        '  </soapenv:Body>',
        '</soapenv:Envelope>',
      ].join('\n'),
    );
  });

  it('2.1 adds a WS-Security UsernameToken header when given credentials', () => {
    const xml = buildSoapEnvelope({ namespace: 'urn:x', element: 'Op', body: {}, usernameToken: { username: 'svc', password: 'pw123456' } });
    const parsed = parseSoap(xml);
    expect(readUsernameToken(parsed.header)).toEqual({ username: 'svc', password: 'pw123456' });
  });

  it('2.2 reads the first Body element whatever prefixes the sender used', () => {
    const xml = `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><m:GetCreditScore xmlns:m="urn:loans"><m:CustomerId>CUST1001</m:CustomerId></m:GetCreditScore></S:Body></S:Envelope>`;
    const parsed = parseSoap(xml);
    expect(parsed.operation).toBe('GetCreditScore');
    expect(parsed.content).toEqual({ CustomerId: 'CUST1001' });
    expect(parsed.fault).toBeUndefined();
  });

  it('2.3 extracts fault code, string and detail ErrorCode', () => {
    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring>Account not found</faultstring><detail><cb:CoreBankingFault xmlns:cb="urn:cb"><cb:ErrorCode>ACCOUNT_NOT_FOUND</cb:ErrorCode><cb:ErrorMessage>No account ACC999</cb:ErrorMessage></cb:CoreBankingFault></detail></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
    expect(parseSoap(xml).fault).toEqual({
      faultcode: 'soapenv:Client',
      faultstring: 'Account not found',
      errorCode: 'ACCOUNT_NOT_FOUND',
      errorMessage: 'No account ACC999',
    });
  });

  it('2.3 falls back to the faultcode when there is no detail', () => {
    const xml = `<e:Envelope xmlns:e="http://schemas.xmlsoap.org/soap/envelope/"><e:Body><e:Fault><faultcode>e:Server</faultcode><faultstring>Boom</faultstring></e:Fault></e:Body></e:Envelope>`;
    expect(parseSoap(xml).fault?.errorCode).toBe('Server');
  });

  it('2.4 rejects XML that is not an envelope', () => {
    expect(() => parseSoap('<GetAccountBalance><AccountNumber>ACC101</AccountNumber></GetAccountBalance>')).toThrow('not a SOAP envelope');
  });

  it('2.5 builds a fault envelope that round-trips', () => {
    const xml = buildSoapFault({ side: 'Client', message: 'Bad request', detail: { ErrorCode: 'VALIDATION_FAILED', ErrorMessage: 'x', RequestId: 'r1' } });
    const fault = parseSoap(xml).fault;
    expect(fault?.faultcode).toBe('soapenv:Client');
    expect(fault?.errorCode).toBe('VALIDATION_FAILED');
  });
});
