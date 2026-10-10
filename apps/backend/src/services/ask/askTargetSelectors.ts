// Domain-owned Ask target selectors (capability discovery plan, Phase 7; Inline Workspace FRD IW-SHELL-022). Each selector reads its OWNING
// domain's canonical source, applies that domain's own eligibility rule, and returns options the caller may use. Nothing here writes. The target
// operation revalidates access, role, and current state when an option is chosen, so a stale list can at worst lead to an honest refusal.
//   PROPERTY_AREA  source: Property Context completeness (read ONCE for all areas). An area is offered only if it has askable missing, conflicted,
//                  or stale facts. Choosing one launches PROPERTY_CONTEXT_AREA_CAPTURE for that scope.
//   DIY_PROJECT    source: the DIY service. A project is offered only if it is planning or in progress AND the project guide's own evaluation says it
//                  can be guided; it is AVAILABLE only against the current reviewed guide. Choosing one launches DIY_PROJECT_GUIDE for that project.
import { HouseholdRole } from '@prisma/client';
import { logger } from '../../lib/logger';
import { getPropertyContext } from '../../modules/propertyContext/application/getPropertyContext';
import { PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../modules/propertyContext/catalog/featureRequirementRegistry';
import {
  AskTargetSelectionSchema, type AskTargetOption, type AskTargetSelection, type AskTargetSelectorId,
} from '../../productFramework/ask/askTargetSelection.contract';
import { diyService } from '../diy.service';
import { evaluateProjectGuide, type GuideSource } from '../diy/projectGuide';
import { currentStepOf } from '../diy/stepOrder';
import { ensurePropertyAccess } from './askHandlerSupport';
import { AREA_CAPTURE_MESSAGES, areaCaptureProgressFromSnapshot, areaLabel } from './support/capture';
import type { AskOperationId } from './askOperationRegistry';

export interface AskTargetSelectorContext {
  userId: string;
  propertyId: string;
  role: HouseholdRole;
}

export interface AskTargetSelectorDefinition {
  id: AskTargetSelectorId;
  /** The operation a chosen option launches. */
  operationId: AskOperationId;
  title: string;
  noneEligible: string;
  unavailable: string;
  /** The exact messages a chosen option sends, so a launch can be recognised as coming from this selector (lifecycle attribution). */
  messages: readonly string[];
  /** Reads the owning domain. THROWS if the source cannot be read; the caller reports that as UNAVAILABLE, never as an empty list. */
  assemble(context: AskTargetSelectorContext): Promise<{ options: AskTargetOption[]; truncated?: boolean }>;
}

const clip = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const PROPERTY_AREA_SELECTOR: AskTargetSelectorDefinition = {
  id: 'PROPERTY_AREA',
  operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE',
  title: 'Which part of your home record?',
  noneEligible: 'Nothing is missing in any area right now, so there is nothing to add.',
  unavailable: 'Your home record could not be checked right now. Nothing has changed. Try again in a moment.',
  messages: Object.freeze(Object.values(AREA_CAPTURE_MESSAGES)),
  async assemble({ userId, propertyId, role }) {
    // One read for every area: fact applicability reads facts across areas.
    const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [...PROPERTY_AREA_CAPTURE_SCOPES] });
    const options: AskTargetOption[] = [];
    for (const scope of PROPERTY_AREA_CAPTURE_SCOPES as readonly PropertyAreaCaptureScope[]) {
      const progress = areaCaptureProgressFromSnapshot(snapshot, scope, new Set());
      if (progress.askable.length === 0) continue;
      const askable = new Set(progress.askable);
      const parts = [
        progress.missing.filter((key) => askable.has(key)).length ? `${plural(progress.missing.filter((key) => askable.has(key)).length, 'detail', 'details')} to add` : null,
        progress.conflicted.filter((key) => askable.has(key)).length ? `${plural(progress.conflicted.filter((key) => askable.has(key)).length, 'detail', 'details')} to review` : null,
        progress.stale.filter((key) => askable.has(key)).length ? `${plural(progress.stale.filter((key) => askable.has(key)).length, 'detail', 'details')} to refresh` : null,
      ].filter((part): part is string => part !== null);
      const viewer = role === HouseholdRole.VIEWER;
      options.push({
        targetId: scope,
        label: areaLabel(scope),
        summary: parts.join(', '),
        availability: viewer ? 'UNAVAILABLE' : 'AVAILABLE',
        reasonCodes: viewer ? ['ASK_PERMISSION_REQUIRED'] : [],
        launch: { operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', message: AREA_CAPTURE_MESSAGES[scope], entityType: 'PROPERTY_CONTEXT_AREA', entityId: scope },
      });
    }
    return { options };
  },
};

/** How many of the newest active projects are examined. The guide evaluation reads each project, so this is bounded. */
const DIY_PROJECT_EXAMINE_LIMIT = 12;
export const DIY_GUIDE_LAUNCH_MESSAGE = 'Guide me through this project.';

