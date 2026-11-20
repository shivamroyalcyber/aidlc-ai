import type { Integration, RestTarget, SoapTarget } from '../config/types';
import { BridgeError, isBridgeError } from './errors';
import { applyMappings } from './mapping';
import { collectSensitive } from './mask';
import { buildSoapEnvelope, buildSoapFault, parseSoap, type ParsedSoap, type UsernameToken } from './soap';
import { validatePayload } from './validate';
import { assertPayloadSize, isRecord } from './xml';

export const JSON_TYPE = 'application/json';
export const XML_TYPE = 'text/xml; charset=utf-8';

export interface DownstreamCredentialsView {
  usernameToken?: UsernameToken;
  bearerToken?: string;
}

export interface RequestTransform {
  body: string;
  contentType: string;
  headers: Record<string, string>;
  sensitive: string[];
}

export interface ResponseTransform {
  body: string;
  contentType: string;
  sensitive: string[];
}

export interface RenderedError {
  status: number;
  contentType: string;
  body: string;
}

export function parseJsonBody(text: string): Record<string, unknown> {
  assertPayloadSize(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BridgeError('INVALID_PAYLOAD', 'Body is not valid JSON', 400);
  }
  if (!isRecord(value)) throw new BridgeError('INVALID_PAYLOAD', 'Body must be a JSON object', 400);
  return value;
}

export function soapTarget(integration: Integration): SoapTarget {
  if (integration.target.type !== 'soap') throw new Error(`${integration.id} has no SOAP target`);
  return integration.target;
}

export function restTarget(integration: Integration): RestTarget {
  if (integration.target.type !== 'rest') throw new Error(`${integration.id} has no REST target`);
  return integration.target;
}

function failIf(errors: string[], code: string, message: string, status: number, source: 'client' | 'downstream'): void {
  if (errors.length > 0) throw new BridgeError(code, message, status, errors, source);
}

/** Client request → downstream request. Throws `BridgeError` for client-side problems. */
export function transformRequest(integration: Integration, clientBody: string, credentials: DownstreamCredentialsView = {}): RequestTransform {
  const rules = integration.request.mappings;
  const schema = integration.request.schema ?? {};

  if (integration.direction === 'rest-to-soap') {
    const target = soapTarget(integration);
    const json = parseJsonBody(clientBody);
    failIf(validatePayload(json, schema, { lenient: false }), 'VALIDATION_FAILED', 'Request validation failed', 400, 'client');
    const { output, errors } = applyMappings(json, rules, { prefix: 'ns:' });
    failIf(errors, 'VALIDATION_FAILED', 'Request validation failed', 400, 'client');
    const usernameToken = target.auth === 'ws-security' ? credentials.usernameToken : undefined;
    const body = buildSoapEnvelope({ namespace: target.namespace, element: target.operation, body: output, ...(usernameToken ? { usernameToken } : {}) });
    return {
      body,
      contentType: XML_TYPE,
      headers: { 'content-type': XML_TYPE, soapaction: `"${target.soapAction}"` },
      sensitive: collectSensitive(json, rules),
    };
  }

  const target = restTarget(integration);
  const soap = parseSoap(clientBody);
  if (soap.operation !== integration.route.soapOperation) {
    throw new BridgeError('ROUTE_NOT_FOUND', `Operation ${soap.operation} is not available at this endpoint`, 404);
  }
  failIf(validatePayload(soap.content, schema, { lenient: true }), 'VALIDATION_FAILED', 'Request validation failed', 400, 'client');
  const { output, errors } = applyMappings(soap.content, rules);
  failIf(errors, 'VALIDATION_FAILED', 'Request validation failed', 400, 'client');
  const headers: Record<string, string> = { 'content-type': JSON_TYPE, accept: JSON_TYPE };
  if (target.auth === 'bearer' && credentials.bearerToken) headers['authorization'] = `Bearer ${credentials.bearerToken}`;
  return { body: JSON.stringify(output), contentType: JSON_TYPE, headers, sensitive: collectSensitive(soap.content, rules) };
}

/** Maps a legacy fault or REST error code to the client-facing error. */
export function downstreamError(integration: Integration, code: string, message: string): BridgeError {
  const mapped = integration.faults?.[code];
  if (mapped) return new BridgeError(mapped.code ?? code, message, mapped.status, [], 'downstream');
  return new BridgeError('DOWNSTREAM_FAULT', 'The downstream system returned an error', 502, [`${code}: ${message}`], 'downstream');
}

