import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const SAVINGS_SKILL = Object.freeze({
  "id": "savings",
  "version": "1.0.0",
  "domain": "HOME_FINANCE",
  "displayName": "Savings",
  "description": "Find recorded savings, rebate, benefit, and cost-reduction opportunities for the selected home.",
  "homeownerJobs": [
    "STAY_AHEAD",
    "DECIDE_WITH_CONFIDENCE"
  ],
  "supportedGoals": [
    "find-home-savings",
    "review-savings-opportunities"
  ],
  "aliases": [
    "home savings",
    "savings opportunities",
    "rebate and benefit opportunities"
  ],
  "operations": [
    {
      "operationId": "SAVINGS_OPPORTUNITIES",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [],
  "allowedAdapters": [
    {
      "id": "savings.opportunities",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "SAVINGS_OPPORTUNITIES"
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
      "id": "SAVINGS_OPPORTUNITIES",
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
  "evaluationSuite": "skill-savings-golden",
  "featureFlag": "ASK_SKILL_SAVINGS_ENABLED",
  "killSwitch": "ASK_SKILL_SAVINGS_KILL_SWITCH",
  "owner": "Homeowner Product / Home Finance",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
