import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { cached, coreBankingCredentials, secretString } from '../gateway/secrets';
import { fromApiGatewayEvent, toApiGatewayResult } from '../shared/apigw';
import { DynamoChaosStore } from '../shared/dynamo-chaos';
import { createSimulatorsApp } from './app';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const secrets = new SecretsManagerClient({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FIVE_MINUTES = 5 * 60 * 1000;

const app = createSimulatorsApp({
  coreBankingCredentials: cached(coreBankingCredentials(secretString(secrets, required('CORE_BANKING_SECRET_ARN'))), FIVE_MINUTES),
  fintechToken: cached(secretString(secrets, required('FINTECH_SECRET_ARN')), FIVE_MINUTES),
  chaos: new DynamoChaosStore(doc, required('TABLE_NAME')),
  now: () => new Date(),
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (message) => console.log(JSON.stringify({ level: 'warn', message })),
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> =>
  toApiGatewayResult(await app(fromApiGatewayEvent(event)));
