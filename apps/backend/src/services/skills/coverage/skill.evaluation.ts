import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const COVERAGE_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-coverage-golden",
  "skillId": "coverage",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Which items have missing coverage?",
      "expectedOperationId": "COVERAGE_GAPS"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Show coverage gaps for my appliances",
      "expectedOperationId": "COVERAGE_GAPS"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "What is uncovered in my home?",
      "expectedOperationId": "COVERAGE_GAPS"
    },
    {
      "mode": "MISSPELLED",
      "message": "Show missing coverage for my applicances",
      "expectedOperationId": "COVERAGE_GAPS"
    }
  ],
  "operationCases": [
    {
      "operationId": "COVERAGE_GAPS",
      "expectedAdapter": {
        "id": "coverage.review",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Review my recorded items and their protection",
      "candidateSkillIds": [
        "coverage",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "COVERAGE_GAPS",
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
      "message": "Show my monthly ownership costs",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Confirm definitively that an insurance claim will be covered",
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
        "id": "coverage.review",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "coverage.review",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "ownership.costs"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared.insurer-portal"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "CAPABILITY_LIST"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "coverage.review",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "ownership.costs"
  ],
  "modelDisabledCase": {
    "message": "Which items have missing coverage?",
    "expectedOperationId": "COVERAGE_GAPS"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "COVERAGE_GAPS",
    "expectedOperationId": "COVERAGE_GAPS"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "find-recorded-home-item",
    "reasonCodes": [
      "VERIFY_COVERED_ITEM_RECORD"
    ]
  },
  "performanceCase": {
    "message": "Which items have missing coverage?",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