const DIY_PROJECT_SELECTOR: AskTargetSelectorDefinition = {
  id: 'DIY_PROJECT',
  operationId: 'DIY_PROJECT_GUIDE',
  title: 'Which project?',
  noneEligible: 'None of your active projects has a reviewed guide Ask can walk you through. Projects you start from a reviewed template can be guided here.',
  unavailable: 'Your DIY projects could not be checked right now. Nothing has changed. Try again in a moment.',
  messages: Object.freeze([DIY_GUIDE_LAUNCH_MESSAGE]),
  async assemble({ propertyId }) {
    const view = await diyService.listProjects(propertyId, { status: ['PLANNING', 'IN_PROGRESS'], limit: 20 });
    // The same courtesy filter the DIY projects card uses before offering its guide action; the guide evaluation below is the real gate.
    const candidates = view.items.filter((item) => item.templateId && !item.aiGuideId && item.templateRevisionId).slice(0, DIY_PROJECT_EXAMINE_LIMIT);
    const options: AskTargetOption[] = [];
    for (const item of candidates) {
      const source = await diyService.getProjectGuideSource(item.id, propertyId);
      if (!source) continue;
      const evaluation = evaluateProjectGuide(source as unknown as GuideSource);
      if (evaluation.kind !== 'GUIDE') continue;
      const next = currentStepOf((source.project.steps ?? []) as Array<{ stepNumber: number; status: string; title: string }>);
      const state = item.status === 'IN_PROGRESS' ? 'In progress' : 'Planning';
      const current = evaluation.sourceState === 'CURRENT';
      options.push({
        targetId: item.id,
        label: clip(item.title, 120),
        summary: clip(next ? `${state} · Next: ${next.title}` : `${state} · All steps are resolved`, 200),
        availability: current ? 'AVAILABLE' : 'UNAVAILABLE',
        reasonCodes: current ? [] : [evaluation.sourceState === 'WITHDRAWN' ? 'GUIDE_WITHDRAWN' : 'GUIDE_SUPERSEDED'],
        launch: { operationId: 'DIY_PROJECT_GUIDE', message: DIY_GUIDE_LAUNCH_MESSAGE, entityType: 'DIY_PROJECT', entityId: item.id },
      });
    }
    return { options, truncated: Boolean(view.nextCursor) || view.items.filter((item) => item.templateId && !item.aiGuideId && item.templateRevisionId).length > DIY_PROJECT_EXAMINE_LIMIT };
  },
};

export const ASK_TARGET_SELECTORS: Readonly<Record<AskTargetSelectorId, AskTargetSelectorDefinition>> = Object.freeze({
  PROPERTY_AREA: PROPERTY_AREA_SELECTOR,
  DIY_PROJECT: DIY_PROJECT_SELECTOR,
});

export function getAskTargetSelector(id: string): AskTargetSelectorDefinition | undefined {
  return (ASK_TARGET_SELECTORS as Record<string, AskTargetSelectorDefinition | undefined>)[id];
}

export interface AskTargetSelectionDependencies {
  access: (userId: string, propertyId: string) => Promise<{ role: HouseholdRole }>;
  now: () => Date;
}

/**
 * Reads one selection. Access failures propagate (the caller maps them to 403/404). A source failure is reported as UNAVAILABLE and NEVER as an
 * empty list: "could not check" and "nothing to choose" are different answers.
 */
export async function loadAskTargetSelection(
  selectorId: string,
  userId: string,
  propertyId: string,
  dependencies: Partial<AskTargetSelectionDependencies> = {},
  selectors: Readonly<Record<string, AskTargetSelectorDefinition | undefined>> = ASK_TARGET_SELECTORS,
): Promise<AskTargetSelection> {
  const deps: AskTargetSelectionDependencies = { access: ensurePropertyAccess, now: () => new Date(), ...dependencies };
  const selector = selectors[selectorId];
  if (!selector) {
    const error = new Error(`Unknown Ask target selector: ${selectorId}`);
    (error as Error & { code?: string }).code = 'ASK_TARGET_SELECTOR_NOT_FOUND';
    throw error;
  }
  const { role } = await deps.access(userId, propertyId);
  const base = { selectorId: selector.id, propertyId, title: selector.title, generatedAt: deps.now().toISOString() };
  try {
    const { options, truncated } = await selector.assemble({ userId, propertyId, role });
    if (options.length === 0) return AskTargetSelectionSchema.parse({ ...base, state: 'NONE_ELIGIBLE', options: [], explanation: selector.noneEligible, truncated: false });
    return AskTargetSelectionSchema.parse({ ...base, state: 'OPTIONS', options, explanation: null, truncated: Boolean(truncated) });
  } catch (error) {
    logger.warn({ err: error, selectorId, propertyId, userId }, 'Ask target selector source unavailable; reported as UNAVAILABLE, not as an empty list');
    return AskTargetSelectionSchema.parse({ ...base, state: 'UNAVAILABLE', options: [], explanation: selector.unavailable, truncated: false });
  }
}
