// Proposed data-point catalogue (reliability FRD FR-DATA-1..5, D11, D12, D13). The Prisma schema says what exists; this file says what the homeowner may be shown and
// how they ask for it. FAIL CLOSED: a field not listed here cannot be read through DATA_POINT_READ, whatever the schema contains. The catalogue holds 33 PROPOSED data
// points (inventory 14, warranties 5, insurance 7, maintenance 7) plus 14 reserve and ownership-cost points (catalogue version 2). The owner approved the field floors and the
// domain split for exactly these 71 ids (33 at version 1, 14 at version 2, 12 at version 3, 4 at version 4, 4 at version 5, 4 at version 6; all 2026-11-12); see APPROVED_DATA_POINT_IDS below. Any other id, or any change of a floor, needs a new approval and a new version.
export type DataPointFamily = 'text' | 'date' | 'money' | 'dollars' | 'enum' | 'tags' | 'flag' | 'percent' | 'number';
export type DataPointEntity = 'InventoryItem' | 'Warranty' | 'InsurancePolicy' | 'PropertyMaintenanceTask' | 'HomeReserveFund' | 'PropertyTaxBillRecord' | 'PropertyTaxAssessmentRecord' | 'PropertySalePrepProfile' | 'PropertySaleCase' | 'HomeBuyerChecklist' | 'PropertyRecord' | 'HomeBuyerTask' | 'BuyerJourneyMilestone' | 'SaleReadinessItem' | 'PropertyRecordVersion' | 'Claim' | 'ClaimChecklistItem' | 'ClaimTimelineEvent' | 'ClaimDocument';
export type DataPointDomain = 'appliances-inventory' | 'warranties' | 'insurance' | 'maintenance' | 'reserve-ownership-costs' | 'seller-prep' | 'buyer' | 'documents-records' | 'claims';
export type AudienceFloor = 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
export interface DataPointDefinition {
  /** Stable id used by plans, fixtures and tests (never a column name). */
  readonly id: string;
  readonly domain: DataPointDomain;
  readonly entity: DataPointEntity;
  /** The Prisma column the value is read from. */
  readonly field: string;
  readonly family: DataPointFamily;
  /** The question this data point answers, in homeowner words (FR-REC-3). */
  readonly label: string;
  /** Lower-case alias phrases a homeowner uses for it. Matched on whole words after routing normalisation. */
  readonly aliases: readonly string[];
  /** How the value is phrased when present. */
  readonly sentence: string;
  readonly sensitivity: 'HOME' | 'FINANCIAL';
  /** The lowest household role that may be shown this data point. Explicit for every point (a point with no entry in FIELD_AUDIENCE fails the module load), enforced by the reader and re-checked on composite replay. */
  readonly audience: AudienceFloor;
  /** Words that must appear in the message for a point of a non-inventory entity ("warranty", "policy", "task"), so a bare "expires" never picks an entity. */
  readonly cues?: readonly string[];
  /** True when the cues are compound phrases ("buyer task") that must take precedence over a generic cue ("task") that is also present. The bare generic word never selects this point. */
  readonly compoundCue?: boolean;
  /** Child entities whose cue contains the parent's cue: the matched cue's length also counts, so "claim timeline event" beats "claim". */
  readonly specificCue?: boolean;
}

