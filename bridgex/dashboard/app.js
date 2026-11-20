// BridgeX dashboard (U5). Plain ES module, no build step (ADR-010).
// Every value from the API is inserted as text (textContent / text nodes), never as HTML.

const state = {
  apiUrl: '',
  apiKey: sessionStorage.getItem('bridgex.apiKey') ?? '',
  integrations: [],
  presets: [],
  pollTimer: undefined,
  selectedId: undefined,
};

const $ = (selector) => document.querySelector(selector);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function setStatus(target, message, kind = '') {
  const node = typeof target === 'string' ? $(target) : target;
  node.textContent = message;
  node.dataset.kind = kind;
}

function pretty(text) {
  if (text === undefined || text === null) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return String(text);
  }
}

const isXml = (text) => typeof text === 'string' && text.trim().startsWith('<');
const time = (iso) => new Date(iso).toLocaleTimeString();
const directionLabel = (d) => (d === 'soap-to-rest' ? 'SOAP → REST' : d === 'rest-to-soap' ? 'REST → SOAP' : '—');
const outcomeBadge = (outcome) => {
  const kind = outcome === 'success' || outcome === 'replayed' ? 'ok' : outcome === 'client_error' ? 'warn' : 'bad';
  return el('span', { class: `badge ${kind}` }, outcome.replace('_', ' '));
};
const statusBadge = (status) => el('span', { class: `badge ${status < 300 ? 'ok' : status < 500 ? 'warn' : 'bad'}` }, status);

// ---- API ---------------------------------------------------------------------------

