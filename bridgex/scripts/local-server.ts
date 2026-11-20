/**
 * Plan B and development server (U3 Req 7, NFR-07): gateway, simulators and dashboard on one port,
 * in-memory stores, no AWS needed. Credentials are generated at start-up and never written anywhere.
 *
 *   npm run local            → http://localhost:3000
 *   BRIDGEX_LOCAL_BEDROCK=1  → also enable AI mapping through Bedrock with your AWS credentials
 */
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { INTEGRATION_DOCUMENTS } from '../src/config/integrations';
import { createRegistry } from '../src/config/registry';
import { bedrockInvoker, suggestMappings } from '../src/gateway/ai-mapping';
import { createGatewayApp } from '../src/gateway/app';
import { InMemoryIdempotencyStore, InMemoryRequestLog } from '../src/gateway/store';
import { InMemoryChaosStore } from '../src/shared/chaos';
import { lowerCaseHeaders, type HttpResponse } from '../src/shared/http';
import { createSimulatorsApp } from '../src/simulators/app';

const PORT = Number(process.env['PORT'] ?? 3000);
const BASE = `http://localhost:${PORT}`;
const DASHBOARD_DIR = join(import.meta.dirname, '..', 'dashboard');
const MODEL_ID = process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const token = () => randomBytes(18).toString('base64url');
const apiKey = process.env['BRIDGEX_API_KEY'] ?? token();
const coreBanking = { username: 'bridgex-svc', password: token() };
const fintechToken = token();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const chaos = new InMemoryChaosStore();

const simulators = createSimulatorsApp({
  coreBankingCredentials: async () => coreBanking,
  fintechToken: async () => fintechToken,
  chaos,
  now: () => new Date(),
  random: Math.random,
  sleep,
});

const invoke = process.env['BRIDGEX_LOCAL_BEDROCK'] === '1' ? bedrockInvoker(new BedrockRuntimeClient({ region: 'us-east-1' }), MODEL_ID) : undefined;

const gateway = createGatewayApp({
  registry: createRegistry(INTEGRATION_DOCUMENTS, { CORE_BANKING_URL: `${BASE}/sim/core-banking`, FINTECH_URL: `${BASE}/sim/fintech` }),
  apiKey: async () => apiKey,
  downstreamCredentials: async () => ({ coreBanking, fintechToken }),
  log: new InMemoryRequestLog(),
  idempotency: new InMemoryIdempotencyStore(),
  chaos,
  fetch: (url, init) => fetch(url, init),
  sleep,
  now: () => new Date(),
  random: Math.random,
  emit: (line) => {
    const entry = JSON.parse(line) as { requestId?: string; Integration?: string; status?: number; LatencyMs?: number; message?: string };
    console.log(`${entry.requestId ?? ''} ${entry.Integration ?? ''} ${entry.status ?? ''} ${entry.LatencyMs ?? ''}ms ${entry.message ?? ''}`.trim());
  },
  ...(invoke ? { suggestMappings: (input) => suggestMappings(input, invoke, MODEL_ID) } : {}),
});

const STATIC: Record<string, string> = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = {
    method: (req.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    headers: lowerCaseHeaders(req.headers as Record<string, string>),
    query: Object.fromEntries(url.searchParams),
    body: Buffer.concat(chunks).toString('utf8'),
  };

  let response: HttpResponse;
  const file = STATIC[url.pathname];
  if (request.method === 'GET' && file) {
    response = { status: 200, headers: { 'content-type': TYPES[extname(file)] ?? 'text/plain' }, body: await readFile(join(DASHBOARD_DIR, file), 'utf8') };
  } else if (request.method === 'GET' && url.pathname === '/config.json') {
    response = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiUrl: BASE, environment: 'local' }) };
  } else if (url.pathname.startsWith('/sim/')) {
    response = await simulators({ ...request, path: url.pathname.slice('/sim'.length) });
  } else {
    response = await gateway(request);
  }
  res.writeHead(response.status, response.headers).end(response.body);
}).listen(PORT, () => {
  console.log(`BridgeX local: ${BASE}`);
  console.log(`API key for this run: ${apiKey}`);
  console.log(`AI mapping: ${invoke ? `Bedrock ${MODEL_ID}` : 'off (set BRIDGEX_LOCAL_BEDROCK=1)'}`);
});
