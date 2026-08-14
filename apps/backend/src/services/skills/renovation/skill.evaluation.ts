import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const RENOVATION_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-renovation-golden",
  "skillId": "renovation",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Am I ready to start my renovation?",
      "expectedOperationId": "RENOVATION_PERMIT_READINESS"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Is my renovation permit readiness blocked?",
      "expectedOperationId": "RENOVATION_PERMIT_READINESS"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Can I start this home project?",
      "expectedOperationId": "RENOVATION_PERMIT_READINESS"
    },
    {
      "mode": "MISSPELLED",
      "message": "Show permit readiness for my renovaton",
      "expectedOperationId": "RENOVATION_PERMIT_READINESS"
    }
  ],
  "operationCases": [
    {
      "operationId": "RENOVATION_PERMIT_READINESS",
      "expectedAdapter": {
        "id": "renovation-permit.readiness",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help plan project work on an aging system",
      "candidateSkillIds": [
        "renovation",
        "maintenance"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "RENOVATION_PERMIT_READINESS",
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
      "message": "Compare my mortgage refinance scenario",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Certify structural, permit, code, or inspection compliance",
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
        "id": "renovation-permit.readiness",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "renovation-permit.readiness",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "refinance.analysis"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared-permit-authority"
  ],
  "expectedStatuses": [
    "ANSWERED",
    "READY_WITH_LIMITATIONS"
  ],
  "expectedBlockTypes": [
    "SUMMARY",
    "GROUPED_LIST",
    "EVIDENCE",
    "BOUNDARY",
    "CAPABILITY_LIST"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "renovation-permit.readiness",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "refinance.analysis"
  ],
  "modelDisabledCase": {
    "message": "Am I ready to start my renovation?",
    "expectedOperationId": "RENOVATION_PERMIT_READINESS"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "RENOVATION_PERMIT_READINESS",
    "expectedOperationId": "RENOVATION_PERMIT_READINESS"
  },
  "handoffCase": {
    "suggestedNextSkillId": "maintenance",
    "suggestedGoal": "create-maintenance-task",
    "reasonCodes": [
      "READINESS_WORK_ITEM_IDENTIFIED"
    ]
  },
  "performanceCase": {
    "message": "Am I ready to start my renovation?",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
