/**
 * The first registry-derived lexicon subset (FR-PLAN-7 / FR-ONT-6 / §18 Phase 1).
 * Runtime consumers use only the generated artifact below. Reviewed aliases
 * remain attached to stable semantic identities instead of handler routes.
 * Warranty, insurance, policy, coverage, and claim tokens are strictly disjoint.
 */
export const ASK_SHARED_LEXICON_VERSION = 'phase1-subset-1.3.0' as const;

export type SemanticLexemeRole =
  | 'DOMAIN'
  | 'ENTITY'
  | 'FIELD'
  | 'RELATION'
  | 'JOB'
  | 'PROJECTION'
  | 'POLARITY'
  | 'TIME'
  | 'COORDINATOR';

interface RegistryLexeme {
  role: SemanticLexemeRole;
  semanticId: string;
  canonicalLabel: string;
  reviewedAliases: readonly string[];
}

const BASIC_READ_REGISTRY_LEXEMES: readonly RegistryLexeme[] = [
  // §5 Domains (all 11 domain groups represented)
  { role: 'DOMAIN', semanticId: 'domain.property_core', canonicalLabel: 'property profile', reviewedAliases: ['home profile'] },
  { role: 'DOMAIN', semanticId: 'domain.rooms_areas', canonicalLabel: 'rooms', reviewedAliases: ['living areas'] },
  { role: 'DOMAIN', semanticId: 'domain.inventory', canonicalLabel: 'inventory', reviewedAliases: ['home inventory'] },
  { role: 'DOMAIN', semanticId: 'domain.home_systems_risk', canonicalLabel: 'home systems', reviewedAliases: ['system risk'] },
  { role: 'DOMAIN', semanticId: 'domain.maintenance', canonicalLabel: 'maintenance', reviewedAliases: ['home maintenance'] },
  { role: 'DOMAIN', semanticId: 'domain.protection', canonicalLabel: 'protection', reviewedAliases: ['home protection'] },
  { role: 'DOMAIN', semanticId: 'domain.finance_tax_cost', canonicalLabel: 'home finance', reviewedAliases: ['property tax and finance'] },
  { role: 'DOMAIN', semanticId: 'domain.documents_records', canonicalLabel: 'documents', reviewedAliases: ['home records'] },
  { role: 'DOMAIN', semanticId: 'domain.timeline_events_monitoring', canonicalLabel: 'home timeline', reviewedAliases: ['home events'] },
  { role: 'DOMAIN', semanticId: 'domain.transactions_projects', canonicalLabel: 'projects and transactions', reviewedAliases: ['renovation and closing'] },
  { role: 'DOMAIN', semanticId: 'domain.operations_saved_work', canonicalLabel: 'saved work', reviewedAliases: ['saved results'] },

  // Entities across the 11 §5 domain groups + separated protection tokens (§17.2 #3)
  { role: 'ENTITY', semanticId: 'entity.property', canonicalLabel: 'home profile', reviewedAliases: ['property profile', 'roof'] },
  { role: 'ENTITY', semanticId: 'entity.inventory_room', canonicalLabel: 'room', reviewedAliases: ['rooms', 'kitchen', 'basement', 'garage'] },
  { role: 'ENTITY', semanticId: 'entity.inventory_item', canonicalLabel: 'inventory item', reviewedAliases: ['inventory items', 'item', 'items', 'appliance', 'appliances', 'equipment', 'refrigerator', 'fridge', 'dishwasher', 'furnace', 'water heater', 'washer', 'dryer'] },
  { role: 'ENTITY', semanticId: 'entity.home_system', canonicalLabel: 'home system', reviewedAliases: ['home systems', 'hvac system', 'electrical panel', 'plumbing system'] },
  { role: 'ENTITY', semanticId: 'entity.maintenance_task', canonicalLabel: 'maintenance task', reviewedAliases: ['maintenance tasks', 'maintenance', 'upkeep task', 'upkeep tasks', 'service task', 'service tasks'] },
  { role: 'ENTITY', semanticId: 'entity.warranty', canonicalLabel: 'warranty', reviewedAliases: ['warranties', 'home warranty', 'appliance warranty'] },
  { role: 'ENTITY', semanticId: 'entity.insurance_policy', canonicalLabel: 'insurance policy', reviewedAliases: ['insurance policies', 'homeowners insurance', 'insurance', 'policy', 'policies'] },
  { role: 'ENTITY', semanticId: 'entity.coverage', canonicalLabel: 'coverage', reviewedAliases: ['coverage gap', 'coverage gaps', 'protection coverage'] },
  { role: 'ENTITY', semanticId: 'entity.claim', canonicalLabel: 'claim', reviewedAliases: ['claims', 'insurance claim', 'warranty claim'] },
  { role: 'ENTITY', semanticId: 'entity.tax_bill', canonicalLabel: 'property tax bill', reviewedAliases: ['property tax bills', 'tax bill', 'tax bills', 'property tax', 'property taxes'] },
  { role: 'ENTITY', semanticId: 'entity.tax_assessment', canonicalLabel: 'property tax assessment', reviewedAliases: ['property tax assessments', 'tax assessment', 'assessed value'] },
  { role: 'ENTITY', semanticId: 'entity.reserve_fund', canonicalLabel: 'reserve fund', reviewedAliases: ['home reserve fund', 'repair reserve'] },
  { role: 'ENTITY', semanticId: 'entity.property_record', canonicalLabel: 'home record', reviewedAliases: ['home records', 'property record', 'property records', 'recorded document', 'recorded documents', 'record version', 'record versions', 'document version', 'file version'] },
  { role: 'ENTITY', semanticId: 'entity.home_event', canonicalLabel: 'home event', reviewedAliases: ['home events', 'timeline event', 'timeline events'] },
  { role: 'ENTITY', semanticId: 'entity.buyer_task', canonicalLabel: 'buyer task', reviewedAliases: ['buyer tasks', 'closing task', 'closing tasks'] },
  { role: 'ENTITY', semanticId: 'entity.sale_readiness_item', canonicalLabel: 'sale readiness item', reviewedAliases: ['sale readiness items', 'seller prep item', 'seller prep items', 'sale item', 'sale items', 'sale checklist item'] },
  { role: 'ENTITY', semanticId: 'entity.claim_checklist_item', canonicalLabel: 'claim checklist step', reviewedAliases: ['claim checklist', 'claim checklist item', 'claim step', 'checklist step'] },
  { role: 'ENTITY', semanticId: 'entity.claim_timeline_event', canonicalLabel: 'claim timeline event', reviewedAliases: ['claim event', 'claim timeline'] },
  { role: 'ENTITY', semanticId: 'entity.claim_document', canonicalLabel: 'claim document', reviewedAliases: ['claim attachment'] },
  { role: 'ENTITY', semanticId: 'entity.buyer_milestone', canonicalLabel: 'buyer milestone', reviewedAliases: ['milestone', 'closing milestone', 'purchase milestone'] },
  { role: 'ENTITY', semanticId: 'entity.sale_prep_profile', canonicalLabel: 'sale prep', reviewedAliases: ['sale prep profile', 'seller prep', 'seller prep profile'] },
  { role: 'ENTITY', semanticId: 'entity.sale_case', canonicalLabel: 'sale plan', reviewedAliases: ['sale case', 'home sale'] },
  { role: 'ENTITY', semanticId: 'entity.buyer_checklist', canonicalLabel: 'buyer journey', reviewedAliases: ['buyer checklist', 'buying journey', 'home purchase'] },
  { role: 'ENTITY', semanticId: 'entity.saved_result', canonicalLabel: 'saved result', reviewedAliases: ['saved results', 'saved analysis', 'saved analyses', 'bookmarked result', 'bookmarked results'] },

  // Fields for Phase 1 basic-read families (including item-cost, property core, maintenance, insurance, tax, closing)
  { role: 'FIELD', semanticId: 'field.inventory_item.purchase_cost', canonicalLabel: 'purchase cost', reviewedAliases: ['purchase price', 'cost', 'price', 'paid', 'pay'] },
  { role: 'FIELD', semanticId: 'field.inventory_item.replacement_cost', canonicalLabel: 'replacement cost', reviewedAliases: ['cost to replace', 'replacement estimate'] },
  { role: 'FIELD', semanticId: 'field.inventory_item.serial_number', canonicalLabel: 'serial number', reviewedAliases: ['serial'] },
  { role: 'FIELD', semanticId: 'field.inventory_item.model_number', canonicalLabel: 'model number', reviewedAliases: ['model'] },
  { role: 'FIELD', semanticId: 'field.inventory_item.installed_on', canonicalLabel: 'install date', reviewedAliases: ['installed on', 'installation date', 'when was installed', 'how old', 'installed', 'installation'] },
  { role: 'FIELD', semanticId: 'field.property.year_built', canonicalLabel: 'year built', reviewedAliases: ['built year', 'when was built', 'built', 'year of construction', 'construction year', 'how old is my home', 'how old is my house', 'age of my home', 'age of my house', 'age of the home', 'age of the house'] },
  { role: 'FIELD', semanticId: 'field.property.living_area', canonicalLabel: 'living area', reviewedAliases: ['square footage', 'sq ft', 'square feet', 'square foot', 'sqft', 'how big is my home', 'how big is my house', 'how large is my home', 'how large is my house', 'size of my home', 'size of my house'] },
  { role: 'FIELD', semanticId: 'field.property.roof_replacement_year', canonicalLabel: 'roof replacement year', reviewedAliases: ['roof age', 'when was roof replaced', 'roof replaced', 'roof replacement', 'roof installed', 'roof install year', 'age of my roof', 'age of the roof', 'how old is my roof', 'how old is the roof', 'when was my roof', 'when was the roof'] },
  { role: 'FIELD', semanticId: 'field.property.bedrooms', canonicalLabel: 'bedroom count', reviewedAliases: ['bedrooms', 'number of bedrooms'] },
  { role: 'FIELD', semanticId: 'field.property.bathrooms', canonicalLabel: 'bathroom count', reviewedAliases: ['bathrooms', 'number of bathrooms'] },
  { role: 'FIELD', semanticId: 'field.property.address', canonicalLabel: 'property address', reviewedAliases: ['home address', 'house address', 'street address', 'what is my address', 'my address'] },
  { role: 'FIELD', semanticId: 'field.property.zip_code', canonicalLabel: 'zip code', reviewedAliases: ['zip', 'postal code'] },
  { role: 'FIELD', semanticId: 'field.property.county', canonicalLabel: 'county', reviewedAliases: ['what county'] },
  { role: 'FIELD', semanticId: 'field.property.home_type', canonicalLabel: 'home type', reviewedAliases: ['type of home', 'kind of home', 'type of house', 'kind of house', 'house type', 'dwelling type', 'property type', 'type of property', 'type of dwelling'] },
  { role: 'FIELD', semanticId: 'field.property.roof_type', canonicalLabel: 'roof type', reviewedAliases: ['type of roof', 'kind of roof'] },
  { role: 'FIELD', semanticId: 'field.property.heating_type', canonicalLabel: 'heating type', reviewedAliases: ['type of heating', 'kind of heating', 'type of heating system', 'kind of heating system'] },
  { role: 'FIELD', semanticId: 'field.property.cooling_type', canonicalLabel: 'cooling type', reviewedAliases: ['type of cooling', 'kind of cooling', 'type of cooling system', 'kind of cooling system', 'type of air conditioning', 'kind of air conditioning'] },
  { role: 'FIELD', semanticId: 'field.maintenance_task.next_due_date', canonicalLabel: 'next due date', reviewedAliases: ['due date', 'due', 'overdue', 'pending'] },
  { role: 'FIELD', semanticId: 'field.maintenance_task.priority', canonicalLabel: 'priority', reviewedAliases: ['urgent', 'high priority'] },
  { role: 'FIELD', semanticId: 'field.warranty.expiry_date', canonicalLabel: 'warranty expiration date', reviewedAliases: ['warranty expiry', 'warranty expires'] },
  { role: 'FIELD', semanticId: 'field.insurance_policy.deductible', canonicalLabel: 'deductible', reviewedAliases: ['insurance deductible', 'policy deductible'] },
  { role: 'FIELD', semanticId: 'field.insurance_policy.premium_amount', canonicalLabel: 'premium', reviewedAliases: ['insurance premium', 'policy premium'] },
  { role: 'FIELD', semanticId: 'field.insurance_policy.expiry_date', canonicalLabel: 'policy expiration date', reviewedAliases: ['policy expiry', 'insurance expires'] },
  { role: 'FIELD', semanticId: 'field.tax_bill.tax_amount', canonicalLabel: 'tax amount', reviewedAliases: ['tax bill amount', 'property tax amount', 'amount', 'how much', 'owe', 'total', 'paying'] },
  { role: 'FIELD', semanticId: 'field.reserve_fund.balance', canonicalLabel: 'reserve balance', reviewedAliases: ['reserve fund balance'] },
  { role: 'FIELD', semanticId: 'field.buyer_task.due_date', canonicalLabel: 'closing due date', reviewedAliases: ['buyer task due date', 'due', 'due date', 'deadline'] },

  { role: 'FIELD', semanticId: 'field.claim.status', canonicalLabel: 'status', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.buyer_task.status', canonicalLabel: 'status', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.buyer_milestone.status', canonicalLabel: 'status', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.sale_item.status', canonicalLabel: 'status', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.claim_checklist.status', canonicalLabel: 'status', reviewedAliases: ['is it done'] },
  { role: 'FIELD', semanticId: 'field.sale_case.status', canonicalLabel: 'status', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.buyer_milestone.due_date', canonicalLabel: 'due', reviewedAliases: ['due date', 'deadline'] },
  { role: 'FIELD', semanticId: 'field.sale_item.due_date', canonicalLabel: 'due', reviewedAliases: ['due date', 'deadline'] },
  { role: 'FIELD', semanticId: 'field.buyer_task.completed_date', canonicalLabel: 'completed', reviewedAliases: ['completed on', 'completion date', 'finished'] },
  { role: 'FIELD', semanticId: 'field.buyer_milestone.completed_date', canonicalLabel: 'completed', reviewedAliases: ['completed on', 'completion date', 'finished'] },
  { role: 'FIELD', semanticId: 'field.claim_checklist.completed_date', canonicalLabel: 'completed', reviewedAliases: ['completed on', 'completion date', 'finished'] },
  { role: 'FIELD', semanticId: 'field.buyer_task.priority', canonicalLabel: 'priority', reviewedAliases: ['how urgent'] },
  { role: 'FIELD', semanticId: 'field.claim.deductible', canonicalLabel: 'deductible', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.tax_bill.effective_rate', canonicalLabel: 'effective tax rate', reviewedAliases: ['effective rate', 'tax rate', 'millage'] },
  { role: 'FIELD', semanticId: 'field.tax_bill.issue_date', canonicalLabel: 'issue date', reviewedAliases: ['date issued', 'issued'] },
  { role: 'FIELD', semanticId: 'field.tax_assessment.total_assessed_value', canonicalLabel: 'total assessed value', reviewedAliases: ['assessed value', 'assessment value', 'total assessed'] },
  { role: 'FIELD', semanticId: 'field.tax_assessment.taxable_value', canonicalLabel: 'taxable value', reviewedAliases: ['taxable'] },
  { role: 'FIELD', semanticId: 'field.tax_assessment.land_value', canonicalLabel: 'land value', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.tax_assessment.improvement_value', canonicalLabel: 'improvement value', reviewedAliases: ['building value', 'structure value'] },
  { role: 'FIELD', semanticId: 'field.tax_assessment.assessment_date', canonicalLabel: 'assessment date', reviewedAliases: ['assessed on'] },
  { role: 'FIELD', semanticId: 'field.sale_prep.paint', canonicalLabel: 'paint condition', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.sale_prep.curb_appeal', canonicalLabel: 'curb appeal', reviewedAliases: ['curb appeal condition'] },
  { role: 'FIELD', semanticId: 'field.sale_prep.flooring', canonicalLabel: 'flooring condition', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.sale_prep.kitchen', canonicalLabel: 'kitchen condition', reviewedAliases: ['kitchen status'] },
  { role: 'FIELD', semanticId: 'field.sale_prep.bathroom', canonicalLabel: 'bathroom condition', reviewedAliases: ['bathroom status'] },
  { role: 'FIELD', semanticId: 'field.sale_prep.staging', canonicalLabel: 'staging readiness', reviewedAliases: ['staging'] },
  { role: 'FIELD', semanticId: 'field.sale_case.target_list_date', canonicalLabel: 'target list date', reviewedAliases: ['list date', 'listing date'] },
  { role: 'FIELD', semanticId: 'field.sale_case.target_close_date', canonicalLabel: 'sale closing date', reviewedAliases: ['sale close date'] },
  { role: 'FIELD', semanticId: 'field.buyer_checklist.stage', canonicalLabel: 'buyer stage', reviewedAliases: ['stage'] },
  { role: 'FIELD', semanticId: 'field.buyer_checklist.target_close_date', canonicalLabel: 'closing date', reviewedAliases: ['close date', 'target close date'] },
  { role: 'FIELD', semanticId: 'field.buyer_checklist.move_in_date', canonicalLabel: 'move in date', reviewedAliases: ['move in', 'moving in'] },
  { role: 'FIELD', semanticId: 'field.record.type', canonicalLabel: 'record type', reviewedAliases: ['document type', 'type of record', 'type of document'] },
  { role: 'FIELD', semanticId: 'field.record.verification', canonicalLabel: 'verification status', reviewedAliases: ['verification', 'verified'] },
  { role: 'FIELD', semanticId: 'field.record.effective_to', canonicalLabel: 'effective until', reviewedAliases: ['effective through', 'valid until', 'valid through'] },
  { role: 'FIELD', semanticId: 'field.record.retain_until', canonicalLabel: 'retention date', reviewedAliases: ['retain until', 'retained until', 'retention'] },
  { role: 'FIELD', semanticId: 'field.record_version.number', canonicalLabel: 'version number', reviewedAliases: ['current version', 'latest version', 'which version', 'what version', 'current record version', 'latest record version'] },
  { role: 'FIELD', semanticId: 'field.record_version.uploaded_date', canonicalLabel: 'upload date', reviewedAliases: ['uploaded', 'uploaded on'] },
  { role: 'FIELD', semanticId: 'field.record_version.scan_status', canonicalLabel: 'scan status', reviewedAliases: ['virus scan', 'malware scan'] },
  { role: 'FIELD', semanticId: 'field.record_version.integrity_status', canonicalLabel: 'integrity status', reviewedAliases: ['file integrity'] },
  { role: 'FIELD', semanticId: 'field.buyer_milestone.type', canonicalLabel: 'milestone type', reviewedAliases: ['type'] },
  { role: 'FIELD', semanticId: 'field.sale_item.category', canonicalLabel: 'category', reviewedAliases: [] },
  { role: 'FIELD', semanticId: 'field.sale_item.requirement_class', canonicalLabel: 'requirement class', reviewedAliases: ['how required'] },
  { role: 'FIELD', semanticId: 'field.claim.type', canonicalLabel: 'claim type', reviewedAliases: ['type'] },
  { role: 'FIELD', semanticId: 'field.claim.incident_date', canonicalLabel: 'incident date', reviewedAliases: ['date of loss', 'loss date'] },
  { role: 'FIELD', semanticId: 'field.claim.opened_date', canonicalLabel: 'opened', reviewedAliases: ['opened on', 'date opened'] },
  { role: 'FIELD', semanticId: 'field.claim.submitted_date', canonicalLabel: 'submitted', reviewedAliases: ['submitted on', 'filed'] },
  { role: 'FIELD', semanticId: 'field.claim.closed_date', canonicalLabel: 'closed on', reviewedAliases: ['date closed'] },
  { role: 'FIELD', semanticId: 'field.claim.next_follow_up', canonicalLabel: 'next follow up', reviewedAliases: ['follow up', 'follow up date'] },
  { role: 'FIELD', semanticId: 'field.claim.estimated_loss', canonicalLabel: 'estimated loss', reviewedAliases: ['loss amount'] },
  { role: 'FIELD', semanticId: 'field.claim.settlement', canonicalLabel: 'settlement amount', reviewedAliases: ['settlement', 'payout'] },
  { role: 'FIELD', semanticId: 'field.claim.claim_number', canonicalLabel: 'claim number', reviewedAliases: ['claim id', 'reference number'] },
  { role: 'FIELD', semanticId: 'field.claim_checklist.required', canonicalLabel: 'required', reviewedAliases: ['optional'] },
  { role: 'FIELD', semanticId: 'field.claim_event.occurred_date', canonicalLabel: 'occurred', reviewedAliases: ['happened', 'happen', 'occur'] },
  { role: 'FIELD', semanticId: 'field.claim_document.attached_date', canonicalLabel: 'attached', reviewedAliases: ['attached on', 'added'] },

  // Relations
  { role: 'RELATION', semanticId: 'relation.inventory_item.warranty', canonicalLabel: 'warranty', reviewedAliases: ['warranties', 'warranty record', 'warranty records'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.maintenance_task', canonicalLabel: 'due maintenance', reviewedAliases: ['maintenance due', 'overdue maintenance', 'maintenance schedule', 'maintenance task', 'maintenance tasks'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.room', canonicalLabel: 'in room', reviewedAliases: ['room', 'located in'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.receipt_document', canonicalLabel: 'receipt', reviewedAliases: ['receipts', 'receipt record', 'receipt records'] },
  { role: 'RELATION', semanticId: 'relation.inventory_item.age', canonicalLabel: 'older than', reviewedAliases: [] },

  // Jobs
  { role: 'JOB', semanticId: 'job.saved_results.lookup', canonicalLabel: 'saved results', reviewedAliases: ['saved analyses', 'bookmarked results'] },
  { role: 'JOB', semanticId: 'job.inventory.replacement_guidance', canonicalLabel: 'replacement guidance', reviewedAliases: ['repair or replace', 'should i repair or replace', 'should i replace', 'replace or repair'] },
  { role: 'JOB', semanticId: 'job.maintenance.create', canonicalLabel: 'schedule maintenance', reviewedAliases: ['create maintenance task', 'add maintenance task', 'schedule maintenance task', 'create upkeep task'] },

  // Projections & Polarity
  { role: 'PROJECTION', semanticId: 'projection.list', canonicalLabel: 'list', reviewedAliases: ['list down', 'show', 'which'] },
  { role: 'PROJECTION', semanticId: 'projection.detail', canonicalLabel: 'details', reviewedAliases: ['detail', 'provide details', 'show details', 'tell me'] },
  { role: 'PROJECTION', semanticId: 'projection.count', canonicalLabel: 'count', reviewedAliases: ['how many', 'number of'] },
  { role: 'PROJECTION', semanticId: 'projection.exists', canonicalLabel: 'exists', reviewedAliases: ['are there', 'do any'] },
  {
    role: 'POLARITY',
    semanticId: 'polarity.negative',
    canonicalLabel: 'without',
    reviewedAliases: [
      "don't have", 'dont have', 'do not have', 'does not have', 'not having',
      'is not', "isn't", 'isnt', 'are not', "aren't", 'arent',
      "don't", 'dont', "doesn't", 'doesnt', "didn't", 'didnt',
      "haven't", 'havent', "hasn't", 'hasnt',
      'not in', 'not', 'no', 'missing',
    ],
  },
  { role: 'POLARITY', semanticId: 'polarity.positive', canonicalLabel: 'with', reviewedAliases: ['have', 'has', 'having'] },

  // Time / Due-status qualifiers & Boolean coordinators
  { role: 'TIME', semanticId: 'time.maintenance.overdue', canonicalLabel: 'overdue', reviewedAliases: ['past due'] },
  { role: 'TIME', semanticId: 'time.maintenance.due', canonicalLabel: 'due', reviewedAliases: ['pending', 'upcoming'] },
  { role: 'COORDINATOR', semanticId: 'coordinator.and', canonicalLabel: 'and', reviewedAliases: [] },
  { role: 'COORDINATOR', semanticId: 'coordinator.or', canonicalLabel: 'or', reviewedAliases: ['either'] },
  { role: 'COORDINATOR', semanticId: 'coordinator.neither', canonicalLabel: 'neither', reviewedAliases: [] },
  { role: 'COORDINATOR', semanticId: 'coordinator.nor', canonicalLabel: 'nor', reviewedAliases: [] },
] as const;

export interface GeneratedSemanticLexeme {
  role: SemanticLexemeRole;
  semanticId: string;
  phrase: string;
  lineage: 'CANONICAL_LABEL' | 'REVIEWED_ALIAS';
}

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
}

export function generateSharedSemanticLexicon(): readonly GeneratedSemanticLexeme[] {
  const generated = BASIC_READ_REGISTRY_LEXEMES.flatMap((entry) => [
    { role: entry.role, semanticId: entry.semanticId, phrase: normalizePhrase(entry.canonicalLabel), lineage: 'CANONICAL_LABEL' as const },
    ...entry.reviewedAliases.map((alias) => ({ role: entry.role, semanticId: entry.semanticId, phrase: normalizePhrase(alias), lineage: 'REVIEWED_ALIAS' as const })),
  ]);
  const identities = new Set<string>();
  return generated.filter((entry) => {
    const identity = `${entry.role}:${entry.semanticId}:${entry.phrase}`;
    if (!entry.phrase || identities.has(identity)) return false;
    identities.add(identity);
    return true;
  }).sort((left, right) => right.phrase.length - left.phrase.length || left.semanticId.localeCompare(right.semanticId));
}

export const ASK_SHARED_SEMANTIC_LEXICON = Object.freeze(generateSharedSemanticLexicon());

/**
 * Verifies §17.2 #3 / §18 Phase 1: warranty, insurance, policy, coverage, and claim
 * semantic identities do not share cross-contaminating phrases in the shared lexicon.
 */
export function verifyProtectionLexemeSeparation(): {
  readonly valid: boolean;
  readonly violations: readonly string[];
} {
  const violations: string[] = [];
  for (const entry of ASK_SHARED_SEMANTIC_LEXICON) {
    if (entry.semanticId.includes('warranty') && /\b(insurance|policy|policies|claim|claims)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains non-warranty token: "${entry.phrase}"`);
    }
    if (entry.semanticId === 'entity.insurance_policy' && /\b(warranty|warranties|claim|claims|coverage)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains non-insurance/policy token: "${entry.phrase}"`);
    }
    if (entry.semanticId === 'entity.coverage' && /\b(warranty|warranties|insurance|policy|policies|claim|claims)\b/.test(entry.phrase)) {
      violations.push(`${entry.semanticId} contains conflated protection token: "${entry.phrase}"`);
    }
  }
  return { valid: violations.length === 0, violations };
}