async function api(path, { method = 'GET', body, contentType = 'application/json', headers = {}, raw = false } = {}) {
  const response = await fetch(`${state.apiUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers: { 'x-api-key': state.apiKey, ...(body !== undefined ? { 'content-type': contentType } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (response.status === 401 && path.startsWith('/admin/')) {
    setStatus('#connection-status', 'API key rejected', 'error');
    stopPolling();
    $('#api-key').focus();
    throw new Error('The API key was rejected');
  }
  if (raw) return response;
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw Object.assign(new Error(data?.error?.message ?? `HTTP ${response.status}`), { data, status: response.status });
  return data;
}

// ---- Tabs ----------------------------------------------------------------------------

const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  }
  if (tab.id === 'tab-overview') startPolling();
  else stopPolling();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
});

// ---- Overview ------------------------------------------------------------------------

function kpi(name, value, hint, kind = '') {
  return el('div', { class: `kpi ${kind}` }, el('div', { class: 'name' }, name), el('div', { class: 'value' }, value), hint ? el('div', { class: 'hint' }, hint) : null);
}

function renderStats(stats) {
  $('#kpis').replaceChildren(
    kpi('Requests', stats.total, `last ${stats.windowSize} recorded`),
    kpi('Success rate', `${stats.successRate}%`, `${stats.succeeded} succeeded`, stats.successRate >= 90 ? 'ok' : stats.total ? 'bad' : ''),
    kpi('Failures', stats.failed, `${stats.clientErrors} client · ${stats.downstreamErrors} downstream`, stats.failed ? 'bad' : ''),
    kpi('Avg latency', `${stats.avgLatencyMs} ms`, 'end to end'),
    kpi('p95 latency', `${stats.p95LatencyMs} ms`),
    kpi('Retried', stats.retried, 'requests with >1 attempt'),
    kpi('Recovered', stats.recovered, 'saved by a retry', stats.recovered ? 'ok' : ''),
  );

  const max = Math.max(1, ...stats.series.map((b) => b.succeeded + b.failed));
  $('#chart').replaceChildren(
    ...stats.series.map((b) =>
      el(
        'div',
        { class: 'bar', title: `${time(b.minute)}: ${b.succeeded} ok, ${b.failed} failed` },
        el('span', { class: 'ok', style: { height: `${(b.succeeded / max) * 140}px` } }),
        el('span', { class: 'bad', style: { height: `${(b.failed / max) * 140}px` } }),
      ),
    ),
  );

  $('#by-integration tbody').replaceChildren(
    ...(stats.byIntegration.length
      ? stats.byIntegration.map((i) => el('tr', {}, el('td', {}, i.integrationName), el('td', {}, i.total), el('td', {}, i.failed), el('td', {}, i.retried), el('td', {}, i.avgLatencyMs), el('td', {}, i.p95LatencyMs)))
      : [el('tr', {}, el('td', { colspan: 6, class: 'muted' }, 'No traffic yet. Try the Playground.'))]),
  );
}

function renderRequests(requests) {
  const rows = requests.map((r) => {
    const row = el(
      'tr',
      { tabindex: 0, class: r.id === state.selectedId ? 'selected' : '' },
      el('td', {}, time(r.timestamp)),
      el('td', {}, r.integrationName ?? r.path),
      el('td', {}, directionLabel(r.direction)),
      el('td', {}, statusBadge(r.status)),
      el('td', {}, outcomeBadge(r.outcome), r.errorCode ? el('span', { class: 'muted' }, ` ${r.errorCode}`) : null),
      el('td', {}, r.attempts.length),
      el('td', {}, `${r.latencyMs} ms`),
    );
    const open = () => showDetail(r.id);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
    return row;
  });
  $('#requests tbody').replaceChildren(...(rows.length ? rows : [el('tr', {}, el('td', { colspan: 7, class: 'muted' }, 'No requests yet.'))]));
}

async function refreshOverview() {
  try {
    const [stats, list] = await Promise.all([api('/admin/stats'), api('/admin/requests?limit=25')]);
    renderStats(stats);
    renderRequests(list.requests);
  } catch (error) {
    setStatus('#connection-status', error.message, 'error');
  }
}

function startPolling() {
  stopPolling();
  if (!state.apiKey || !state.integrations.length) return;
  refreshOverview();
  state.pollTimer = setInterval(() => document.visibilityState === 'visible' && refreshOverview(), 5000);
}

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = undefined;
}

// ---- Request detail (four stages) ----------------------------------------------------

function attemptChip(a) {
  const kind = a.kind === 'ok' ? 'ok' : a.kind === 'fault' ? 'warn' : 'bad';
  return el('span', { class: `badge ${kind}` }, `#${a.attempt} ${a.kind}${a.status ? ` ${a.status}` : ''} · ${a.latencyMs} ms`);
}

function flowView(record) {
  const clientFormat = record.direction === 'soap-to-rest' ? 'SOAP/XML' : 'JSON';
  const downstreamFormat = record.direction === 'soap-to-rest' ? 'JSON' : 'SOAP/XML';
  const target = record.direction === 'soap-to-rest' ? 'FinTech API' : 'Core Banking';
  const step = (n, title, who, text) =>
    el('div', { class: 'step' }, el('h3', {}, `${n}. ${title} `, el('span', { class: 'who' }, who)), el('pre', { class: 'code', tabindex: 0 }, text ? pretty(text) : '— not reached —'));

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'meta' },
      el('span', {}, el('b', {}, 'Integration '), record.integrationName ?? record.path),
      el('span', {}, el('b', {}, 'Direction '), directionLabel(record.direction)),
      el('span', {}, el('b', {}, 'Status '), statusBadge(record.status)),
      el('span', {}, el('b', {}, 'Outcome '), outcomeBadge(record.outcome)),
      record.errorCode ? el('span', {}, el('b', {}, 'Error '), record.errorCode) : null,
      el('span', {}, el('b', {}, 'Latency '), `${record.latencyMs} ms (downstream ${record.downstreamLatencyMs} ms)`),
      record.idempotencyKey ? el('span', {}, el('b', {}, 'Idempotency-Key '), record.idempotencyKey) : null,
    ),
    el('div', { class: 'attempts' }, record.attempts.length ? record.attempts.map(attemptChip) : el('span', { class: 'muted' }, 'No downstream call was made.')),
    el(
      'div',
      { class: 'flow' },
      step(1, 'Client request', clientFormat, record.stages.clientRequest),
      step(2, 'To downstream', `${downstreamFormat} → ${target}`, record.stages.downstreamRequest),
      step(3, 'Downstream response', downstreamFormat, record.stages.downstreamResponse),
      step(4, 'Client response', clientFormat, record.stages.clientResponse),
    ),
    el('p', { class: 'muted' }, 'Account numbers and customer IDs are masked (***101). Downstream credentials are replaced with ********.'),
  );
}

