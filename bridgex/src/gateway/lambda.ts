import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { INTEGRATION_DOCUMENTS } from '../config/integrations';
import { createRegistry } from '../config/registry';
import { fromApiGatewayEvent, toApiGatewayResult } from '../shared/apigw';
import { DynamoChaosStore } from '../shared/dynamo-chaos';
import { bedrockInvoker, suggestMappings } from './ai-mapping';
import { createGatewayApp } from './app';
import { DynamoIdempotencyStore, DynamoRequestLog } from './dynamo-store';
import { cached, coreBankingCredentials, secretString } from './secrets';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const tableName = required('TABLE_NAME');
const modelId = required('BEDROCK_MODEL_ID');

// Clients are created once per container and reused (NFR-02).
const secrets = new SecretsManagerClient({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const bedrock = new BedrockRuntimeClient({});
const coreBanking = coreBankingCredentials(secretString(secrets, required('CORE_BANKING_SECRET_ARN')));
const fintechToken = secretString(secrets, required('FINTECH_SECRET_ARN'));
const invoke = bedrockInvoker(bedrock, modelId);

const app = createGatewayApp({
  registry: createRegistry(INTEGRATION_DOCUMENTS, process.env),
  apiKey: cached(secretString(secrets, required('API_KEY_SECRET_ARN')), FIVE_MINUTES),
  downstreamCredentials: cached(async () => ({ coreBanking: await coreBanking(), fintechToken: await fintechToken() }), FIVE_MINUTES),
  log: new DynamoRequestLog(doc, tableName),
  idempotency: new DynamoIdempotencyStore(doc, tableName),
  chaos: new DynamoChaosStore(doc, tableName),
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  random: Math.random,
  // Raw stdout keeps each line pure JSON, which CloudWatch needs to read Embedded Metric Format.
  emit: (line) => process.stdout.write(`${line}\n`),
  suggestMappings: (input) => suggestMappings(input, invoke, modelId),
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> =>
  toApiGatewayResult(await app(fromApiGatewayEvent(event)));
