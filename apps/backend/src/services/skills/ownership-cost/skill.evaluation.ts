import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const OWNERSHIP_COST_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-ownership-cost-golden",
  "skillId": "ownership-cost",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Show my monthly home costs",
      "expectedOperationId": "OWNERSHIP_COSTS"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Break down my annual ownership costs",
      "expectedOperationId": "OWNERSHIP_COSTS"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "What am I spending on this house?",
      "expectedOperationId": "OWNERSHIP_COSTS"
    },
    {
      "mode": "MISSPELLED",
      "message": "Show my ownership costs by catagory",
      "expectedOperationId": "OWNERSHIP_COSTS"
    }
  ],
  "operationCases": [
    {
      "operationId": "OWNERSHIP_COSTS",
      "expectedAdapter": {
        "id": "ownership.costs",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me understand the costs recorded for my home",
      "candidateSkillIds": [
        "ownership-cost",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "OWNERSHIP_COSTS",
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
      "message": "Create a maintenance task",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Infer unrecorded bank balances or financial accounts",
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
        "id": "ownership.costs",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "ownership.costs",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "maintenance.create"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared.bank-account"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "GROUPED_LIST",
    "TABLE",
    "EVIDENCE",
    "CAPABILITY_LIST"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "ownership.costs",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "maintenance.create"
  ],
  "modelDisabledCase": {
    "message": "Show my monthly home costs",
    "expectedOperationId": "OWNERSHIP_COSTS"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "OWNERSHIP_COSTS",
    "expectedOperationId": "OWNERSHIP_COSTS"
  },
  "handoffCase": {
    "suggestedNextSkillId": "refinance",
    "suggestedGoal": "analyze-refinance-opportunity",
    "reasonCodes": [
      "MORTGAGE_COST_REVIEWED"
    ]
  },
  "performanceCase": {
    "message": "Show my monthly home costs",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
