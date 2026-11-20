import { header, jsonResponse, textResponse, type Handler, type HttpRequest } from '../shared/http';
import { newRequestId } from '../shared/ids';
import { errorFormat, renderError } from '../transform/engine';
import { BridgeError, isBridgeError } from '../transform/errors';
import { parseSoap } from '../transform/soap';
import type { Integration } from '../config/types';
import { handleAdmin } from './admin';
import { apiKeyMatches } from './auth';
import { runIntegration, type GatewayDeps } from './pipeline';

const isIntegrationPath = (path: string) => path.startsWith('/api/') || path.startsWith('/soap/');

/** Finds the integration for a request. SOAP routes are matched by path and the first Body element. */
function resolveIntegration(deps: GatewayDeps, request: HttpRequest): { integration?: Integration; error?: BridgeError } {
  if (request.method !== 'POST') return {};
  if (request.path.startsWith('/soap/')) {
    if (!deps.registry.hasSoapPath(request.path)) return {};
    try {
      const operation = parseSoap(request.body).operation;
      const integration = deps.registry.matchSoap(request.path, operation);
      return integration ? { integration } : { error: new BridgeError('ROUTE_NOT_FOUND', `Operation ${operation} is not available at this endpoint`, 404) };
    } catch (error) {
      if (isBridgeError(error)) return { error };
      throw error;
    }
  }
  const integration = deps.registry.matchRest(request.method, request.path);
  return integration ? { integration } : {};
}

/** The BridgeX gateway: health, API key check, admin API and integration routes (U3). */
export function createGatewayApp(deps: GatewayDeps): Handler {
  return async (request) => {
    const startedAt = deps.now().getTime();
    const requestId = newRequestId(deps.now());
    try {
      // API Gateway answers CORS preflight itself; this is a fallback if a preflight ever reaches the function.
      if (request.method === 'OPTIONS') return { status: 204, headers: {}, body: '' };

      if (request.method === 'GET' && request.path === '/health') {
        return jsonResponse(200, { status: 'ok', integrations: deps.registry.list().length }, { 'x-bridgex-request-id': requestId });
      }

      const authorised = apiKeyMatches(header(request, 'x-api-key'), await deps.apiKey());

      if (isIntegrationPath(request.path)) {
        const { integration, error } = resolveIntegration(deps, request);
        const rejection = !authorised ? new BridgeError('UNAUTHORIZED', 'Missing or invalid API key', 401) : error;
        return await runIntegration(deps, integration, request, { requestId, startedAt, ...(rejection ? { rejection } : {}) });
      }

      if (!authorised) {
        const rendered = renderError('json', new BridgeError('UNAUTHORIZED', 'Missing or invalid API key', 401), requestId);
        return textResponse(rendered.status, rendered.body, rendered.contentType, { 'x-bridgex-request-id': requestId });
      }

      if (request.path.startsWith('/admin/')) {
        const response = await handleAdmin(deps, request, requestId);
        return { ...response, headers: { ...response.headers, 'x-bridgex-request-id': requestId } };
      }

      const rendered = renderError('json', new BridgeError('ROUTE_NOT_FOUND', 'Unknown route', 404), requestId);
      return textResponse(rendered.status, rendered.body, rendered.contentType, { 'x-bridgex-request-id': requestId });
    } catch (error) {
      deps.emit(JSON.stringify({ level: 'error', message: 'unhandled gateway error', requestId, errorName: (error as Error)?.name }));
      const rendered = renderError(errorFormat(undefined, request.path), new BridgeError('GATEWAY_ERROR', 'Unexpected gateway error', 500, [], 'gateway'), requestId);
      return textResponse(rendered.status, rendered.body, rendered.contentType, { 'x-bridgex-request-id': requestId });
    }
  };
}