/** Per-point audience floors (review 2026-11-11). Money, serial numbers, free-form coverage text and tags are not shown to viewers; plain item, date and status facts are. Floors approved by the owner 2026-11-12 for catalogue version 1. */
const FIELD_AUDIENCE: Readonly<Record<string, AudienceFloor>> = Object.freeze({
  'item.brand': 'VIEWER', 'item.manufacturer': 'VIEWER', 'item.model': 'VIEWER', 'item.serial': 'CONTRIBUTOR', 'item.installedOn': 'VIEWER', 'item.purchasedOn': 'VIEWER',
  'item.lastServicedOn': 'VIEWER', 'item.expectedExpiryDate': 'VIEWER', 'item.condition': 'VIEWER', 'item.category': 'VIEWER', 'item.efficiencyRating': 'VIEWER',
  'item.purchaseCost': 'CONTRIBUTOR', 'item.replacementCost': 'CONTRIBUTOR', 'item.tags': 'CONTRIBUTOR',
  'warranty.expiryDate': 'VIEWER', 'warranty.startDate': 'VIEWER', 'warranty.provider': 'VIEWER', 'warranty.coverage': 'CONTRIBUTOR', 'warranty.cost': 'CONTRIBUTOR',
  'policy.carrier': 'VIEWER', 'policy.expiryDate': 'VIEWER', 'policy.startDate': 'VIEWER', 'policy.deductible': 'CONTRIBUTOR', 'policy.premium': 'CONTRIBUTOR',
  'policy.coverageType': 'VIEWER', 'policy.personalPropertyLimit': 'CONTRIBUTOR',
  'task.nextDueDate': 'VIEWER', 'task.lastCompletedDate': 'VIEWER', 'task.status': 'VIEWER', 'task.priority': 'VIEWER', 'task.frequency': 'VIEWER',
  'task.estimatedCost': 'CONTRIBUTOR', 'task.actualCost': 'CONTRIBUTOR',
  // Catalogue version 2 (owner-approved 2026-11-12): money and tax figures contributor and up, plain dates/status/rate viewer.
  'reserve.balance': 'CONTRIBUTOR', 'reserve.monthlyContribution': 'CONTRIBUTOR', 'reserve.shortfall': 'CONTRIBUTOR', 'reserve.posture': 'VIEWER', 'reserve.horizonYears': 'VIEWER', 'reserve.lastRecalculated': 'VIEWER',
  'taxBill.amount': 'CONTRIBUTOR', 'taxBill.effectiveRate': 'VIEWER', 'taxBill.issueDate': 'VIEWER',
  'taxAssessment.totalAssessedValue': 'CONTRIBUTOR', 'taxAssessment.taxableValue': 'CONTRIBUTOR', 'taxAssessment.landValue': 'CONTRIBUTOR', 'taxAssessment.improvementValue': 'CONTRIBUTOR', 'taxAssessment.assessmentDate': 'VIEWER',
  // Catalogue version 4 (owner policy 2026-11-12): ordinary journey status, stage and dates are shared household information (viewers read, contributors change), matching the direct
  // buyer/seller operations. Amounts, rates, financing/contract terms and title details stay OWNER and are not catalogued. Record points follow the record's own visibility (see readDataPoint).
  'salePrep.paint': 'VIEWER', 'salePrep.curbAppeal': 'VIEWER', 'salePrep.flooring': 'VIEWER', 'salePrep.kitchen': 'VIEWER', 'salePrep.bathroom': 'VIEWER', 'salePrep.staging': 'VIEWER',
  'saleCase.status': 'VIEWER', 'saleCase.targetListDate': 'VIEWER', 'saleCase.targetCloseDate': 'VIEWER',
  'buyer.stage': 'VIEWER', 'buyer.targetCloseDate': 'VIEWER', 'buyer.moveInDate': 'VIEWER',
  'record.type': 'VIEWER', 'record.verification': 'VIEWER', 'record.effectiveTo': 'VIEWER', 'record.retainUntil': 'OWNER',
  // Catalogue version 5 (owner approval 2026-11-12): first relation read, buyer tasks through the property's checklist. Structured fields only.
  'buyerTask.status': 'VIEWER', 'buyerTask.dueDate': 'VIEWER', 'buyerTask.completedDate': 'VIEWER', 'buyerTask.priority': 'VIEWER',
  // Catalogue version 6 (owner approval 2026-11-12): buyer journey milestones through the same checklist relation. Structured fields only.
  'buyerMilestone.status': 'VIEWER', 'buyerMilestone.dueDate': 'VIEWER', 'buyerMilestone.completedDate': 'VIEWER', 'buyerMilestone.type': 'VIEWER',
  // Catalogue version 7 (owner approval 2026-11-13): sale-readiness items through the property's sale case. Structured fields only.
  'saleItem.status': 'VIEWER', 'saleItem.category': 'VIEWER', 'saleItem.requirementClass': 'VIEWER', 'saleItem.dueDate': 'VIEWER',
  // Catalogue version 8 (built 2026-11-13; ids ratified by the owner AFTER implementation, 2026-11-13): home record versions, reached only through a NAMED record that is visible to the caller's role. Metadata only.
  'recordVersion.number': 'VIEWER', 'recordVersion.uploadedDate': 'VIEWER', 'recordVersion.scanStatus': 'VIEWER', 'recordVersion.integrityStatus': 'VIEWER',
  // Catalogue version 9 (built 2026-11-13; ids ratified by the owner AFTER implementation, 2026-11-13; floors per the owner's 2026-11-12 relation order: claim status/dates CONTRIBUTOR, amounts/identifiers OWNER).
  'claim.status': 'CONTRIBUTOR', 'claim.type': 'CONTRIBUTOR', 'claim.incidentDate': 'CONTRIBUTOR', 'claim.openedDate': 'CONTRIBUTOR', 'claim.submittedDate': 'CONTRIBUTOR', 'claim.closedDate': 'CONTRIBUTOR', 'claim.nextFollowUp': 'CONTRIBUTOR',
  'claim.deductible': 'OWNER', 'claim.estimatedLoss': 'OWNER', 'claim.settlement': 'OWNER', 'claim.claimNumber': 'OWNER',
  // Catalogue version 10 (built 2026-11-13 on the owner's suggested claim-children policy; exact ids proposed by the implementation, ratified by the owner after implementation on 2026-11-13): claim children, reached only through a NAMED claim.
  'claimChecklist.status': 'CONTRIBUTOR', 'claimChecklist.required': 'CONTRIBUTOR', 'claimChecklist.completedDate': 'CONTRIBUTOR',
  'claimEvent.occurredDate': 'CONTRIBUTOR', 'claimDocument.attachedDate': 'CONTRIBUTOR',
});
const d = (x: Omit<DataPointDefinition, 'audience'>): DataPointDefinition => {
  const audience = FIELD_AUDIENCE[x.id];
  if (!audience) throw new Error(`data point ${x.id} has no audience floor; the catalogue fails closed`);
  return { ...x, audience };
};
const ROLE_RANK: Readonly<Record<string, number>> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };
/** Whether a household role may be shown a data point. An unknown role is refused. */
export const roleMayRead = (role: string, point: DataPointDefinition): boolean => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[point.audience];
const INVENTORY_POINTS: readonly DataPointDefinition[] = [
  d({ id: 'item.brand', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'brand', family: 'text', label: 'The brand', aliases: ['brand', 'maker', 'who makes'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.manufacturer', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'manufacturer', family: 'text', label: 'The manufacturer', aliases: ['manufacturer', 'manufactured by'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.model', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'modelNumber', family: 'text', label: 'The model number', aliases: ['model number', 'model no', 'model'], sentence: 'has model number', sensitivity: 'HOME' }),
  d({ id: 'item.serial', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'serialNumber', family: 'text', label: 'The serial number', aliases: ['serial number', 'serial no', 'serial'], sentence: 'has serial number', sensitivity: 'HOME' }),
  d({ id: 'item.installedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'installedOn', family: 'date', label: 'When it was installed', aliases: ['installed', 'installation date', 'install date'], sentence: 'was installed', sensitivity: 'HOME' }),
  d({ id: 'item.purchasedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchasedOn', family: 'date', label: 'When it was purchased', aliases: ['purchased', 'bought', 'purchase date', 'date of purchase'], sentence: 'was purchased', sensitivity: 'HOME' }),
  d({ id: 'item.lastServicedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'lastServicedOn', family: 'date', label: 'When it was last serviced', aliases: ['last serviced', 'last service', 'last service date', 'serviced last'], sentence: 'was last serviced', sensitivity: 'HOME' }),
  d({ id: 'item.expectedExpiryDate', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'expectedExpiryDate', family: 'date', label: 'When it is expected to wear out', aliases: ['expected to last', 'end of life', 'expected expiry', 'life expectancy', 'wear out'], sentence: 'is expected to reach the end of its life', sensitivity: 'HOME' }),
  d({ id: 'item.condition', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'condition', family: 'enum', label: 'Its recorded condition', aliases: ['condition'], sentence: 'is recorded in', sensitivity: 'HOME' }),
  d({ id: 'item.category', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'category', family: 'enum', label: 'Its category', aliases: ['category', 'what type', 'what kind'], sentence: 'is filed under', sensitivity: 'HOME' }),
  d({ id: 'item.efficiencyRating', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'efficiencyRating', family: 'text', label: 'Its efficiency rating', aliases: ['efficiency rating', 'efficiency', 'energy rating', 'energy star'], sentence: 'has an efficiency rating of', sensitivity: 'HOME' }),
  d({ id: 'item.purchaseCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchaseCostCents', family: 'money', label: 'What it cost when bought', aliases: ['purchase price', 'purchase cost', 'paid for', 'did i pay', 'cost when i bought', 'bought for', 'price paid'], sentence: 'was bought for', sensitivity: 'FINANCIAL' }),
  d({ id: 'item.replacementCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'replacementCostCents', family: 'money', label: 'The recorded replacement cost', aliases: ['recorded replacement cost', 'replacement value'], sentence: 'has a recorded replacement cost of', sensitivity: 'FINANCIAL' }),
  // item.notes is deliberately NOT catalogued: free-form text can hold anything (review 2026-11-11).
  d({ id: 'item.tags', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'tags', family: 'tags', label: 'Its tags', aliases: ['tags', 'tagged'], sentence: 'is tagged', sensitivity: 'HOME' }),
];

const W = ['warranty', 'warranties', 'warrantied'];
const P = ['policy', 'policies', 'insurance', 'insurer', 'insured'];
const T = ['task', 'tasks', 'chore', 'reminder', 'maintenance'];
const w = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'warranties', entity: 'Warranty', cues: W });
const pol = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'insurance', entity: 'InsurancePolicy', cues: P });
const mt = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'maintenance', entity: 'PropertyMaintenanceTask', cues: T });
const OTHER_DOMAINS: readonly DataPointDefinition[] = [
  w({ id: 'warranty.expiryDate', field: 'expiryDate', family: 'date', label: 'When the warranty expires', aliases: ['expire', 'expires', 'expiration', 'expiry', 'expiry date', 'run out', 'runs out', 'good until', 'end'], sentence: 'expires', sensitivity: 'HOME' }),
  w({ id: 'warranty.startDate', field: 'startDate', family: 'date', label: 'When the warranty started', aliases: ['start', 'starts', 'started', 'begin', 'began', 'start date', 'effective'], sentence: 'started', sensitivity: 'HOME' }),
  w({ id: 'warranty.provider', field: 'providerName', family: 'text', label: 'Who the warranty is with', aliases: ['provider', 'who is it with', 'who provides', 'company', 'who is the warranty with', 'warranty with', 'who covers'], sentence: 'is with', sensitivity: 'HOME' }),
  w({ id: 'warranty.coverage', field: 'coverageDetails', family: 'text', label: 'What the warranty covers', aliases: ['cover', 'covers', 'covered', 'coverage', 'coverage details', 'what does'], sentence: 'has these coverage notes:', sensitivity: 'HOME' }),
  w({ id: 'warranty.cost', field: 'cost', family: 'dollars', label: 'What the warranty cost', aliases: ['cost', 'price', 'paid', 'pay'], sentence: 'cost', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.carrier', field: 'carrierName', family: 'text', label: 'Who the policy is with', aliases: ['carrier', 'insurer', 'company', 'who is my insurance with', 'who insures', 'who is it with', 'insurance with', 'policy with', 'provider'], sentence: 'is with', sensitivity: 'HOME' }),
  pol({ id: 'policy.expiryDate', field: 'expiryDate', family: 'date', label: 'When the policy expires', aliases: ['expire', 'expires', 'expiration', 'expiry', 'expiry date', 'renew', 'renews', 'renewal', 'renewal date', 'run out', 'runs out'], sentence: 'expires', sensitivity: 'HOME' }),
  pol({ id: 'policy.startDate', field: 'startDate', family: 'date', label: 'When the policy started', aliases: ['start', 'starts', 'started', 'start date', 'effective'], sentence: 'started', sensitivity: 'HOME' }),
  pol({ id: 'policy.deductible', field: 'deductibleCents', family: 'money', label: 'The deductible', aliases: ['deductible', 'deductibles'], sentence: 'has a deductible of', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.premium', field: 'premiumAmount', family: 'dollars', label: 'The premium', aliases: ['premium', 'premiums', 'cost', 'pay', 'paying', 'monthly cost'], sentence: 'has a premium of', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.coverageType', field: 'coverageType', family: 'text', label: 'The type of coverage', aliases: ['coverage type', 'type of coverage', 'type of policy', 'what kind of policy'], sentence: 'has coverage type', sensitivity: 'HOME' }),
  pol({ id: 'policy.personalPropertyLimit', field: 'personalPropertyLimitCents', family: 'money', label: 'The personal property limit', aliases: ['personal property limit', 'personal property coverage', 'contents limit', 'contents coverage'], sentence: 'has a personal property limit of', sensitivity: 'FINANCIAL' }),
  mt({ id: 'task.nextDueDate', field: 'nextDueDate', family: 'date', label: 'When it is next due', aliases: ['due', 'next due', 'due date', 'when is it due', 'next time', 'scheduled'], sentence: 'is next due', sensitivity: 'HOME' }),
  mt({ id: 'task.lastCompletedDate', field: 'lastCompletedDate', family: 'date', label: 'When it was last done', aliases: ['last done', 'last complete', 'last completed', 'last time', 'last did', 'completed', 'finished', 'last finished'], sentence: 'was last completed', sensitivity: 'HOME' }),
  mt({ id: 'task.status', field: 'status', family: 'enum', label: 'Its status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  mt({ id: 'task.priority', field: 'priority', family: 'enum', label: 'Its priority', aliases: ['priority', 'how urgent', 'urgent'], sentence: 'has priority', sensitivity: 'HOME' }),
  mt({ id: 'task.frequency', field: 'frequency', family: 'enum', label: 'How often it repeats', aliases: ['how often', 'frequency', 'repeat', 'repeats', 'recurring'], sentence: 'repeats', sensitivity: 'HOME' }),
  mt({ id: 'task.estimatedCost', field: 'estimatedCost', family: 'dollars', label: 'The estimated cost', aliases: ['estimated cost', 'estimate', 'expected cost', 'how much will', 'how much does'], sentence: 'has an estimated cost of', sensitivity: 'FINANCIAL' }),
  mt({ id: 'task.actualCost', field: 'actualCost', family: 'dollars', label: 'What it actually cost', aliases: ['actual cost', 'actually cost', 'how much did', 'cost me', 'what did it cost'], sentence: 'actually cost', sensitivity: 'FINANCIAL' }),
];

const R = ['reserve', 'reserves', 'reserve fund', 'savings fund', 'sinking fund', 'home fund'];
const B = ['property tax', 'property taxes', 'tax bill', 'tax bills', 'real estate tax'];
const A = ['assessment', 'assessments', 'assessed', 'assessor'];
const rf = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'reserve-ownership-costs', entity: 'HomeReserveFund', cues: R });
const tb = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'reserve-ownership-costs', entity: 'PropertyTaxBillRecord', cues: B });
const ta = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'reserve-ownership-costs', entity: 'PropertyTaxAssessmentRecord', cues: A });
// Reserve and ownership costs (catalogue version 2). The reserve fund is one row per property (singleton read); tax bills and assessments are read as the latest ACTIVE,
// non-superseded record for the named (or latest) tax year. Expense stays an Ask command (own-profile only) and is deliberately not catalogued; claims wait for a relation-read design.
const RESERVE_COST_POINTS: readonly DataPointDefinition[] = [
  rf({ id: 'reserve.balance', field: 'currentBalanceCents', family: 'money', label: 'The reserve fund balance', aliases: ['balance', 'how much is in', 'how much have i saved', 'saved'], sentence: 'has a recorded balance of', sensitivity: 'FINANCIAL' }),
  rf({ id: 'reserve.monthlyContribution', field: 'recommendedMonthlyContributionCents', family: 'money', label: 'The recommended monthly contribution', aliases: ['monthly contribution', 'recommended contribution', 'contribution', 'set aside', 'put aside', 'contribute'], sentence: 'has a recommended monthly contribution of', sensitivity: 'FINANCIAL' }),
  rf({ id: 'reserve.shortfall', field: 'currentShortfallCents', family: 'money', label: 'The reserve shortfall', aliases: ['shortfall', 'how short', 'gap'], sentence: 'has a recorded shortfall of', sensitivity: 'FINANCIAL' }),
  rf({ id: 'reserve.posture', field: 'posture', family: 'enum', label: 'The reserve posture', aliases: ['posture', 'strategy'], sentence: 'is set to the posture', sensitivity: 'HOME' }),
  rf({ id: 'reserve.horizonYears', field: 'horizonYears', family: 'number', label: 'The planning horizon', aliases: ['horizon', 'planning horizon', 'how many years', 'how far ahead'], sentence: 'plans ahead, in years:', sensitivity: 'HOME' }),
  rf({ id: 'reserve.lastRecalculated', field: 'lastRecalculatedAt', family: 'date', label: 'When it was last recalculated', aliases: ['last recalculated', 'recalculated', 'last updated', 'last calculated'], sentence: 'was last recalculated', sensitivity: 'HOME' }),
  tb({ id: 'taxBill.amount', field: 'billAmount', family: 'dollars', label: 'The property tax bill amount', aliases: ['amount', 'how much', 'owe', 'total', 'pay', 'paying'], sentence: 'shows a bill of', sensitivity: 'FINANCIAL' }),
  tb({ id: 'taxBill.effectiveRate', field: 'effectiveTaxRate', family: 'percent', label: 'The effective tax rate', aliases: ['effective rate', 'effective tax rate', 'tax rate', 'rate', 'millage'], sentence: 'shows an effective tax rate of', sensitivity: 'HOME' }),
  tb({ id: 'taxBill.issueDate', field: 'issueDate', family: 'date', label: 'When the bill was issued', aliases: ['issued', 'issue date', 'date issued', 'when was it issued'], sentence: 'was issued', sensitivity: 'HOME' }),
  ta({ id: 'taxAssessment.totalAssessedValue', field: 'totalAssessedValue', family: 'dollars', label: 'The total assessed value', aliases: ['assessed value', 'total assessed value', 'total assessed', 'assessed at', 'assessed', 'assessment value', 'total assessment'], sentence: 'shows a total assessed value of', sensitivity: 'FINANCIAL' }),
  ta({ id: 'taxAssessment.taxableValue', field: 'taxableValue', family: 'dollars', label: 'The taxable value', aliases: ['taxable value', 'taxable'], sentence: 'shows a taxable value of', sensitivity: 'FINANCIAL' }),
  ta({ id: 'taxAssessment.landValue', field: 'landValue', family: 'dollars', label: 'The land value', aliases: ['land value', 'land'], sentence: 'shows a land value of', sensitivity: 'FINANCIAL' }),
  ta({ id: 'taxAssessment.improvementValue', field: 'improvementValue', family: 'dollars', label: 'The improvement value', aliases: ['improvement value', 'improvements', 'building value', 'structure value'], sentence: 'shows an improvement value of', sensitivity: 'FINANCIAL' }),
  ta({ id: 'taxAssessment.assessmentDate', field: 'assessmentDate', family: 'date', label: 'The assessment date', aliases: ['assessment date', 'assessed on', 'when was it assessed', 'when was my home assessed', 'when was my house assessed'], sentence: 'was assessed', sensitivity: 'HOME' }),
];

