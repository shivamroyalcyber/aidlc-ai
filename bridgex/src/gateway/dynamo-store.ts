import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  IN_PROGRESS_LOCK_MS,
  SUMMARY_FIELDS,
  type BeginResult,
  type IdempotencyStore,
  type RequestLogStore,
  type RequestRecord,
  type RequestSummary,
  type StoredResponse,
} from './store';

const DAY_SECONDS = 24 * 60 * 60;
const LOG_TTL_SECONDS = 7 * DAY_SECONDS;

/** Request records in the single table: pk = REQ, sk = time-ordered id (ADR-005). */
export class DynamoRequestLog implements RequestLogStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(record: RequestRecord): Promise<void> {
    const ttl = Math.floor(Date.parse(record.timestamp) / 1000) + LOG_TTL_SECONDS;
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: { pk: 'REQ', sk: record.id, ttl, ...record } }));
  }

  async get(id: string): Promise<RequestRecord | undefined> {
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: 'REQ', sk: id } }));
    if (!result.Item) return undefined;
    const { pk: _pk, sk: _sk, ttl: _ttl, ...record } = result.Item;
    return record as RequestRecord;
  }

  async recent(limit: number): Promise<RequestSummary[]> {
    // Several summary fields are DynamoDB reserved words, so every name goes through a placeholder.
    const names = Object.fromEntries(SUMMARY_FIELDS.map((field, i) => [`#f${i}`, field]));
    const out: RequestSummary[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': 'REQ' },
          ExpressionAttributeNames: names,
          ProjectionExpression: Object.keys(names).join(', '),
          ScanIndexForward: false,
          Limit: limit - out.length,
          ExclusiveStartKey: startKey,
        }),
      );
      out.push(...((page.Items ?? []) as RequestSummary[]));
      startKey = page.LastEvaluatedKey;
    } while (startKey && out.length < limit);
    return out;
  }
}

/** Idempotency records: pk = IDEM#<integration>#<key>, sk = IDEM, 24 h TTL, 60 s in-progress lock. */
export class DynamoIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private key(scope: string, key: string) {
    return { pk: `IDEM#${scope}#${key}`, sk: 'IDEM' };
  }

  async begin(scope: string, key: string, bodyHash: string, now: Date): Promise<BeginResult> {
    const nowMs = now.getTime();
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...this.key(scope, key),
            idemState: 'in-progress',
            bodyHash,
            lockedUntil: nowMs + IN_PROGRESS_LOCK_MS,
            ttl: Math.floor(nowMs / 1000) + DAY_SECONDS,
          },
          ConditionExpression: 'attribute_not_exists(pk) OR (idemState = :progress AND lockedUntil < :now AND bodyHash = :hash)',
          ExpressionAttributeValues: { ':progress': 'in-progress', ':now': nowMs, ':hash': bodyHash },
        }),
      );
      return { state: 'new' };
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
    }
    const existing = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: this.key(scope, key), ConsistentRead: true }));
    const item = existing.Item ?? {};
    if (item['bodyHash'] !== bodyHash) return { state: 'conflict', reason: 'different-body' };
    if (item['idemState'] === 'completed') {
      return { state: 'replay', status: Number(item['status']), body: String(item['body']), contentType: String(item['contentType']) };
    }
    return { state: 'conflict', reason: 'in-progress' };
  }

  async complete(scope: string, key: string, response: StoredResponse): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.key(scope, key),
        UpdateExpression: 'SET idemState = :done, #status = :status, #body = :body, contentType = :type',
        ExpressionAttributeNames: { '#status': 'status', '#body': 'body' },
        ExpressionAttributeValues: { ':done': 'completed', ':status': response.status, ':body': response.body, ':type': response.contentType },
      }),
    );
  }

  async release(scope: string, key: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: this.key(scope, key) }));
  }
}
