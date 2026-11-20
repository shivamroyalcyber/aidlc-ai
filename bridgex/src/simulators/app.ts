import type { ChaosStore, ChaosTarget } from '../shared/chaos';
import { jsonResponse, textResponse, type Handler } from '../shared/http';
import { createCoreBanking, type CoreBankingDeps } from './core-banking';
import { createFintech } from './fintech';

export interface SimulatorsDeps extends Omit<CoreBankingDeps, 'credentials'> {
  coreBankingCredentials(): Promise<{ username: string; password: string }>;
  fintechToken(): Promise<string>;
  chaos: ChaosStore;
  log?(message: string): void;
}

export const CHAOS_TIMEOUT_MS = 6000;

/** Routes `/core-banking/*` and `/fintech/*` and applies failure injection first (FR-16). */
export function createSimulatorsApp(deps: SimulatorsDeps): Handler {
  const coreBanking = createCoreBanking({ ...deps, credentials: deps.coreBankingCredentials });
  const fintech = createFintech({ ...deps, token: deps.fintechToken });

  const routes: Array<{ path: string; target: ChaosTarget; handler: Handler }> = [
    { path: '/core-banking/CoreBankingService', target: 'core-banking', handler: coreBanking },
    { path: '/fintech/v1/credit-scores', target: 'fintech', handler: fintech },
  ];

  return async (request) => {
    if (request.path === '/health') return jsonResponse(200, { status: 'ok', systems: routes.map((r) => r.target) });
    const route = routes.find((r) => r.path === request.path);
    if (!route) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Unknown simulator path' } });

    let mode = null;
    try {
      mode = await deps.chaos.consume(route.target);
    } catch (error) {
      deps.log?.(`chaos store unavailable: ${(error as Error).name}`);
    }
    if (mode === 'error') {
      return textResponse(503, '<html><body><h1>503 Service Unavailable</h1><p>Legacy host is not responding.</p></body></html>', 'text/html');
    }
    if (mode === 'timeout') await deps.sleep(CHAOS_TIMEOUT_MS);
    return route.handler(request);
  };
}