const SP = ['sale prep', 'seller prep', 'selling', 'prepare to sell', 'curb appeal', 'staging'];
const SC = ['sale case', 'sale plan', 'selling', 'sell my home', 'sell my house', 'listing'];
const BY = ['buyer', 'buying', 'buyer journey', 'buying journey', 'home purchase'];
const sp = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'seller-prep', entity: 'PropertySalePrepProfile', cues: SP });
const sc = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'seller-prep', entity: 'PropertySaleCase', cues: SC });
const by = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'buyer', entity: 'HomeBuyerChecklist', cues: BY });
// Catalogue version 3: the parent rows that are one per property (singleton read). Children (sale readiness items, buyer tasks, milestones), financing, loan, contract and title entities are not catalogued; PropertyRecord is deferred (visibility policy).
const SELL_BUY_POINTS: readonly DataPointDefinition[] = [
  sp({ id: 'salePrep.paint', field: 'paintCondition', family: 'enum', label: 'The paint condition', aliases: ['paint', 'paint condition'], sentence: 'has a recorded paint condition of', sensitivity: 'HOME' }),
  sp({ id: 'salePrep.curbAppeal', field: 'curbAppealCondition', family: 'enum', label: 'The curb appeal condition', aliases: ['curb appeal', 'curb appeal condition'], sentence: 'has a recorded curb appeal condition of', sensitivity: 'HOME' }),
  sp({ id: 'salePrep.flooring', field: 'flooringCondition', family: 'enum', label: 'The flooring condition', aliases: ['flooring', 'floors', 'flooring condition'], sentence: 'has a recorded flooring condition of', sensitivity: 'HOME' }),
  sp({ id: 'salePrep.kitchen', field: 'kitchenStatus', family: 'enum', label: 'The kitchen update status', aliases: ['kitchen', 'kitchen status'], sentence: 'has a recorded kitchen status of', sensitivity: 'HOME' }),
  sp({ id: 'salePrep.bathroom', field: 'bathroomStatus', family: 'enum', label: 'The bathroom update status', aliases: ['bathroom', 'bathrooms', 'bathroom status'], sentence: 'has a recorded bathroom status of', sensitivity: 'HOME' }),
  sp({ id: 'salePrep.staging', field: 'stagingReadiness', family: 'enum', label: 'The staging readiness', aliases: ['staging readiness', 'staged', 'staging'], sentence: 'has a recorded staging readiness of', sensitivity: 'HOME' }),
  sc({ id: 'saleCase.status', field: 'status', family: 'enum', label: 'The sale status', aliases: ['status', 'sale status', 'where am i'], sentence: 'has status', sensitivity: 'HOME' }),
  sc({ id: 'saleCase.targetListDate', field: 'targetListDate', family: 'date', label: 'The target list date', aliases: ['target list date', 'list date', 'listing date', 'when do i plan to list', 'when will i list'], sentence: 'has a target list date of', sensitivity: 'HOME' }),
  sc({ id: 'saleCase.targetCloseDate', field: 'targetCloseDate', family: 'date', label: 'The target close date', aliases: ['target close date', 'close date', 'closing date', 'when do i close', 'when will i close'], sentence: 'has a target close date of', sensitivity: 'HOME' }),
  by({ id: 'buyer.stage', field: 'stage', family: 'enum', label: 'The buying stage', aliases: ['stage', 'what stage', 'where am i'], sentence: 'is at the stage', sensitivity: 'HOME' }),
  by({ id: 'buyer.targetCloseDate', field: 'targetCloseDate', family: 'date', label: 'The target close date', aliases: ['target close date', 'close date', 'closing date', 'when do i close', 'when will i close'], sentence: 'has a target close date of', sensitivity: 'HOME' }),
  by({ id: 'buyer.moveInDate', field: 'moveInDate', family: 'date', label: 'The move-in date', aliases: ['move in date', 'move in', 'moving in', 'when do i move in'], sentence: 'has a move-in date of', sensitivity: 'HOME' }),
];

