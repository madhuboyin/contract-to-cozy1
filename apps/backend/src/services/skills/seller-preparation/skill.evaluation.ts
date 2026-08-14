import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';

export const SELLER_PREPARATION_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-seller-preparation-golden",
  "skillId": "seller-preparation",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Help me prepare for selling my home",
      "expectedOperationId": "MAJOR_EVENT_ENTRY"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Give me a checklist for my home sale",
      "expectedOperationId": "MAJOR_EVENT_ENTRY"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "What should I do before moving out?",
      "expectedOperationId": "MAJOR_EVENT_ENTRY"
    },
    {
      "mode": "MISSPELLED",
      "message": "Help me prepare for my home sale and seling",
      "expectedOperationId": "MAJOR_EVENT_ENTRY"
    }
  ],
  "operationCases": [
    {
      "operationId": "MAJOR_EVENT_ENTRY",
      "expectedAdapter": {
        "id": "major-event.entry",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me decide and prepare to sell",
      "candidateSkillIds": [
        "seller-preparation",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "MAJOR_EVENT_ENTRY",
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
      "message": "Create a refinance rate monitor",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Guarantee an exact sale price or legal disclosure compliance",
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
        "id": "major-event.entry",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "major-event.entry",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "refinance.monitor"
  ],
  "expectedContextProviders": [],
  "prohibitedContextProviders": [
    "undeclared-broker"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "major-event.entry",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "refinance.monitor"
  ],
  "modelDisabledCase": {
    "message": "Help me prepare for selling my home",
    "expectedOperationId": "MAJOR_EVENT_ENTRY"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "MAJOR_EVENT_ENTRY",
    "expectedOperationId": "MAJOR_EVENT_ENTRY"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "VERIFY_HOME_RECORD_FOR_SALE"
    ]
  },
  "performanceCase": {
    "message": "Help me prepare for selling my home",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
