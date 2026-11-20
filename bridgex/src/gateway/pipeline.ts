import { createHash } from 'node:crypto';
import type { Registry } from '../config/registry';
import { DEFAULT_RETRY, DEFAULT_TIMEOUT_MS, type Integration } from '../config/types';
import type { ChaosStore } from '../shared/chaos';
import { header, textResponse, type HttpRequest, type HttpResponse } from '../shared/http';
import { errorFormat, JSON_TYPE, parseJsonBody, renderError, transformRequest, transformResponse, XML_TYPE } from '../transform/engine';
import { BridgeError, isBridgeError } from '../transform/errors';
import { collectSensitive, createMasker } from '../transform/mask';
import { parseSoap } from '../transform/soap';
import type { SuggestionRequest, SuggestionResult } from './ai-mapping';
import { callDownstream, type FetchLike, type RawOutcome } from './http-client';
import { emfLine } from './metrics';
import { backoffDelay, isRetryable, type Attempt } from './retry';
import type { DownstreamCredentials } from './secrets';
import type { AttemptRecord, IdempotencyStore, Outcome, RequestLogStore, RequestRecord } from './store';

export interface GatewayDeps {
  registry: Registry;
  apiKey(): Promise<string>;
  downstreamCredentials(): Promise<DownstreamCredentials>;
  log: RequestLogStore;
  idempotency: IdempotencyStore;
  chaos: ChaosStore;
  fetch: FetchLike;
  sleep(ms: number): Promise<void>;
  now(): Date;
  random(): number;
  /** Writes one log line (raw stdout in Lambda so EMF is parsed). */
  emit(line: string): void;
  suggestMappings?(input: SuggestionRequest): Promise<SuggestionResult>;
}

export const STAGE_LIMIT = 8 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