const REC = ['home record', 'home records', 'document', 'documents', 'record', 'records'];
const rc = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'documents-records', entity: 'PropertyRecord', cues: REC });
// Catalogue version 4: Home Records metadata. visibility is the record-level access authority (homeRecordsAccess.visibleRecordWhere), sensitivity is classification only; the floor below can only narrow a visible record.
// Aliases are deliberately specific: 'expires' belongs to warranty/policy points, so a record's end date is asked as "effective until / valid until".
const RECORD_POINTS: readonly DataPointDefinition[] = [
  rc({ id: 'record.type', field: 'recordType', family: 'enum', label: 'The record type', aliases: ['record type', 'document type', 'type of record', 'type of document', 'what type of document', 'what type of record', 'what kind of document', 'what kind of record'], sentence: 'is filed as', sensitivity: 'HOME' }),
  rc({ id: 'record.verification', field: 'verificationStatus', family: 'enum', label: 'Its verification status', aliases: ['verified', 'verification', 'verification status', 'is it verified'], sentence: 'has verification status', sensitivity: 'HOME' }),
  rc({ id: 'record.effectiveTo', field: 'effectiveTo', family: 'date', label: 'The date it is effective until', aliases: ['effective until', 'effective through', 'effective to', 'valid until', 'valid through'], sentence: 'is effective until', sensitivity: 'HOME' }),
  rc({ id: 'record.retainUntil', field: 'retainUntil', family: 'date', label: 'The retention date', aliases: ['retain until', 'retained until', 'keep until', 'retention date', 'retention'], sentence: 'is retained until', sensitivity: 'HOME' }),
];

