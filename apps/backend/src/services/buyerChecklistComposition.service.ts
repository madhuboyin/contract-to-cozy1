import { createHash } from 'node:crypto';
import type { PropertyContextSnapshot, PropertyFact } from '../modules/propertyContext/domain/contracts';

export const BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION = 'buyer-phase-checklists-v2';

type Applicability = 'UNKNOWN' | 'APPLICABLE' | 'NOT_APPLICABLE';
type Phase = 'OFFER_CONTRACT' | 'DUE_DILIGENCE' | 'CLOSING_PREP' | 'MOVE_IN';
type Priority = 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
type TaskType = 'ACTION' | 'MILESTONE_SUPPORT' | 'DECISION' | 'DOCUMENT' | 'SERVICE' | 'MOVE' | 'HOME_SETUP';
type EvidenceRequirement = 'NONE' | 'OPTIONAL' | 'REQUIRED';
type Section =
  | 'CONTRACT_CONTINGENCIES'
  | 'INSPECTION_DUE_DILIGENCE'
  | 'FINANCING_APPRAISAL'
  | 'TITLE_ESCROW_HOA'
  | 'INSURANCE'
  | 'FINAL_WALKTHROUGH'
  | 'CLOSING_DISCLOSURE_FUNDS'
  | 'CLOSING_DAY'
  | 'MOVE_POSSESSION';

export interface BuyerChecklistTemplate {
  actionKey: string;
  templateKey: string;
  title: string;
  description: string;
  whyMatters: string;
  completionCriteria: string;
  blockedGuidance: string;
  phase: Phase;
  priority: Priority;
  taskType: TaskType;
  checklistSection: Section;
  evidenceRequirement: EvidenceRequirement;
  required: boolean;
  blocking: boolean;
  anchorOffsetDays: number | null;
  ruleKey: string;
  evaluate: (context: PropertyContextSnapshot) => RuleDecision;
}

export interface RuleDecision {
  result: Applicability;
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
}

export interface ExistingBuyerChecklistTask {
  actionKey: string;
  applicability: Applicability;
  generationVersion?: string | null;
}

export interface ComposedBuyerChecklistItem extends Omit<BuyerChecklistTemplate, 'evaluate'> {
  templateVersion: string;
  applicability: RuleDecision & { basisHash: string; evaluatedAt: string };
}

const universal = (reasonCode: string): BuyerChecklistTemplate['evaluate'] => () => ({
  result: 'APPLICABLE',
  reasonCodes: [reasonCode],
  usedFactKeys: [],
  missingFactKeys: [],
  conflictedFactKeys: [],
});

function associationContextDecision(context: PropertyContextSnapshot): RuleDecision {
  const dwelling = context.facts['core.dwellingType'];
  const ownership = context.facts['core.ownershipForm'];
  if (dwelling?.state === 'CONFLICTED' || ownership?.state === 'CONFLICTED') {
    return { result: 'UNKNOWN', reasonCodes: ['PROPERTY_CONTEXT_CONFLICT'], usedFactKeys: [], missingFactKeys: [], conflictedFactKeys: [dwelling?.state === 'CONFLICTED' ? 'core.dwellingType' : null, ownership?.state === 'CONFLICTED' ? 'core.ownershipForm' : null].filter((key): key is string => Boolean(key)) };
  }
  const dwellingValue = dwelling?.state === 'KNOWN' ? dwelling.value : null;
  const ownershipValue = ownership?.state === 'KNOWN' ? ownership.value : null;
  if (dwellingValue === 'CONDO_UNIT' || ownershipValue === 'CONDOMINIUM' || ownershipValue === 'COOPERATIVE') {
    return { result: 'APPLICABLE', reasonCodes: ['ASSOCIATION_CONTEXT_CONFIRMED'], usedFactKeys: [dwellingValue === 'CONDO_UNIT' ? 'core.dwellingType' : 'core.ownershipForm'], missingFactKeys: [], conflictedFactKeys: [] };
  }
  if (['DETACHED_SINGLE_FAMILY', 'MANUFACTURED_HOME', 'OTHER'].includes(String(dwellingValue))) {
    return { result: 'NOT_APPLICABLE', reasonCodes: ['NON_ASSOCIATION_CONTEXT_CONFIRMED'], usedFactKeys: ['core.dwellingType'], missingFactKeys: [], conflictedFactKeys: [] };
  }
  if (ownershipValue) {
    return { result: 'NOT_APPLICABLE', reasonCodes: ['NON_ASSOCIATION_CONTEXT_CONFIRMED'], usedFactKeys: ['core.ownershipForm'], missingFactKeys: [], conflictedFactKeys: [] };
  }
  const missingFactKeys = dwellingValue ? ['core.ownershipForm'] : ['core.dwellingType'];
  return { result: 'UNKNOWN', reasonCodes: ['PROPERTY_DETAIL_REQUIRED'], usedFactKeys: dwellingValue ? ['core.dwellingType'] : [], missingFactKeys, conflictedFactKeys: [] };
}

