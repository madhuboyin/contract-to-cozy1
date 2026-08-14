import type { SkillEvaluationPackage } from '../skillEvaluationRegistry';
import { deepFreezeSkillPackage } from '../skillPackageFreeze';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';

export const CAPITAL_PLANNING_SKILL_EVALUATION = deepFreezeSkillPackage({
  "id": "skill-capital-planning-golden",
  "skillId": "capital-planning",
  "skillVersion": "1.0.0",
  "routingCases": [
    {
      "mode": "EXACT",
      "message": "Show my capital plan for major replacements",
      "expectedOperationId": "CAPITAL_RESERVE_PLAN"
    },
    {
      "mode": "PARAPHRASED",
      "message": "How much should I save for major replacements?",
      "expectedOperationId": "CAPITAL_RESERVE_PLAN"
    },
    {
      "mode": "COLLOQUIAL",
      "message": "Show my future home expenses",
      "expectedOperationId": "CAPITAL_RESERVE_PLAN"
    },
    {
      "mode": "MISSPELLED",
      "message": "Show my capital timeline for replacments",
      "expectedOperationId": "CAPITAL_RESERVE_PLAN"
    }
  ],
  "operationCases": [
    {
      "operationId": "CAPITAL_RESERVE_PLAN",
      "expectedAdapter": {
        "id": "capital-reserve.plan",
        "version": "1.0"
      }
    }
  ],
  "ambiguityCases": [
    {
      "message": "Help me plan whether to replace an aging system",
      "candidateSkillIds": [
        "capital-planning",
        "repair-replace"
      ],
      "expectedBehavior": "CLARIFY_OR_SAFE_BLOCK"
    }
  ],
  "policyCases": [
    {
      "consumer": "ASK",
      "operationId": "CAPITAL_RESERVE_PLAN",
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
      "message": "Show my current mortgage refinance options",
      "expectedBehavior": "DO_NOT_SELECT_SKILL"
    }
  ],
  "exclusionCases": [
    {
      "message": "Guarantee the exact future cost of every home replacement",
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
        "id": "capital-reserve.plan",
        "version": "1.0"
      },
      "expectedBehavior": "DEGRADED_OR_UNAVAILABLE"
    }
  ],
  "expectedAdapters": [
    {
      "id": "capital-reserve.plan",
      "version": "1.0"
    }
  ],
  "prohibitedAdapters": [
    "refinance.analysis"
  ],
  "expectedContextProviders": [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  "prohibitedContextProviders": [
    "undeclared.financial-account"
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
      "id": "capital-reserve.plan",
      "version": "1.0"
    }
  ],
  "prohibitedCanonicalCalls": [
    "refinance.analysis"
  ],
  "modelDisabledCase": {
    "message": "Show my capital plan for major replacements",
    "expectedOperationId": "CAPITAL_RESERVE_PLAN"
  },
  "continuationCase": {
    "message": "Continue that request",
    "sourceOperationId": "CAPITAL_RESERVE_PLAN",
    "expectedOperationId": "CAPITAL_RESERVE_PLAN"
  },
  "handoffCase": {
    "suggestedNextSkillId": "repair-replace",
    "suggestedGoal": "analyze-repair-or-replace",
    "reasonCodes": [
      "CAPITAL_ITEM_NEEDS_DECISION"
    ]
  },
  "performanceCase": {
    "message": "Show my capital plan for major replacements",
    "maxSkillCandidates": 10,
    "maxOperationCandidates": 3,
    "smokeCeilingMs": 100
  }
} satisfies SkillEvaluationPackage);
