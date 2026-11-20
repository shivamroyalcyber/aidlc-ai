import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { lowerCaseHeaders, type HttpRequest, type HttpResponse } from './http';

export function fromApiGatewayEvent(event: APIGatewayProxyEventV2): HttpRequest {
  const raw = event.body ?? '';
  return {
    method: event.requestContext.http.method.toUpperCase(),
    path: event.rawPath,
    headers: lowerCaseHeaders(event.headers),
    query: Object.fromEntries(Object.entries(event.queryStringParameters ?? {}).filter((e): e is [string, string] => e[1] !== undefined)),
    body: event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw,
  };
}

export function toApiGatewayResult(response: HttpResponse): APIGatewayProxyStructuredResultV2 {
  return { statusCode: response.status, headers: response.headers, body: response.body };
}
