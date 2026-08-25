import fs from 'node:fs';
import path from 'node:path';
import {
  HOME_ACTION_PRODUCER_OWNERSHIP,
  CAPABILITY_SKILL_GUIDANCE_BRIDGE,
  COMPLETION_EVIDENCE_POLICY,
  INTELLIGENCE_CONSUMER_REGISTRY,
  COMPOUND_RULE_REGISTRY,
  ATTENTION_PRIORITY_OWNERS,
  type HomeActionProducerOwnershipEntry,
  type CapabilitySkillGuidanceBridgeEntry,
  type CompletionEvidencePolicyEntry,
  type AttentionPriorityOwner,
} from '../src/services/intelligence';
import { canonicalCapabilityRegistry } from '../src/productFramework/capabilities/canonicalCapabilityRegistry';
import type { ToolCapabilityDefinition } from '../src/productFramework/capabilities/capability.contract';

const REPORT_PATH = path.join(__dirname, '../../../docs/product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md');

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 0 — this script
 * IS the generator the Phase 0 report's own frontmatter (generated_from)
 * has claimed to have since the report was first written. It didn't exist
 * until this pass; the report was hand-authored and had already drifted
 * (three Phase 1 loaders were live in getPromotedHomeActions but missing
 * from the report's producer table) by the time that gap was found. Run via
 * `npm run report:home-intelligence-phase0`. The companion parity test
 * (tests/unit/homeIntelligencePhase0Report.test.js) fails CI the moment
 * this script's output stops matching the committed file — i.e. the moment
 * a registry changes without regenerating.
 *
 * The canonical-read-boundary decision remains prose because it is a design
 * decision, not an enumerable runtime mapping. The independent-priority
 * inventory is generated from ATTENTION_PRIORITY_OWNERS so parity checks now
 * catch changes to the known owner list.
 */

function independentPriorityCalculationsSection(): string {
  const rows = ATTENTION_PRIORITY_OWNERS.map((entry: AttentionPriorityOwner, index: number) =>
    `| ${index + 1} | ${entry.sourceFiles.map((file: string) => `\`${file}\``).join('<br>')} | ${entry.surface} | ${entry.calculation} |`);
  return `## 2. Bounded attention policies outside canonical Home Action ranking

${ATTENTION_PRIORITY_OWNERS.length} bounded domain or delivery policies remain outside \`homeActions.service.ts\`. Phase 8 removed the competing Home/Fix presentation ranks; these entries are retained to prevent a domain-specific or channel-delivery policy from being mistaken for permission to re-rank the canonical Home Action feed. The rows are generated from \`ATTENTION_PRIORITY_OWNERS\` and validated at startup.

| # | File | Surface | What it computes independently |
| --- | --- | --- | --- |
${rows.join('\n')}

**Canonical presentation pattern:** \`apps/backend/src/services/decisionPlatform/priorityListPolicy.ts\`'s \`buildPriorityListView()\` is a genuinely pure, DB-free projection of \`homeActions.service.ts\`'s already-ranked feed — it never re-ranks. \`askOrchestrator.service.ts\` (Ask/Cozy) and \`homeActionProactiveDelivery.service.ts\` (external proactive notifications) consume it correctly.`;
}

const READ_BOUNDARY_SECTION = `## 4. Canonical read boundary decision (FRD Phase 0 work item 4)

**Decision:** \`buildPriorityListView()\` in \`apps/backend/src/services/decisionPlatform/priorityListPolicy.ts\`, applied over \`homeActions.service.ts\`'s \`getHomeActionFeed()\`, is the canonical read boundary. Ask/Cozy and proactive notification delivery already consume this projection correctly. Phase 1 generalizes the same boundary to every owner remaining in §2 rather than introducing a new one.`;

