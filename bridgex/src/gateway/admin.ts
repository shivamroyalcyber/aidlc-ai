import { CHAOS_TARGETS, isChaosTarget } from '../shared/chaos';
import { jsonResponse, type HttpRequest, type HttpResponse } from '../shared/http';
import { parseJsonBody, previewTransform, renderError } from '../transform/engine';
import { BridgeError, isBridgeError } from '../transform/errors';
import type { SuggestionRequest } from './ai-mapping';
import type { GatewayDeps } from './pipeline';
import { computeStats } from './stats';

const STATS_WINDOW = 500;

function bad(message: string, details: string[] = []): BridgeError {
  return new BridgeError('INVALID_PAYLOAD', message, 400, details);
}

/** Admin API for the dashboard (U3 Req 6). Caller has already checked the API key. */
export async function handleAdmin(deps: GatewayDeps, request: HttpRequest, requestId: string): Promise<HttpResponse> {
  const { method, path } = request;
  try {
    if (method === 'GET' && path === '/admin/integrations') {
      return jsonResponse(200, { integrations: deps.registry.list().map((i) => deps.registry.publicView(i.id)) });
    }

    if (method === 'GET' && path === '/admin/stats') {
      return jsonResponse(200, computeStats(await deps.log.recent(STATS_WINDOW), deps.now()));
    }

    if (method === 'GET' && path === '/admin/requests') {
      const limit = Math.min(Math.max(Number(request.query['limit']) || 50, 1), 200);
      return jsonResponse(200, { requests: await deps.log.recent(limit) });
    }

    const detail = /^\/admin\/requests\/([a-z0-9]{9}-[a-z0-9]{4})$/.exec(path);
    if (method === 'GET' && detail?.[1]) {
      const record = await deps.log.get(detail[1]);
      if (!record) throw new BridgeError('NOT_FOUND', 'No request with this id', 404);
      return jsonResponse(200, record);
    }

    if (method === 'POST' && path === '/admin/transform-preview') {
      const body = parseJsonBody(request.body);
      const integration = typeof body['integrationId'] === 'string' ? deps.registry.get(body['integrationId']) : undefined;
      if (!integration) throw bad('integrationId does not name an integration');
      const stage = body['stage'];
      if (stage !== 'request' && stage !== 'response') throw bad('stage must be request or response');
      if (typeof body['payload'] !== 'string') throw bad('payload must be a string');
      return jsonResponse(200, { integrationId: integration.id, stage, ...previewTransform(integration, stage, body['payload']) });
    }

    if (method === 'GET' && path === '/admin/chaos') {
      return jsonResponse(200, { chaos: await deps.chaos.list() });
    }

    if (method === 'POST' && path === '/admin/chaos') {
      const body = parseJsonBody(request.body);
      const { target, mode } = body;
      const count = Number(body['count'] ?? 0);
      if (!isChaosTarget(target)) throw bad(`target must be one of ${CHAOS_TARGETS.join(', ')}`);
      if (mode !== 'error' && mode !== 'timeout' && mode !== 'off') throw bad('mode must be error, timeout or off');
      if (!Number.isInteger(count) || count < 0 || count > 10) throw bad('count must be an integer from 0 to 10');
      await deps.chaos.set(target, mode, count);
      return jsonResponse(200, { chaos: await deps.chaos.list() });
    }

    if (method === 'POST' && path === '/admin/mapping-suggestions') {
      if (!deps.suggestMappings) throw new BridgeError('AI_UNAVAILABLE', 'Mapping suggestions are not configured', 501, [], 'gateway');
      const body = parseJsonBody(request.body) as unknown as SuggestionRequest;
      return jsonResponse(200, await deps.suggestMappings(body));
    }

    throw new BridgeError('ROUTE_NOT_FOUND', 'Unknown admin route', 404);
  } catch (error) {
    const failure = isBridgeError(error) ? error : new BridgeError('GATEWAY_ERROR', 'Unexpected gateway error', 500, [], 'gateway');
    if (!isBridgeError(error)) deps.emit(JSON.stringify({ level: 'error', message: 'admin route failed', requestId, path, errorName: (error as Error)?.name }));
    const rendered = renderError('json', failure, requestId);
    return { status: rendered.status, headers: { 'content-type': rendered.contentType }, body: rendered.body };
  }
}