function factDecision(
  context: PropertyContextSnapshot,
  factKeys: string[],
  decide: (values: Record<string, unknown>) => { result: Applicability; reasonCode: string },
): RuleDecision {
  const facts = factKeys.map((key) => context.facts[key]);
  const conflictedFactKeys = factKeys.filter((_, index) => facts[index]?.state === 'CONFLICTED');
  const missingFactKeys = factKeys.filter((_, index) => {
    const fact = facts[index];
    return !fact || fact.state === 'UNKNOWN' || fact.state === 'STALE' || fact.value === null;
  });
  if (conflictedFactKeys.length) {
    return {
      result: 'UNKNOWN',
      reasonCodes: ['PROPERTY_CONTEXT_CONFLICT'],
      usedFactKeys: [],
      missingFactKeys,
      conflictedFactKeys,
    };
  }
  if (missingFactKeys.length) {
    return {
      result: 'UNKNOWN',
      reasonCodes: ['PROPERTY_DETAIL_REQUIRED'],
      usedFactKeys: factKeys.filter((key) => !missingFactKeys.includes(key)),
      missingFactKeys,
      conflictedFactKeys: [],
    };
  }
  const values = Object.fromEntries(factKeys.map((key, index) => [key, facts[index]!.value]));
  const decision = decide(values);
  return {
    result: decision.result,
    reasonCodes: [decision.reasonCode],
    usedFactKeys: factKeys,
    missingFactKeys: [],
    conflictedFactKeys: [],
  };
}

const base = (
  section: Section,
  slug: string,
  values: Omit<BuyerChecklistTemplate, 'actionKey' | 'templateKey' | 'checklistSection'>,
): BuyerChecklistTemplate => ({
  actionKey: `buyer:phase:${slug}`,
  templateKey: `buyer:phase:${slug}`,
  checklistSection: section,
  ...values,
});

