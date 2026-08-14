import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const PROPERTY_TAX_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-property-tax-golden",
  "skillId": "property-tax",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Am I ready to appeal my property tax assessment?",
      "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
    },
    {
      "mode": "PARAPHRASED",
      "message": "Show evidence for a property tax appeal",
      "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Is my assessed value too high?",
      "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
    },
    {
      "mode": "MISSPELLED",
      "message": "Can I challange my property tax assessment appeal?",
      "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
    }
  ],
  "operationCases": [
    {
      "operationId": "PROPERTY_TAX_APPEAL_READINESS",
      "expectedAdapter": {
        "id": "property-tax.appeal-readiness",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Review my property value and financial options",
      "candidateSkillIds": [
        "property-tax",
        "refinance"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "PROPERTY_TAX_APPEAL_READINESS",
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
      "message": "Show my appliance inventory",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Guarantee that a tax authority will approve an appeal",
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
        "id": "property-tax.appeal-readiness",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "property-tax.appeal-readiness",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "inventory.lookup"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared-tax-authority"
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
    "BOUNDARY",
    "CAPABILITY_LIST"
  ],
  "expectedCanonicalCalls": [
    {
      "id": "property-tax.appeal-readiness",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "inventory.lookup"
  ],
  "modelDisabledCase": {
    "message": "Am I ready to appeal my property tax assessment?",
    "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "PROPERTY_TAX_APPEAL_READINESS",
    "expectedOperationId": "PROPERTY_TAX_APPEAL_READINESS"
  },
  "handoffCase": {
    "suggestedNextSkillId": "property-record",
    "suggestedGoal": "summarize-property-record",
    "reasonCodes": [
      "VERIFY_PROPERTY_FACTS_FOR_APPEAL"
    ]
  },
  "performanceCase": {
    "message": "Am I ready to appeal my property tax assessment?",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
