import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const OWNERSHIP_COST_SKILL = Object.freeze({
  "id": "ownership-cost",
  "version": "1.0.0",
  "domain": "HOME_FINANCE",
  "displayName": "Ownership Cost",
  "description": "Summarize monthly and annual home ownership costs using recorded household data.",
  "homeownerJobs": [
    "STAY_AHEAD",
    "DECIDE_WITH_CONFIDENCE"
  ],
  "supportedGoals": [
    "review-ownership-costs",
    "compare-cost-categories"
  ],
  "aliases": [
    "ownership cost",
    "home operating costs",
    "annual housing expenses"
  ],
  "operations": [
    {
      "operationId": "OWNERSHIP_COSTS",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [],
  "allowedAdapters": [
    {
      "id": "ownership.costs",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "OWNERSHIP_COSTS"
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
    {
      "type": "OPERATION_CONTRACT",
      "id": "OWNERSHIP_COSTS",
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
  "evaluationSuite": "skill-ownership-cost-golden",
  "featureFlag": "ASK_SKILL_OWNERSHIP_COST_ENABLED",
  "killSwitch": "ASK_SKILL_OWNERSHIP_COST_KILL_SWITCH",
  "owner": "Homeowner Product / Home Finance",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