function producerTable(): string {
  const rows = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry: HomeActionProducerOwnershipEntry) => {
    const kind = entry.sourceKind ?? '_dynamic per-action_';
    const completion = entry.hasCompletionAdapter
      ? `Yes — ${entry.completionAdapterOwner}${entry.isKindLevelCompletionException ? ' (id-prefix exception, not the source kind default)' : ''}`
      : 'No';
    const dynamicWork = entry.dynamicWorkItemOwnership ?? [];
    const workItem = entry.carriesExistingWorkItem
      ? 'Existing linked Operational Work Item'
      : entry.workKeyEligible
        ? `Yes (${entry.workItemSourceType})`
        : dynamicWork.length > 0
          ? `By runtime source kind: ${dynamicWork.map((mapping) => `${mapping.sourceKind}→${mapping.workItemSourceType}`).join(', ')}`
          : 'No';
    const prefixes = entry.idPrefixes.length > 0 ? entry.idPrefixes.map((p: string) => `\`${p}\``).join(', ') : '_none_';
    const commands = entry.supportedCommands.map((c: string) => `\`${c}\``).join(', ');
    const commandOutcome = entry.hasOutcomeAdapter ? `Yes — ${entry.outcomeAdapterOwner}` : 'No';
    const endToEndOutcome = (entry.endToEndOutcomeAdapters ?? []).length > 0
      ? entry.endToEndOutcomeAdapters!.map((adapter) => `${adapter.owner}<br>Path: ${adapter.completionPath}<br>Conditions: ${adapter.conditions}`).join('<br><br>')
      : entry.hasOutcomeAdapter
        ? `Same as command path — ${entry.outcomeAdapterOwner}`
        : 'No verified path declared';
    return `| \`${entry.producerId}\` | \`${entry.sourceFile}\` | ${entry.factSignalOrigin} | ${kind} | ${commands} | ${entry.commandOwner} | ${completion} | ${commandOutcome} | ${endToEndOutcome} | ${workItem} | ${prefixes} |`;
  });
  return [
    '| Producer | Source file | Fact/signal origin | Source kind | Supported commands | Command owner | Completion adapter | Command-path outcome | End-to-end outcome owner | Work-item eligible | Id prefix(es) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function outcomeObservationRealitySection(): string {
  const producersWithCommandOutcomeAdapter = HOME_ACTION_PRODUCER_OWNERSHIP.filter((entry: HomeActionProducerOwnershipEntry) => entry.hasOutcomeAdapter).length;
  const producersWithEndToEndOutcomeAdapter = HOME_ACTION_PRODUCER_OWNERSHIP.filter((entry: HomeActionProducerOwnershipEntry) =>
    entry.hasOutcomeAdapter || (entry.endToEndOutcomeAdapters ?? []).length > 0).length;
  return `## 6. Outcome observation reality (FRD §8.5 HI-OUT-005)

The FRD §15 Phase 0 functional exit criterion asks the registry report to trace every active recommendation source through to its "outcome owner." Command completion and authoritative domain completion are different paths: **${producersWithCommandOutcomeAdapter} of ${HOME_ACTION_PRODUCER_OWNERSHIP.length}** producers create an outcome directly from their Home Action COMPLETE/ALREADY_DONE command, while **${producersWithEndToEndOutcomeAdapter} of ${HOME_ACTION_PRODUCER_OWNERSHIP.length}** have at least one verified command or domain/reconciliation path to an outcome. Each domain path's linkage and VERIFIED-state conditions are explicit in §1; a declared path does not imply that every emitted recommendation has already created an outcome.

\`OutcomeObservationSourceType\` declares **10** source types. \`outcomeObservationService.ts\` implements seven idempotent creation adapters: \`recordHomeownerReportedOutcome\`, \`recordCompletedMaintenanceOutcome\`, \`recordOperationalWorkOutcome\`, \`recordClaimOutcome\`, \`recordDocumentPromotionOutcome\`, \`recordCoverageDecisionOutcome\`, and \`recordHomeEventOutcome\`. \`PROJECT_RECORD\`, \`BOOKING_RECORD\`, and \`INSPECTION_FINDING\` remain deliberately unused as direct source types because project, booking, guidance, inspection, incident, sale-readiness, and maintenance execution converge on the consistently shaped \`OPERATIONAL_WORK_ITEM\` outcome.

\`hasOutcomeAdapter\`/\`outcomeAdapterOwner\` now retain their narrow command-surface meaning. \`endToEndOutcomeAdapters\` records authoritative domain/reconciliation ownership separately, and the capability bridge derives fallback outcome ownership from both. Booking is an execution adapter rather than a Home Action producer, so its outcome is reported on the originating recommendation's path when that booking reuses a linked work item.`;
}

