// Phase 0b: derive the Ask data-point catalogue CANDIDATES from the Prisma data model (reliability FRD FR-DATA-1, FR-DATA-2, FR-DATA-13).
// Pure and offline: reads `Prisma.dmmf`, writes nothing. Meaning, aliases, audience policy and visibility are NOT derivable from the schema
// (FR-DATA-1): this module only proposes (a) which entities are property-scoped, (b) a default disposition, (c) a domain, (d) a sensitivity
// class and (e) a grouping, all marked as PROPOSALS for owner sign-off (D11, D13). Nothing here makes a data point visible to Ask.
const { Prisma } = require('@prisma/client');

// ---- D11 default exclusions: operational and security data. Analytics is NOT excluded as a category (homeowner-visible analytics and derived values may be in scope).
const EXCLUDED_ENTITY_PATTERNS = [
  [/^Ask[A-Z]/, 'Ask bookkeeping (executions, sessions, events, receipts)'],
  [/^(Agent|Orchestration)[A-Z]/, 'Agent or orchestration internals'],
  [/(Run|Job|Trace|Cursor|Outbox|Lease|Lock|Receipt|Replay|Heartbeat|Idempotency)(s)?$/, 'Operational record (run, job, trace, cursor, outbox, lock, receipt)'],
  [/^(Operational)[A-Z]/, 'Operational work-item internals'],
  [/(RefreshToken|AccessToken|ApiKey|Credential|Secret|Webhook|PushSubscription|DeviceToken|OAuth)/, 'Security or credential data'],
  [/^(Session|AuditLog|FeatureFlag|Experiment|Migration)/, 'Platform internals'],
  [/^(Gazette)(Generation|Selection)/, 'Content-generation internals'],
  [/(Delivery|Queue)$/, 'Delivery or queue internals'],
];
const EXCLUDED_FIELD_PATTERN = /(password|passwordHash|salt|secret|token|apiKey|credential|signature|webhook|refresh|checksum|storageKey|s3Key|bucketKey|idempotencyKey|fingerprint|rawPayload|embedding)/i;

// ---- Provisional domain map (D13, in the owner's order). Boundaries are explicit so domains do not overlap:
//      item attributes -> appliances; the coverage of an item (warranty, policy, claim) -> warranty-insurance-claims.
const DOMAINS = [
  ['appliances-inventory', /^(Inventory|HomeItem|Room|Appliance|HomeTwin|MaterialSpec|Plant|Garden)/],
  ['maintenance', /^(Maintenance|PropertyMaintenance|Seasonal|Checklist|ChecklistItem|Recurring|Climate|PropertyClimate|HomeHabit|Habit|Diy)/],
  ['warranty-insurance-claims', /^(Warranty|Insurance|Policy|Claim|Coverage|Incident|Recall|Inspection)/],
  ['reserve-ownership-costs', /^(Reserve|HomeReserve|Capital|HomeCapital|Ownership|Expense|Budget|Refinance|Mortgage|Financing|PropertyFinancing|Savings|HomeSavings|Tax|PropertyTax|Equity|SellHoldRent|Assumption|BreakEven)/],
  ['documents-records', /^(Document|PropertyRecord|Record|Photo|Upload|HomeReport|HomeRecord|Evidence|PropertyFact|PropertyContext)/],
  ['buyer', /^(Buyer|HomeBuyer|NewHome|Closing)/],
  ['seller-prep', /^(SaleReadiness|PropertySale|Seller|PropertySaleCase)/],
  ['decisions-projects', /^(Decision|Project|Renovation|Quote|ServiceQuote|Negotiation|PriceFinalization|Booking|Payment|Review|Scenario|ReplaceRepair|DoNothing|RiskMitigation|RiskPremium|RiskAssessment|ToolOverride|ToolInvocation|RefundRequest)/],
  ['home-events-timeline', /^(HomeEvent|PropertyChange|PropertyDailySnapshot|PropertyStreak|PropertyTransition|PropertyMicroAction|PropertyHabit|HomeDigitalWill|MovingPlan)/],
  ['household-account', /^(Household|Notification|PreferenceProfile|Feedback|PropertyResponsibility|PropertyExternalIdentity|PropertyOnboarding|HomeBriefing)/],
  ['property-profile', /^(Property$|PropertyExteriorProfile|PropertyImpact|PropertyInsight|PropertyScore|PropertyLocal|PropertyBrief|PropertyAnalytics|Hoa)/],
  ['neighbourhood-risk-radar', /^(Neighborhood|Neighbourhood|Hazard|Radar|HiddenAsset|Permit|Demographic|ServiceRadar|PropertyHazard|PropertyNeighborhood|PropertyPermit|PropertyObservation|PropertyHiddenAsset|PropertyRadar|PropertyRefinanceRadar)/],
  ['intelligence-derived', /^(Recommendation|Signal|Personalized|DerivedTrait|Guidance|HomeScore|HomeRisk|Intelligence|Outcome|HomeAction|Llm|KnowledgeArticle|Gazette|DomainEvent|ProductAnalytics|ExtractedFact|MaterialExtraction|MaterialLifecycle|HomeDigitalTwin)/],
];
const domainOf = (entity) => { for (const [name, re] of DOMAINS) if (re.test(entity)) return name; return 'everything-else'; };

