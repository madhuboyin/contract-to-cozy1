import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const HOUSEHOLD_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-household-golden",
  "skillId": "household",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Invite my spouse to my household",
      "expectedOperationId": "HOUSEHOLD_INVITATION"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Add a family member to this home",
      "expectedOperationId": "HOUSEHOLD_INVITATION"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Share my home with my partner",
      "expectedOperationId": "HOUSEHOLD_INVITATION"
    },
    {
      "mode": "MISSPELLED",
      "message": "Send a household invitation to my spouce",
      "expectedOperationId": "HOUSEHOLD_INVITATION"
    }
  ],
  "operationCases": [
    {
      "operationId": "HOUSEHOLD_INVITATION",
      "expectedAdapter": {
        "id": "household.invitation",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Share home information with another person",
      "candidateSkillIds": [
        "household",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "HOUSEHOLD_INVITATION",
      "allowed": true
    }
  ],
  "contextCases": [
    {
      "state": "KNOWN",
      "expectedBehavior": "READY"
    },
    {
      "state": "MISSING",
      "expectedBehavior": "CAPTURE_OR_BLOCK"
    },
    {
      "state": "STALE",
      "expectedBehavior": "DISCLOSE_OR_BLOCK"
    },
    {
      "state": "CONFLICTING",
      "expectedBehavior": "BLOCK"
    },
    {
      "state": "UNAUTHORIZED",
      "expectedBehavior": "BLOCK"
    },
    {
      "state": "UNAVAILABLE",
      "expectedBehavior": "DEGRADED_OR_BLOCK"
    }
  ],
  "negativeCases": [
    {
      "message": "Show my home maintenance schedule",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Change another household's membership or bypass owner authorization",
      "expectedBehavior": "DO_NOT_EXECUTE_SKILL"
    }
  ],
  "resolutionAmbiguityCases": [
    {
      "kind": "ENTITY",
      "message": "Continue this request for the matching item",
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    },
    {
      "kind": "PROPERTY",
      "message": "Run this request for my home",
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    },
    {
      "kind": "DECISION_THREAD",
      "message": "Continue my current home decision",
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "degradedModeCases": [
    {
      "dependencyType": "ADAPTER",
      "dependency": {
        "id": "household.invitation",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "household.invitation",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "maintenance.status"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared-contact-book"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS",
    "NEEDS_CONFIRMATION",
    "COMPLETED"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "WORKFLOW_PROGRESS"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "household.invitation",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "maintenance.status"
  ],
  "modelDisabledCase": {
    "message": "Invite my spouse to my household",
    "expectedOperationId": "HOUSEHOLD_INVITATION"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "HOUSEHOLD_INVITATION",
    "expectedOperationId": "HOUSEHOLD_INVITATION"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "HOUSEHOLD_ACCESS_ESTABLISHED"
    ]
  },
  "performanceCase": {
    "message": "Invite my spouse to my household",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
