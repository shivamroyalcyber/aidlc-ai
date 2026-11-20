import { safeEqual } from '../gateway/secrets';
import { formatDate } from '../transform/convert';
import { XML_TYPE } from '../transform/engine';
import { buildSoapEnvelope, buildSoapFault, parseSoap, readUsernameToken, withPrefix } from '../transform/soap';
import { textOf } from '../transform/xml';
import { textResponse, type Handler, type HttpResponse } from '../shared/http';
import { ACCOUNTS, CORE_BANKING_NS } from './data';

export interface CoreBankingDeps {
  credentials(): Promise<{ username: string; password: string }>;
  now(): Date;
  random(): number;
  sleep(ms: number): Promise<void>;
}

const money = (n: number) => n.toFixed(2);
const yyyyMMdd = (d: Date) => formatDate([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()], 'yyyyMMdd');

function fault(code: string, message: string, side: 'Client' | 'Server' = 'Client'): HttpResponse {
  const body = buildSoapFault({ side, message, namespace: CORE_BANKING_NS, detailElement: 'CoreBankingFault', detail: { ErrorCode: code, ErrorMessage: message } });
  return textResponse(500, body, XML_TYPE);
}

function ok(element: string, content: Record<string, unknown>): HttpResponse {
  const body = buildSoapEnvelope({ namespace: CORE_BANKING_NS, element, body: withPrefix(content) as Record<string, unknown> });
  return textResponse(200, body, XML_TYPE);
}

const text = (content: Record<string, unknown>, key: string): string => {
  const value = textOf(content[key]);
  return typeof value === 'string' ? value.trim() : '';
};

/** Simulated legacy Core Banking System: SOAP 1.1, WS-Security UsernameToken, three operations (FR-19). */
export function createCoreBanking(deps: CoreBankingDeps): Handler {
  return async (request) => {
    if (request.method !== 'POST') return fault('METHOD_NOT_ALLOWED', 'Use POST');
    await deps.sleep(40 + Math.floor(deps.random() * 80));

    let soap;
    try {
      soap = parseSoap(request.body);
    } catch {
      return fault('INVALID_REQUEST', 'Request is not a valid SOAP envelope');
    }

    const token = readUsernameToken(soap.header);
    const expected = await deps.credentials();
    if (!token || !safeEqual(token.username, expected.username) || !safeEqual(token.password, expected.password)) {
      return fault('AUTH_FAILED', 'WS-Security authentication failed');
    }

    const c = soap.content;
    switch (soap.operation) {
      case 'GetAccountBalance': {
        const account = ACCOUNTS[text(c, 'AccountNumber')];
        if (!account) return fault('ACCOUNT_NOT_FOUND', 'Account not found');
        return ok('GetAccountBalanceResponse', {
          AccountNumber: account.number,
          AccountName: account.name,
          AvailableBalance: money(account.available),
          LedgerBalance: money(account.ledger),
          Currency: account.currency,
          Status: account.status,
          AsOfDate: yyyyMMdd(deps.now()),
        });
      }

      case 'GetTransactionHistory': {
        const account = ACCOUNTS[text(c, 'AccountNumber')];
        if (!account) return fault('ACCOUNT_NOT_FOUND', 'Account not found');
        const from = text(c, 'FromDate') || '00000000';
        const to = text(c, 'ToDate') || '99999999';
        if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) return fault('INVALID_REQUEST', 'Dates must be yyyyMMdd');
        const max = Math.min(Math.max(Number(text(c, 'MaxRecords')) || 10, 1), 50);
        const rows = account.transactions.filter((t) => t.date >= from && t.date <= to).slice(0, max);
        return ok('GetTransactionHistoryResponse', {
          AccountNumber: account.number,
          RecordCount: String(rows.length),
          Transactions:
            rows.length === 0
              ? ''
              : {
                  Transaction: rows.map((t) => ({
                    TransactionId: t.id,
                    PostingDate: t.date,
                    Amount: money(t.amount),
                    DrCrIndicator: t.indicator,
                    Narration: t.narration,
                    RunningBalance: money(t.balanceAfter),
                  })),
                },
        });
      }

      case 'TransferFunds': {
        const amount = Number(text(c, 'Amount'));
        if (!Number.isFinite(amount) || amount <= 0) return fault('INVALID_AMOUNT', 'Amount must be positive');
        const from = ACCOUNTS[text(c, 'FromAccount')];
        const to = ACCOUNTS[text(c, 'ToAccount')];
        if (!from || !to) return fault('ACCOUNT_NOT_FOUND', 'Account not found');
        if (from.status === 'F') return fault('ACCOUNT_FROZEN', 'Source account is frozen');
        if (amount > from.available) return fault('INSUFFICIENT_FUNDS', 'Insufficient funds');
        const now = deps.now();
        const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
        return ok('TransferFundsResponse', {
          TransactionReference: `TXN${stamp}${String(Math.floor(deps.random() * 1000)).padStart(3, '0')}`,
          Status: 'S',
          FromAccount: from.number,
          ToAccount: to.number,
          DebitedAmount: money(amount),
          Currency: from.currency,
          ValueDate: yyyyMMdd(now),
        });
      }

      default:
        return fault('UNKNOWN_OPERATION', `Operation ${soap.operation} is not supported`);
    }
  };
}
