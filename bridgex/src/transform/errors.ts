/** Where an error came from. Drives the `outcome` in request records and retry decisions. */
export type ErrorSource = 'client' | 'downstream' | 'gateway';

/** The single error type carried through the pipeline. `message` and `details` are safe to show to clients. */
export class BridgeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: string[];
  readonly source: ErrorSource;

  constructor(code: string, message: string, status: number, details: string[] = [], source: ErrorSource = 'client') {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.source = source;
  }
}

export function isBridgeError(value: unknown): value is BridgeError {
  return value instanceof BridgeError;
}
