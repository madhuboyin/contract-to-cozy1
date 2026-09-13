import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

export const DOCUMENTS_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-documents-golden",
  "skillId": "documents",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Show my documents",
      "expectedOperationId": "DOCUMENT_LOOKUP"
    },
    {
      "mode": "PARAPHRASED",
      "message": "What documents do I have for this property?",
      "expectedOperationId": "DOCUMENT_LOOKUP"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "How many documents do I have on file?",
      "expectedOperationId": "DOCUMENT_LOOKUP"
    },
    {
      "mode": "MISSPELLED",
      "message": "Show my documents plese",
      "expectedOperationId": "DOCUMENT_LOOKUP"
    }
  ],
  "operationCases": [
    {
      "operationId": "DOCUMENT_LOOKUP",
      "expectedAdapter": {
        "id": "documents.lookup",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Review my recorded items and their protection",
      "candidateSkillIds": [
        "documents",
        "property-record"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "DOCUMENT_LOOKUP",
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
      "message": "Which facts extracted from my uploaded files are waiting on me?",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    },
    {
      "message": "Show my appliance inventory",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Confirm this reviewed document extraction",
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
        "id": "documents.lookup",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "documents.lookup",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "document-promotion.review"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER, PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared.document-scanner"
  ],
  "expectedStatuses": [
    "ANSWERED"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "EMPTY_STATE",
    "CAPABILITY_LIST",
    "BOUNDARY"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "documents.lookup",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "document-promotion.review"
  ],
  "modelDisabledCase": {
    "message": "Show my documents",
    "expectedOperationId": "DOCUMENT_LOOKUP"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "DOCUMENT_LOOKUP",
    "expectedOperationId": "DOCUMENT_LOOKUP"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "VERIFY_RECORDED_HOME_CONTEXT"
    ]
  },
  "performanceCase": {
    "message": "Show my documents",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
