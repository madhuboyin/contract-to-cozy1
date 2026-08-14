import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SELL_HOLD_RENT_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-sell-hold-rent-golden",
  "skillId": "sell-hold-rent",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Should I sell, hold, or rent this home?",
      "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Compare selling versus renting out my property",
      "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Would I be better off holding or selling?",
      "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
    },
    {
      "mode": "MISSPELLED",
      "message": "Should I sell or rent this propertie?",
      "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
    }
  ],
  "operationCases": [
    {
      "operationId": "SELL_HOLD_RENT_ANALYSIS",
      "expectedAdapter": {
        "id": "sale-case.analysis",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me decide whether to sell and prepare the home",
      "candidateSkillIds": [
        "sell-hold-rent",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "SELL_HOLD_RENT_ANALYSIS",
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
      "message": "Show my maintenance tasks",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Guarantee future rent, appreciation, or sale proceeds",
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
        "id": "sale-case.analysis",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "sale-case.analysis",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "maintenance.status"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared-marketplace"
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
      "id": "sale-case.analysis",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "maintenance.status"
  ],
  "modelDisabledCase": {
    "message": "Should I sell, hold, or rent this home?",
    "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "SELL_HOLD_RENT_ANALYSIS",
    "expectedOperationId": "SELL_HOLD_RENT_ANALYSIS"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "VERIFY_PROPERTY_CONTEXT_FOR_SCENARIO"
    ]
  },
  "performanceCase": {
    "message": "Should I sell, hold, or rent this home?",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
