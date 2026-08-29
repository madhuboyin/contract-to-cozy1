const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-23T12:00:00.000Z');

function stubSources({ analyses = [], guidanceJourneys = [], decisionThreads = [] } = {}) {
  return {
    // loadGuidanceActions() and loadRepairReplaceDecisionActions() both call
    // db.guidanceJourney.findMany with different `where` shapes — route by
    // the replace-repair-specific toolKey filter so this fixture only
    // reaches the loader it's meant for.
    guidanceJourney: {
      findMany: async (args) => (args?.where?.steps?.some?.toolKey === 'replace-repair' ? guidanceJourneys : []),
    },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
    replaceRepairAnalysis: { findMany: async () => analyses },
    decisionThread: { findMany: async () => decisionThreads },
  };
}

function analysis(overrides = {}) {
  return {
    id: 'analysis-1',
    propertyId: 'property-1',
    inventoryItemId: 'item-1',
    currentMarker: 'CURRENT',
    status: 'READY',
    verdict: 'REPLACE_NOW',
    confidence: 'HIGH',
    impactLevel: 'HIGH',
    summary: 'This water heater is past its expected lifespan.',
    computedAt: NOW,
    inventoryItem: { id: 'item-1', name: 'Water Heater', category: 'APPLIANCE' },
    ...overrides,
  };
}

