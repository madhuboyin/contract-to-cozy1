import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const SAVINGS_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-savings-golden",
  "skillId": "savings",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Where could I save money on this home?",
      "expectedOperationId": "SAVINGS_OPPORTUNITIES"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Show my savings opportunities",
      "expectedOperationId": "SAVINGS_OPPORTUNITIES"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "How can we lower our home costs?",
      "expectedOperationId": "SAVINGS_OPPORTUNITIES"
    },
    {
      "mode": "MISSPELLED",
      "message": "What savings have I received recenlty?",
      "expectedOperationId": "SAVINGS_OPPORTUNITIES"
    }
  ],
  "operationCases": [
    {
      "operationId": "SAVINGS_OPPORTUNITIES",
      "expectedAdapter": {
        "id": "savings.opportunities",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me understand and lower my home expenses",
      "candidateSkillIds": [
        "savings",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "SAVINGS_OPPORTUNITIES",
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
      "message": "Invite my spouse to the household",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Guarantee eligibility for a rebate or financial benefit",
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
        "id": "savings.opportunities",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "savings.opportunities",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "household.invitation"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared-benefit-provider"
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
      "id": "savings.opportunities",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "household.invitation"
  ],
  "modelDisabledCase": {
    "message": "Where could I save money on this home?",
    "expectedOperationId": "SAVINGS_OPPORTUNITIES"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "SAVINGS_OPPORTUNITIES",
    "expectedOperationId": "SAVINGS_OPPORTUNITIES"
  },
  "handoffCase": {
    "suggestedNextSkillId": "refinance",
    "suggestedGoal": "analyze-refinance-opportunity",
    "reasonCodes": [
      "FINANCING_SAVINGS_NEEDS_ANALYSIS"
    ]
  },
  "performanceCase": {
    "message": "Where could I save money on this home?",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
