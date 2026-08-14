import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const RENOVATION_SKILL = Object.freeze({
  "id": "renovation",
  "version": "1.0.0",
  "domain": "HOME_PROJECTS",
  "displayName": "Renovation",
  "description": "Review renovation and permit readiness, recorded blockers, and required next steps.",
  "homeownerJobs": [
    "NAVIGATE_MAJOR_MOMENTS",
    "STAY_AHEAD"
  ],
  "supportedGoals": [
    "review-renovation-readiness",
    "review-permit-readiness"
  ],
  "aliases": [
    "renovation readiness",
    "permit readiness",
    "remodel blockers"
  ],
  "operations": [
    {
      "operationId": "RENOVATION_PERMIT_READINESS",
      "version": "1.0",
      "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER]
    }
  ],
  "requiredContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "optionalContextProviders": [],
  "allowedAdapters": [
    {
      "id": "renovation-permit.readiness",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "RENOVATION_PERMIT_READINESS"
      ]
    }
  ],
  "riskPolicy": {
    "effects": [
      "READ"
    ],
    "materiality": "MATERIAL",
    "riskDomains": [
      "HOME_SAFETY",
      "TAX_LEGAL",
      "PRIVACY"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "VIEWER",
  "allowedResultBlocks": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "BOUNDARY",
    "CAPABILITY_LIST"
  ],
  "dependencies": [
    { "type": "CONTEXT_PROVIDER", "id": PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, "version": PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, "required": true },
    {
      "type": "OPERATION_CONTRACT",
      "id": "RENOVATION_PERMIT_READINESS",
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
  "evaluationSuite": "skill-renovation-golden",
  "featureFlag": "ASK_SKILL_RENOVATION_ENABLED",
  "killSwitch": "ASK_SKILL_RENOVATION_KILL_SWITCH",
  "owner": "Homeowner Product / Home Projects",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
