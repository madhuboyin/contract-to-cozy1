import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';

export const QUOTE_COMPARISON_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-quote-comparison-golden",
  "skillId": "quote-comparison",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Create a quote comparison workspace",
      "expectedOperationId": "QUOTE_COMPARISON_CREATE"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Compare my contractor bids",
      "expectedOperationId": "QUOTE_COMPARISON_REVIEW"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Which estimate is best?",
      "expectedOperationId": "QUOTE_COMPARISON_REVIEW"
    },
    {
      "mode": "MISSPELLED",
      "message": "Review my quotes and estimats",
      "expectedOperationId": "QUOTE_COMPARISON_REVIEW"
    }
  ],
  "operationCases": [
    {
      "operationId": "QUOTE_COMPARISON_CREATE",
      "expectedAdapter": {
        "id": "quote-comparison.create",
        "version": "1.0"
      }
    },
    {
      "operationId": "QUOTE_COMPARISON_REVIEW",
      "expectedAdapter": {
        "id": "quote-comparison.review",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me with my quote comparison",
      "candidateOperationIds": [
        "QUOTE_COMPARISON_CREATE",
        "QUOTE_COMPARISON_REVIEW"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "QUOTE_COMPARISON_CREATE",
      "allowed": true
    },
    {
      "consumer": "ASK",
      "operationId": "QUOTE_COMPARISON_REVIEW",
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
      "message": "Show my property tax assessment",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Select, contact, or hire a contractor without homeowner confirmation",
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
        "id": "quote-comparison.create",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "quote-comparison.create",
      "version": "1.0"
    },
    {
      "id": "quote-comparison.review",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "property-tax.appeal-readiness"
  ],
  "expectedContextProviders": [],
  "prohibitedContextProviders": [
    "undeclared-contractor-marketplace"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS",
    "NEEDS_CONFIRMATION",
    "COMPLETED"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "WORKFLOW_PROGRESS",
    "CAPABILITY_LIST",
    "GROUPED_LIST",
    "TABLE",
    "EVIDENCE",
    "BOUNDARY"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "quote-comparison.create",
      "version": "1.0"
    },
    {
      "id": "quote-comparison.review",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "property-tax.appeal-readiness"
  ],
  "modelDisabledCase": {
    "message": "Create a quote comparison workspace",
    "expectedOperationId": "QUOTE_COMPARISON_CREATE"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "QUOTE_COMPARISON_CREATE",
    "expectedOperationId": "QUOTE_COMPARISON_CREATE"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "VERIFY_PROJECT_CONTEXT_FOR_QUOTES"
    ]
  },
  "performanceCase": {
    "message": "Create a quote comparison workspace",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
