import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DOCUMENTS_SKILL = Object.freeze({
  "id": "documents",
  "version": "1.0.0",
  "domain": "HOME_INTELLIGENCE",
  "displayName": "Documents",
  "description": "Look up uploaded documents on file for this home -- inspection reports, estimates, invoices, contracts, permits, and other records -- grouped by type and verification status.",
  "homeownerJobs": [
    "STAY_AHEAD",
    "DECIDE_WITH_CONFIDENCE"
  ],
  "supportedGoals": [
    "look-up-documents"
  ],
  "aliases": [
    "documents",
    "document vault",
    "uploaded files"
  ],
  "operations": [
    {
      "operationId": "DOCUMENT_LOOKUP",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
      "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "allowedAdapters": [
    {
      "id": "documents.lookup",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "DOCUMENT_LOOKUP"
      ]
    }
  ],
  "autonomyLevel": 1,
  "riskPolicy": {
    "effects": [
      "READ"
    ],
    "materiality": "LOW",
    "riskDomains": [
      "PRIVACY"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "VIEWER",
  "allowedResultBlocks": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "EMPTY_STATE",
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, "version": PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, "required": false },
    {
      "type": "OPERATION_CONTRACT",
      "id": "DOCUMENT_LOOKUP",
      "version": "1.0",
      "required": true
    }
  ],
  "contextBudget": {
    "maxFacts": 20,
    "maxEntities": 50,
    "maxDocuments": 0,
    "maxHistoryEvents": 0,
    "maxSerializedBytes": 64000,
    "maxProviderLatencyMs": 3000,
    "maxOverallLatencyMs": 15000
  },
  "evaluationSuite": "skill-documents-golden",
  "featureFlag": "ASK_SKILL_DOCUMENTS_ENABLED",
  "killSwitch": "ASK_SKILL_DOCUMENTS_KILL_SWITCH",
  "owner": "Homeowner Product / Home Records",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