function capabilityBridgeTable(): string {
  const rows = CAPABILITY_SKILL_GUIDANCE_BRIDGE
    .slice()
    .sort((a: CapabilitySkillGuidanceBridgeEntry, b: CapabilitySkillGuidanceBridgeEntry) => a.capabilityId.localeCompare(b.capabilityId))
    .map((entry: CapabilitySkillGuidanceBridgeEntry) => {
      const operations = entry.operationIds.length > 0 ? entry.operationIds.join(', ') : '_none — Home Action only_';
      const skills = entry.skillIds.length > 0 ? entry.skillIds.join(', ') : '—';
      return `| \`${entry.capabilityId}\` | ${operations} | ${skills} | ${entry.completionOwner} | ${entry.outcomeAdapter ?? 'No verified adapter declared'} |`;
    });
  return [
    '| Capability | Operations | Skill(s) resolved | Completion owner | Outcome adapter |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function completionEvidenceTable(): string {
  const rows = COMPLETION_EVIDENCE_POLICY.map((entry: CompletionEvidencePolicyEntry) =>
    `| \`${entry.safetyTier}\` | ${entry.attestation} | ${entry.costOrObservedResult} | ${entry.recordEvidence} | ${entry.policyOrClaimLinkage} | ${entry.requiresDomainOwnedResolution ? 'Yes' : 'No'} | ${entry.simpleDismissalAllowed ? 'Yes' : 'No'} | ${entry.minimumCompletionBehavior} |`);
  return [
    '| Safety tier | Attestation | Cost/result | Record evidence | Policy/claim link | Domain-owned resolution | Simple dismissal | Minimum completion behavior |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function buildReportMarkdown(): string {
  const today = new Date().toISOString().slice(0, 10);
  const bridgedCapabilityIds = new Set(CAPABILITY_SKILL_GUIDANCE_BRIDGE.map((entry: CapabilitySkillGuidanceBridgeEntry) => entry.capabilityId));
  const sourceKindsRequiringBridge = canonicalCapabilityRegistry.capabilities.filter((c: ToolCapabilityDefinition) => c.recommendation.sourceKinds.length > 0);
  const uncoveredCount = sourceKindsRequiringBridge.filter((c: ToolCapabilityDefinition) => !bridgedCapabilityIds.has(c.id)).length;

  return `---
title: "Home Intelligence Phase 0 — Registry and Ownership Report"
document_type: "Implementation status report"
status: "Phase 0 complete"
date: "${today}"
generated_from: "scripts/generate-home-intelligence-phase0-report.ts (npm run report:home-intelligence-phase0)"
---

# Home Intelligence Phase 0 — Registry and Ownership Report

Companion artifact to [\`HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md\`](./HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) §15 Phase 0. This is the "one generated registry report [that] can trace every active recommendation source from fact/signal through action, work, completion, and outcome owner" Phase 0's functional exit criterion calls for. Every table below is generated directly from the registries under \`apps/backend/src/services/intelligence/\` and \`canonicalCapabilityRegistry\` — not hand-typed — by \`scripts/generate-home-intelligence-phase0-report.ts\`; a parity test fails CI if this file stops matching that script's output.

Phase 0 ships seven registries under \`apps/backend/src/services/intelligence/\`, validated in both the API and worker processes where applicable:

| Registry | File | Populated? |
| --- | --- | --- |
| Home Action producer ownership | \`homeActionProducerOwnership.ts\` | Yes — ${HOME_ACTION_PRODUCER_OWNERSHIP.length}/${HOME_ACTION_PRODUCER_OWNERSHIP.length} producers |
| Home Action adapter ownership (source-kind rollup) | \`homeActionAdapterOwnership.ts\` | Yes — derived from the producer registry |
| Capability/skill/guidance bridge | \`capabilitySkillGuidanceBridge.registry.ts\` | Yes — ${CAPABILITY_SKILL_GUIDANCE_BRIDGE.length} capabilities bridged; ${uncoveredCount} of ${sourceKindsRequiringBridge.length} sourceKinds-claiming capabilities uncovered |
| Completion evidence policy | \`completionEvidencePolicy.registry.ts\` | Yes — ${COMPLETION_EVIDENCE_POLICY.length}/${COMPLETION_EVIDENCE_POLICY.length} safety tiers |
| Intelligence consumer registry | \`intelligenceConsumerRegistry.ts\` | ${INTELLIGENCE_CONSUMER_REGISTRY.length === 0 ? 'Empty by design — Phase 2 populates it' : `Populated — ${INTELLIGENCE_CONSUMER_REGISTRY.length} entries`} |
| Compound rule registry | \`compoundRuleRegistry.contract.ts\` | ${COMPOUND_RULE_REGISTRY.length === 0 ? 'Empty by design — Phase 5 populates it' : `Populated — ${COMPOUND_RULE_REGISTRY.length} entries`} |
| Independent attention-priority ownership | \`attentionPriorityOwnership.registry.ts\` | Populated — ${ATTENTION_PRIORITY_OWNERS.length} owners |

The compound-rule registry remains contract-only until Phase 5. The recompute and attention-priority registries are populated and executable today.

---

## 1. Home Action producer inventory and ownership

\`getHomeActionFeed()\` (\`apps/backend/src/services/homeActions.service.ts\`) concatenates output from three call sites, the largest of which (\`getPromotedHomeActions()\` in \`homeActionSourcePromotion.service.ts\`) runs the producers below. All producers normalize through \`adaptHomeActionSource()\`. \`apps/backend/src/services/intelligence/homeActionProducerOwnership.ts\` is the single source of truth at producer granularity. \`homeActionAdapterOwnership.ts\` retains source-kind command defaults and derives work-item-eligible kinds/source mappings from the producer rows.

${producerTable()}

Also re-entering the feed independent of the producers above but included in the table: \`appendAcceptedOperationalWork()\` projects already-\`ACCEPTED\` \`OperationalWorkItem\` rows back in with \`presentation.variant: 'ACCEPTED_WORK'\`.

${independentPriorityCalculationsSection()}

---

## 3. Capability/skill/guidance bridge

No formal three-way capability↔skill↔guidance link existed before Phase 0. \`apps/backend/src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts\` is the code-owned bridge, cross-validated at boot against \`canonicalCapabilityRegistry\`, the Ask operation registry, and the skill registry. It also now enforces completeness against every capability whose \`recommendation.sourceKinds\` is non-empty (${sourceKindsRequiringBridge.length} of ${canonicalCapabilityRegistry.capabilities.length} total capabilities) — a capability reachable only via an Ask operation, with no \`sourceKinds\` claim, has no independent canonical signal to check against and is not covered by that completeness check.

${capabilityBridgeTable()}

**Known limitation:** capabilities without Phase 6 metadata derive completion and outcome ownership only when their canonical recommendation contract resolves to one Home Action source kind. A capability with multiple or empty \`sourceKinds\` still requires an explicit capability-level mapping; the table says “No verified adapter declared” instead of inventing one.

---

${READ_BOUNDARY_SECTION}

---

## 5. Completion evidence policy (FRD §8.5 HI-OUT-002)

Defined in \`apps/backend/src/services/intelligence/completionEvidencePolicy.registry.ts\`, keyed by the existing \`RecommendationSafetyTier\` enum (\`recommendationGovernance.contract.ts\`) rather than a new parallel tier — every \`HomeAction.governance.safetyTier\` already carries this value.

${completionEvidenceTable()}

Consumed by the shared Home/Fix completion flow and material-approval evidence validation; registry validation protects the minimums each safety tier requires.

---

${outcomeObservationRealitySection()}

---

## What Phase 0 did not touch

Every system listed in §2 continues to rank independently, unchanged. No API response shape, ranking order, or UI changed in this phase — Phase 0 is registries, contracts, and ownership consolidation only, per the FRD's own §16 sequencing.
`;
}

function main() {
  const markdown = buildReportMarkdown();
  fs.writeFileSync(REPORT_PATH, markdown);
  console.log(`Wrote ${REPORT_PATH}`);
}

if (require.main === module) {
  main();
}