/** Downstream response → client response. Throws `BridgeError` for faults and mapping problems. */
export function transformResponse(integration: Integration, status: number, downstreamBody: string): ResponseTransform {
  const rules = integration.response.mappings;

  if (integration.direction === 'rest-to-soap') {
    const target = soapTarget(integration);
    let soap: ParsedSoap;
    try {
      soap = parseSoap(downstreamBody);
    } catch {
      throw new BridgeError('MAPPING_FAILED', 'Downstream response is not a SOAP envelope', 502, [], 'downstream');
    }
    if (soap.fault) throw downstreamError(integration, soap.fault.errorCode, soap.fault.errorMessage);
    if (soap.operation !== target.responseElement) {
      throw new BridgeError('MAPPING_FAILED', 'Downstream response did not match the mapping', 502, [`expected ${target.responseElement}, got ${soap.operation}`], 'downstream');
    }
    const { output, errors } = applyMappings(soap.content, rules);
    failIf(errors, 'MAPPING_FAILED', 'Downstream response did not match the mapping', 502, 'downstream');
    return { body: JSON.stringify(output), contentType: JSON_TYPE, sensitive: collectSensitive(soap.content, rules) };
  }

  let json: unknown;
  try {
    json = JSON.parse(downstreamBody);
  } catch {
    throw new BridgeError('MAPPING_FAILED', 'Downstream response is not JSON', 502, [], 'downstream');
  }
  if (status >= 400) {
    const error = isRecord(json) && isRecord(json['error']) ? json['error'] : {};
    const code = typeof error['code'] === 'string' ? error['code'] : `HTTP_${status}`;
    const message = typeof error['message'] === 'string' ? error['message'] : 'The downstream system returned an error';
    throw downstreamError(integration, code, message);
  }
  const { output, errors } = applyMappings(json, rules, { prefix: 'ns:' });
  failIf(errors, 'MAPPING_FAILED', 'Downstream response did not match the mapping', 502, 'downstream');
  const namespace = integration.route.soapNamespace ?? '';
  const element = integration.route.responseElement ?? `${integration.route.soapOperation ?? 'Operation'}Response`;
  return { body: buildSoapEnvelope({ namespace, element, body: output }), contentType: XML_TYPE, sensitive: collectSensitive(json, rules) };
}

/** Renders an error in the client's own format: SOAP fault for SOAP clients, JSON error model otherwise. */
export function renderError(format: 'soap' | 'json', error: BridgeError, requestId: string): RenderedError {
  if (format === 'soap') {
    const status = error.status === 401 ? 401 : error.status < 500 ? 400 : 500;
    const body = buildSoapFault({
      side: error.status < 500 ? 'Client' : 'Server',
      message: error.message,
      detail: { ErrorCode: error.code, ErrorMessage: [error.message, ...error.details].join('; '), RequestId: requestId },
    });
    return { status, contentType: XML_TYPE, body };
  }
  const payload: Record<string, unknown> = { code: error.code, message: error.message, requestId };
  if (error.details.length > 0) payload['details'] = error.details;
  return { status: error.status, contentType: JSON_TYPE, body: JSON.stringify({ error: payload }) };
}

export function errorFormat(integration: Integration | undefined, path: string): 'soap' | 'json' {
  if (integration) return integration.direction === 'soap-to-rest' ? 'soap' : 'json';
  return path.startsWith('/soap/') ? 'soap' : 'json';
}

export interface PreviewResult {
  output: string;
  contentType: string;
  headers: Record<string, string>;
  status: number;
  errors: string[];
}

function pretty(body: string, contentType: string): string {
  return contentType === JSON_TYPE ? JSON.stringify(JSON.parse(body), null, 2) : body;
}

/** Runs one transformation stage on a dummy payload. Never calls a downstream system. */
export function previewTransform(integration: Integration, stage: 'request' | 'response', payload: string): PreviewResult {
  try {
    if (stage === 'request') {
      const result = transformRequest(integration, payload, {
        usernameToken: { username: '[masked]', password: '[masked]' },
        bearerToken: '[masked]',
      });
      return { output: pretty(result.body, result.contentType), contentType: result.contentType, headers: result.headers, status: 200, errors: [] };
    }
    const result = transformResponse(integration, 200, payload);
    return { output: pretty(result.body, result.contentType), contentType: result.contentType, headers: {}, status: 200, errors: [] };
  } catch (error) {
    if (!isBridgeError(error)) throw error;
    const rendered = renderError(errorFormat(integration, integration.route.path), error, 'preview');
    return {
      output: pretty(rendered.body, rendered.contentType),
      contentType: rendered.contentType,
      headers: {},
      status: rendered.status,
      errors: [`${error.code}: ${error.message}`, ...error.details],
    };
  }
}
