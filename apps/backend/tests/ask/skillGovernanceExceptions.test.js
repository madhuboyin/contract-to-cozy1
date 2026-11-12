const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 1: every operation without an owning Skill has exactly one structured exception record, and the boot
// validator rejects each way that record can go wrong. Loading the Ask facade registers every handler, as startupRegistryValidation does.
require('../../src/services/ask/askOrchestrator.service.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const {
  KNOWN_UNGOVERNED_OPERATIONS,
  SKILL_GOVERNANCE_EXCEPTIONS,
  validateSkillOperationGovernanceCoverage,
} = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');
const { SKILL_GOVERNANCE_EXCEPTION_REGISTRATION_ISSUES } = require('../../src/services/intelligence/skillGovernanceExceptions.contract.ts');
const { deterministicMessageRouteOperationIds, buildAskArchitectureInventory } = require('../../src/scripts/askArchitectureInventory.ts');

const covers = (operationId) => Boolean(getSkillForOperation(operationId));
const context = { skillCoversOperation: covers };
const skillless = Object.keys(ASK_OPERATION_DEFINITIONS).filter((id) => !covers(id)).sort();
const clone = (record, patch) => ({ ...record, ...patch });
const withRecord = (operationId, record) => ({ ...SKILL_GOVERNANCE_EXCEPTIONS, [operationId]: record });
const issuesWith = (exceptions, operations) => validateSkillOperationGovernanceCoverage(context, operations, { exceptions });

test('the current registry boots clean and every Skill-less operation has exactly one record', () => {
  assert.deepEqual(validateSkillOperationGovernanceCoverage(context), []);
  assert.deepEqual(SKILL_GOVERNANCE_EXCEPTION_REGISTRATION_ISSUES, []);
  assert.deepEqual(Object.keys(SKILL_GOVERNANCE_EXCEPTIONS).sort(), skillless);
});

test('the classification counts are the reviewed Phase 1 result', () => {
  const counts = {};
  for (const record of Object.values(SKILL_GOVERNANCE_EXCEPTIONS)) counts[record.classification] = (counts[record.classification] ?? 0) + 1;
  assert.deepEqual(counts, {
    INTENTIONAL_PLATFORM: 5,
    INTERNAL_CAPTURE: 5,
    LAUNCH_ONLY: 2,
    DETERMINISTIC_TYPED_READ: 5,
    GOVERNED_INTERNAL_COMMAND: 65,
    TEMPORARY_GAP: 23,
  });
});

test('the legacy list is derived from the registry and has no independent source', () => {
  const expected = skillless.filter((id) => ASK_OPERATION_DEFINITIONS[id].propertyRoleFloor !== null);
  assert.deepEqual([...KNOWN_UNGOVERNED_OPERATIONS].sort(), expected);
});

test('entry paths agree with the real deterministic route table', () => {
  const routed = deterministicMessageRouteOperationIds();
  for (const [operationId, record] of Object.entries(SKILL_GOVERNANCE_EXCEPTIONS)) {
    if (record.classification === 'INTENTIONAL_PLATFORM') continue;
    assert.equal(
      record.allowedEntryPaths.includes('DETERMINISTIC_TYPED_ROUTE'),
      routed.has(operationId),
      `${operationId}: DETERMINISTIC_TYPED_ROUTE must be declared exactly when resolveAskOperation can return it`,
    );
  }
  // A launch-only read is, by definition, not reachable by a typed pattern.
  for (const [operationId, record] of Object.entries(SKILL_GOVERNANCE_EXCEPTIONS)) {
    if (record.classification === 'LAUNCH_ONLY') assert.equal(routed.has(operationId), false, operationId);
  }
});

test('the route analysis reads resolved() calls and fails loudly when the resolver moves', () => {
  const source = "function resolveAskOperation(m) {\n  if (a.test(m)) return resolved('ALPHA', 1);\n  return resolved('BETA', 0.5);\n}";
  assert.deepEqual([...deterministicMessageRouteOperationIds(source)].sort(), ['ALPHA', 'BETA']);
  assert.throws(() => deterministicMessageRouteOperationIds('function other() {}'), /resolveAskOperation/);
});

test('a temporary gap carries an owner and the approved removal condition', () => {
  for (const [operationId, record] of Object.entries(SKILL_GOVERNANCE_EXCEPTIONS)) {
    if (record.classification !== 'TEMPORARY_GAP') continue;
    assert.equal(record.owner, ASK_OPERATION_DEFINITIONS[operationId].adapterKey, operationId);
    assert.match(record.removalCondition, /exactly one owning Skill/, operationId);
    assert.equal(ASK_OPERATION_DEFINITIONS[operationId].messageRoutable, true, operationId);
  }
});

