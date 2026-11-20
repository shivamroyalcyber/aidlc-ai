import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import { BridgeError } from './errors';

export const MAX_PAYLOAD_BYTES = 64 * 1024;

// Element values stay strings; the mapping layer converts types explicitly.
// SECURITY: `processEntities: true` decodes the five predefined entities (&amp; &lt; ...) so values are readable.
// It would also expand entities declared in a DOCTYPE, which is why parseXml() rejects <!DOCTYPE and <!ENTITY
// before parsing. That check is load-bearing: never remove it while this flag is on (review finding W1).
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true,
  processEntities: true,
});

export function assertPayloadSize(text: string): void {
  if (Buffer.byteLength(text, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new BridgeError('PAYLOAD_TOO_LARGE', 'Payload exceeds 64 KB', 413);
  }
}

/**
 * Parses untrusted XML. DOCTYPE and ENTITY declarations are refused before parsing:
 * fast-xml-parser would otherwise expand internal entities (checked in a probe on 2026-11-20).
 */
export function parseXml(text: string): Record<string, unknown> {
  assertPayloadSize(text);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new BridgeError('INVALID_PAYLOAD', 'XML document type and entity declarations are not allowed', 400);
  }
  if (!text.trim().startsWith('<')) {
    throw new BridgeError('INVALID_PAYLOAD', 'Body is not XML', 400);
  }
  const check = XMLValidator.validate(text);
  if (check !== true) {
    throw new BridgeError('INVALID_PAYLOAD', 'Body is not well-formed XML', 400, [`line ${check.err.line}: ${check.err.msg}`]);
  }
  const doc: unknown = parser.parse(text);
  if (!isRecord(doc)) {
    throw new BridgeError('INVALID_PAYLOAD', 'Body is not XML', 400);
  }
  return doc;
}

/** Builds XML with a UTF-8 declaration. Text and attribute values are escaped by the builder. */
export function buildXml(doc: Record<string, unknown>): string {
  const xml: string = builder.build({ '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' }, ...doc });
  return xml.trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the text of an XML node: the `#text` of an element with attributes, or the value itself. */
export function textOf(value: unknown): unknown {
  if (isRecord(value)) {
    return '#text' in value ? value['#text'] : value;
  }
  return value;
}