const BT = ['buyer task', 'buyer tasks', 'buying task', 'buying tasks', 'closing task', 'closing tasks'];
const bt = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ ...x, domain: 'buyer', entity: 'HomeBuyerTask', cues: BT, compoundCue: true });
// Catalogue version 5: buyer tasks, the first RELATION read (HomeBuyerTask -> HomeBuyerChecklist, see RELATION_ENTITIES). Structured fields only. The title may SELECT a row and is never returned as a value;
// description, notes, status reason, evidence JSON, booking id and estimated cost are not catalogued. The cue is the compound phrase; the bare word "task" still means a maintenance task.
const BUYER_TASK_POINTS: readonly DataPointDefinition[] = [
  bt({ id: 'buyerTask.status', field: 'status', family: 'enum', label: 'The task status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  bt({ id: 'buyerTask.dueDate', field: 'dueAt', family: 'date', label: 'When the task is due', aliases: ['due', 'due date', 'when is it due', 'deadline'], sentence: 'is due', sensitivity: 'HOME' }),
  bt({ id: 'buyerTask.completedDate', field: 'completedAt', family: 'date', label: 'When the task was completed', aliases: ['completed', 'completed on', 'completion date', 'finished', 'when was it completed', 'when did i complete'], sentence: 'was completed', sensitivity: 'HOME' }),
  bt({ id: 'buyerTask.priority', field: 'priority', family: 'enum', label: 'The task priority', aliases: ['priority', 'how urgent', 'urgent'], sentence: 'has priority', sensitivity: 'HOME' }),
];
const BM = ['buyer milestone', 'buyer milestones', 'buying milestone', 'buying milestones', 'closing milestone', 'closing milestones', 'purchase milestone', 'purchase milestones'];
const bm = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ ...x, domain: 'buyer', entity: 'BuyerJourneyMilestone', cues: BM, compoundCue: true });
// Catalogue version 6: milestones, the second relation path (same HomeBuyerChecklist parent). customLabel, notes, responsibleUserId, sourceEntityId and sourceDocumentId are NOT catalogued.
const BUYER_MILESTONE_POINTS: readonly DataPointDefinition[] = [
  bm({ id: 'buyerMilestone.status', field: 'status', family: 'enum', label: 'The milestone status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  bm({ id: 'buyerMilestone.dueDate', field: 'dueAt', family: 'date', label: 'When the milestone is due', aliases: ['due', 'due date', 'when is it due', 'deadline', 'when is it'], sentence: 'is due', sensitivity: 'HOME' }),
  bm({ id: 'buyerMilestone.completedDate', field: 'completedAt', family: 'date', label: 'When the milestone was completed', aliases: ['completed', 'completed on', 'completion date', 'finished', 'when was it completed', 'when did i complete'], sentence: 'was completed', sensitivity: 'HOME' }),
  bm({ id: 'buyerMilestone.type', field: 'type', family: 'enum', label: 'The milestone type', aliases: ['type', 'what type', 'what kind'], sentence: 'is of type', sensitivity: 'HOME' }),
];
const SI = ['sale item', 'sale items', 'sale-readiness item', 'sale-readiness items', 'sale readiness item', 'sale readiness items', 'seller-prep item', 'seller-prep items', 'seller prep item', 'seller prep items', 'sale checklist item', 'sale checklist items'];
const si = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ ...x, domain: 'seller-prep', entity: 'SaleReadinessItem', cues: SI, compoundCue: true });
// Catalogue version 7: sale-readiness items, the third relation path (SaleReadinessItem -> PropertySaleCase via saleCaseId). The title only SELECTS a row. detail, cost and value-add ranges, waiver reason,
// source entity id, user ids and the canonical work-item id are NOT catalogued. The bare word "item" never claims this entity.
const SALE_ITEM_POINTS: readonly DataPointDefinition[] = [
  si({ id: 'saleItem.status', field: 'status', family: 'enum', label: 'The item status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  si({ id: 'saleItem.category', field: 'category', family: 'enum', label: 'The item category', aliases: ['category', 'what category'], sentence: 'is in category', sensitivity: 'HOME' }),
  si({ id: 'saleItem.requirementClass', field: 'requirementClass', family: 'enum', label: 'The item requirement class', aliases: ['requirement', 'requirement class', 'how required'], sentence: 'has requirement class', sensitivity: 'HOME' }),
  si({ id: 'saleItem.dueDate', field: 'dueAt', family: 'date', label: 'When the item is due', aliases: ['due', 'due date', 'when is it due', 'deadline'], sentence: 'is due', sensitivity: 'HOME' }),
];
const RV = ['record version', 'record versions', 'home record version', 'home record versions', 'document version', 'document versions', 'file version', 'file versions'];
const rv = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ ...x, domain: 'documents-records', entity: 'PropertyRecordVersion', cues: RV, compoundCue: true });
// Catalogue version 8: record versions. The parent record must be NAMED (many records per property, so there is no parent-first default) and must pass the canonical visibleRecordWhere(role) plus ACTIVE and not trashed.
// NOT catalogued: storageKey, original file name (free text), mime type, size, sha256, storage etag, extracted text, OCR score, uploader id, supersession ids.
const RECORD_VERSION_POINTS: readonly DataPointDefinition[] = [
  rv({ id: 'recordVersion.number', field: 'versionNumber', family: 'number', label: 'The current version number', aliases: ['version number', 'which version', 'what version', 'current version', 'latest version', 'current', 'latest'], sentence: 'is at version', sensitivity: 'HOME' }),
  rv({ id: 'recordVersion.uploadedDate', field: 'createdAt', family: 'date', label: 'When the version was uploaded', aliases: ['uploaded', 'uploaded on', 'upload date', 'when was it uploaded', 'when was it added'], sentence: 'was uploaded', sensitivity: 'HOME' }),
  rv({ id: 'recordVersion.scanStatus', field: 'scanStatus', family: 'enum', label: 'The version scan status', aliases: ['scan', 'scan status', 'virus scan', 'malware scan', 'scanned'], sentence: 'has scan status', sensitivity: 'HOME' }),
  rv({ id: 'recordVersion.integrityStatus', field: 'integrityStatus', family: 'enum', label: 'The version integrity status', aliases: ['integrity', 'integrity status', 'file integrity'], sentence: 'has integrity status', sensitivity: 'HOME' }),
];
const CL = ['claim', 'claims', 'insurance claim', 'insurance claims', 'warranty claim', 'warranty claims'];
const cl = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ ...x, domain: 'claims', entity: 'Claim', cues: CL, compoundCue: true });
// Catalogue version 9: claims. Claim has a plain propertyId, so this is a NAMED read (not a relation read). The title only SELECTS a claim and is never returned; the row is named by type ("water damage claim").
// NOT catalogued: title, description, provider name, external URL, creator id, coverage ids, checklist progress, activity time. Status and dates are CONTRIBUTOR; the amounts and the claim number are OWNER.
const CLAIM_POINTS: readonly DataPointDefinition[] = [
  cl({ id: 'claim.status', field: 'status', family: 'enum', label: 'The claim status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  cl({ id: 'claim.type', field: 'type', family: 'enum', label: 'The claim type', aliases: ['type', 'what type', 'what kind'], sentence: 'is of type', sensitivity: 'HOME' }),
  cl({ id: 'claim.incidentDate', field: 'incidentAt', family: 'date', label: 'When the incident happened', aliases: ['incident date', 'date of loss', 'when did it happen', 'when did the incident happen', 'loss date'], sentence: 'covers an incident on', sensitivity: 'HOME' }),
  cl({ id: 'claim.openedDate', field: 'openedAt', family: 'date', label: 'When the claim was opened', aliases: ['opened', 'opened on', 'when was it opened', 'when did i open'], sentence: 'was opened', sensitivity: 'HOME' }),
  cl({ id: 'claim.submittedDate', field: 'submittedAt', family: 'date', label: 'When the claim was submitted', aliases: ['submitted', 'submitted on', 'when was it submitted', 'when did i submit', 'filed', 'when was it filed'], sentence: 'was submitted', sensitivity: 'HOME' }),
  cl({ id: 'claim.closedDate', field: 'closedAt', family: 'date', label: 'When the claim was closed', aliases: ['closed', 'closed on', 'when was it closed', 'when did it close'], sentence: 'was closed', sensitivity: 'HOME' }),
  cl({ id: 'claim.nextFollowUp', field: 'nextFollowUpAt', family: 'date', label: 'The next follow-up date', aliases: ['follow up', 'follow-up', 'next follow up', 'next follow-up', 'when do i follow up'], sentence: 'has its next follow-up on', sensitivity: 'HOME' }),
  cl({ id: 'claim.deductible', field: 'deductibleAmount', family: 'dollars', label: 'The claim deductible', aliases: ['deductible'], sentence: 'has a deductible of', sensitivity: 'FINANCIAL' }),
  cl({ id: 'claim.estimatedLoss', field: 'estimatedLossAmount', family: 'dollars', label: 'The estimated loss', aliases: ['estimated loss', 'loss amount', 'how much is the loss', 'how much was lost'], sentence: 'has an estimated loss of', sensitivity: 'FINANCIAL' }),
  cl({ id: 'claim.settlement', field: 'settlementAmount', family: 'dollars', label: 'The settlement amount', aliases: ['settlement', 'settlement amount', 'how much was i paid', 'payout', 'how much did they pay'], sentence: 'has a settlement of', sensitivity: 'FINANCIAL' }),
  cl({ id: 'claim.claimNumber', field: 'claimNumber', family: 'text', label: 'The claim number', aliases: ['claim number', 'claim id', 'claim reference', 'reference number'], sentence: 'has claim number', sensitivity: 'FINANCIAL' }),
];
const CLC = ['claim checklist step', 'claim checklist steps', 'claim checklist item', 'claim checklist items', 'claim step', 'claim steps'];
const clc = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ specificCue: true, ...x, domain: 'claims', entity: 'ClaimChecklistItem', cues: CLC, compoundCue: true });
const CLE = ['claim timeline event', 'claim timeline events', 'claim event', 'claim events', 'claim timeline'];
const cle = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ specificCue: true, ...x, domain: 'claims', entity: 'ClaimTimelineEvent', cues: CLE, compoundCue: true });
const CLD = ['claim document', 'claim documents', 'claim attachment', 'claim attachments'];
const cld = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience' | 'compoundCue'>): DataPointDefinition => d({ specificCue: true, ...x, domain: 'claims', entity: 'ClaimDocument', cues: CLD, compoundCue: true });
// Catalogue version 10: claim children. Every read goes through a NAMED claim (property-scoped, CONTRIBUTOR floor). The free-form checklist title and description, timeline title/description/meta, document title/notes,
// the document and record ids and any storage data are NOT catalogued (OWNER-only or excluded). A checklist step is selected by its number ("step 2"); an event or document by its structured type. An event or document is
// never defaulted to "the latest": a selection that could go stale on replay is not offered. A claim document additionally needs its PropertyRecord to be visible to the caller (neither parent broadens the other).
const CLAIM_CHILD_POINTS: readonly DataPointDefinition[] = [
  clc({ id: 'claimChecklist.status', field: 'status', family: 'enum', label: 'The checklist step status', aliases: ['status', 'is it done', 'is it complete'], sentence: 'has status', sensitivity: 'HOME' }),
  clc({ id: 'claimChecklist.required', field: 'required', family: 'flag', label: 'Whether the step is required', aliases: ['required', 'is it required', 'optional', 'is it optional'], sentence: 'is required:', sensitivity: 'HOME' }),
  clc({ id: 'claimChecklist.completedDate', field: 'completedAt', family: 'date', label: 'When the step was completed', aliases: ['completed', 'completed on', 'when was it completed', 'when did i complete', 'finished'], sentence: 'was completed', sensitivity: 'HOME' }),
  cle({ id: 'claimEvent.occurredDate', field: 'occurredAt', family: 'date', label: 'When the event happened', aliases: ['when', 'when did it happen', 'when was it', 'date', 'happened', 'occurred'], sentence: 'happened', sensitivity: 'HOME' }),
  cld({ id: 'claimDocument.attachedDate', field: 'createdAt', family: 'date', label: 'When the document was attached', aliases: ['when', 'attached', 'when was it attached', 'when was it added', 'added', 'date'], sentence: 'was attached', sensitivity: 'HOME' }),
];
/** Allowlisted parent-to-child relation paths (relation-read design). The child has no propertyId; it is reached ONLY through the parent, which is property-scoped. Depth is always 1. */
export const RELATION_ENTITIES: Readonly<Record<string, { readonly parent: DataPointEntity; readonly parentDelegate: string; readonly key: string; /** How the parent is named in a limitation sentence. */ readonly parentNoun: string; /** Parent statuses at which a read is normal; "paused" ones read with a notice; anything else is a historical read needing a named child. */ readonly normalStatuses: readonly string[]; readonly pausedStatuses: readonly string[] }>> = Object.freeze({
  HomeBuyerTask: { parent: 'HomeBuyerChecklist', parentDelegate: 'homeBuyerChecklist', key: 'checklistId', parentNoun: 'buyer journey', normalStatuses: ['ACTIVE'], pausedStatuses: ['PAUSED'] },
  // Reached through a NAMED, role-visible PropertyRecord (reader mode RECORD_VERSION), not parent-first; listed so the model check and the property-scoping rule cover it.
  PropertyRecordVersion: { parent: 'PropertyRecord', parentDelegate: 'propertyRecord', key: 'recordId', parentNoun: 'record', normalStatuses: ['ACTIVE'], pausedStatuses: [] },
  // Claim children are reached through a NAMED claim (reader mode CLAIM_CHILD); listed so the model check and property-scoping rule cover them.
  ClaimChecklistItem: { parent: 'Claim', parentDelegate: 'claim', key: 'claimId', parentNoun: 'claim', normalStatuses: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'], pausedStatuses: [] },
  ClaimTimelineEvent: { parent: 'Claim', parentDelegate: 'claim', key: 'claimId', parentNoun: 'claim', normalStatuses: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'CLOSED'], pausedStatuses: [] },
  ClaimDocument: { parent: 'Claim', parentDelegate: 'claim', key: 'claimId', parentNoun: 'claim', normalStatuses: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'CLOSED'], pausedStatuses: [] },
  SaleReadinessItem: { parent: 'PropertySaleCase', parentDelegate: 'propertySaleCase', key: 'saleCaseId', parentNoun: 'sale case', normalStatuses: ['PREPARING', 'LISTED', 'UNDER_CONTRACT'], pausedStatuses: [] },
  BuyerJourneyMilestone: { parent: 'HomeBuyerChecklist', parentDelegate: 'homeBuyerChecklist', key: 'checklistId', parentNoun: 'buyer journey', normalStatuses: ['ACTIVE'], pausedStatuses: ['PAUSED'] },
});