const SENSITIVE_FIELD = [
  ['PII', /(email|phone|address|street|postal|zip|ssn|socialSecurity|birth|dob|firstName|lastName|fullName|userId|ownerName)/i],
  ['FINANCIAL', /(amount|price|cost|balance|loan|mortgage|rate|premium|deductible|payment|income|equity|value|cents)/i],
];
const sensitivityOf = (field) => { for (const [cls, re] of SENSITIVE_FIELD) if (re.test(field)) return cls; return 'HOME'; };
const familyOf = (f) => {
  if (f.kind === 'enum') return 'enum';
  if (f.type === 'DateTime') return 'date';
  if (f.type === 'Boolean') return 'boolean';
  if (f.type === 'Json') return 'json';
  if (['Int', 'BigInt'].includes(f.type)) return /cents|amount|price|cost|premium|balance/i.test(f.name) ? 'money' : 'count';
  if (['Float', 'Decimal'].includes(f.type)) return /cents|amount|price|cost|premium|balance|rate/i.test(f.name) ? 'money' : 'measure';
  return 'text';
};
const SYSTEM_FIELD = /^(id|createdAt|updatedAt|deletedAt|version|schemaVersion)$/;

function loadModels() { return Prisma.dmmf.datamodel.models; }

/** Property-scoped = has a scalar `propertyId`, is `Property`, or reaches a property-scoped model through a required to-one relation. */
function propertyScope(models) {
  const byName = new Map(models.map((m) => [m.name, m]));
  const scoped = new Set(models.filter((m) => m.name === 'Property' || m.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar')).map((m) => m.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of models) {
      if (scoped.has(m.name)) continue;
      const viaRequiredToOne = m.fields.some((f) => f.kind === 'object' && !f.isList && f.isRequired && (f.relationFromFields?.length ?? 0) > 0 && scoped.has(f.type));
      if (viaRequiredToOne) { scoped.add(m.name); changed = true; }
    }
  }
  return { scoped, byName };
}

function entityDisposition(name) {
  for (const [re, reason] of EXCLUDED_ENTITY_PATTERNS) if (re.test(name)) return { disposition: 'EXCLUDED_DEFAULT', reason };
  return { disposition: 'CANDIDATE', reason: null };
}

/** The full derivation. `rows` is entity-level; `fields` is field-level (large; only returned when asked). */
function deriveCatalogue({ includeFields = false } = {}) {
  const models = loadModels(); const { scoped } = propertyScope(models);
  const entities = []; const fields = [];
  for (const m of models) {
    if (!scoped.has(m.name)) continue;
    const disp = entityDisposition(m.name); const domain = domainOf(m.name);
    const fkFields = new Set(m.fields.flatMap((f) => f.relationFromFields ?? []));
    const scalarFields = m.fields.filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && !SYSTEM_FIELD.test(f.name) && !fkFields.has(f.name));
    const toMany = m.fields.filter((f) => f.kind === 'object' && f.isList).length;
    let candidateFields = 0; let excludedFields = 0; const families = {}; const sensitivity = { HOME: 0, PII: 0, FINANCIAL: 0 };
    for (const f of scalarFields) {
      const excluded = disp.disposition === 'EXCLUDED_DEFAULT' || EXCLUDED_FIELD_PATTERN.test(f.name);
      if (excluded) excludedFields += 1; else {
        candidateFields += 1; const fam = familyOf(f); families[fam] = (families[fam] ?? 0) + 1; sensitivity[sensitivityOf(f.name)] += 1;
        if (includeFields) fields.push({ entity: m.name, field: f.name, type: f.type, kind: f.kind, family: fam, sensitivity: sensitivityOf(f.name), domain, required: f.isRequired, list: f.isList });
      }
    }
    entities.push({ entity: m.name, domain, disposition: disp.disposition, reason: disp.reason, scalarFields: scalarFields.length, candidateFields, excludedFields, toManyRelations: toMany, families, sensitivity });
  }
  entities.sort((a, b) => a.entity.localeCompare(b.entity));
  return { entities, fields };
}

/** Grouping (FR-DATA-13): data points of one entity with the same value family, audience class and sensitivity share a group. */
function groupCount(fields) {
  const groups = new Set(fields.map((f) => `${f.entity}|${f.family}|${f.sensitivity}`));
  return groups.size;
}

module.exports = { deriveCatalogue, propertyScope, loadModels, domainOf, DOMAINS, EXCLUDED_ENTITY_PATTERNS, EXCLUDED_FIELD_PATTERN };
