import { ConverseCommand, type BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DATE_FORMATS, VALUE_TYPES, type DateFormat, type MappingRule, type ValueType } from '../config/types';
import { parseJsonBody } from '../transform/engine';
import { BridgeError, isBridgeError } from '../transform/errors';
import { leafPaths } from '../transform/paths';
import { parseSoap } from '../transform/soap';
import { isRecord, parseXml } from '../transform/xml';

export const SAMPLE_LIMIT = 16 * 1024;

export interface SampleInput {
  format: 'json' | 'xml';
  sample: string;
}

export interface SuggestionRequest {
  source: SampleInput;
  target: SampleInput;
}

export interface Suggestion {
  from: string;
  to: string;
  type?: ValueType;
  sourceFormat?: DateFormat;
  targetFormat?: DateFormat;
  lookup?: Record<string, string>;
  confidence: number;
  reason: string;
  valid: boolean;
  problem?: string;
}

export interface SuggestionResult {
  model: string;
  suggestions: Suggestion[];
  draft: MappingRule[];
  unmappedTargets: string[];
  sourcePaths: string[];
  targetPaths: string[];
}

export interface ToolCall {
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
}

/** Calls a model with a forced tool and returns the tool input. */
export type ModelInvoker = (call: ToolCall) => Promise<unknown>;

const TOOL_NAME = 'propose_mappings';

export const TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path, exactly as listed' },
          to: { type: 'string', description: 'Target path, exactly as listed' },
          type: { type: 'string', enum: [...VALUE_TYPES] },
          sourceFormat: { type: 'string', enum: [...DATE_FORMATS] },
          targetFormat: { type: 'string', enum: [...DATE_FORMATS] },
          lookup: { type: 'object', additionalProperties: { type: 'string' } },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
        },
        required: ['from', 'to', 'confidence', 'reason'],
      },
    },
  },
  required: ['mappings'],
};

const SYSTEM_PROMPT = [
  'You are an integration engineer at a bank. You map fields between two payloads for the BridgeX gateway, which converts SOAP/XML and REST/JSON.',
  'Rules:',
  '- Use only paths from the two path lists, exactly as written.',
  '- A path containing [] is inside a repeating element. Map it only to a path containing [] on the other side.',
  '- Set type to number or integer when the target sample holds a number, boolean for flags, and date when the two sides use different date formats.',
  '- For dates set sourceFormat and targetFormat: iso (YYYY-MM-DD), yyyyMMdd, or ddMMyyyy.',
  '- Use lookup when one side holds codes and the other holds words, for example {"CR":"credit","DR":"debit"}. Infer pairs from the samples and common banking conventions.',
  '- confidence is between 0 and 1. reason is at most 15 words.',
  '- Leave out target fields you cannot match. Never invent paths.',
  `Answer only by calling the ${TOOL_NAME} tool.`,
].join('\n');

/** Parses a sample into a plain document. SOAP envelopes are unwrapped to the first Body element, as in integration documents. */
export function parseSample(input: SampleInput | undefined, side: string): unknown {
  if (!input || (input.format !== 'json' && input.format !== 'xml') || typeof input.sample !== 'string') {
    throw new BridgeError('INVALID_PAYLOAD', `${side} needs a format (json or xml) and a sample`, 400);
  }
  if (input.sample.length > SAMPLE_LIMIT) throw new BridgeError('PAYLOAD_TOO_LARGE', `${side} sample exceeds 16 KB`, 413);
  try {
    if (input.format === 'json') return parseJsonBody(input.sample);
    try {
      return parseSoap(input.sample).content;
    } catch {
      const doc = parseXml(input.sample);
      const roots = Object.keys(doc);
      const only = roots.length === 1 && roots[0] ? doc[roots[0]] : undefined;
      return isRecord(only) ? only : doc;
    }
  } catch (error) {
    if (isBridgeError(error)) throw new BridgeError(error.code, `${side} sample: ${error.message}`, error.status, error.details);
    throw error;
  }
}

