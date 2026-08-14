import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const QUOTE_COMPARISON_SKILL = Object.freeze({
  "id": "quote-comparison",
  "version": "1.0.0",
  "domain": "HOME_PROJECTS",
  "displayName": "Quote Comparison",
  "description": "Create a governed quote workspace and compare recorded bids, estimates, and proposals.",
  "homeownerJobs": [
    "DECIDE_WITH_CONFIDENCE",
    "NAVIGATE_MAJOR_MOMENTS"
  ],
  "supportedGoals": [
    "create-quote-comparison",
    "review-quote-comparison"
  ],
  "aliases": [
    "quote comparison",
    "compare contractor bids",
    "estimate comparison workspace"
  ],
  "operations": [
    {
      "operationId": "QUOTE_COMPARISON_CREATE",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER]
    },
    {
      "operationId": "QUOTE_COMPARISON_REVIEW",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [],
  "allowedAdapters": [
    {
      "id": "quote-comparison.create",
      "version": "1.0"
    },
    {
      "id": "quote-comparison.review",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "QUOTE_COMPARISON_CREATE",
        "QUOTE_COMPARISON_REVIEW"
      ]
    }
  ],
  "riskPolicy": {
    "effects": [
      "READ",
      "WRITE"
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
    "WORKFLOW_PROGRESS",
    "CAPABILITY_LIST",
    "GROUPED_LIST",
    "TABLE",
    "EVIDENCE",
    "BOUNDARY"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    {
      "type": "OPERATION_CONTRACT",
      "id": "QUOTE_COMPARISON_CREATE",
      "version": "1.0",
      "required": true
    },
    {
      "type": "OPERATION_CONTRACT",
      "id": "QUOTE_COMPARISON_REVIEW",
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
  "evaluationSuite": "skill-quote-comparison-golden",
  "featureFlag": "ASK_SKILL_QUOTE_COMPARISON_ENABLED",
  "killSwitch": "ASK_SKILL_QUOTE_COMPARISON_KILL_SWITCH",
  "owner": "Homeowner Product / Home Projects",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
