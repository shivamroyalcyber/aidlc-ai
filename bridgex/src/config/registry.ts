import { DATE_FORMATS, VALUE_TYPES, type Integration, type MappingRule } from './types';

export interface Registry {
  list(): Integration[];
  get(id: string): Integration | undefined;
  matchRest(method: string, path: string): Integration | undefined;
  matchSoap(path: string, operation: string): Integration | undefined;
  hasSoapPath(path: string): boolean;
  /** The document as written, with URL placeholders unresolved. Contains no secrets. */
  publicView(id: string): Integration | undefined;
}

const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g;

export function createRegistry(documents: unknown[], env: Record<string, string | undefined>): Registry {
  const originals: Integration[] = documents.map((doc) => {
    const problems = validateIntegration(doc);
    const id = typeof (doc as { id?: unknown })?.id === 'string' ? (doc as { id: string }).id : '(no id)';
    if (problems.length > 0) throw new Error(`Invalid integration ${id}: ${problems.join('; ')}`);
    return doc as Integration;
  });

  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();
  for (const integration of originals) {
    if (seenIds.has(integration.id)) throw new Error(`Duplicate integration id ${integration.id}`);
    seenIds.add(integration.id);
    const routeKey = `${integration.route.method} ${integration.route.path} ${integration.route.soapOperation ?? ''}`;
    if (seenRoutes.has(routeKey)) throw new Error(`Duplicate route ${routeKey}`);
    seenRoutes.add(routeKey);
  }

  const resolved = originals.map((integration) => ({
    ...integration,
    target: { ...integration.target, url: resolvePlaceholders(integration.target.url, env, integration.id) },
  }));

  return {
    list: () => resolved,
    get: (id) => resolved.find((i) => i.id === id),
    matchRest: (method, path) =>
      resolved.find((i) => i.direction === 'rest-to-soap' && i.route.method === method && i.route.path === path),
    matchSoap: (path, operation) =>
      resolved.find((i) => i.direction === 'soap-to-rest' && i.route.path === path && i.route.soapOperation === operation),
    hasSoapPath: (path) => resolved.some((i) => i.direction === 'soap-to-rest' && i.route.path === path),
    publicView: (id) => originals.find((i) => i.id === id),
  };
}

export function resolvePlaceholders(template: string, env: Record<string, string | undefined>, id: string): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Integration ${id} needs environment variable ${name}`);
    return value.replace(/\/+$/, '');
  });
}

/** Returns a list of problems; empty means the document is valid. */
export function validateIntegration(doc: unknown): string[] {
  const problems: string[] = [];
  const d = doc as Partial<Integration> | null;
  if (typeof d !== 'object' || d === null) return ['document is not an object'];
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  need(typeof d.id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id), 'id must be kebab-case');
  need(typeof d.name === 'string' && d.name.length > 0, 'name is required');
  need(d.direction === 'rest-to-soap' || d.direction === 'soap-to-rest', 'direction must be rest-to-soap or soap-to-rest');
  need(d.route?.method === 'POST', 'route.method must be POST');
  need(typeof d.route?.path === 'string' && /^\/(api|soap)\/[A-Za-z0-9/_-]+$/.test(d.route.path), 'route.path must start with /api/ or /soap/');
  need(typeof d.idempotent === 'boolean', 'idempotent must be true or false');
  need(typeof d.samples?.request === 'string' && typeof d.samples?.response === 'string', 'samples.request and samples.response are required');

  if (d.direction === 'rest-to-soap') {
    const t = d.target;
    need(t?.type === 'soap', 'rest-to-soap needs a soap target');
    if (t?.type === 'soap') {
      for (const key of ['url', 'operation', 'namespace', 'soapAction', 'responseElement'] as const) {
        need(typeof t[key] === 'string' && t[key].length > 0, `target.${key} is required`);
      }
    }
  }
  if (d.direction === 'soap-to-rest') {
    need(d.target?.type === 'rest', 'soap-to-rest needs a rest target');
    need(typeof d.target?.url === 'string', 'target.url is required');
    for (const key of ['soapOperation', 'soapNamespace', 'responseElement'] as const) {
      need(typeof d.route?.[key] === 'string', `route.${key} is required for soap-to-rest`);
    }
  }
  if (d.timeoutMs !== undefined) need(Number.isInteger(d.timeoutMs) && d.timeoutMs >= 100 && d.timeoutMs <= 10000, 'timeoutMs must be 100–10000');
  if (d.retry !== undefined) {
    need(Number.isInteger(d.retry.maxAttempts) && d.retry.maxAttempts >= 1 && d.retry.maxAttempts <= 5, 'retry.maxAttempts must be 1–5');
    need(Number.isInteger(d.retry.baseDelayMs) && d.retry.baseDelayMs >= 0, 'retry.baseDelayMs must be a positive integer');
  }
  if (d.idempotent === false && (d.retry?.maxAttempts ?? 1) > 1) problems.push('non-idempotent integrations must not retry');

  need(Array.isArray(d.request?.mappings), 'request.mappings must be an array');
  need(Array.isArray(d.response?.mappings), 'response.mappings must be an array');
  if (Array.isArray(d.request?.mappings)) problems.push(...validateRules(d.request.mappings, 'request'));
  if (Array.isArray(d.response?.mappings)) problems.push(...validateRules(d.response.mappings, 'response'));
  for (const [path, field] of Object.entries(d.request?.schema ?? {})) {
    if (field.type !== undefined) need(VALUE_TYPES.includes(field.type), `schema ${path}: unknown type ${field.type}`);
    if (field.pattern !== undefined) {
      try {
        new RegExp(field.pattern);
      } catch {
        problems.push(`schema ${path}: invalid pattern`);
      }
    }
  }
  return problems;
}

function validateRules(rules: MappingRule[], where: string): string[] {
  const problems: string[] = [];
  rules.forEach((rule, index) => {
    const at = `${where}.mappings[${index}]`;
    if (typeof rule.from !== 'string' || rule.from === '') problems.push(`${at}.from is required`);
    if (typeof rule.to !== 'string' || rule.to === '') problems.push(`${at}.to is required`);
    if (rule.type !== undefined && !VALUE_TYPES.includes(rule.type)) problems.push(`${at}: unknown type ${rule.type}`);
    for (const format of [rule.sourceFormat, rule.targetFormat]) {
      if (format !== undefined && !DATE_FORMATS.includes(format)) problems.push(`${at}: unknown date format ${format}`);
    }
    if (rule.items && rule.array) problems.push(`${at}: use items or array, not both`);
    if (rule.items) problems.push(...validateRules(rule.items, `${at}.items`));
  });
  return problems;
}