function checkSuggestion(raw: unknown, sourcePaths: Set<string>, targetPaths: Set<string>): Suggestion | undefined {
  if (!isRecord(raw) || typeof raw['from'] !== 'string' || typeof raw['to'] !== 'string') return undefined;
  const confidence = typeof raw['confidence'] === 'number' ? Math.min(1, Math.max(0, raw['confidence'])) : 0;
  const suggestion: Suggestion = {
    from: raw['from'],
    to: raw['to'],
    confidence,
    reason: typeof raw['reason'] === 'string' ? raw['reason'].slice(0, 200) : '',
    valid: true,
  };
  const type = raw['type'];
  if (typeof type === 'string' && (VALUE_TYPES as readonly string[]).includes(type)) suggestion.type = type as ValueType;
  for (const key of ['sourceFormat', 'targetFormat'] as const) {
    const value = raw[key];
    if (typeof value === 'string' && (DATE_FORMATS as readonly string[]).includes(value)) suggestion[key] = value as DateFormat;
  }
  const lookup = raw['lookup'];
  if (isRecord(lookup) && Object.keys(lookup).length > 0) {
    suggestion.lookup = Object.fromEntries(Object.entries(lookup).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }

  const problems: string[] = [];
  if (!sourcePaths.has(suggestion.from)) problems.push(`source path ${suggestion.from} is not in the sample`);
  if (!targetPaths.has(suggestion.to)) problems.push(`target path ${suggestion.to} is not in the sample`);
  if (suggestion.from.includes('[]') !== suggestion.to.includes('[]')) problems.push('repeating and non-repeating paths cannot be mapped to each other');
  if ((suggestion.from.match(/\[\]/g)?.length ?? 0) > 1 || (suggestion.to.match(/\[\]/g)?.length ?? 0) > 1) problems.push('nested repeating elements are not supported');
  if (problems.length > 0) {
    suggestion.valid = false;
    suggestion.problem = problems.join('; ');
  }
  return suggestion;
}

function ruleOf(s: Suggestion, from: string, to: string): MappingRule {
  return {
    from,
    to,
    ...(s.type ? { type: s.type } : {}),
    ...(s.sourceFormat ? { sourceFormat: s.sourceFormat } : {}),
    ...(s.targetFormat ? { targetFormat: s.targetFormat } : {}),
    ...(s.lookup ? { lookup: s.lookup } : {}),
  };
}

/** Turns valid flat suggestions into integration-document rules, grouping repeating elements into `items`. */
export function buildDraft(suggestions: Suggestion[]): MappingRule[] {
  const draft: MappingRule[] = [];
  const groups = new Map<string, MappingRule>();
  for (const s of suggestions.filter((x) => x.valid)) {
    if (!s.from.includes('[]')) {
      draft.push(ruleOf(s, s.from, s.to));
      continue;
    }
    const [fromArray = '', fromLeaf = ''] = s.from.split('[]');
    const [toArray = '', toLeaf = ''] = s.to.split('[]');
    if (fromLeaf === '' && toLeaf === '') {
      draft.push({ ...ruleOf(s, fromArray, toArray), array: true });
      continue;
    }
    const key = `${fromArray}→${toArray}`;
    let group = groups.get(key);
    if (!group) {
      group = { from: fromArray, to: toArray, items: [] };
      groups.set(key, group);
      draft.push(group);
    }
    group.items?.push(ruleOf(s, fromLeaf.replace(/^\./, ''), toLeaf.replace(/^\./, '')));
  }
  return draft;
}

/** Suggests mapping rules with a model, then checks them against the samples (FR-18, ADR-008). Never applies anything. */
export async function suggestMappings(input: SuggestionRequest, invoke: ModelInvoker, modelId: string): Promise<SuggestionResult> {
  const sourceDoc = parseSample(input?.source, 'source');
  const targetDoc = parseSample(input?.target, 'target');
  const sourcePaths = leafPaths(sourceDoc);
  const targetPaths = leafPaths(targetDoc);

  const prompt = [
    `Source (${input.source.format}) leaf paths:`,
    ...sourcePaths.map((p) => `- ${p}`),
    '',
    'Source sample:',
    input.source.sample,
    '',
    `Target (${input.target.format}) leaf paths:`,
    ...targetPaths.map((p) => `- ${p}`),
    '',
    'Target sample:',
    input.target.sample,
  ].join('\n');

  let output: unknown;
  try {
    output = await invoke({ system: SYSTEM_PROMPT, prompt, toolName: TOOL_NAME, toolDescription: 'Propose field mappings from source paths to target paths.', schema: TOOL_SCHEMA });
  } catch {
    throw new BridgeError('AI_UNAVAILABLE', 'The mapping model could not be reached', 502, [], 'downstream');
  }
  const raw = isRecord(output) ? output['mappings'] : undefined;
  if (!Array.isArray(raw)) throw new BridgeError('AI_UNAVAILABLE', 'The mapping model returned no suggestions', 502, [], 'downstream');

  const sourceSet = new Set(sourcePaths);
  const targetSet = new Set(targetPaths);
  const suggestions = raw.map((item) => checkSuggestion(item, sourceSet, targetSet)).filter((s): s is Suggestion => s !== undefined);
  const mappedTargets = new Set(suggestions.filter((s) => s.valid).map((s) => s.to));
  return {
    model: modelId,
    suggestions,
    draft: buildDraft(suggestions),
    unmappedTargets: targetPaths.filter((p) => !mappedTargets.has(p)),
    sourcePaths,
    targetPaths,
  };
}

/** Bedrock Converse with a forced tool call, temperature 0. */
export function bedrockInvoker(client: BedrockRuntimeClient, modelId: string): ModelInvoker {
  return async (call) => {
    const result = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: call.system }],
        messages: [{ role: 'user', content: [{ text: call.prompt }] }],
        inferenceConfig: { maxTokens: 2000, temperature: 0 },
        toolConfig: {
          tools: [{ toolSpec: { name: call.toolName, description: call.toolDescription, inputSchema: { json: call.schema as never } } }],
          toolChoice: { tool: { name: call.toolName } },
        },
      }),
    );
    return result.output?.message?.content?.find((block) => block.toolUse)?.toolUse?.input;
  };
}
