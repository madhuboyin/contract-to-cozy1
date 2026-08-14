import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SELL_HOLD_RENT_SKILL = Object.freeze({
  "id": "sell-hold-rent",
  "version": "1.0.0",
  "domain": "HOME_TRANSACTION",
  "displayName": "Sell, Hold, or Rent",
  "description": "Compare governed sell, hold, and rent scenarios from recorded property and financial context.",
  "homeownerJobs": [
    "DECIDE_WITH_CONFIDENCE",
    "NAVIGATE_MAJOR_MOMENTS"
  ],
  "supportedGoals": [
    "analyze-sell-hold-rent",
    "compare-property-exit-options"
  ],
  "aliases": [
    "sell hold rent analysis",
    "property exit options",
    "sell versus rent decision"
  ],
  "operations": [
    {
      "operationId": "SELL_HOLD_RENT_ANALYSIS",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "allowedAdapters": [
    {
      "id": "sale-case.analysis",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "SELL_HOLD_RENT_ANALYSIS"
      ]
    }
  ],
  "riskPolicy": {
    "effects": [
      "READ"
    ],
    "materiality": "MATERIAL",
    "riskDomains": [
      "FINANCIAL",
      "TAX_LEGAL",
      "PRIVACY"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "VIEWER",
  "allowedResultBlocks": [
    "SUMMARY",
    "GROUPED_LIST",
    "TABLE",
    "EVIDENCE",
    "CAPABILITY_LIST"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, "version": PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, "required": false },
    {
      "type": "OPERATION_CONTRACT",
      "id": "SELL_HOLD_RENT_ANALYSIS",
      "version": "1.0",
      "required": true
    }
  ],
  "contextBudget": {
    "maxFacts": 50,
    "maxEntities": 25,
    "maxDocuments": 0,
    "maxHistoryEvents": 50,
    "maxSerializedBytes": 64000,
    "maxProviderLatencyMs": 3000,
    "maxOverallLatencyMs": 15000
  },
  "evaluationSuite": "skill-sell-hold-rent-golden",
  "featureFlag": "ASK_SKILL_SELL_HOLD_RENT_ENABLED",
  "killSwitch": "ASK_SKILL_SELL_HOLD_RENT_KILL_SWITCH",
  "owner": "Homeowner Product / Home Transaction",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