export const DATA_POINT_DEFINITIONS: readonly DataPointDefinition[] = Object.freeze([...INVENTORY_POINTS, ...OTHER_DOMAINS, ...RESERVE_COST_POINTS, ...SELL_BUY_POINTS, ...RECORD_POINTS, ...BUYER_TASK_POINTS, ...BUYER_MILESTONE_POINTS, ...SALE_ITEM_POINTS, ...RECORD_VERSION_POINTS, ...CLAIM_POINTS, ...CLAIM_CHILD_POINTS]);
export const DATA_POINT_BY_ID: ReadonlyMap<string, DataPointDefinition> = new Map(DATA_POINT_DEFINITIONS.map((p) => [p.id, p]));
/** The only columns the reader may select per entity (FR-DATA-15: the select list is built from this allowlist, never from user text). */
export const READABLE_FIELDS: Readonly<Record<DataPointEntity, readonly string[]>> = Object.freeze({
  InventoryItem: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'InventoryItem').map((p) => p.field),
  Warranty: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'Warranty').map((p) => p.field),
  InsurancePolicy: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'InsurancePolicy').map((p) => p.field),
  PropertyMaintenanceTask: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyMaintenanceTask').map((p) => p.field),
  HomeReserveFund: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'HomeReserveFund').map((p) => p.field),
  PropertyTaxBillRecord: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyTaxBillRecord').map((p) => p.field),
  PropertyTaxAssessmentRecord: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyTaxAssessmentRecord').map((p) => p.field),
  PropertySalePrepProfile: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertySalePrepProfile').map((p) => p.field),
  PropertySaleCase: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertySaleCase').map((p) => p.field),
  HomeBuyerChecklist: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'HomeBuyerChecklist').map((p) => p.field),
  PropertyRecord: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyRecord').map((p) => p.field),
  HomeBuyerTask: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'HomeBuyerTask').map((p) => p.field),
  BuyerJourneyMilestone: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'BuyerJourneyMilestone').map((p) => p.field),
  SaleReadinessItem: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'SaleReadinessItem').map((p) => p.field),
  PropertyRecordVersion: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyRecordVersion').map((p) => p.field),
  Claim: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'Claim').map((p) => p.field),
  ClaimChecklistItem: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'ClaimChecklistItem').map((p) => p.field),
  ClaimTimelineEvent: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'ClaimTimelineEvent').map((p) => p.field),
  ClaimDocument: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'ClaimDocument').map((p) => p.field),
});
export const READABLE_ITEM_FIELDS: readonly string[] = READABLE_FIELDS.InventoryItem;

