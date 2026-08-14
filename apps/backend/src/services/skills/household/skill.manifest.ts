import type { SkillDefinition } from '../skill.contract';

export const HOUSEHOLD_SKILL = Object.freeze({
  "id": "household",
  "version": "1.0.0",
  "domain": "HOUSEHOLD",
  "displayName": "Household",
  "description": "Manage governed household invitations and explain membership access boundaries.",
  "homeownerJobs": [
    "NAVIGATE_MAJOR_MOMENTS",
    "STAY_AHEAD"
  ],
  "supportedGoals": [
    "invite-household-member",
    "manage-household-access"
  ],
  "aliases": [
    "household membership",
    "household invitation",
    "share home access"
  ],
  "operations": [
    {
      "operationId": "HOUSEHOLD_INVITATION",
      "version": "1.0"
    }
  ],
  "requiredContextProviders": [],
  "optionalContextProviders": [],
  "allowedAdapters": [
    {
      "id": "household.invitation",
      "version": "1.0"
    }
  ],
  "allowedExternalConnectors": [],
  "consumerPolicy": [
    {
      "consumer": "ASK",
      "operations": [
        "HOUSEHOLD_INVITATION"
      ]
    }
  ],
  "riskPolicy": {
    "effects": [
      "WRITE"
    ],
    "materiality": "MATERIAL",
    "riskDomains": [
      "HOUSEHOLD_SECURITY",
      "PRIVACY"
    ],
    "reversibility": "REVERSIBLE"
  },
  "authorizationFloor": "OWNER",
  "allowedResultBlocks": [
    "SUMMARY",
    "WORKFLOW_PROGRESS"
  ],
  "dependencies": [
    {
      "type": "OPERATION_CONTRACT",
      "id": "HOUSEHOLD_INVITATION",
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
  "evaluationSuite": "skill-household-golden",
  "featureFlag": "ASK_SKILL_HOUSEHOLD_ENABLED",
  "killSwitch": "ASK_SKILL_HOUSEHOLD_KILL_SWITCH",
  "owner": "Homeowner Product / Household",
  "lifecycleStatus": "DEVELOPMENT",
  "operationalStatus": "ENABLED"
} satisfies SkillDefinition);
