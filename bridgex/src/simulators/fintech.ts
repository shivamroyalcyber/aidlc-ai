import { safeEqual } from '../gateway/secrets';
import { header, jsonResponse, type Handler } from '../shared/http';
import { CUSTOMERS } from './data';

export interface FintechDeps {
  token(): Promise<string>;
  now(): Date;
  random(): number;
  sleep(ms: number): Promise<void>;
}

const error = (status: number, code: string, message: string) => jsonResponse(status, { error: { code, message } });

/** Simulated modern FinTech credit-score API: REST/JSON with a Bearer token (FR-20). */
export function createFintech(deps: FintechDeps): Handler {
  return async (request) => {
    if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED', 'Use POST');
    await deps.sleep(15 + Math.floor(deps.random() * 30));

    const auth = header(request, 'authorization') ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!given || !safeEqual(given, await deps.token())) return error(401, 'UNAUTHORIZED', 'Missing or invalid bearer token');

    let body: unknown;
    try {
      body = JSON.parse(request.body);
    } catch {
      return error(400, 'BAD_REQUEST', 'Body must be JSON');
    }
    const customerId = (body as { customerId?: unknown })?.customerId;
    if (typeof customerId !== 'string') return error(400, 'BAD_REQUEST', 'customerId is required');

    const profile = CUSTOMERS[customerId];
    if (!profile) return error(404, 'CUSTOMER_NOT_FOUND', 'No credit file for this customer');
    return jsonResponse(200, { ...profile, reportDate: deps.now().toISOString().slice(0, 10) });
  };
}