async function showDetail(id) {
  state.selectedId = id;
  const record = await api(`/admin/requests/${encodeURIComponent(id)}`);
  $('#detail-id').textContent = id;
  $('#detail').replaceChildren(flowView(record));
  $('#detail-card').hidden = false;
  $('#detail-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#detail-close').addEventListener('click', () => {
  $('#detail-card').hidden = true;
  state.selectedId = undefined;
});

// ---- Playground ----------------------------------------------------------------------

const EXTRA_PRESETS = [
  { integrationId: 'account-balance', label: 'Balance: unknown account (SOAP fault → 404)', body: '{\n  "accountId": "ACC999"\n}' },
  { integrationId: 'account-balance', label: 'Balance: invalid account id (validation → 400)', body: '{\n  "accountId": "savings-1"\n}' },
  { integrationId: 'fund-transfer', label: 'Transfer: insufficient funds (SOAP fault → 422)', body: '{\n  "fromAccountId": "ACC103",\n  "toAccountId": "ACC101",\n  "amount": 5000\n}' },
  { integrationId: 'fund-transfer', label: 'Transfer: frozen account (SOAP fault → 422)', body: '{\n  "fromAccountId": "ACC104",\n  "toAccountId": "ACC101",\n  "amount": 100\n}' },
  {
    integrationId: 'credit-score',
    label: 'Credit score: unknown customer (REST 404 → SOAP fault)',
    body: '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ln="http://legacybank.example.com/loans">\n  <soapenv:Body>\n    <ln:GetCreditScore>\n      <ln:CustomerId>CUST9999</ln:CustomerId>\n    </ln:GetCreditScore>\n  </soapenv:Body>\n</soapenv:Envelope>',
  },
];

const newKey = () => `demo-${crypto.randomUUID().slice(0, 13)}`;

function buildPresets() {
  const base = state.integrations.map((i) => ({ integrationId: i.id, label: `${i.name} (${directionLabel(i.direction)})`, body: i.samples.request }));
  state.presets = [...base, ...EXTRA_PRESETS.filter((p) => state.integrations.some((i) => i.id === p.integrationId))];
  $('#pg-scenario').replaceChildren(...state.presets.map((p, index) => el('option', { value: index }, p.label)));
  applyPreset();
}

function currentPreset() {
  const preset = state.presets[Number($('#pg-scenario').value)] ?? state.presets[0];
  return { preset, integration: state.integrations.find((i) => i.id === preset?.integrationId) };
}

function applyPreset() {
  const { preset, integration } = currentPreset();
  if (!preset || !integration) return;
  $('#pg-description').textContent = integration.description;
  $('#pg-path').textContent = integration.route.path;
  $('#pg-body').value = preset.body;
  $('#pg-format').textContent = integration.direction === 'soap-to-rest' ? 'SOAP/XML' : 'JSON';
  $('#pg-idem-row').hidden = !integration.requireIdempotencyKey;
  if (integration.requireIdempotencyKey && !$('#pg-idem').value) $('#pg-idem').value = newKey();
}

$('#pg-scenario').addEventListener('change', applyPreset);
$('#pg-idem-new').addEventListener('click', () => ($('#pg-idem').value = newKey()));

$('#pg-send').addEventListener('click', async () => {
  const { integration } = currentPreset();
  if (!integration) return;
  const button = $('#pg-send');
  button.disabled = true;
  setStatus('#pg-status', 'Sending…');
  try {
    const soap = integration.direction === 'soap-to-rest';
    const headers = integration.requireIdempotencyKey ? { 'idempotency-key': $('#pg-idem').value.trim() } : {};
    const response = await api(integration.route.path, { method: 'POST', body: $('#pg-body').value, contentType: soap ? 'text/xml; charset=utf-8' : 'application/json', headers, raw: true });
    const text = await response.text();
    const id = response.headers.get('x-bridgex-request-id');
    $('#pg-response-meta').replaceChildren(
      statusBadge(response.status),
      el('span', { class: 'badge' }, `attempts ${response.headers.get('x-bridgex-attempts') ?? '?'}`),
      el('span', { class: 'badge' }, `${response.headers.get('x-bridgex-latency-ms') ?? '?'} ms`),
      response.headers.get('x-idempotent-replay') ? el('span', { class: 'badge warn' }, 'idempotent replay') : null,
      id ? el('span', { class: 'badge' }, `id ${id}`) : null,
    );
    $('#pg-response').textContent = pretty(text);
    setStatus('#pg-status', `HTTP ${response.status}`, response.ok ? 'ok' : 'error');
    if (id) $('#pg-flow').replaceChildren(flowView(await api(`/admin/requests/${encodeURIComponent(id)}`)));
    refreshChaos();
  } catch (error) {
    setStatus('#pg-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

function describeChaos(list) {
  const active = list.filter((c) => c.mode !== 'off' && c.remaining > 0);
  if (!active.length) return 'All simulated systems healthy.';
  return active.map((c) => `${c.target}: next ${c.remaining} call(s) ${c.mode === 'timeout' ? 'time out' : 'fail with 503'}`).join(' · ');
}

async function refreshChaos() {
  try {
    const { chaos } = await api('/admin/chaos');
    setStatus('#chaos-state', describeChaos(chaos), chaos.some((c) => c.remaining > 0) ? 'error' : 'ok');
  } catch {
    /* shown elsewhere */
  }
}

for (const button of document.querySelectorAll('[data-chaos]')) {
  button.addEventListener('click', async () => {
    const [mode, count] = button.dataset.chaos.split(':');
    try {
      const { chaos } = await api('/admin/chaos', { method: 'POST', body: { target: $('#chaos-target').value, mode, count: Number(count) } });
      setStatus('#chaos-state', describeChaos(chaos), chaos.some((c) => c.remaining > 0) ? 'error' : 'ok');
    } catch (error) {
      setStatus('#chaos-state', error.message, 'error');
    }
  });
}

// ---- Transformation Studio -----------------------------------------------------------

function studioIntegration() {
  return state.integrations.find((i) => i.id === $('#st-integration').value);
}

function studioFormats() {
  const i = studioIntegration();
  if (!i) return;
  const stage = $('#st-stage').value;
  const clientSide = i.direction === 'soap-to-rest' ? 'SOAP/XML' : 'JSON';
  const downstreamSide = i.direction === 'soap-to-rest' ? 'JSON' : 'SOAP/XML';
  $('#st-in-format').textContent = stage === 'request' ? `${clientSide} from client` : `${downstreamSide} from downstream`;
  $('#st-out-format').textContent = stage === 'request' ? `${downstreamSide} to downstream` : `${clientSide} to client`;
}

function loadStudioSample() {
  const i = studioIntegration();
  if (!i) return;
  $('#st-input').value = $('#st-stage').value === 'request' ? i.samples.request : i.samples.response;
  $('#st-output').textContent = '';
  $('#st-errors').replaceChildren();
  studioFormats();
}

$('#st-integration').addEventListener('change', loadStudioSample);
$('#st-stage').addEventListener('change', loadStudioSample);
$('#st-sample').addEventListener('click', loadStudioSample);
$('#st-run').addEventListener('click', async () => {
  try {
    const result = await api('/admin/transform-preview', { method: 'POST', body: { integrationId: $('#st-integration').value, stage: $('#st-stage').value, payload: $('#st-input').value } });
    $('#st-output').textContent = result.output;
    $('#st-errors').replaceChildren(...result.errors.map((e) => el('li', {}, e)));
  } catch (error) {
    $('#st-errors').replaceChildren(el('li', {}, error.message), ...(error.data?.error?.details ?? []).map((d) => el('li', {}, d)));
  }
});

// ---- AI mapping ----------------------------------------------------------------------

const AI_EXAMPLE = {
  source: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <GetLoanStatusResponse>
      <LoanNo>LN2026-0077</LoanNo>
      <CustNo>CUST1001</CustNo>
      <PrincipalOs>425000.00</PrincipalOs>
      <NextDueDt>05122026</NextDueDt>
      <LoanStat>A</LoanStat>
      <AutoDebit>Y</AutoDebit>
      <Schedule>
        <Inst><InstNo>1</InstNo><DueDt>05122026</DueDt><EmiAmt>18450.00</EmiAmt></Inst>
        <Inst><InstNo>2</InstNo><DueDt>05012027</DueDt><EmiAmt>18450.00</EmiAmt></Inst>
      </Schedule>
    </GetLoanStatusResponse>
  </soapenv:Body>
</soapenv:Envelope>`,
  target: `{
  "loanId": "LN2026-0077",
  "customerId": "CUST1001",
  "outstandingPrincipal": 425000,
  "nextDueDate": "2026-12-05",
  "status": "active",
  "autoDebitEnabled": true,
  "installments": [
    { "number": 1, "dueDate": "2026-12-05", "amount": 18450 }
  ]
}`,
};

function conversionText(rule) {
  const parts = [];
  if (rule.type === 'date') parts.push(`date ${rule.sourceFormat ?? 'iso'} → ${rule.targetFormat ?? 'iso'}`);
  else if (rule.type) parts.push(rule.type);
  if (rule.lookup) parts.push(`lookup ${Object.entries(rule.lookup).map(([k, v]) => `${k}→${v}`).join(', ')}`);
  if (rule.default !== undefined) parts.push(`default ${JSON.stringify(rule.default)}`);
  if (rule.items) parts.push(`each item: ${rule.items.length} field(s)`);
  if (rule.array) parts.push('repeating values');
  if (rule.sensitive) parts.push('sensitive (masked in logs)');
  return parts.join(' · ') || 'copy';
}

$('#ai-example').addEventListener('click', () => {
  $('#ai-source').value = AI_EXAMPLE.source;
  $('#ai-target').value = AI_EXAMPLE.target;
  $('#ai-source-format').value = 'xml';
  $('#ai-target-format').value = 'json';
});

$('#ai-run').addEventListener('click', async () => {
  const button = $('#ai-run');
  button.disabled = true;
  const started = performance.now();
  setStatus('#ai-status', 'Asking Amazon Bedrock…');
  try {
    const result = await api('/admin/mapping-suggestions', {
      method: 'POST',
      body: { source: { format: $('#ai-source-format').value, sample: $('#ai-source').value }, target: { format: $('#ai-target-format').value, sample: $('#ai-target').value } },
    });
    $('#ai-table tbody').replaceChildren(
      ...result.suggestions.map((s) =>
        el(
          'tr',
          {},
          el('td', {}, el('code', {}, s.from)),
          el('td', {}, el('code', {}, s.to)),
          el('td', {}, conversionText(s)),
          el('td', {}, `${Math.round(s.confidence * 100)}%`),
          el('td', {}, s.reason),
          el('td', {}, s.valid ? el('span', { class: 'badge ok' }, 'paths verified') : el('span', { class: 'badge bad', title: s.problem }, s.problem ?? 'rejected')),
        ),
      ),
    );
    $('#ai-unmapped').textContent = result.unmappedTargets.length ? `Target fields with no suggestion: ${result.unmappedTargets.join(', ')}` : 'Every target field has a suggestion.';
    $('#ai-draft').textContent = JSON.stringify(result.draft, null, 2);
    $('#ai-preview').textContent = [JSON.stringify(result.preview, null, 2), ...result.previewErrors.map((e) => `! ${e}`)].join('\n');
    $('#ai-results').hidden = false;
    setStatus('#ai-status', `${result.suggestions.length} suggestions from ${result.model} in ${Math.round(performance.now() - started)} ms`, 'ok');
  } catch (error) {
    setStatus('#ai-status', `${error.message}${error.data?.error?.details?.length ? `: ${error.data.error.details.join('; ')}` : ''}`, 'error');
  } finally {
    button.disabled = false;
  }
});

// ---- Integrations ----------------------------------------------------------------------

function rulesTable(title, rules) {
  return el(
    'div',
    {},
    el('h3', {}, title),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'From'), el('th', { scope: 'col' }, 'To'), el('th', { scope: 'col' }, 'Conversion'))),
      el(
        'tbody',
        {},
        rules.flatMap((r) => [
          el('tr', {}, el('td', {}, el('code', {}, r.from)), el('td', {}, el('code', {}, r.to)), el('td', {}, conversionText(r))),
          ...(r.items ?? []).map((item) => el('tr', {}, el('td', {}, el('code', {}, `  ↳ ${item.from}`)), el('td', {}, el('code', {}, `  ↳ ${item.to}`)), el('td', {}, conversionText(item)))),
        ]),
      ),
    ),
  );
}

function renderIntegrations() {
  $('#integrations').replaceChildren(
    ...state.integrations.map((i) =>
      el(
        'div',
        { class: 'card integration' },
        el('h2', {}, i.name, el('span', { class: 'badge' }, directionLabel(i.direction))),
        el('p', { class: 'muted' }, i.description),
        el(
          'div',
          { class: 'chips' },
          el('span', { class: 'badge' }, `${i.route.method} ${i.route.path}${i.route.soapOperation ? ` · ${i.route.soapOperation}` : ''}`),
          el('span', { class: 'badge' }, `target ${i.target.type.toUpperCase()} ${i.target.operation ?? i.target.method ?? ''}`),
          el('span', { class: 'badge' }, `auth ${i.target.auth ?? 'none'}`),
          el('span', { class: `badge ${i.idempotent ? 'ok' : 'warn'}` }, i.idempotent ? `retries ×${i.retry?.maxAttempts ?? 3}` : 'no retry · Idempotency-Key required'),
          el('span', { class: 'badge' }, `timeout ${i.timeoutMs ?? 2500} ms`),
        ),
        el('p', {}, el('code', {}, i.target.url)),
        el('div', { class: 'cols' }, rulesTable('Request mapping', i.request.mappings), rulesTable('Response mapping', i.response.mappings)),
        i.faults ? el('p', { class: 'muted' }, `Fault map: ${Object.entries(i.faults).map(([code, f]) => `${code} → ${f.status}${f.code ? ` ${f.code}` : ''}`).join(' · ')}`) : null,
      ),
    ),
  );
}

// ---- Connection ------------------------------------------------------------------------

async function connect() {
  state.apiUrl = $('#api-url').value.trim();
  state.apiKey = $('#api-key').value.trim();
  sessionStorage.setItem('bridgex.apiKey', state.apiKey);
  setStatus('#connection-status', 'Connecting…');
  try {
    const { integrations } = await api('/admin/integrations');
    state.integrations = integrations;
    setStatus('#connection-status', `Connected · ${integrations.length} integrations`, 'ok');
    buildPresets();
    $('#st-integration').replaceChildren(...integrations.map((i) => el('option', { value: i.id }, i.name)));
    loadStudioSample();
    renderIntegrations();
    refreshChaos();
    if ($('#tab-overview').getAttribute('aria-selected') === 'true') startPolling();
  } catch (error) {
    setStatus('#connection-status', error.message, 'error');
  }
}

$('#connect-form').addEventListener('submit', (event) => {
  event.preventDefault();
  connect();
});

async function init() {
  try {
    const config = await (await fetch('config.json', { cache: 'no-store' })).json();
    state.apiUrl = config.apiUrl ?? '';
    $('#env-label').textContent = config.environment === 'aws' ? 'running on AWS (us-east-1)' : 'running locally';
  } catch {
    $('#env-label').textContent = 'no config.json found';
  }
  $('#api-url').value = state.apiUrl;
  $('#api-key').value = state.apiKey;
  if (state.apiUrl && state.apiKey) connect();
  else $('#api-key').focus();
}

init();
