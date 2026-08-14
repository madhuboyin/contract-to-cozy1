import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const COVERAGE_SKILL = Object.freeze({
  "id": "coverage",
  "version": "1.0.0",
  "domain": "HOME_PROTECTION",
  "displayName": "Coverage",
  "description": "Review recorded warranty and insurance coverage gaps and evidence readiness.",
  "homeownerJobs": [
    "STAY_AHEAD",
    "DECIDE_WITH_CONFIDENCE"
  ],
  "supportedGoals": [
    "review-coverage-gaps",
    "review-coverage-evidence"
  ],
  "aliases": [
    "coverage review",
    "coverage gaps",
    "warranty evidence readiness"
  ],
  "operations": [
    {
      "operationId": "COVERAGE_GAPS",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "allowedAdapters": [
    {
      "id": "coverage.review",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "COVERAGE_GAPS"
      ]
    }
  ],
  "riskPolicy": {
    "effects": [
      "READ"
    ],
    "materiality": "MATERIAL",
    "riskDomains": [
      "COVERAGE",
      "PRIVACY"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "VIEWER",
  "allowedResultBlocks": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "CAPABILITY_LIST"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, "version": PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, "required": false },
    {
      "type": "OPERATION_CONTRACT",
      "id": "COVERAGE_GAPS",
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
  "evaluationSuite": "skill-coverage-golden",
  "featureFlag": "ASK_SKILL_COVERAGE_ENABLED",
  "killSwitch": "ASK_SKILL_COVERAGE_KILL_SWITCH",
  "owner": "Homeowner Product / Home Protection",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