/** Catalogue version the owner's approval covers. Bump it with any added id or changed audience floor, and re-approve. */
export const DATA_POINT_CATALOGUE_VERSION = 10;
/** Owner approval record (2026-11-12): field audience floors and the domain split (appliances-inventory, warranties, insurance, maintenance; claims is a future domain), version 1 = 33 ids; version 2 adds the 14 reserve-ownership-costs ids (all 14 approved as proposed, tax amounts at CONTRIBUTOR, Expense kept own-profile only, claims deferred). */
export const DATA_POINT_APPROVAL = Object.freeze({ catalogueVersion: 10, approvedOn: '2026-11-13', postBuildRatification: Object.freeze({ v8: '2026-11-13', v9: '2026-11-13', v10: '2026-11-13', note: 'The v8 (recordVersion), v9 (claim) and v10 (claim child) ids were implemented first and ratified by the owner afterwards, on 2026-11-13; v2-v7 were approved before they were built.' }), scope: 'field audience floors and domain split, exact ids only (33 at v1 + 14 reserve-ownership-costs at v2 + 12 seller-prep/buyer at v3 + 4 PropertyRecord at v4 + 4 buyerTask at v5 + 4 buyerMilestone at v6 + 4 saleItem at v7 + 4 recordVersion at v8 + 11 claim at v9 (7 CONTRIBUTOR, 4 OWNER) + 5 claim-child at v10 (all CONTRIBUTOR, ratified after implementation 2026-11-13); the v5-v8 ids are VIEWER, read through the buyer checklist / sale case relations and through a named, role-visible record); v4 lowers the 12 v3 floors CONTRIBUTOR -> VIEWER (shared journey facts) and approves record.type/verification/effectiveTo at VIEWER and record.retainUntil at OWNER, only for records visible under visibleRecordWhere(role)' });
export const APPROVED_DATA_POINT_IDS: readonly string[] = Object.freeze([
  'item.brand', 'item.manufacturer', 'item.model', 'item.serial', 'item.installedOn', 'item.purchasedOn', 'item.lastServicedOn', 'item.expectedExpiryDate', 'item.condition', 'item.category', 'item.efficiencyRating', 'item.purchaseCost', 'item.replacementCost', 'item.tags',
  'warranty.expiryDate', 'warranty.startDate', 'warranty.provider', 'warranty.coverage', 'warranty.cost',
  'policy.carrier', 'policy.expiryDate', 'policy.startDate', 'policy.deductible', 'policy.premium', 'policy.coverageType', 'policy.personalPropertyLimit',
  'task.nextDueDate', 'task.lastCompletedDate', 'task.status', 'task.priority', 'task.frequency', 'task.estimatedCost', 'task.actualCost',
  'reserve.balance', 'reserve.monthlyContribution', 'reserve.shortfall', 'reserve.posture', 'reserve.horizonYears', 'reserve.lastRecalculated',
  'taxBill.amount', 'taxBill.effectiveRate', 'taxBill.issueDate',
  'taxAssessment.totalAssessedValue', 'taxAssessment.taxableValue', 'taxAssessment.landValue', 'taxAssessment.improvementValue', 'taxAssessment.assessmentDate',
  'salePrep.paint', 'salePrep.curbAppeal', 'salePrep.flooring', 'salePrep.kitchen', 'salePrep.bathroom', 'salePrep.staging',
  'saleCase.status', 'saleCase.targetListDate', 'saleCase.targetCloseDate',
  'buyer.stage', 'buyer.targetCloseDate', 'buyer.moveInDate',
  'record.type', 'record.verification', 'record.effectiveTo', 'record.retainUntil',
  'buyerTask.status', 'buyerTask.dueDate', 'buyerTask.completedDate', 'buyerTask.priority',
  'buyerMilestone.status', 'buyerMilestone.dueDate', 'buyerMilestone.completedDate', 'buyerMilestone.type',
  'saleItem.status', 'saleItem.category', 'saleItem.requirementClass', 'saleItem.dueDate',
  'recordVersion.number', 'recordVersion.uploadedDate', 'recordVersion.scanStatus', 'recordVersion.integrityStatus',
  'claim.status', 'claim.type', 'claim.incidentDate', 'claim.openedDate', 'claim.submittedDate', 'claim.closedDate', 'claim.nextFollowUp',
  'claim.deductible', 'claim.estimatedLoss', 'claim.settlement', 'claim.claimNumber',
  'claimChecklist.status', 'claimChecklist.required', 'claimChecklist.completedDate', 'claimEvent.occurredDate', 'claimDocument.attachedDate',
]);
/** Categories the owner presumes owner-only for any FUTURE catalogue entry (not catalogued today): mortgage/equity/financing, bank/payment, full policy or account ids, household identity/access, title/ownership, tax ids. */
export const FUTURE_OWNER_ONLY_PRESUMPTIONS: readonly string[] = Object.freeze(['mortgage-equity-financing', 'bank-payment', 'full-policy-or-account-ids', 'household-identity-access', 'title-ownership', 'tax-ids']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The data point a message asks about, or null when none or more than one distinct point matches (never guess between two). Longest alias wins; ties across points = null. */
export function resolveDataPoint(message: string): DataPointDefinition | null {
  const text = ` ${message.toLowerCase().replace(/[^a-z0-9$' ]+/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { point: DataPointDefinition; length: number } | null = null; let tied = false;
  for (const point of DATA_POINT_DEFINITIONS) for (const alias of point.aliases) {
    // Points of a non-inventory entity need that entity's cue word in the message; the cue also breaks ties against inventory points.
    let cueLength = 0;
    if (point.cues) { const hit = point.cues.filter((cue) => new RegExp(`\\b${escapeRe(cue)}\\b`).test(text)); if (!hit.length) continue; cueLength = Math.max(...hit.map((c) => c.length)); }
    if (!new RegExp(`\\b${escapeRe(alias)}\\b`).test(text)) continue;
    // A child entity's cue ("claim checklist step") contains its parent's ("claim"), so its points also score by how specific the matched cue is; this does not change any other entity's scoring.
    const weight = alias.length + (point.cues ? 100 : 0) + (point.compoundCue ? 200 : 0) + (point.specificCue ? cueLength : 0);
    if (!best || weight > best.length) { best = { point, length: weight }; tied = false; }
    else if (weight === best.length && best.point.id !== point.id) tied = true;
  }
  if (!best || tied) return null;
  // A message that mixes the buyer words with the maintenance word ("buyer maintenance task") is resolved to nothing, deterministically, so the caller asks which; it is never decided by registration order.
  if ((best.point.entity === 'PropertyMaintenanceTask' || best.point.entity === 'HomeBuyerTask') && /\b(?:buyer|buying|closing)\b/.test(text) && /\bmaintenance\b/.test(text)) return null;
  return best.point;
}

/** Entities (and claim detail ids) whose single details no dedicated operation answers : a compound-cue question about one of them is read by the data point, not by a list operation that merely shares a word. */
const DATA_POINT_ONLY_ENTITIES: ReadonlySet<string> = new Set(['HomeBuyerTask', 'BuyerJourneyMilestone', 'SaleReadinessItem', 'PropertyRecordVersion', 'ClaimChecklistItem', 'ClaimTimelineEvent', 'ClaimDocument']);
// Inventory details the inventory lookup does NOT state (it shows the item's name, brand and model, and its condition and history, but never its serial number or what it cost). The other inventory points stay with INVENTORY_LOOKUP, which owns them in the routing ratchets.
const INVENTORY_ONLY_IDS: ReadonlySet<string> = new Set(['item.serial', 'item.purchaseCost', 'item.replacementCost', 'item.efficiencyRating']);
const CLAIM_DETAIL_IDS: ReadonlySet<string> = new Set(['claim.deductible', 'claim.estimatedLoss', 'claim.settlement', 'claim.claimNumber', 'claim.incidentDate', 'claim.openedDate', 'claim.submittedDate', 'claim.closedDate', 'claim.nextFollowUp']);
export function isDataPointOnlyQuestion(message: string): boolean {
  const point = resolveDataPoint(message);
  return Boolean(point && (DATA_POINT_ONLY_ENTITIES.has(point.entity) || CLAIM_DETAIL_IDS.has(point.id) || INVENTORY_ONLY_IDS.has(point.id)));
}

/** Who a floor is shown to, in homeowner words. Generated from the point's actual floor so the restriction message never states a different audience than the check enforces. */
export function audienceFloorCopy(floor: AudienceFloor): { title: string; who: string } {
  switch (floor) {
    case 'OWNER': return { title: 'That detail is shown to the home’s owner', who: 'the home’s owner' };
    case 'CONTRIBUTOR': return { title: 'That detail is shown to contributors and owners', who: 'household members who can edit this home' };
    default: return { title: 'That detail is shown to everyone in the household', who: 'everyone in the household' };
  }
}
