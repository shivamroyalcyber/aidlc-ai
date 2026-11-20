export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

/** The subset of `fetch` the gateway uses, so tests and the local server can supply their own. */
export type FetchLike = (url: string, init: FetchInit) => Promise<{ status: number; text(): Promise<string> }>;

export type RawOutcome =
  | { kind: 'response'; status: number; body: string; latencyMs: number }
  | { kind: 'timeout'; latencyMs: number }
  | { kind: 'network'; latencyMs: number; errorName: string };

/** One downstream attempt with a hard timeout (NFR-03). Never throws. */
export async function callDownstream(
  fetchFn: FetchLike,
  url: string,
  init: Omit<FetchInit, 'signal'>,
  timeoutMs: number,
  clock: () => number = Date.now,
): Promise<RawOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = clock();
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    const body = await response.text();
    return { kind: 'response', status: response.status, body, latencyMs: clock() - started };
  } catch (error) {
    if (controller.signal.aborted) return { kind: 'timeout', latencyMs: clock() - started };
    return { kind: 'network', latencyMs: clock() - started, errorName: (error as Error).name ?? 'Error' };
  } finally {
    clearTimeout(timer);
  }
}
