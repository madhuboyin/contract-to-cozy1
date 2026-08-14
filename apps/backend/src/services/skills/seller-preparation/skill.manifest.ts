import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SELLER_PREPARATION_SKILL = Object.freeze({
  "id": "seller-preparation",
  "version": "1.0.0",
  "domain": "HOME_TRANSACTION",
  "displayName": "Seller Preparation",
  "description": "Navigate seller readiness and major home-sale preparation using recorded home context.",
  "homeownerJobs": [
    "NAVIGATE_MAJOR_MOMENTS",
    "DECIDE_WITH_CONFIDENCE"
  ],
  "supportedGoals": [
    "prepare-home-sale",
    "enter-home-sale-journey"
  ],
  "aliases": [
    "seller preparation",
    "home sale readiness",
    "selling preparation checklist"
  ],
  "operations": [
    {
      "operationId": "MAJOR_EVENT_ENTRY",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "allowedAdapters": [
    {
      "id": "major-event.entry",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "MAJOR_EVENT_ENTRY"
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
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, "version": PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, "required": false },
    {
      "type": "OPERATION_CONTRACT",
      "id": "MAJOR_EVENT_ENTRY",
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
  "evaluationSuite": "skill-seller-preparation-golden",
  "featureFlag": "ASK_SKILL_SELLER_PREPARATION_ENABLED",
  "killSwitch": "ASK_SKILL_SELLER_PREPARATION_KILL_SWITCH",
  "owner": "Homeowner Product / Home Transaction",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
