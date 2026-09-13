import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const SELLER_PREP_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-seller-prep-golden",
  "skillId": "seller-prep",
  "skillVersion": "1.1.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Check my sale readiness",
      "expectedOperationId": "SELLER_PREP_CHECKLIST"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Is my home ready to list yet?",
      "expectedOperationId": "SELLER_PREP_CHECKLIST"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "What's on my seller prep checklist?",
      "expectedOperationId": "SELLER_PREP_CHECKLIST"
    },
    {
      "mode": "MISSPELLED",
      "message": "Check my sale readiness for this hom",
      "expectedOperationId": "SELLER_PREP_CHECKLIST"
    },
    {
      "mode": "EXACT",
      "message": "Waive the seller prep item for the roof repair",
      "expectedOperationId": "SELLER_PREP_ITEM_DECISION"
    },
    {
      "mode": "PARAPHRASED",
      "message": "I will pursue the gutter cleaning checklist item",
      "expectedOperationId": "SELLER_PREP_ITEM_DECISION"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Go ahead and waive that sale readiness item for me",
      "expectedOperationId": "SELLER_PREP_ITEM_DECISION"
    },
    {
      "mode": "MISSPELLED",
      "message": "Reopen the seller prep item I waivd",
      "expectedOperationId": "SELLER_PREP_ITEM_DECISION"
    }
  ],
  "operationCases": [
    {
      "operationId": "SELLER_PREP_CHECKLIST",
      "expectedAdapter": {
        "id": "seller-prep.checklist",
        "version": "1.0"
      }
    },
    {
      "operationId": "SELLER_PREP_ITEM_DECISION",
      "expectedAdapter": {
        "id": "seller-prep.item-decision",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me get ready to sell or decide if I should rent instead",
      "candidateSkillIds": [
        "seller-prep",
        "sell-hold-rent"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "SELLER_PREP_CHECKLIST",
      "allowed": true
    },
    {
      "consumer": "ASK",
      "operationId": "SELLER_PREP_ITEM_DECISION",
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
      "message": "Guarantee this home will sell above asking price",
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
        "id": "seller-prep.checklist",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    },
    {
      "dependencyType": "ADAPTER",
      "dependency": {
        "id": "seller-prep.item-decision",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "seller-prep.checklist",
      "version": "1.0"
    },
    {
      "id": "seller-prep.item-decision",
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
    "NOT_APPLICABLE",
    "NEEDS_ENTITY",
    "NEEDS_CONFIRMATION"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "WORKFLOW_PROGRESS",
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "seller-prep.checklist",
      "version": "1.0"
    },
    {
      "id": "seller-prep.item-decision",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "maintenance.status"
  ],
  "modelDisabledCase": {
    "message": "Check my sale readiness",
    "expectedOperationId": "SELLER_PREP_CHECKLIST"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "SELLER_PREP_CHECKLIST",
    "expectedOperationId": "SELLER_PREP_CHECKLIST"
  },
  "handoffCase": {
    "suggestedNextSkillId": "sell-hold-rent",
    "suggestedGoal": "analyze-sell-hold-rent",
    "reasonCodes": [
      "VERIFY_PROPERTY_CONTEXT_FOR_SCENARIO"
    ]
  },
  "performanceCase": {
    "message": "Check my sale readiness",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
