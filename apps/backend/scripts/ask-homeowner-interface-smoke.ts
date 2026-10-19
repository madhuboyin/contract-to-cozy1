import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function endpoint(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

function object(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} is not an object.`);
  }
  return value as JsonObject;
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} is not an array.`);
  return value;
}

function string(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context} is missing.`);
  return value;
}

async function getJson(url: string, token?: string): Promise<JsonObject> {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}.`);
  return object(await response.json(), `GET ${url} response`);
}

async function postJson(url: string, token: string, body: JsonObject): Promise<JsonObject> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${url} returned ${response.status}.`);
  return object(await response.json(), `POST ${url} response`);
}

function buildContract(health: JsonObject, service: string): string {
  if (health.service !== service || health.status !== 'healthy') {
    throw new Error(`${service} health response did not identify a healthy ${service} service.`);
  }
  return string(
    object(health.build, `${service} build`).askHomeownerInterfaceContractVersion,
    `${service} Ask homeowner interface contract version`,
  );
}

async function main(): Promise<void> {
  const frontendBaseUrl = requiredEnvironment('ASK_INTERFACE_SMOKE_FRONTEND_BASE_URL');
  const apiBaseUrl = requiredEnvironment('ASK_INTERFACE_SMOKE_API_BASE_URL');
  const token = requiredEnvironment('ASK_INTERFACE_SMOKE_TOKEN');
  const propertyId = requiredEnvironment('ASK_INTERFACE_SMOKE_PROPERTY_ID');
  const sessionId = requiredEnvironment('ASK_INTERFACE_SMOKE_SESSION_ID');

  const [frontendHealth, apiHealth] = await Promise.all([
    getJson(endpoint(frontendBaseUrl, '/api/health')),
    getJson(endpoint(apiBaseUrl, '/api/health')),
  ]);
  const frontendContract = buildContract(frontendHealth, 'frontend');
  const apiContract = buildContract(apiHealth, 'backend');
  if (frontendContract !== apiContract) {
    throw new Error(`Ask homeowner interface contract mismatch: frontend=${frontendContract}, backend=${apiContract}.`);
  }

  const conciergeEnvelope = await getJson(
    `${endpoint(apiBaseUrl, '/api/ask/concierge-home')}?propertyId=${encodeURIComponent(propertyId)}`,
    token,
  );
  const concierge = object(conciergeEnvelope.data, 'concierge data');
  const topics = array(concierge.discoveryTopics, 'concierge discovery topics').map((value, index) => object(value, `discovery topic ${index}`));
  const homeRecordTopic = topics.find((topic) => topic.id === 'HOME_RECORD');
  if (!homeRecordTopic || homeRecordTopic.label !== 'My Home Record') {
    throw new Error('My Home Record discovery topic is missing or mislabeled.');
  }

  const groups = array(concierge.capabilityGroups, 'concierge capability groups').map((value, index) => object(value, `capability group ${index}`));
  const explorerEntries = groups.flatMap((group, groupIndex) =>
    array(group.prompts, `capability group ${groupIndex} prompts`).map((value, entryIndex) => object(value, `capability group ${groupIndex} prompt ${entryIndex}`)),
  );
  const recordEntry = explorerEntries.find((entry) => entry.id === 'understand-complete-record');
  if (!recordEntry || recordEntry.label !== 'Browse home record' || recordEntry.operationId !== 'PROPERTY_SUMMARY') {
    throw new Error('More ideas does not expose the registered Browse home record entry.');
  }

  const executionEnvelope = await postJson(endpoint(apiBaseUrl, '/api/ask/executions'), token, {
    clientRequestId: `ask-interface-smoke-${randomUUID()}`,
    sessionId,
    propertyId,
    message: 'Check my sale readiness',
    launchContext: { surface: 'PRODUCTION_SMOKE', operationId: 'SELLER_PREP_CHECKLIST' },
  });
  const execution = object(executionEnvelope.data, 'Ask execution data');
  if (execution.suggestedNextActionsGoverned !== true) {
    throw new Error('Ask execution did not pass through governed Suggested Next Actions.');
  }
  const actions = array(execution.suggestedNextActions, 'Suggested Next Actions').map((value, index) => object(value, `Suggested Next Action ${index}`));
  const recordAction = actions.find((action) =>
    action.operationId === 'PROPERTY_SUMMARY'
      && action.outcomeKey === 'REVIEW_HOME_SUMMARY'
      && action.label === 'Browse home record',
  );
  if (!recordAction) {
    throw new Error('Suggested Next Actions does not expose PROPERTY_SUMMARY:REVIEW_HOME_SUMMARY as Browse home record.');
  }

  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    contractVersion: apiContract,
    checks: ['build-compatibility', 'my-home-record', 'more-ideas-record-entry', 'suggested-next-actions-record-entry'],
    executionId: string(execution.executionId, 'Ask execution id'),
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Ask homeowner interface smoke failed: ${message}\n`);
  process.exitCode = 1;
});