function truncate(text: string): string {
  return text.length > STAGE_LIMIT ? `${text.slice(0, STAGE_LIMIT)}\n…[truncated]` : text;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Sensitive values from a request we could not transform, so even rejected payloads are masked. */
function bestEffortSensitive(integration: Integration, body: string): string[] {
  try {
    const source = integration.direction === 'rest-to-soap' ? parseJsonBody(body) : parseSoap(body).content;
    return collectSensitive(source, integration.request.mappings);
  } catch {
    return [];
  }
}

function classify(integration: Integration, raw: RawOutcome): Attempt {
  if (raw.kind !== 'response') return { kind: raw.kind, latencyMs: raw.latencyMs };
  const { status, body, latencyMs } = raw;
  if (status >= 200 && status < 300) return { kind: 'ok', status, body, latencyMs };
  if (integration.target.type === 'soap') {
    let isFault = false;
    try {
      isFault = Boolean(parseSoap(body).fault);
    } catch {
      isFault = false;
    }
    if (isFault) return { kind: 'fault', status, body, latencyMs };
  } else if (status >= 400 && status < 500 && status !== 429) {
    return { kind: 'fault', status, body, latencyMs };
  }
  return { kind: 'http-error', status, body, latencyMs };
}

export interface RunContext {
  requestId: string;
  startedAt: number;
  /** Set when the request was rejected before the pipeline (auth, routing). */
  rejection?: BridgeError;
}

/** Runs one integration request end to end and records it (U3 Req 2–5). */
export async function runIntegration(deps: GatewayDeps, integration: Integration | undefined, request: HttpRequest, ctx: RunContext): Promise<HttpResponse> {
  const format = errorFormat(integration, request.path);
  const attempts: AttemptRecord[] = [];
  let sensitive: string[] = integration ? bestEffortSensitive(integration, request.body) : [];
  let secrets: string[] = [];
  let downstreamRequest: string | undefined;
  let downstreamResponse: string | undefined;
  let downstreamType: string | undefined;
  let lastKind: Attempt['kind'] | undefined;
  let idempotencyKey: string | undefined;
  let locked = false;
  let response: HttpResponse;
  let outcome: Outcome;
  let errorCode: string | undefined;

  try {
    if (ctx.rejection) throw ctx.rejection;
    if (!integration) throw new BridgeError('ROUTE_NOT_FOUND', 'No integration matches this route', 404);

    const credentials = await deps.downstreamCredentials();
    secrets = [credentials.coreBanking.password, credentials.fintechToken];
    const transformed = transformRequest(integration, request.body, { usernameToken: credentials.coreBanking, bearerToken: credentials.fintechToken });
    sensitive = transformed.sensitive;

    let replay: HttpResponse | undefined;
    if (integration.requireIdempotencyKey) {
      idempotencyKey = header(request, 'idempotency-key');
      if (!idempotencyKey) throw new BridgeError('IDEMPOTENCY_KEY_REQUIRED', 'This operation needs an Idempotency-Key header', 400);
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
        throw new BridgeError('INVALID_PAYLOAD', 'Idempotency-Key must be 8–128 letters, digits or - _ . :', 400);
      }
      const begun = await deps.idempotency.begin(integration.id, idempotencyKey, sha256(request.body), deps.now());
      if (begun.state === 'conflict') {
        const message = begun.reason === 'different-body' ? 'Idempotency-Key was already used with a different request body' : 'A request with this Idempotency-Key is still in progress';
        throw new BridgeError('IDEMPOTENCY_CONFLICT', message, 409);
      }
      if (begun.state === 'replay') replay = textResponse(begun.status, begun.body, begun.contentType, { 'x-idempotent-replay': 'true' });
      else locked = true;
    }

    if (replay) {
      response = replay;
      outcome = 'replayed';
    } else {
      downstreamRequest = transformed.body;
      downstreamType = transformed.contentType;
      const maxAttempts = integration.idempotent ? (integration.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts) : 1;
      const baseDelay = integration.retry?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
      const timeoutMs = integration.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      let last: Attempt | undefined;
      for (let n = 1; n <= maxAttempts; n++) {
        const raw = await callDownstream(deps.fetch, integration.target.url, { method: 'POST', headers: transformed.headers, body: transformed.body }, timeoutMs, () => deps.now().getTime());
        last = classify(integration, raw);
        attempts.push({ attempt: n, kind: last.kind, ...(last.status !== undefined ? { status: last.status } : {}), latencyMs: last.latencyMs });
        if (!isRetryable(last) || n === maxAttempts) break;
        await deps.sleep(backoffDelay(n, baseDelay, deps.random));
      }
      if (!last) throw new BridgeError('GATEWAY_ERROR', 'No downstream attempt was made', 500, [], 'gateway');
      lastKind = last.kind;
      if (last.body !== undefined) downstreamResponse = last.body;

      if (last.kind === 'ok' || last.kind === 'fault') {
        const mapped = transformResponse(integration, last.status ?? 200, last.body ?? '');
        sensitive = [...sensitive, ...mapped.sensitive];
        response = textResponse(200, mapped.body, mapped.contentType);
        outcome = 'success';
      } else if (last.kind === 'timeout') {
        throw new BridgeError('DOWNSTREAM_TIMEOUT', 'The downstream system did not answer in time', 504, [], 'downstream');
      } else {
        throw new BridgeError('DOWNSTREAM_UNAVAILABLE', 'The downstream system is unavailable', 503, [], 'downstream');
      }
    }
  } catch (error) {
    const failure = isBridgeError(error) ? error : new BridgeError('GATEWAY_ERROR', 'Unexpected gateway error', 500, [], 'gateway');
    if (!isBridgeError(error)) {
      deps.emit(JSON.stringify({ level: 'error', message: 'unexpected gateway error', requestId: ctx.requestId, errorName: (error as Error)?.name }));
    }
    const rendered = renderError(format, failure, ctx.requestId);
    response = textResponse(rendered.status, rendered.body, rendered.contentType);
    errorCode = failure.code;
    outcome =
      failure.source === 'client' ? 'client_error' : failure.source === 'gateway' ? 'gateway_error' : lastKind === 'fault' ? 'downstream_fault' : 'downstream_error';
  }

  if (locked && integration && idempotencyKey) {
    // Release only when the downstream certainly did not act; otherwise keep the answer, even an unknown one (ADR-006).
    const notProcessed = attempts.length === 0 || lastKind === 'http-error';
    try {
      if (notProcessed) await deps.idempotency.release(integration.id, idempotencyKey);
      else await deps.idempotency.complete(integration.id, idempotencyKey, { status: response.status, body: response.body, contentType: response.headers['content-type'] ?? JSON_TYPE });
    } catch (error) {
      deps.emit(JSON.stringify({ level: 'error', message: 'idempotency update failed', requestId: ctx.requestId, errorName: (error as Error)?.name }));
    }
  }

  const latencyMs = deps.now().getTime() - ctx.startedAt;
  const mask = createMasker(sensitive, secrets);
  const stage = (text: string | undefined) => (text === undefined ? undefined : truncate(mask(text)));
  const record: RequestRecord = {
    id: ctx.requestId,
    timestamp: new Date(ctx.startedAt).toISOString(),
    ...(integration ? { integrationId: integration.id, integrationName: integration.name, direction: integration.direction } : {}),
    method: request.method,
    path: request.path,
    status: response.status,
    outcome,
    ...(errorCode ? { errorCode } : {}),
    latencyMs,
    downstreamLatencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    attempts,
    retried: attempts.length > 1,
    recovered: attempts.length > 1 && outcome === 'success',
    ...(idempotencyKey ? { idempotencyKey } : {}),
    stages: {
      clientRequest: integration ? (stage(request.body) ?? '') : '[not stored: no matching integration]',
      ...(downstreamRequest !== undefined ? { downstreamRequest: stage(downstreamRequest) } : {}),
      ...(downstreamResponse !== undefined ? { downstreamResponse: stage(downstreamResponse) } : {}),
      clientResponse: stage(response.body) ?? '',
    },
    contentTypes: {
      client: format === 'soap' ? XML_TYPE : JSON_TYPE,
      ...(downstreamType ? { downstream: downstreamType } : {}),
    },
  };

  try {
    await deps.log.put(record);
  } catch (error) {
    deps.emit(JSON.stringify({ level: 'error', message: 'request log write failed', requestId: ctx.requestId, errorName: (error as Error)?.name }));
  }
  deps.emit(emfLine(record));

  return {
    ...response,
    headers: {
      ...response.headers,
      'x-bridgex-request-id': ctx.requestId,
      'x-bridgex-attempts': String(attempts.length),
      'x-bridgex-latency-ms': String(latencyMs),
    },
  };
}
