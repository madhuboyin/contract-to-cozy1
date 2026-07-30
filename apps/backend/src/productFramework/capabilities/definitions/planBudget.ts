import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const PLAN_BUDGET_CAPABILITIES = buildCapabilityDefinitions(([
  ['budget', 'Budget Planner', 'Plan and track home spending.', '/dashboard/budget', 'BUDGET_PLANNER', 'BETA', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['capital-timeline', 'Home Capital Timeline', 'Plan major home system and capital events.', '/dashboard/properties/[id]/tools/capital-timeline', 'HOME_CAPITAL_TIMELINE', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['diy', 'DIY Project Center', 'Use reviewed guidance for eligible low-risk projects.', '/dashboard/properties/[id]/tools/diy', 'DIY', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['documents', 'Document Vault', 'Organize and review critical home documents.', '/dashboard/documents', 'DOCUMENT_VAULT', 'BETA', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['emergency', 'Emergency Help', 'Access rapid guidance for urgent home incidents.', '/dashboard/emergency', 'EMERGENCY_HELP', 'BETA', 'SAFETY_EMERGENCY', 'CATALOG_ONLY'],
  ['hoa-compliance', 'HOA Compliance', 'Track HOA approvals and compliance requirements.', '/dashboard/properties/[id]/tools/hoa', 'HOA_COMPLIANCE', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['home-renovation-risk-advisor', 'Renovations', 'Explore, plan, approve, execute, and close out one governed renovation journey.', '/dashboard/properties/[id]/renovations', 'RENOVATION_RISK_ADVISOR', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['home-timeline', 'Home Timeline', 'Review major events and plans across home ownership.', '/dashboard/properties/[id]/timeline', 'HOME_TIMELINE', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['inspection-hub', 'Inspection Hub', 'Organize inspection reports and track open findings.', '/dashboard/properties/[id]/inspection-hub', 'INSPECTION_HUB', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['oracle', 'Appliance Oracle', 'Review appliance lifespan and replacement timing.', '/dashboard/oracle', 'APPLIANCE_ORACLE', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['permits', 'Permit Tracker', 'Track permits, inspections, and disclosure records.', '/dashboard/properties/[id]/tools/permits', 'PERMITS', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['project-tracker', 'Project Tracker', 'Track contractor projects from contract to completion.', '/dashboard/properties/[id]/projects', 'PROJECT_TRACKER', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['reserve-fund', 'Reserve Fund Planner', 'Plan reserves for future repairs and replacements.', '/dashboard/properties/[id]/tools/reserve-fund', 'RESERVE_FUND', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['seller-prep', 'Seller Prep', 'Prepare the property, documents, and timeline for sale.', '/dashboard/properties/[id]/seller-prep', 'SELLER_PREP', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['status-board', 'Status Board', "See your home's current condition, readiness, and evidence in one place.", '/dashboard/properties/[id]/status-board', 'STATUS_BOARD', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
] as const).map(([
  id,
  label,
  description,
  routeTemplate,
  rolloutKey,
  releaseStage,
  safetyTier,
  mode,
]) => ({
  id,
  ...(id === 'diy' ? {
    version: 2,
    iconName: 'hammer' as const,
    intentAliases: [
      'diy project center',
      'can I do this repair myself',
      'diy or hire a professional',
      'low risk home repair',
      'step by step home maintenance',
      'turn this finding into a diy project',
      'save money with a safe diy project',
    ],
    homeownerOutcome:
      'Decide whether reviewed home work is safe to do yourself and start a guided project only when it is low risk.',
    livingHomeRecordReads: [
      'property-context',
      'maintenance-task',
      'inspection-finding',
      'service-quote',
      'diy-skill-profile',
      'reviewed-diy-template',
    ],
    livingHomeRecordWrites: [
      'diy-decision',
      'diy-project',
      'home-event',
      'maintenance-completion',
    ],
    expectedOutput:
      'A recorded DIY-or-hire decision or a safety-gated project created from reviewed low-risk guidance.',
    completionSignal: 'diy_decision_recorded_or_project_created',
    outputEntityTypes: ['PROJECT'] as const,
  } : {}),
  ...(id === 'seller-prep' ? {
    version: 2,
    iconName: 'list-checks' as const,
    intentAliases: [
      'seller prep',
      'prepare my home to sell',
      'home sale checklist',
      'get my house ready to list',
      'moving timeline home sale',
      'what should I fix before selling',
      'maximize my home sale value',
      'seller readiness plan',
    ],
    homeownerOutcome:
      'Turn confirmed sale intent into a prioritized preparation plan for the property, documents, budget, and listing timeline.',
    livingHomeRecordReads: [
      'property-context',
      'sale-intent',
      'seller-journey',
      'inspection-finding',
      'permit-record',
      'active-project',
      'insurance-policy',
      'comparable-sale',
    ],
    livingHomeRecordWrites: [
      'seller-prep-plan',
      'seller-prep-preferences',
      'seller-prep-checklist-progress',
      'agent-comparison',
    ],
    expectedOutput:
      'A property-specific seller preparation plan with priorities, budget guidance, readiness progress, and market context.',
    completionSignal: 'seller_prep_plan_created_or_advanced',
    outputEntityTypes: ['PROJECT'] as const,
  } : {}),
  ...(id === 'permits' ? {
    version: 2,
    iconName: 'file-text' as const,
    intentAliases: [
      'permit tracker',
      'does my project need a permit',
      'track building permit',
      'track permit inspection',
      'unpermitted work',
      'permit history',
      'home permit records',
    ],
    homeownerOutcome:
      'Research likely permit needs and keep permit and inspection records together for the property.',
    livingHomeRecordReads: [
      'property-context',
      'jurisdiction',
      'active-project',
      'inspection-finding',
      'permit-record',
    ],
    livingHomeRecordWrites: [
      'permit-record',
      'inspection-milestone',
      'unpermitted-work-flag',
      'permit-disclosure-export',
    ],
    expectedOutput:
      'A tracked permit or inspection record that supports local verification without representing legal compliance.',
    completionSignal: 'permit_record_created',
    outputEntityTypes: ['DOCUMENT'] as const,
  } : {}),
  ...(id === 'hoa-compliance' ? {
    version: 2,
    iconName: 'shield-alert' as const,
    intentAliases: [
      'hoa compliance',
      'does my project need hoa approval',
      'track architectural approval',
      'hoa project application',
      'hoa rules for renovation',
      'association approval record',
      'hoa violation history',
    ],
    homeownerOutcome:
      'Track association information, project approval records, and notices while verifying requirements with the association.',
    livingHomeRecordReads: [
      'property-context',
      'hoa-association',
      'active-project',
      'responsibility-context',
      'association-document',
    ],
    livingHomeRecordWrites: [
      'hoa-association',
      'hoa-approval-record',
      'hoa-violation-record',
    ],
    expectedOutput:
      'A tracked association approval record that organizes the homeowner workflow without representing legal compliance.',
    completionSignal: 'hoa_approval_record_created',
    outputEntityTypes: ['DOCUMENT'] as const,
  } : {}),
  ...(id === 'home-renovation-risk-advisor' ? {
    version: 2,
    iconName: 'hammer' as const,
    intentAliases: [
      'renovation workspace',
      'plan a home renovation',
      'home upgrades',
      'renovation risk advisor',
      'does my renovation need a permit',
      'track renovation approvals',
      'is my renovation ready to start',
      'renovation closeout',
    ],
    homeownerOutcome:
      'Move one renovation from exploration through verified closeout with scope, requirements, approvals, readiness, execution, and durable evidence kept together.',
    livingHomeRecordReads: [
      'property-context',
      'renovation-case',
      'renovation-scope',
      'permit-record',
      'hoa-approval-record',
      'project-record',
      'material-specification',
    ],
    livingHomeRecordWrites: [
      'renovation-case',
      'renovation-scope',
      'renovation-requirement',
      'renovation-readiness',
      'project-link',
      'closeout-package',
    ],
    expectedOutput:
      'A governed renovation case with one current stage, one next action, and linked specialist records through verified closeout.',
    completionSignal: 'renovation_case_advanced_or_verified_complete',
    outputEntityTypes: ['PROJECT'] as const,
  } : {}),
  ...(id === 'inspection-hub' ? {
    version: 2,
    iconName: 'file-check' as const,
    intentAliases: [
      'inspection hub',
      'upload home inspection report',
      'review inspection findings',
      'track inspection issues',
      'pre purchase inspection report',
      'annual home inspection',
      'what did my home inspector find',
    ],
    homeownerOutcome:
      'Turn a professional inspection report into reviewed, trackable findings and durable follow-up actions.',
    livingHomeRecordReads: [
      'property-context',
      'inspection-document',
      'inspection-journey',
      'inspection-report',
      'inspection-finding',
    ],
    livingHomeRecordWrites: [
      'inspection-report',
      'inspection-finding',
      'inspection-write-back',
      'finding-resolution',
    ],
    expectedOutput:
      'A structured inspection report with extracted findings ready for homeowner review and confirmation.',
    // Home Operations Slice 10: intentionally stays ARTIFACT_CREATED, not a
    // new completionKind — "findings confirmed" (using this tool) and
    // "follow-up resolved" (§11) are two different moments, and resolution
    // now genuinely lives in the Home Operations work-item lifecycle
    // (accept-as-work → Maintenance/Guidance/Project → verified), not in
    // "using the Inspection Hub tool." This capability's completion is
    // accurately the artifact (the reviewed report/findings) it produces.
    completionSignal: 'inspection_findings_extracted',
    outputEntityTypes: ['ISSUE'] as const,
  } : {}),
  ...(id === 'project-tracker' ? {
    version: 2,
    iconName: 'list-checks' as const,
    intentAliases: [
      'project tracker',
      'track my contractor project',
      'home renovation timeline',
      'track project milestones',
      'track contractor payments',
      'manage change orders',
      'project progress photos',
      'home project warranty',
    ],
    homeownerOutcome:
      'Turn a selected contractor, signed scope, or explicit home project into a durable execution record from milestones through warranty.',
    livingHomeRecordReads: [
      'property-context',
      'contractor-selection',
      'project-contract',
      'guidance-journey',
      'permit-record',
      'inspection-finding',
    ],
    livingHomeRecordWrites: [
      'project-record',
      'project-milestone',
      'project-progress',
      'project-payment',
      'project-change-order',
      'project-warranty',
    ],
    expectedOutput:
      'A tracked home project with milestones, progress evidence, financial changes, and completion records.',
    completionSignal: 'project_verified_outcome_recorded',
    outputEntityTypes: ['PROJECT'] as const,
  } : {}),
  label,
  description,
  routeTemplate,
  outcomeCategory: 'PLAN_BUDGET' as const,
  rolloutKey,
  releaseStage,
  safetyTier,
  completionKind:
    id === 'diy'
      ? 'DECISION_RECORDED' as const
      : id === 'inspection-hub'
        ? 'ARTIFACT_CREATED' as const
        : id === 'project-tracker'
          // Home Operations Slice 10 (§11): verified project completion, not
          // "created with a milestone or progress" — the real machinery this
          // now reflects lives in projectTracker.service.ts's confirmCompletion.
          ? 'OUTCOME_VERIFIED' as const
          : id === 'status-board'
            // Slice 10 (§11 / §3.1): Status Board reports condition, it does
            // not create the operational plan its old PLAN_CREATED default
            // implied — that's Home Operations' job now.
            ? 'OUTPUT_VIEWED' as const
        : 'PLAN_CREATED' as const,
  mode,
})));