test('a REPLACE_NOW analysis produces a SOON-priority, replace-favoring Home Action', async () => {
  const db = stubSources({ analyses: [analysis()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.id, 'repair-replace:analysis-1');
  assert.equal(action.source.kind, 'GUIDANCE');
  assert.equal(action.priority, 'SOON');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(action.options.find((o) => o.id === 'replace').recommended, true);
  assert.equal(action.options.find((o) => o.id === 'repair').recommended, false);
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/inventory/items/item-1/replace-repair');
});

test('a REPAIR_AND_MONITOR analysis favors repair and gets PLAN priority', async () => {
  const db = stubSources({ analyses: [analysis({ id: 'analysis-2', verdict: 'REPAIR_AND_MONITOR', confidence: 'MEDIUM' })] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'PLAN');
  assert.equal(action.options.find((o) => o.id === 'repair').recommended, true);
  assert.equal(action.confidence.label, 'MEDIUM');
});

test('HVAC stays neutral before a current Decision Platform snapshot exists', async () => {
  const db = stubSources({
    analyses: [analysis({
      verdict: 'REPLACE_NOW',
      summary: 'The generic analysis says replace immediately.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'PLAN');
  assert.equal(action.options.find((o) => o.id === 'repair').recommended, false);
  assert.equal(action.options.find((o) => o.id === 'replace').recommended, false);
  assert.match(action.whyItMatters, /no current Decision Platform recommendation/i);
  assert.doesNotMatch(`${action.whyItMatters} ${action.recommendedAction}`, /replace immediately/i);
  assert.deepEqual(action.confidence.missing, ['Current HVAC Decision Platform recommendation']);
  assert.equal(action.evidence[0].source, 'Lifespan Engine (supporting evidence only)');
});

test('generic HVAC verdict fields cannot affect neutral Home Action presentation or priority', async () => {
  const guidanceJourneys = [{
    id: 'journey-1', inventoryItemId: 'item-1', currentStepKey: 'compare-options', issueType: 'Repair or replace',
  }];
  const variants = [
    analysis({
      verdict: 'REPLACE_NOW', confidence: 'HIGH', impactLevel: 'HIGH',
      summary: 'The generic analysis says replace immediately.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    }),
    analysis({
      verdict: 'REPAIR_ONLY', confidence: 'LOW', impactLevel: 'LOW',
      summary: 'The generic analysis says repair this furnace.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    }),
  ];

  const actions = [];
  for (const candidate of variants) {
    const result = await getPromotedHomeActions('property-1', stubSources({ analyses: [candidate], guidanceJourneys }), {
      evaluatedAt: NOW,
      includePersonalization: false,
    });
    actions.push(result.actions[0]);
  }

  const presentation = (action) => ({
    priority: action.priority,
    signal: action.signal,
    whyItMatters: action.whyItMatters,
    recommendedAction: action.recommendedAction,
    options: action.options,
    confidence: action.confidence,
    href: action.primaryCta.href,
  });
  assert.deepEqual(presentation(actions[0]), presentation(actions[1]));
  assert.equal(actions[0].primaryCta.href.includes('customIssueLabel='), false);
  assert.doesNotMatch(JSON.stringify(presentation(actions[0])), /replace immediately|repair this furnace/i);
});

test('current HVAC snapshot is the sole published verdict even when the generic analysis disagrees', async () => {
  const db = stubSources({
    analyses: [analysis({
      verdict: 'REPLACE_NOW',
      summary: 'The generic analysis says replace immediately.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    })],
    decisionThreads: [{
      primaryEntityId: 'item-1',
      contextStatus: 'CURRENT',
      currentRecommendationSnapshot: {
        id: 'snapshot-repair',
        verdictCode: 'REPAIR',
        generatedAt: NOW,
        confidenceBreakdown: { label: 'MEDIUM', knownFactors: ['AGE', 'CONDITION'], unknownFactors: [] },
      },
    }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'PLAN');
  assert.equal(action.options.find((o) => o.id === 'repair').recommended, true);
  assert.equal(action.options.find((o) => o.id === 'replace').recommended, false);
  assert.match(action.whyItMatters, /favors repair/i);
  assert.doesNotMatch(`${action.whyItMatters} ${action.recommendedAction}`, /replace immediately/i);
  assert.equal(action.source.version, 'snapshot:snapshot-repair');
  assert.equal(action.evidence[0].id, 'snapshot-repair');
  assert.equal(action.evidence[0].source, 'Decision Platform');
  assert.equal(action.confidence.label, 'MEDIUM');
  assert.deepEqual(action.confidence.missing, []);
});

test('generic HVAC verdict fields cannot affect snapshot-authoritative Home Action presentation or priority', async () => {
  const snapshotThread = {
    primaryEntityId: 'item-1',
    contextStatus: 'CURRENT',
    currentRecommendationSnapshot: {
      id: 'snapshot-repair', verdictCode: 'REPAIR', generatedAt: NOW,
      confidenceBreakdown: { label: 'MEDIUM' },
    },
  };
  const variants = [
    analysis({
      verdict: 'REPLACE_NOW', confidence: 'HIGH', impactLevel: 'HIGH',
      summary: 'The generic analysis says replace immediately.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    }),
    analysis({
      verdict: 'REPAIR_ONLY', confidence: 'LOW', impactLevel: 'LOW',
      summary: 'The generic analysis says repair this furnace.',
      inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' },
    }),
  ];

  const actions = [];
  for (const candidate of variants) {
    const result = await getPromotedHomeActions('property-1', stubSources({
      analyses: [candidate],
      decisionThreads: [snapshotThread],
    }), { evaluatedAt: NOW, includePersonalization: false });
    actions.push(result.actions[0]);
  }

  const presentation = (action) => ({
    priority: action.priority,
    signal: action.signal,
    whyItMatters: action.whyItMatters,
    recommendedAction: action.recommendedAction,
    options: action.options,
    confidence: action.confidence,
    sourceVersion: action.source.version,
  });
  assert.deepEqual(presentation(actions[0]), presentation(actions[1]));
  assert.match(actions[0].whyItMatters, /favors repair/i);
  assert.doesNotMatch(JSON.stringify(presentation(actions[0])), /replace immediately|repair this furnace/i);
});

test('stale or ambiguous HVAC lineage cannot publish a snapshot verdict', async () => {
  const staleThread = {
    primaryEntityId: 'item-1',
    contextStatus: 'STALE',
    currentRecommendationSnapshot: {
      id: 'snapshot-replace', verdictCode: 'REPLACE', generatedAt: NOW,
      confidenceBreakdown: { label: 'HIGH' },
    },
  };
  const hvacAnalysis = analysis({ inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' } });
  for (const decisionThreads of [[staleThread], [
    { ...staleThread, contextStatus: 'CURRENT' },
    { ...staleThread, contextStatus: 'CURRENT', currentRecommendationSnapshot: { ...staleThread.currentRecommendationSnapshot, id: 'snapshot-2' } },
  ]]) {
    const db = stubSources({ analyses: [hvacAnalysis], decisionThreads });
    const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
    assert.match(actions[0].whyItMatters, /no current Decision Platform recommendation/i);
    assert.equal(actions[0].options.some((option) => option.recommended), false);
  }
});

test('an active resume-eligible guidance journey produces a pinned-mode href', async () => {
  const db = stubSources({
    analyses: [analysis()],
    guidanceJourneys: [{
      id: 'journey-1', inventoryItemId: 'item-1', currentStepKey: 'compare-options', issueType: 'Repair or replace',
    }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.ok(action.primaryCta.href.startsWith('/dashboard/properties/property-1/tools/guidance-overview?'));
  assert.ok(action.primaryCta.href.includes('journeyId=journey-1'));
  assert.equal(action.relatedJourneyId, 'journey-1');
});

test('multiple analyses for the same item are deduped, preferring the CURRENT marker', async () => {
  const db = stubSources({
    analyses: [
      analysis({ id: 'stale-analysis', currentMarker: null, computedAt: new Date('2026-01-01T00:00:00.000Z') }),
      analysis({ id: 'current-analysis', currentMarker: 'CURRENT', computedAt: new Date('2026-06-01T00:00:00.000Z') }),
    ],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, 'repair-replace:current-analysis');
});

// C2C Intelligence & Agentic Evolution Phase 4A (architecture §12.7):
// category-aware decision-family routing. `id` is category-independent;
// only `lineageId` picks the family.
test('a non-HVAC analysis routes to the appliance-repair-replace lineage; HVAC keeps repair-replace', async () => {
  const applianceDb = stubSources({ analyses: [analysis({ inventoryItem: { id: 'item-1', name: 'Water Heater', category: 'APPLIANCE' } })] });
  const { actions: applianceActions } = await getPromotedHomeActions('property-1', applianceDb, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(applianceActions[0].id, 'repair-replace:analysis-1');
  assert.equal(applianceActions[0].lineageId, 'appliance-repair-replace:item-1');

  const hvacDb = stubSources({
    analyses: [analysis({ inventoryItem: { id: 'item-1', name: 'Furnace', category: 'HVAC' } })],
    decisionThreads: [],
  });
  const { actions: hvacActions } = await getPromotedHomeActions('property-1', hvacDb, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(hvacActions[0].id, 'repair-replace:analysis-1');
  assert.equal(hvacActions[0].lineageId, 'repair-replace:item-1');
});

test('a db stub without replaceRepairAnalysis does not throw and yields no actions', async () => {
  const db = {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
  };
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});
