import { PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CHAOS_TARGETS, isChaosTarget, type ChaosMode, type ChaosSetting, type ChaosStore, type ChaosTarget } from './chaos';

/** Chaos settings in the BridgeX table: pk = CHAOS, sk = target. */
export class DynamoChaosStore implements ChaosStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async consume(target: ChaosTarget): Promise<ChaosMode | null> {
    try {
      const result = await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: 'CHAOS', sk: target },
          UpdateExpression: 'SET #remaining = #remaining - :one',
          ConditionExpression: '#remaining > :zero',
          ExpressionAttributeNames: { '#remaining': 'remaining' },
          ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
          ReturnValues: 'ALL_NEW',
        }),
      );
      const mode = result.Attributes?.['chaosMode'];
      return mode === 'error' || mode === 'timeout' ? mode : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return null;
      throw error;
    }
  }

  async set(target: ChaosTarget, mode: ChaosMode | 'off', count: number): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: 'CHAOS', sk: target, chaosMode: mode, remaining: mode === 'off' ? 0 : count, updatedAt: new Date().toISOString() },
      }),
    );
  }

  async list(): Promise<ChaosSetting[]> {
    const result = await this.doc.send(
      new QueryCommand({ TableName: this.tableName, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'CHAOS' } }),
    );
    const found = new Map<ChaosTarget, ChaosSetting>();
    for (const item of result.Items ?? []) {
      const target = item['sk'];
      const mode = item['chaosMode'];
      if (isChaosTarget(target) && (mode === 'error' || mode === 'timeout' || mode === 'off')) {
        found.set(target, { target, mode, remaining: Number(item['remaining'] ?? 0) });
      }
    }
    return CHAOS_TARGETS.map((target) => found.get(target) ?? { target, mode: 'off', remaining: 0 });
  }
}