/** One versioned universal entry point for each required Section 14.15 checklist. */
export const BUYER_PHASE_CHECKLIST_TEMPLATES: readonly BuyerChecklistTemplate[] = [
  base('CONTRACT_CONTINGENCIES', 'contract-source-confirm', {
    title: 'Confirm the accepted contract and current deadlines',
    description: 'Record the accepted contract, material revisions, closing date, possession terms, and known contingency deadlines.',
    whyMatters: 'A confirmed current source keeps every downstream closing date tied to the terms you actually accepted.',
    completionCriteria: 'The current contract source and its material dates and terms have been confirmed.',
    blockedGuidance: 'Ask your agent or closing professional for the current signed contract and every material addendum.',
    phase: 'OFFER_CONTRACT', priority: 'NOW', taskType: 'DOCUMENT', evidenceRequirement: 'REQUIRED', required: true,
    blocking: true, anchorOffsetDays: -30, ruleKey: 'buyer.rule.universal.contract-source',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('INSPECTION_DUE_DILIGENCE', 'inspection-plan-confirm', {
    title: 'Confirm the inspection and due-diligence plan',
    description: 'Choose the inspection scope, timing, access, and any property-relevant specialist questions.',
    whyMatters: 'A scoped plan helps you resolve material findings before the recorded contingency deadline.',
    completionCriteria: 'Inspection timing, access, scope, and report-review owner are recorded.',
    blockedGuidance: 'Contact the inspector and buyer representative to confirm scope and deadline constraints.',
    phase: 'DUE_DILIGENCE', priority: 'NOW', taskType: 'SERVICE', evidenceRequirement: 'OPTIONAL', required: true,
    blocking: false, anchorOffsetDays: -21, ruleKey: 'buyer.rule.universal.inspection-plan',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('FINANCING_APPRAISAL', 'purchase-path-confirm', {
    title: 'Confirm cash or purchase-financing path',
    description: 'Record whether this purchase is cash or financed before lender and appraisal work is composed.',
    whyMatters: 'The purchase path prevents lender-only work from appearing for cash buyers.',
    completionCriteria: 'Cash or financing path is explicitly recorded and current.',
    blockedGuidance: 'Confirm the intended purchase path with the buyer and lender or closing professional.',
    phase: 'OFFER_CONTRACT', priority: 'NOW', taskType: 'DECISION', evidenceRequirement: 'NONE', required: true,
    blocking: false, anchorOffsetDays: -28, ruleKey: 'buyer.rule.universal.purchase-path',
    evaluate: universal('TRANSACTION_PATH_REQUIRED'),
  }),
  base('TITLE_ESCROW_HOA', 'title-closing-contact-confirm', {
    title: 'Confirm the title or closing professional',
    description: 'Record the attorney, title company, settlement agent, or escrow contact responsible for the transaction.',
    whyMatters: 'A known professional owner gives title questions and closing logistics a direct recovery path.',
    completionCriteria: 'The responsible title, attorney, settlement, or escrow contact is recorded.',
    blockedGuidance: 'Ask the buyer representative which professional owns title and settlement for this transaction.',
    phase: 'DUE_DILIGENCE', priority: 'SOON', taskType: 'ACTION', evidenceRequirement: 'NONE', required: true,
    blocking: false, anchorOffsetDays: -18, ruleKey: 'buyer.rule.universal.title-contact',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('INSURANCE', 'insurance-bind-confirm', {
    title: 'Prepare and confirm homeowners insurance',
    description: 'Review quote assumptions and record a bound policy with the required effective date.',
    whyMatters: 'Confirmed coverage readiness prevents an unresolved binder or effective date from surprising the closing plan.',
    completionCriteria: 'Policy selection, effective date, and proof-delivery status are recorded.',
    blockedGuidance: 'Contact the insurer or agent and the lender when applicable; do not infer that a quote is bound coverage.',
    phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'SERVICE', evidenceRequirement: 'REQUIRED', required: true,
    blocking: true, anchorOffsetDays: -7, ruleKey: 'buyer.rule.universal.insurance',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('FINAL_WALKTHROUGH', 'walkthrough-prepare', {
    title: 'Prepare the final walkthrough',
    description: 'Schedule the walkthrough and bring current contract terms, seller commitments, and unresolved findings into one review.',
    whyMatters: 'The walkthrough should test the buyer’s recorded agreement and open questions, not rely on memory.',
    completionCriteria: 'Walkthrough observations and every unresolved issue have been recorded and routed.',
    blockedGuidance: 'Coordinate timing and unresolved issues with the buyer representative or closing professional.',
    phase: 'CLOSING_PREP', priority: 'SOON', taskType: 'ACTION', evidenceRequirement: 'OPTIONAL', required: true,
    blocking: false, anchorOffsetDays: -1, ruleKey: 'buyer.rule.universal.walkthrough',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('CLOSING_DISCLOSURE_FUNDS', 'funds-readiness-confirm', {
    title: 'Confirm closing funds readiness and trusted instructions',
    description: 'Record the required funds method and independent verification of instructions without storing bank or wire credentials.',
    whyMatters: 'A trusted-channel check reduces wire-fraud risk and makes unresolved funds questions visible.',
    completionCriteria: 'Funds timing and method are known and instructions were independently verified through a trusted contact.',
    blockedGuidance: 'Call a known lender or settlement number; never rely on changed instructions received only by email.',
    phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'ACTION', evidenceRequirement: 'NONE', required: true,
    blocking: true, anchorOffsetDays: -3, ruleKey: 'buyer.rule.universal.funds-readiness',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('CLOSING_DAY', 'closing-day-confirm', {
    title: 'Prepare for and confirm the professional closing',
    description: 'Confirm appointment details, identification, unresolved blockers, records, access items, and explicit close completion.',
    whyMatters: 'Explicit confirmation keeps the homeowner transition separate from checklist assumptions.',
    completionCriteria: 'The professional closing is explicitly confirmed complete and final records are saved.',
    blockedGuidance: 'Route unresolved legal, funds, title, or signing questions to the responsible professional before the appointment.',
    phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'MILESTONE_SUPPORT', evidenceRequirement: 'REQUIRED', required: true,
    blocking: true, anchorOffsetDays: 0, ruleKey: 'buyer.rule.universal.closing-day',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
  base('MOVE_POSSESSION', 'move-possession-confirm', {
    title: 'Confirm move and possession readiness',
    description: 'Track possession separately from closing and coordinate access, utilities, mover, storage, cleaning, and essentials.',
    whyMatters: 'Possession can differ from legal closing; keeping both dates distinct prevents unsafe assumptions.',
    completionCriteria: 'Possession timing, first access, critical services, and delay fallback are recorded.',
    blockedGuidance: 'Confirm possession terms with the buyer representative or closing professional before scheduling irreversible steps.',
    phase: 'MOVE_IN', priority: 'SOON', taskType: 'MOVE', evidenceRequirement: 'NONE', required: false,
    blocking: false, anchorOffsetDays: 0, ruleKey: 'buyer.rule.universal.move-possession',
    evaluate: universal('UNIVERSAL_TRANSACTION_CORE'),
  }),
] as const;

export const BUYER_PROPERTY_CHECKLIST_TEMPLATES: readonly BuyerChecklistTemplate[] = [
  base('TITLE_ESCROW_HOA', 'association-records-review', {
    title: 'Review association records and buyer responsibilities',
    description: 'Collect governing documents, master insurance, reserves, assessments, fees, rules, and move requirements.',
    whyMatters: 'Recorded ownership and responsibility facts separate unit obligations from association-managed elements.',
    completionCriteria: 'Association records and open responsibility questions have been reviewed with the appropriate professional.',
    blockedGuidance: 'Request the current association package and record unresolved responsibility questions.',
    phase: 'DUE_DILIGENCE', priority: 'NOW', taskType: 'DOCUMENT', evidenceRequirement: 'REQUIRED', required: true,
    blocking: false, anchorOffsetDays: -14, ruleKey: 'buyer.rule.property.association-records',
    evaluate: associationContextDecision,
  }),
  base('INSPECTION_DUE_DILIGENCE', 'association-envelope-questions', {
    title: 'Confirm what the association maintains',
    description: 'Record visible roof/exterior concerns as association questions instead of buyer-owned component work.',
    whyMatters: 'Responsibility-aware guidance avoids representing common elements as buyer-owned systems.',
    completionCriteria: 'Visible concerns and association record questions are separated and assigned.',
    blockedGuidance: 'Confirm roof and exterior responsibility in governing documents or with the appropriate professional.',
    phase: 'DUE_DILIGENCE', priority: 'SOON', taskType: 'ACTION', evidenceRequirement: 'OPTIONAL', required: false,
    blocking: false, anchorOffsetDays: -12, ruleKey: 'buyer.rule.property.association-envelope',
    evaluate: (context) => {
      const association = associationContextDecision(context);
      if (association.result !== 'APPLICABLE') return association;
      return factDecision(context, ['responsibility.roof', 'responsibility.buildingExterior'], (values) => {
        const parties = [values['responsibility.roof'], values['responsibility.buildingExterior']];
        const applies = parties.some((party) => party === 'ASSOCIATION' || party === 'SHARED');
        return { result: applies ? 'APPLICABLE' : 'NOT_APPLICABLE', reasonCode: applies ? 'ASSOCIATION_ENVELOPE_RESPONSIBILITY' : 'PRIVATE_ENVELOPE_RESPONSIBILITY' };
      });
    },
  }),
  base('INSPECTION_DUE_DILIGENCE', 'pool-specialist-review', {
    title: 'Ask what the pool or spa inspection covers',
    description: 'Review visible condition, barrier, equipment, electrical, leak, permit, and specialist questions for the confirmed pool or spa.',
    whyMatters: 'Confirmed site features add focused questions without treating presence as a defect.',
    completionCriteria: 'Pool or spa questions and any chosen specialist review are dispositioned.',
    blockedGuidance: 'Ask the inspector which observations are in scope and whether a qualified specialist is appropriate.',
    phase: 'DUE_DILIGENCE', priority: 'SOON', taskType: 'SERVICE', evidenceRequirement: 'OPTIONAL', required: false,
    blocking: false, anchorOffsetDays: -12, ruleKey: 'buyer.rule.property.pool-spa',
    evaluate: (context) => factDecision(context, ['exterior.hasPoolOrSpa'], (values) => {
      const applies = values['exterior.hasPoolOrSpa'] === true;
      return { result: applies ? 'APPLICABLE' : 'NOT_APPLICABLE', reasonCode: applies ? 'POOL_SPA_CONFIRMED' : 'POOL_SPA_ABSENT' };
    }),
  }),
  base('INSPECTION_DUE_DILIGENCE', 'basement-inspection-focus', {
    title: 'Focus the inspection on basement moisture and safety',
    description: 'Add basement-specific questions about moisture, drainage, foundation surfaces, radon considerations, and finished-space safety when applicable.',
    whyMatters: 'A confirmed basement changes the most useful inspection questions without treating the feature itself as a problem.',
    completionCriteria: 'Basement-specific questions have been discussed with the inspector or intentionally set aside.',
    blockedGuidance: 'Ask the inspector what basement observations are included and whether any specialist review is appropriate.',
    phase: 'DUE_DILIGENCE', priority: 'SOON', taskType: 'ACTION', evidenceRequirement: 'OPTIONAL', required: false,
    blocking: false, anchorOffsetDays: -12, ruleKey: 'buyer.rule.property.basement',
    evaluate: (context) => factDecision(context, ['structure.basementConfiguration'], (values) => {
      const configuration = values['structure.basementConfiguration'];
      const applies = configuration === 'FINISHED' || configuration === 'UNFINISHED';
      return { result: applies ? 'APPLICABLE' : 'NOT_APPLICABLE', reasonCode: applies ? 'BASEMENT_CONFIRMED' : 'BASEMENT_ABSENT' };
    }),
  }),
  base('INSPECTION_DUE_DILIGENCE', 'age-records-questions', {
    title: 'Ask about older-home records and renovations',
    description: 'Use confirmed property age and location to prepare renovation, permit, materials, and major-system-history questions.',
    whyMatters: 'Age and location can focus record questions but are not proof of a defect, hazard, or professional finding.',
    completionCriteria: 'Age-relevant record questions have been reviewed or explicitly dispositioned.',
    blockedGuidance: 'Confirm the approximate year built and location source, then ask the inspector or appropriate professional about relevant records.',
    phase: 'DUE_DILIGENCE', priority: 'PLAN', taskType: 'ACTION', evidenceRequirement: 'OPTIONAL', required: false,
    blocking: false, anchorOffsetDays: -10, ruleKey: 'buyer.rule.property.age-records',
    evaluate: (context) => factDecision(context, ['core.yearBuilt', 'location.state'], (values) => {
      const yearBuilt = Number(values['core.yearBuilt']);
      const applies = Number.isInteger(yearBuilt) && yearBuilt <= 1980;
      return { result: applies ? 'APPLICABLE' : 'NOT_APPLICABLE', reasonCode: applies ? 'OLDER_PROPERTY_WITH_CONFIRMED_LOCATION' : 'AGE_RECORD_MODULE_NOT_TRIGGERED' };
    }),
  }),
  base('INSPECTION_DUE_DILIGENCE', 'hvac-history-questions', {
    title: 'Ask about heating and cooling service history',
    description: 'Use the recorded installation year to focus service-history, warranty, and inspection questions without inferring condition.',
    whyMatters: 'Source-qualified system age can focus useful records while remaining separate from a professional condition finding.',
    completionCriteria: 'HVAC age, service, warranty, and inspection questions have been dispositioned.',
    blockedGuidance: 'Confirm the installation-year source or choose Not sure; do not copy the property year into the system record.',
    phase: 'DUE_DILIGENCE', priority: 'PLAN', taskType: 'ACTION', evidenceRequirement: 'OPTIONAL', required: false,
    blocking: false, anchorOffsetDays: -10, ruleKey: 'buyer.rule.property.hvac-age',
    evaluate: (context) => factDecision(context, ['systems.hvacInstallYear'], (values) => {
      const installYear = Number(values['systems.hvacInstallYear']);
      const currentYear = new Date(context.generatedAt).getUTCFullYear();
      const applies = Number.isInteger(installYear) && currentYear - installYear >= 15;
      return { result: applies ? 'APPLICABLE' : 'NOT_APPLICABLE', reasonCode: applies ? 'SOURCE_QUALIFIED_HVAC_AGE' : 'HVAC_AGE_MODULE_NOT_TRIGGERED' };
    }),
  }),
] as const;

export const BUYER_CHECKLIST_TEMPLATES = [
  ...BUYER_PHASE_CHECKLIST_TEMPLATES,
  ...BUYER_PROPERTY_CHECKLIST_TEMPLATES,
] as const;

type PersonalizationQuestionCopy = {
  prompt: string;
  whyWeAsk: string;
  impactRank: number;
  answerKind: 'SINGLE_SELECT' | 'YEAR';
  options?: Array<{ label: string; value: unknown }>;
};

const QUESTION_COPY: Record<string, PersonalizationQuestionCopy> = {
  'core.dwellingType': {
    prompt: 'What type of home are you buying?',
    whyWeAsk: 'This tells us whether to focus on the whole building or on the parts inside your unit.',
    impactRank: 100,
    answerKind: 'SINGLE_SELECT',
    options: [
      { label: 'Detached house', value: 'DETACHED_SINGLE_FAMILY' },
      { label: 'Townhouse or attached home', value: 'TOWNHOUSE' },
      { label: 'Condo', value: 'CONDO_UNIT' },
      { label: 'Two- or multi-family home', value: 'MULTI_FAMILY' },
      { label: 'Manufactured home', value: 'MANUFACTURED_HOME' },
      { label: 'I’m not sure', value: 'UNKNOWN' },
    ],
  },
  'core.ownershipForm': {
    prompt: 'Will a condo, co-op, or building association manage shared parts of the property?',
    whyWeAsk: 'If yes, we’ll add the documents and responsibility questions that help you understand what the association—not you—maintains.',
    impactRank: 90,
    answerKind: 'SINGLE_SELECT',
    options: [
      { label: 'Yes, a condo association', value: 'CONDOMINIUM' },
      { label: 'Yes, a co-op', value: 'COOPERATIVE' },
      { label: 'No shared building association', value: 'FEE_SIMPLE' },
      { label: 'I’m not sure', value: 'UNKNOWN' },
    ],
  },
  'core.yearBuilt': {
    prompt: 'About when was the home built?',
    whyWeAsk: 'This adds age-relevant system, renovation, and permit questions without assuming anything is wrong.',
    impactRank: 80,
    answerKind: 'YEAR',
  },
  'location.state': {
    prompt: 'Can you confirm the property location?',
    whyWeAsk: 'Confirmed location helps tailor local record questions. Regional context is not proof of a property-specific problem.',
    impactRank: 70,
    answerKind: 'SINGLE_SELECT',
  },
  'responsibility.roof': {
    prompt: 'Does the association maintain the roof?',
    whyWeAsk: 'This keeps roof questions with the right person and avoids treating shared building work as your personal repair.',
    impactRank: 65,
    answerKind: 'SINGLE_SELECT',
    options: [{ label: 'Yes', value: 'ASSOCIATION' }, { label: 'No, the homeowner does', value: 'OWNER' }, { label: 'Responsibility is shared', value: 'SHARED' }, { label: 'I’m not sure', value: 'UNKNOWN' }],
  },
  'responsibility.buildingExterior': {
    prompt: 'Does the association maintain the outside of the building?',
    whyWeAsk: 'This separates what your inspector should observe from what the association is expected to maintain.',
    impactRank: 64,
    answerKind: 'SINGLE_SELECT',
    options: [{ label: 'Yes', value: 'ASSOCIATION' }, { label: 'No, the homeowner does', value: 'OWNER' }, { label: 'Responsibility is shared', value: 'SHARED' }, { label: 'I’m not sure', value: 'UNKNOWN' }],
  },
  'exterior.hasPoolOrSpa': {
    prompt: 'Does the property have a pool or spa?',
    whyWeAsk: 'If yes, we’ll add focused safety, equipment, leak, permit, and specialist questions.',
    impactRank: 75,
    answerKind: 'SINGLE_SELECT',
    options: [{ label: 'Yes', value: true }, { label: 'No', value: false }, { label: 'I’m not sure', value: null }],
  },
  'structure.basementConfiguration': {
    prompt: 'Does the home have a basement?',
    whyWeAsk: 'A basement adds useful moisture, drainage, radon, foundation, and finished-space questions.',
    impactRank: 76,
    answerKind: 'SINGLE_SELECT',
    options: [{ label: 'No basement', value: 'NONE' }, { label: 'Unfinished basement', value: 'UNFINISHED' }, { label: 'Finished basement', value: 'FINISHED' }, { label: 'I’m not sure', value: 'UNKNOWN' }],
  },
  'systems.hvacInstallYear': {
    prompt: 'Do you know when the heating and cooling system was installed?',
    whyWeAsk: 'System age helps focus service and warranty questions without assuming replacement or poor condition.',
    impactRank: 40,
    answerKind: 'YEAR',
  },
};

function basisHash(contextVersion: string, template: BuyerChecklistTemplate, decision: RuleDecision): string {
  return createHash('sha256').update(JSON.stringify({
    contextVersion,
    templateVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
    templateKey: template.templateKey,
    decision,
  })).digest('hex');
}

export function composeBuyerChecklist(
  context: PropertyContextSnapshot,
  existingTasks: ExistingBuyerChecklistTask[] = [],
) {
  const evaluatedAt = context.generatedAt;
  const items: ComposedBuyerChecklistItem[] = BUYER_CHECKLIST_TEMPLATES.map((template) => {
    const decision = template.evaluate(context);
    const { evaluate: _evaluate, ...definition } = template;
    return {
      ...definition,
      templateVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
      applicability: {
        ...decision,
        basisHash: basisHash(context.contextVersion, template, decision),
        evaluatedAt,
      },
    };
  });
  const current = new Map(existingTasks.map((task) => [task.actionKey, task]));
  const applicable = items.filter((item) => item.applicability.result === 'APPLICABLE');
  const managedExisting = existingTasks.filter((task) => task.generationVersion?.startsWith('buyer-phase-checklists-'));
  const addedItems = applicable.filter((item) => !current.has(item.actionKey));
  const removedItems = managedExisting.filter((task) => {
    const next = items.find((item) => item.actionKey === task.actionKey);
    return !next || next.applicability.result !== 'APPLICABLE';
  });
  const unchangedItems = applicable.filter((item) => current.has(item.actionKey));
  const questionMap = new Map<string, {
    factKey: string;
    prompt: string;
    whyWeAsk: string;
    correctionPath: string | null;
    affectedTemplateKeys: string[];
    impactRank: number;
    answerKind: 'SINGLE_SELECT' | 'YEAR';
    options?: Array<{ label: string; value: unknown }>;
  }>();
  for (const item of items.filter((candidate) => candidate.applicability.result === 'UNKNOWN')) {
    for (const factKey of [...item.applicability.missingFactKeys, ...item.applicability.conflictedFactKeys]) {
      const copy = QUESTION_COPY[factKey];
      if (!copy) continue;
      const existing = questionMap.get(factKey);
      const fact = context.facts[factKey] as PropertyFact | undefined;
      // A buyer who explicitly chose “I’m not sure” has answered the setup
      // question. Keep the fact unknown for decision safety, but do not trap
      // them in a repeated prompt on every visit.
      if (fact?.state === 'UNKNOWN' && fact.source === 'USER_REPORTED') continue;
      questionMap.set(factKey, {
        factKey,
        ...copy,
        correctionPath: fact?.correctionPath ?? null,
        affectedTemplateKeys: [...new Set([...(existing?.affectedTemplateKeys ?? []), item.templateKey])],
      });
    }
  }
  const knownFactSpecs: Array<{ factKey: string; label: string; format: (value: unknown) => string }> = [
    { factKey: 'core.dwellingType', label: 'Home type', format: (value) => String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) },
    { factKey: 'core.yearBuilt', label: 'Built', format: (value) => `${value} · about ${Math.max(0, new Date(evaluatedAt).getUTCFullYear() - Number(value))} years old` },
    { factKey: 'core.bedrooms', label: 'Bedrooms', format: String },
    { factKey: 'core.bathrooms', label: 'Bathrooms', format: String },
    { factKey: 'structure.basementConfiguration', label: 'Basement', format: (value) => value === 'NONE' ? 'No basement' : `${String(value).toLowerCase().replace(/_/g, ' ')} basement` },
    { factKey: 'exterior.hasPoolOrSpa', label: 'Pool or spa', format: (value) => value === true ? 'Yes' : 'No' },
  ];
  const knownFacts = knownFactSpecs.flatMap((spec) => {
    const fact = context.facts[spec.factKey];
    return fact?.state === 'KNOWN' && fact.value !== null && fact.value !== 'UNKNOWN'
      ? [{ factKey: spec.factKey, label: spec.label, value: spec.format(fact.value) }]
      : [];
  });
  const questions = [...questionMap.values()].sort((left, right) => right.impactRank - left.impactRank);
  const personalizedItems = applicable
    .filter((item) => item.ruleKey.startsWith('buyer.rule.property.'))
    .map((item) => ({ actionKey: item.actionKey, title: item.title, whyMatters: item.whyMatters }));
  return {
    templateVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
    contextVersion: context.contextVersion,
    evaluatedAt,
    items,
    knownFacts,
    questions,
    personalizedItems,
    setupStatus: questions.length === 0 ? 'PERSONALIZED' as const : 'NEEDS_INPUT' as const,
    delta: {
      added: addedItems.length,
      removed: removedItems.length,
      unchanged: unchangedItems.length,
      addedItems: addedItems.map((item) => ({ actionKey: item.actionKey, title: item.title, reasonCodes: item.applicability.reasonCodes })),
      removedItems: removedItems.map((item) => ({
        actionKey: item.actionKey,
        title: items.find((candidate) => candidate.actionKey === item.actionKey)?.title ?? null,
      })),
    },
  };
}

export type BuyerChecklistComposition = ReturnType<typeof composeBuyerChecklist>;
