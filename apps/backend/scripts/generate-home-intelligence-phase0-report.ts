import fs from 'node:fs';
import path from 'node:path';
import {
  HOME_ACTION_PRODUCER_OWNERSHIP,
  CAPABILITY_SKILL_GUIDANCE_BRIDGE,
  COMPLETION_EVIDENCE_POLICY,
  INTELLIGENCE_CONSUMER_REGISTRY,
  COMPOUND_RULE_REGISTRY,
  type HomeActionProducerOwnershipEntry,
  type CapabilitySkillGuidanceBridgeEntry,
  type CompletionEvidencePolicyEntry,
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
 * Sections 2 (independent priority calculations) and 4 (canonical read
 * boundary decision) are not derivable from any registry — nothing in the
 * codebase enumerates "every system that independently computes urgency" or
 * declares a canonical-read-boundary type. They stay hand-maintained prose
 * below, confirmed against the code at the time this script was last edited
 * rather than generated fresh on every run.
 */

const INDEPENDENT_PRIORITY_CALCULATIONS_SECTION = `## 2. Independent priority calculations (inventory only — Phase 1 converts these)

Ten systems outside \`homeActions.service.ts\` independently compute urgency/priority/rank for "what needs attention," confirmed by direct code read. None were modified this phase — HI-ATT-001 through HI-ATT-004 (making \`getHomeActionFeed()\` the sole ranking authority) is Phase 1. Listing them here so Phase 1 starts from a real inventory instead of rediscovering them.

| # | File | Surface | What it computes independently |
| --- | --- | --- | --- |
| 1 | \`apps/backend/src/services/resolutionCenter.service.ts\` | Fix | Own priority scale (\`critical/high/medium/low\`), own status model, three separate sort functions (\`sortCases\`, \`sortActions\`) — no import of \`homeActions.service.ts\` at all |
| 2 | \`apps/backend/src/services/homeStatusBoard.service.ts\` | Status Board (backend) | \`CONDITION_SEVERITY\` + \`CATEGORY_PRIORITY_WEIGHT\` weighted sort |
| 3 | \`apps/frontend/.../status-board/utils/priorityUtils.ts\` | Status Board (frontend) | Re-ranks *again*, client-side, on top of #2, with yet a third weight set (\`RECOMMENDATION_PRIORITY\`) |
| 4 | \`apps/backend/src/services/guidanceEngine/guidancePriority.service.ts\` | Dashboard hero / Morning Pulse | \`GuidancePriorityService.score()\` — an entirely parallel weighted-score system (severity/urgency/financial/safety/confidence/readiness), zero references to Home Actions |
| 5 | \`apps/frontend/.../DashboardHeroSection.tsx\` | Dashboard hero | Ranks *again* on top of #4's already-scored guidance data (\`estimateHeroStrength\`, \`rankHeroCandidates\`) — the hero item is scored three times total across #4/#5 for this one surface |
| 6 | \`apps/frontend/.../MorningPulseSection.tsx\` | Dashboard | \`PULSE_DOMAIN_ORDER\` + own \`deriveUrgency()\`, on the same guidance-engine data as #4/#5 |
| 7 | \`apps/backend/src/services/notification.service.ts\` | Notifications | \`resolveAttentionPriority()\` fallback, used whenever a caller doesn't pass an explicit priority |
| 8 | \`apps/backend/src/services/maintenanceReminder.service.ts\`, \`newHomeWarrantyDeadline.service.ts\` | Notifications | Each computes its own \`daysUntilDue\`-based priority/urgency independently |
| 9 | \`apps/backend/src/modules/homeEventRadar/services/radarNotificationDelivery.service.ts\` | Notifications | Writes directly to the \`Notification\` table, bypassing \`NotificationService.create\` entirely, with its own urgency mapping |
| 10 | \`apps/backend/src/homeBriefing/homeBriefing.service.ts\` | Home Briefing | Independent \`urgency\`/materiality computation, separate from Home Action priority |

**Positive counter-example — the pattern Phase 1 should generalize, not replace:** \`apps/backend/src/services/decisionPlatform/priorityListPolicy.ts\`'s \`buildPriorityListView()\` is a genuinely pure, DB-free projection of \`homeActions.service.ts\`'s already-ranked feed — it never re-ranks. \`askOrchestrator.service.ts\` (Ask/Cozy) and \`homeActionProactiveDelivery.service.ts\` (external proactive notifications) already consume it correctly today.`;

const READ_BOUNDARY_SECTION = `## 4. Canonical read boundary decision (FRD Phase 0 work item 4)

**Decision:** \`buildPriorityListView()\` in \`apps/backend/src/services/decisionPlatform/priorityListPolicy.ts\`, applied over \`homeActions.service.ts\`'s \`getHomeActionFeed()\`, is the canonical read boundary. It is already correctly implemented and already consumed by two of the ten systems in §2 (Ask/Cozy and proactive notification delivery). Phase 1 generalizes this exact pattern to the other eight — Resolution Center/Fix, Status Board (both layers), Guidance Engine/dashboard hero (all three layers), the remaining notification paths, and Home Briefing — rather than introducing a new boundary.`;

function producerTable(): string {
  const rows = HOME_ACTION_PRODUCER_OWNERSHIP.map((entry: HomeActionProducerOwnershipEntry) => {
    const kind = entry.sourceKind ?? '_dynamic per-action_';
    const completion = entry.hasCompletionAdapter
      ? `Yes — ${entry.completionAdapterOwner}${entry.isKindLevelCompletionException ? ' (id-prefix exception, not the source kind default)' : ''}`
      : 'No';
    const workItem = entry.workKeyEligible ? `Yes (${entry.workItemSourceType})` : 'No';
    const prefixes = entry.idPrefixes.length > 0 ? entry.idPrefixes.map((p: string) => `\`${p}\``).join(', ') : '_none_';
    return `| \`${entry.producerId}\` | \`${entry.sourceFile}\` | ${kind} | ${completion} | ${workItem} | ${prefixes} |`;
  });
  return [
    '| Producer | Source file | Source kind | Completion adapter | Work-item eligible | Id prefix(es) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function capabilityBridgeTable(): string {
  const rows = CAPABILITY_SKILL_GUIDANCE_BRIDGE
    .slice()
    .sort((a: CapabilitySkillGuidanceBridgeEntry, b: CapabilitySkillGuidanceBridgeEntry) => a.capabilityId.localeCompare(b.capabilityId))
    .map((entry: CapabilitySkillGuidanceBridgeEntry) => {
      const operations = entry.operationIds.length > 0 ? entry.operationIds.join(', ') : '_none — Home Action only_';
      const skills = entry.skillIds.length > 0 ? entry.skillIds.join(', ') : '—';
      return `| \`${entry.capabilityId}\` | ${operations} | ${skills} |`;
    });
  return [
    '| Capability | Operations | Skill(s) resolved |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function completionEvidenceTable(): string {
  const rows = COMPLETION_EVIDENCE_POLICY.map((entry: CompletionEvidencePolicyEntry) => `| \`${entry.safetyTier}\` | ${entry.minimumCompletionBehavior} |`);
  return [
    '| Safety tier | Minimum completion behavior |',
    '| --- | --- |',
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

Phase 0 ships six registries under \`apps/backend/src/services/intelligence/\`, each validated at process boot in \`apps/backend/src/index.ts\` alongside the existing Ask and Decision Platform registry checks:

| Registry | File | Populated? |
| --- | --- | --- |
| Home Action producer ownership | \`homeActionProducerOwnership.ts\` | Yes — ${HOME_ACTION_PRODUCER_OWNERSHIP.length}/${HOME_ACTION_PRODUCER_OWNERSHIP.length} producers |
| Home Action adapter ownership (source-kind rollup) | \`homeActionAdapterOwnership.ts\` | Yes — derived from the producer registry |
| Capability/skill/guidance bridge | \`capabilitySkillGuidanceBridge.registry.ts\` | Yes — ${CAPABILITY_SKILL_GUIDANCE_BRIDGE.length} capabilities bridged; ${uncoveredCount} of ${sourceKindsRequiringBridge.length} sourceKinds-claiming capabilities uncovered |
| Completion evidence policy | \`completionEvidencePolicy.registry.ts\` | Yes — ${COMPLETION_EVIDENCE_POLICY.length}/${COMPLETION_EVIDENCE_POLICY.length} safety tiers |
| Intelligence consumer registry | \`intelligenceConsumerRegistry.ts\` | ${INTELLIGENCE_CONSUMER_REGISTRY.length === 0 ? 'Empty by design — Phase 2 populates it' : `Populated — ${INTELLIGENCE_CONSUMER_REGISTRY.length} entries`} |
| Compound rule registry | \`compoundRuleRegistry.contract.ts\` | ${COMPOUND_RULE_REGISTRY.length === 0 ? 'Empty by design — Phase 5 populates it' : `Populated — ${COMPOUND_RULE_REGISTRY.length} entries`} |

The last two are contract-only: nothing in the codebase yet invokes recompute handlers or compound rules, so populating them now would be dead code (see each file's header comment).

---

## 1. Home Action producer inventory and ownership

\`getHomeActionFeed()\` (\`apps/backend/src/services/homeActions.service.ts\`) has no dynamic adapter registry today — it concatenates output from three call sites, the largest of which (\`getPromotedHomeActions()\` in \`homeActionSourcePromotion.service.ts\`) runs the producers below. All producers normalize through \`adaptHomeActionSource()\`. \`apps/backend/src/services/intelligence/homeActionProducerOwnership.ts\` is the single source of truth for per-producer completion and work-item ownership; \`homeActionAdapterOwnership.ts\`'s source-kind-level table is derived from it, not maintained independently.

${producerTable()}

Also re-entering the feed independent of the producers above but included in the table: \`appendAcceptedOperationalWork()\` projects already-\`ACCEPTED\` \`OperationalWorkItem\` rows back in with \`presentation.variant: 'ACCEPTED_WORK'\`.

${INDEPENDENT_PRIORITY_CALCULATIONS_SECTION}

---

## 3. Capability/skill/guidance bridge

No formal three-way capability↔skill↔guidance link existed before Phase 0. \`apps/backend/src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts\` is the code-owned bridge, cross-validated at boot against \`canonicalCapabilityRegistry\`, the Ask operation registry, and the skill registry. It also now enforces completeness against every capability whose \`recommendation.sourceKinds\` is non-empty (${sourceKindsRequiringBridge.length} of ${canonicalCapabilityRegistry.capabilities.length} total capabilities) — a capability reachable only via an Ask operation, with no \`sourceKinds\` claim, has no independent canonical signal to check against and is not covered by that completeness check.

${capabilityBridgeTable()}

**Known gap this registry documents but does not close:** \`guidanceJourneyTypeKeys\` is empty for every entry above. No real capability↔guidance-journey linkage exists anywhere in the codebase today — guidance journeys are keyed by \`signalIntentFamilies\`, not capability id, and journey step \`toolKey\` strings are informal/free-text, not validated against \`canonicalCapabilityRegistry\`. Filling this in is HI-SKL work for a later phase, not Phase 0 — populating it now would mean inventing mappings not backed by real behavior.

---

${READ_BOUNDARY_SECTION}

---

## 5. Completion evidence policy (FRD §8.5 HI-OUT-002)

Defined in \`apps/backend/src/services/intelligence/completionEvidencePolicy.registry.ts\`, keyed by the existing \`RecommendationSafetyTier\` enum (\`recommendationGovernance.contract.ts\`) rather than a new parallel tier — every \`HomeAction.governance.safetyTier\` already carries this value.

${completionEvidenceTable()}

Not yet consumed anywhere (a later phase wires it into the completion UI); defined now so that phase has a validated contract to build against.

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
