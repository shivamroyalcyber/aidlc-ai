/** Transport-neutral request and response, shared by the Lambda adapters, the local server and tests. */
export interface HttpRequest {
  method: string;
  path: string;
  /** Lower-case header names. */
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type Handler = (request: HttpRequest) => Promise<HttpResponse>;

export function jsonResponse(status: number, value: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) };
}

export function textResponse(status: number, body: string, contentType: string, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers: { 'content-type': contentType, ...headers }, body };
}

export function header(request: HttpRequest, name: string): string | undefined {
  return request.headers[name.toLowerCase()];
}

export function lowerCaseHeaders(input: Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value !== undefined) out[key.toLowerCase()] = value;
  }
  return out;
}
