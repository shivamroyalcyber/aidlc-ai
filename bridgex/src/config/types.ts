export type Direction = 'rest-to-soap' | 'soap-to-rest';
export type ValueType = 'string' | 'number' | 'integer' | 'boolean' | 'date';
export type DateFormat = 'iso' | 'yyyyMMdd' | 'ddMMyyyy';

export const VALUE_TYPES: readonly ValueType[] = ['string', 'number', 'integer', 'boolean', 'date'];
export const DATE_FORMATS: readonly DateFormat[] = ['iso', 'yyyyMMdd', 'ddMMyyyy'];

export interface MappingRule {
  from: string;
  to: string;
  type?: ValueType;
  sourceFormat?: DateFormat;
  targetFormat?: DateFormat;
  lookup?: Record<string, string>;
  default?: unknown;
  required?: boolean;
  sensitive?: boolean;
  /** Map each element of a repeating structure with these rules. */
  items?: MappingRule[];
  /** Treat the value as repeating primitive values. */
  array?: boolean;
}

export interface FieldSchema {
  type?: ValueType;
  format?: DateFormat;
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: Array<string | number>;
}

export interface SoapTarget {
  type: 'soap';
  url: string;
  operation: string;
  namespace: string;
  soapAction: string;
  responseElement: string;
  auth?: 'ws-security' | 'none';
}

export interface RestTarget {
  type: 'rest';
  url: string;
  method: 'POST' | 'GET';
  auth?: 'bearer' | 'none';
}

export interface Route {
  method: 'POST';
  path: string;
  /** soap-to-rest only */
  soapOperation?: string;
  soapNamespace?: string;
  responseElement?: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  direction: Direction;
  route: Route;
  target: SoapTarget | RestTarget;
  idempotent: boolean;
  requireIdempotencyKey?: boolean;
  timeoutMs?: number;
  retry?: { maxAttempts: number; baseDelayMs: number };
  request: { schema?: Record<string, FieldSchema>; mappings: MappingRule[] };
  response: { mappings: MappingRule[] };
  faults?: Record<string, { status: number; code?: string }>;
  samples: { request: string; response: string };
}

export const DEFAULT_TIMEOUT_MS = 2500;
export const DEFAULT_RETRY = { maxAttempts: 3, baseDelayMs: 200 } as const;
