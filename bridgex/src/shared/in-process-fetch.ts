import type { FetchLike } from '../gateway/http-client';
import { lowerCaseHeaders, type Handler } from './http';

/** A `fetch` that calls a handler in the same process. Honours AbortSignal, so timeouts behave as over a network. */
export function inProcessFetch(handler: Handler): FetchLike {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
      if (init.signal.aborted) return abort();
      init.signal.addEventListener('abort', abort, { once: true });
      const target = new URL(url);
      handler({
        method: init.method,
        path: target.pathname,
        headers: lowerCaseHeaders(init.headers),
        query: Object.fromEntries(target.searchParams),
        body: init.body ?? '',
      })
        .then((response) => resolve({ status: response.status, text: async () => response.body }), reject)
        .finally(() => init.signal.removeEventListener('abort', abort));
    });
}
