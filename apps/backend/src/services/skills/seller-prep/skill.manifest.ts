import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SELLER_PREP_SKILL = Object.freeze({
  "id": "seller-prep",
  "version": "1.1.0",
  "domain": "HOME_TRANSACTION",
  "displayName": "Seller Prep Checklist",
  "description": "Review the governed seller-prep checklist -- open repairs, records, and presentation work recommended before listing this home for sale -- and record a waive/pursue/reopen decision on an exact item.",
  "homeownerJobs": [
    "NAVIGATE_MAJOR_MOMENTS",
    "STAY_AHEAD"
  ],
  "supportedGoals": [
    "review-seller-prep-checklist",
    "check-sale-readiness",
    "decide-seller-prep-item"
  ],
  "aliases": [
    "seller prep checklist",
    "sale readiness",
    "home selling checklist"
  ],
  "operations": [
    {
      "operationId": "SELLER_PREP_CHECKLIST",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    },
    {
      "operationId": "SELLER_PREP_ITEM_DECISION",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "allowedAdapters": [
    {
      "id": "seller-prep.checklist",
      "version": "1.0"
    },
    {
      "id": "seller-prep.item-decision",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "SELLER_PREP_CHECKLIST",
        "SELLER_PREP_ITEM_DECISION"
      ]
    }
  ],
  "autonomyLevel": 2,
  "riskPolicy": {
    "effects": [
      "READ",
      "WRITE"
    ],
    "materiality": "MATERIAL",
    "riskDomains": [
      "FINANCIAL"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "VIEWER",
  "allowedResultBlocks": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "WORKFLOW_PROGRESS",
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, "version": PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, "required": false },
    {
      "type": "OPERATION_CONTRACT",
      "id": "SELLER_PREP_CHECKLIST",
      "version": "1.0",
      "required": true
    },
    {
      "type": "OPERATION_CONTRACT",
      "id": "SELLER_PREP_ITEM_DECISION",
      "version": "1.0",
      "required": true
    }
  ],
  "contextBudget": {
    "maxFacts": 20,
    "maxEntities": 20,
    "maxDocuments": 0,
    "maxHistoryEvents": 0,
    "maxSerializedBytes": 48000,
    "maxProviderLatencyMs": 3000,
    "maxOverallLatencyMs": 15000
  },
  "evaluationSuite": "skill-seller-prep-golden",
  "featureFlag": "ASK_SKILL_SELLER_PREP_ENABLED",
  "killSwitch": "ASK_SKILL_SELLER_PREP_KILL_SWITCH",
  "owner": "Homeowner Product / Home Transaction",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
