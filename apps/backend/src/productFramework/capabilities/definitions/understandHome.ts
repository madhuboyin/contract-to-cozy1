import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const UNDERSTAND_HOME_CAPABILITIES = buildCapabilityDefinitions([
  {
    // Slice 1 of HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_
    // IMPLEMENTATION_PLAN.md flagged this exact gap. Confirmed via
    // toolLifecycle.contract.ts that the id 'documents' is already the
    // analytics/lifecycle-canonical id for the LEGACY document tool
    // specifically — it has two existing aliases ('document-vault' and
    // 'vault' both canonicalize to 'documents'). This entry's content had
    // drifted to describe the canonical PropertyRecord-based Home Records
    // tool instead (label "Home Records", livingHomeRecordReads/Writes
    // full of property-record/record-version/record-link concepts) while
    // its id still meant the legacy tool everywhere else in the codebase
    // — a real inconsistency, not just a stale route. Fixed by restoring
    // this entry's content to accurately describe what id 'documents'
    // actually is (mobileToolCatalog.ts now calls it "Quick Document
    // Scan"), and adding a new 'home-records' entry below for the
    // canonical system, which never had its own capability entry before.
    id: 'documents',
    version: 3,
    label: 'Quick Document Scan',
    description: 'Scan a file and store it with AI-assisted analysis.',
    routeTemplate: '/dashboard/documents',
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'DOCUMENT_VAULT',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CATALOG_ONLY',
    iconName: 'file-check',
    intentAliases: [
      'quick document scan',
      'scan a document',
      'upload a single file',
      'ai document analysis',
    ],
    homeownerOutcome:
      'Quickly scan and store a single file with AI-assisted analysis, without the versioning or household-wide visibility of the canonical Home Records tool.',
    livingHomeRecordReads: ['property-context', 'document'],
    livingHomeRecordWrites: ['document'],
    expectedOutput: 'A stored document with AI-extracted metadata.',
    completionSignal: 'document_scanned_and_stored',
    outputEntityTypes: ['DOCUMENT'],
  },
  {
    // The canonical PropertyRecord-based Home Records tool — property-
    // owned, versioned, trash/restore, visible to the whole household
    // rather than uploader-only. This is the real "manage my home's
    // records" destination per the continuity plan; id 'documents' above
    // is the older, narrower quick-scan tool. New DISCOVERABLE_TOOL_IDS
    // entry added in toolLifecycle.contract.ts to match.
    id: 'home-records',
    version: 1,
    label: 'Home Records',
    description: 'Keep property files organized as reviewable evidence for the home.',
    routeTemplate: '/dashboard/properties/[id]/tools/home-records',
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'HOME_RECORDS',
    releaseStage: 'BETA',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CATALOG_ONLY',
    iconName: 'file-check',
    intentAliases: [
      'home records',
      'property records',
      'find a home document',
      'upload property records',
      'home receipts warranties and manuals',
      'property evidence',
    ],
    homeownerOutcome:
      'Keep property files findable, reviewable, and reusable as evidence without treating extracted facts as verified records.',
    livingHomeRecordReads: [
      'property-context',
      'property-record',
      'record-version',
      'record-link',
      'extraction-candidate',
    ],
    livingHomeRecordWrites: [
      'property-record',
      'record-version',
      'record-link',
      'extraction-review',
    ],
    expectedOutput:
      'A property-scoped record with review state, evidence links, access scope, and a durable current version.',
    completionSignal: 'home_record_saved_or_reviewed',
    outputEntityTypes: ['PROPERTY_RECORD'],
  },
  {
    id: 'home-digital-will',
    version: 3,
    label: 'Home Continuity Plan',
    description: 'Prepare selected home knowledge for a trusted recipient.',
    routeTemplate: '/dashboard/properties/[id]/tools/home-digital-will',
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'HOME_DIGITAL_WILL',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CONTEXTUAL',
    iconName: 'file-check',
    intentAliases: [
      'home digital will',
      'home continuity plan',
      'home handoff',
      'prepare home information for an emergency',
      'trusted contact home access',
      'critical home documents handoff',
      'what someone needs to manage my home',
      'property knowledge transfer',
      'home emergency instructions',
    ],
    homeownerOutcome:
      'Prepare a governed home-information handoff and verify recipient access before relying on it for continuity.',
    livingHomeRecordReads: [
      'property-context',
      'critical-property-document',
      'trusted-contact-readiness',
      'emergency-instruction',
    ],
    livingHomeRecordWrites: [
      'home-continuity-package',
      'handoff-recipient',
      'handoff-access-grant',
      'handoff-access-log',
    ],
    expectedOutput:
      'A published, access-scoped Home Continuity Plan revision with an accepted recipient and tested access.',
    completionSignal: 'home_continuity_access_tested',
    outputEntityTypes: ['HANDOFF_PACKAGE'],
  },
  {
    id: 'home-risk-replay',
    version: 2,
    label: 'Past Hazard Exposure',
    description: 'Review sourced past hazards near this property without treating proximity as proof of damage.',
    routeTemplate: '/dashboard/properties/[id]/tools/home-risk-replay',
    routeAliases: ['/dashboard/properties/[id]/tools/past-hazard-exposure'],
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'HOME_RISK_REPLAY',
    releaseStage: 'BETA',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'DECISION_RECORDED',
    mode: 'CONTEXTUAL',
    iconName: 'shield-alert',
    homeownerOutcome:
      'Understand which sourced historical hazards were geographically matched, what is known about this home, and whether an outcome needs to be recorded.',
    livingHomeRecordReads: [
      'property-context',
      'reviewed-source-coverage',
      'hazard-observation',
      'claim-record',
      'inspection-record',
      'home-event',
    ],
    livingHomeRecordWrites: [
      'property-hazard-outcome',
      'home-action-reference',
      'confirmed-home-event',
    ],
    expectedOutput:
      'A source-bounded past hazard view that separates regional observation, property match, inferred relevance, and confirmed outcome.',
    completionSignal: 'past_hazard_outcome_recorded',
  },
  {
    id: 'home-timeline',
    version: 2,
    label: 'Home Timeline',
    description: 'Keep a trustworthy history of what actually happened to this home.',
    routeTemplate: '/dashboard/properties/[id]/timeline',
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'HOME_TIMELINE',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CATALOG_ONLY',
    iconName: 'calendar-days',
    homeownerOutcome:
      'Preserve a durable property history with visible evidence, provenance, verification, and honest date precision.',
    livingHomeRecordReads: [
      'home-event',
      'project-record',
      'claim-record',
      'incident-record',
      'maintenance-record',
      'document',
    ],
    livingHomeRecordWrites: [
      'home-event',
      'home-event-revision',
      'home-event-evidence',
    ],
    expectedOutput:
      'A reported or verified property event, evidence attachment, correction, or selected history export.',
    completionSignal: 'home_timeline_history_action_completed',
    outputEntityTypes: ['DOCUMENT'],
  },
  {
    id: 'property-brief',
    version: 1,
    label: 'Property Brief',
    description: 'Create a governed brief from selected verified facts, history, evidence, and explicit unknowns.',
    routeTemplate: '/dashboard/properties/[id]/property-brief',
    routeAliases: ['/dashboard/properties/[id]/home-score'],
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'PROPERTY_BRIEF',
    releaseStage: 'BETA',
    safetyTier: 'MATERIAL_FINANCIAL',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CATALOG_ONLY',
    iconName: 'file-check',
    homeownerOutcome:
      'Prepare a purpose-specific, access-scoped property summary without presenting it as an inspection, appraisal, certification, or disclosure.',
    livingHomeRecordReads: [
      'property-context',
      'verified-property-fact',
      'home-event',
      'document',
      'claim-record',
      'insurance-policy',
    ],
    livingHomeRecordWrites: [
      'property-brief',
      'property-brief-access-policy',
      'property-brief-access-log',
    ],
    expectedOutput:
      'A selected, evidence-linked Property Brief with as-of dates, explicit exclusions, recipient scope, and a limitation statement.',
    completionSignal: 'property_brief_created',
    outputEntityTypes: ['DOCUMENT'],
  },
  {
    id: 'material-specs',
    version: 3,
    label: 'Material Specs',
    description: 'Record finishes, products, colors, and supplier details.',
    routeTemplate: '/dashboard/properties/[id]/materials',
    outcomeCategory: 'UNDERSTAND_HOME',
    rolloutKey: 'MATERIAL_SPECS',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ARTIFACT_CREATED',
    mode: 'CONTEXTUAL',
    iconName: 'layers',
    intentAliases: [
      'material specs',
      'what paint did i use',
      'find my paint color',
      'match a repair finish',
      'room finishes',
      'tile flooring and product details',
      'material document',
    ],
    homeownerOutcome:
      'Keep a reusable record of the exact finishes and products used in each room or project.',
    livingHomeRecordReads: [
      'property-context',
      'project-record',
      'room-record',
    ],
    livingHomeRecordWrites: ['material-specification'],
    expectedOutput:
      'A durable material specification linked to its property, room, or project context.',
    completionSignal: 'material_specification_saved',
    outputEntityTypes: ['STRUCTURED_RECORD'],
  },
]);
