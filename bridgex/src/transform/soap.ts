import { BridgeError } from './errors';
import { buildXml, isRecord, parseXml, textOf } from './xml';

export const SOAP_ENV_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
export const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
export const BRIDGEX_NS = 'urn:bridgex:faults';

export interface UsernameToken {
  username: string;
  password: string;
}

export interface SoapFaultInfo {
  faultcode: string;
  faultstring: string;
  errorCode: string;
  errorMessage: string;
}

export interface ParsedSoap {
  header: Record<string, unknown>;
  operation: string;
  content: Record<string, unknown>;
  fault?: SoapFaultInfo;
}

/** Builds a SOAP 1.1 envelope. `body` keys must already carry the `ns:` prefix. */
export function buildSoapEnvelope(opts: {
  namespace: string;
  element: string;
  body: Record<string, unknown>;
  usernameToken?: UsernameToken;
}): string {
  const header = opts.usernameToken
    ? {
        'wsse:Security': {
          '@_xmlns:wsse': WSSE_NS,
          'wsse:UsernameToken': {
            'wsse:Username': opts.usernameToken.username,
            'wsse:Password': opts.usernameToken.password,
          },
        },
      }
    : '';
  return buildXml({
    'soapenv:Envelope': {
      '@_xmlns:soapenv': SOAP_ENV_NS,
      '@_xmlns:ns': opts.namespace,
      'soapenv:Header': header,
      'soapenv:Body': { [`ns:${opts.element}`]: opts.body },
    },
  });
}

export function buildSoapFault(opts: {
  side: 'Client' | 'Server';
  message: string;
  namespace?: string;
  detailElement?: string;
  detail: Record<string, string>;
}): string {
  const detail: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.detail)) {
    detail[`ns:${key}`] = value;
  }
  return buildXml({
    'soapenv:Envelope': {
      '@_xmlns:soapenv': SOAP_ENV_NS,
      '@_xmlns:ns': opts.namespace ?? BRIDGEX_NS,
      'soapenv:Body': {
        'soapenv:Fault': {
          faultcode: `soapenv:${opts.side}`,
          faultstring: opts.message,
          detail: { [`ns:${opts.detailElement ?? 'BridgeXFault'}`]: detail },
        },
      },
    },
  });
}

/** Reads a SOAP 1.1 envelope whatever prefixes the sender used. */
export function parseSoap(text: string): ParsedSoap {
  const doc = parseXml(text);
  const envelope = doc['Envelope'];
  if (!isRecord(envelope)) {
    throw new BridgeError('INVALID_PAYLOAD', 'Body is not a SOAP envelope', 400);
  }
  const body = envelope['Body'];
  if (!isRecord(body)) {
    throw new BridgeError('INVALID_PAYLOAD', 'SOAP envelope has no Body', 400);
  }
  const header = isRecord(envelope['Header']) ? envelope['Header'] : {};
  const operation = Object.keys(body).find((key) => !key.startsWith('@_') && key !== '#text');
  if (!operation) {
    throw new BridgeError('INVALID_PAYLOAD', 'SOAP Body is empty', 400);
  }
  const raw = body[operation];
  const content = isRecord(raw) ? raw : {};
  if (operation === 'Fault') {
    const faultcode = String(textOf(content['faultcode']) ?? '');
    const faultstring = String(textOf(content['faultstring']) ?? '');
    const errorCode = findText(content['detail'], 'ErrorCode') ?? (faultcode.split(':').pop() || 'UNKNOWN');
    const errorMessage = findText(content['detail'], 'ErrorMessage') ?? faultstring;
    return { header, operation, content, fault: { faultcode, faultstring, errorCode, errorMessage } };
  }
  return { header, operation, content };
}

/** Depth-first search for the first element named `key` with a text value. */
function findText(node: unknown, key: string): string | undefined {
  if (!isRecord(node)) return undefined;
  for (const [k, v] of Object.entries(node)) {
    if (k === key) {
      const t = textOf(v);
      if (typeof t === 'string' && t !== '') return t;
    }
  }
  for (const v of Object.values(node)) {
    const found = findText(v, key);
    if (found) return found;
  }
  return undefined;
}

/** Reads the UsernameToken from a parsed SOAP header, if present. */
export function readUsernameToken(header: Record<string, unknown>): UsernameToken | undefined {
  const security = header['Security'];
  if (!isRecord(security)) return undefined;
  const token = security['UsernameToken'];
  if (!isRecord(token)) return undefined;
  const username = textOf(token['Username']);
  const password = textOf(token['Password']);
  if (typeof username !== 'string' || typeof password !== 'string') return undefined;
  return { username, password };
}
