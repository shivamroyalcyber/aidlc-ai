import type { Direction } from '../config/types';
import type { AttemptKind } from './retry';

export type Outcome = 'success' | 'replayed' | 'client_error' | 'downstream_fault' | 'downstream_error' | 'gateway_error';

export interface AttemptRecord {
  attempt: number;
  kind: AttemptKind;
  status?: number;
  latencyMs: number;
}

export interface RequestStages {
  clientRequest: string;
  downstreamRequest?: string;
  downstreamResponse?: string;
  clientResponse: string;
}

export interface RequestSummary {
  id: string;
  timestamp: string;
  integrationId?: string;
  integrationName?: string;
  direction?: Direction;
  method: string;
  path: string;
  status: number;
  outcome: Outcome;
  errorCode?: string;
  latencyMs: number;
  downstreamLatencyMs: number;
  attempts: AttemptRecord[];
  retried: boolean;
  recovered: boolean;
  idempotencyKey?: string;
}

/** Stored record of one request. Every stage text is masked and truncated before it gets here. */
export interface RequestRecord extends RequestSummary {
  stages: RequestStages;
  contentTypes: { client: string; downstream?: string };
}

export interface RequestLogStore {
  put(record: RequestRecord): Promise<void>;
  get(id: string): Promise<RequestRecord | undefined>;
  recent(limit: number): Promise<RequestSummary[]>;
}

export interface StoredResponse {
  status: number;
  body: string;
  contentType: string;
}

export type BeginResult = { state: 'new' } | ({ state: 'replay' } & StoredResponse) | { state: 'conflict'; reason: 'in-progress' | 'different-body' };

export interface IdempotencyStore {
  begin(scope: string, key: string, bodyHash: string, now: Date): Promise<BeginResult>;
  complete(scope: string, key: string, response: StoredResponse): Promise<void>;
  release(scope: string, key: string): Promise<void>;
}

export const SUMMARY_FIELDS = [
  'id', 'timestamp', 'integrationId', 'integrationName', 'direction', 'method', 'path', 'status', 'outcome',
  'errorCode', 'latencyMs', 'downstreamLatencyMs', 'attempts', 'retried', 'recovered', 'idempotencyKey',
] as const;

export function toSummary(record: RequestRecord): RequestSummary {
  const { stages: _stages, contentTypes: _types, ...summary } = record;
  return summary;
}

export const IN_PROGRESS_LOCK_MS = 60_000;

export class InMemoryRequestLog implements RequestLogStore {
  private readonly records = new Map<string, RequestRecord>();

  async put(record: RequestRecord): Promise<void> {
    this.records.set(record.id, record);
    if (this.records.size > 2000) {
      const oldest = [...this.records.keys()].sort()[0];
      if (oldest) this.records.delete(oldest);
    }
  }

  async get(id: string): Promise<RequestRecord | undefined> {
    return this.records.get(id);
  }

  async recent(limit: number): Promise<RequestSummary[]> {
    return [...this.records.values()]
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, limit)
      .map(toSummary);
  }
}

interface MemoryIdempotency {
  state: 'in-progress' | 'completed';
  bodyHash: string;
  lockedUntil: number;
  response?: StoredResponse;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly items = new Map<string, MemoryIdempotency>();

  async begin(scope: string, key: string, bodyHash: string, now: Date): Promise<BeginResult> {
    const id = `${scope}#${key}`;
    const existing = this.items.get(id);
    if (existing) {
      if (existing.bodyHash !== bodyHash) return { state: 'conflict', reason: 'different-body' };
      if (existing.state === 'completed' && existing.response) return { state: 'replay', ...existing.response };
      if (existing.lockedUntil > now.getTime()) return { state: 'conflict', reason: 'in-progress' };
    }
    this.items.set(id, { state: 'in-progress', bodyHash, lockedUntil: now.getTime() + IN_PROGRESS_LOCK_MS });
    return { state: 'new' };
  }

  async complete(scope: string, key: string, response: StoredResponse): Promise<void> {
    const item = this.items.get(`${scope}#${key}`);
    if (item) Object.assign(item, { state: 'completed', response });
  }

  async release(scope: string, key: string): Promise<void> {
    this.items.delete(`${scope}#${key}`);
  }
}