test('an undocumented Skill-less operation is rejected', () => {
  const { HIRING_GUIDE, ...rest } = SKILL_GOVERNANCE_EXCEPTIONS;
  assert.ok(HIRING_GUIDE);
  assert.match(issuesWith(rest).join('\n'), /HIRING_GUIDE" has no owning Skill and no skill governance exception record/);
});

test('a stale record for a Skill-owned operation, or an unknown operation, is rejected', () => {
  const owned = Object.keys(ASK_OPERATION_DEFINITIONS).find((id) => covers(id));
  const record = SKILL_GOVERNANCE_EXCEPTIONS.HIRING_GUIDE;
  assert.match(issuesWith(withRecord(owned, record)).join('\n'), new RegExp(`${owned}" has a skill governance exception record but is now covered`));
  assert.match(issuesWith(withRecord('NOT_AN_OPERATION', record)).join('\n'), /unknown Ask operation "NOT_AN_OPERATION"/);
});

test('an internal or launch-only exception that is message-routable is rejected', () => {
  const operations = { ...ASK_OPERATION_DEFINITIONS, HIRING_GUIDE: { ...ASK_OPERATION_DEFINITIONS.HIRING_GUIDE, messageRoutable: true } };
  assert.match(issuesWith(SKILL_GOVERNANCE_EXCEPTIONS, operations).join('\n'), /"HIRING_GUIDE" \(LAUNCH_ONLY\): an internal, launch-only, or capture exception must not be message-routable/);
});

test('a temporary gap that is not message-routable must be reclassified', () => {
  const operations = { ...ASK_OPERATION_DEFINITIONS, RECALL_REVIEW: { ...ASK_OPERATION_DEFINITIONS.RECALL_REVIEW, messageRoutable: false } };
  assert.match(issuesWith(SKILL_GOVERNANCE_EXCEPTIONS, operations).join('\n'), /"RECALL_REVIEW" \(TEMPORARY_GAP\): a non-message-routable operation is not a temporary gap/);
});

test('a temporary gap without an owner or removal condition is rejected', () => {
  const base = SKILL_GOVERNANCE_EXCEPTIONS.RECALL_REVIEW;
  const text = issuesWith(withRecord('RECALL_REVIEW', clone(base, { owner: ' ', removalCondition: undefined }))).join('\n');
  assert.match(text, /needs an owner/);
  assert.match(text, /needs a removal condition/);
});

test('a governed command without its command, confirmation control or declared action is rejected', () => {
  const base = SKILL_GOVERNANCE_EXCEPTIONS.COVERAGE_COMMAND;
  const noCommand = validateSkillOperationGovernanceCoverage(context, undefined, { exceptions: SKILL_GOVERNANCE_EXCEPTIONS, commandForOperation: (id) => (id === 'COVERAGE_COMMAND' ? null : getAskDomainCommandByOperation(id)) });
  assert.match(noCommand.join('\n'), /"COVERAGE_COMMAND" \(GOVERNED_INTERNAL_COMMAND\): a governed internal command needs exactly one ASK_DOMAIN_COMMAND_REGISTRY entry/);
  const noConfirm = issuesWith(withRecord('COVERAGE_COMMAND', clone(base, { equivalentControls: ['CAPABILITY_GUARD'] }))).join('\n');
  assert.match(noConfirm, /must declare its confirmation control/);
  const noDeclared = issuesWith(withRecord('COVERAGE_COMMAND', clone(base, { allowedEntryPaths: ['DETERMINISTIC_TYPED_ROUTE'] }))).join('\n');
  assert.match(noDeclared, /must declare DECLARED_ACTION/);
});

test('a read-only exception may not have a command or a confirmation control, and launch-only may not declare a typed route', () => {
  const read = SKILL_GOVERNANCE_EXCEPTIONS.NOTIFICATIONS_OVERVIEW;
  assert.match(issuesWith(withRecord('NOTIFICATIONS_OVERVIEW', clone(read, { equivalentControls: ['CAPABILITY_GUARD', 'CONFIRMATION'] }))).join('\n'), /read-only exception must not declare a confirmation control/);
  assert.match(issuesWith(withRecord('NOTIFICATIONS_OVERVIEW', clone(read, { allowedEntryPaths: ['LAUNCH_CONTEXT'] }))).join('\n'), /must declare DETERMINISTIC_TYPED_ROUTE/);
  assert.match(issuesWith(withRecord('NOTIFICATIONS_OVERVIEW', clone(read, { owner: '' }))).join('\n'), /explicit canonical owner/);
  const launch = SKILL_GOVERNANCE_EXCEPTIONS.HIRING_GUIDE;
  assert.match(issuesWith(withRecord('HIRING_GUIDE', clone(launch, { allowedEntryPaths: ['LAUNCH_CONTEXT', 'DETERMINISTIC_TYPED_ROUTE'] }))).join('\n'), /not allowed for this classification/);
});

test('a record may not declare an entry path outside its class, and a platform record must have no role floor', () => {
  const capture = SKILL_GOVERNANCE_EXCEPTIONS.CAPTURE_FACT_CONFIRM;
  assert.match(issuesWith(withRecord('CAPTURE_FACT_CONFIRM', clone(capture, { allowedEntryPaths: ['MESSAGE_ROUTING'] }))).join('\n'), /entry path MESSAGE_ROUTING is not allowed/);
  const platform = SKILL_GOVERNANCE_EXCEPTIONS.EMERGENCY_BOUNDARY;
  assert.match(issuesWith(withRecord('RECALL_REVIEW', clone(platform, {}))).join('\n'), /only an operation with no property role floor can be an intentional platform exception/);
  assert.match(issuesWith(withRecord('EMERGENCY_BOUNDARY', clone(SKILL_GOVERNANCE_EXCEPTIONS.RECALL_REVIEW, {}))).join('\n'), /no property role floor is a platform boundary/);
});

test('the inventory reports the exception class and route reachability for every Skill-less row', () => {
  const inventory = buildAskArchitectureInventory();
  assert.equal(inventory.skilllessOperations.every((row) => row.exceptionClass !== null), true);
  assert.deepEqual(inventory.governanceDrift, { skilllessUnlisted: [], listedButSkillOwned: [], listedButUnknown: [] });
  assert.equal(inventory.skilllessByExceptionClass.GOVERNED_INTERNAL_COMMAND, 65);
  assert.equal(inventory.skilllessOperations.find((row) => row.operationId === 'NOTIFICATIONS_OVERVIEW').deterministicRouteReachable, true);
});
