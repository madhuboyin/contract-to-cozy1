/**
 * HomeDigitalTwinFactReadinessService
 *
 * Powers the Home Record hub's fact-readiness summary (Slice 2 of the Home
 * Digital Twin audit). This is deliberately a read-only aggregation over
 * HomeTwinComponent + HomeTwinProjectedFact — it does not own facts and it
 * does not offer a new place to edit them. Every item it surfaces links to
 * an existing canonical surface (see correctionDestinationFor in
 * homeDigitalTwinBuilder.service.ts).
 */

import { HomeTwinFactState } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

// Fact states that represent something worth a homeowner's attention —
// either because the value isn't really known (DEFAULT/UNKNOWN) or because
// two sources disagree (CONFLICTED). INFERRED is a system assumption but is
// surfaced separately at lower priority since it is at least a real, if
// weak, signal (e.g. derived from year built).
const NEEDS_ATTENTION_STATES = new Set<HomeTwinFactState>(['CONFLICTED', 'DEFAULT', 'UNKNOWN']);

const FIELD_LABELS: Record<string, string> = {
  installYear: 'install year',
  usefulLifeYears: 'typical lifespan',
  replacementCostEstimate: 'replacement cost',
};

const COMPONENT_LABELS: Record<string, string> = {
  HVAC: 'HVAC System',
  WATER_HEATER: 'Water Heater',
  ROOF: 'Roof',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical System',
  INSULATION: 'Insulation',
  WINDOWS: 'Windows',
  SOLAR: 'Solar System',
  APPLIANCE: 'Appliance',
  FLOORING: 'Flooring',
  EXTERIOR: 'Exterior / Siding',
  FOUNDATION: 'Foundation',
  OTHER: 'Other System',
};

function reasonFor(factState: HomeTwinFactState, fieldLabel: string, componentLabel: string): string {
  switch (factState) {
    case 'CONFLICTED':
      return `Two sources disagree on ${componentLabel}'s ${fieldLabel} — confirm which is right.`;
    case 'DEFAULT':
      return `We don't have any home-specific data for ${componentLabel}'s ${fieldLabel} — using a category default.`;
    case 'UNKNOWN':
      return `${componentLabel}'s ${fieldLabel} is unknown.`;
    default:
      return `${componentLabel}'s ${fieldLabel} could use a confirmation.`;
  }
}

export class HomeDigitalTwinFactReadinessService {
  async getSummary(propertyId: string) {
    const twin = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      select: { id: true, status: true },
    });

    if (!twin) {
      // No twin yet is a valid, common state (e.g. a brand-new property) —
      // not an error. The Home Record hub should show an empty/setup state.
      return {
        hasTwin: false,
        knownFactCount: 0,
        needsAttentionCount: 0,
        confirmedComponentCount: 0,
        totalComponentCount: 0,
        items: [],
      };
    }

    const components = await prisma.homeTwinComponent.findMany({
      where: { digitalTwinId: twin.id, lifecycleState: 'ACTIVE' },
      select: {
        id: true,
        componentType: true,
        label: true,
        isUserConfirmed: true,
        projectedFacts: {
          select: {
            id: true,
            fieldName: true,
            valueNumeric: true,
            valueText: true,
            unit: true,
            factState: true,
            correctionDestination: true,
            conflictGroupId: true,
          },
        },
      },
      orderBy: { componentType: 'asc' },
    });

    let knownFactCount = 0;
    let needsAttentionCount = 0;
    const items: Array<{
      componentId: string;
      componentType: string;
      componentLabel: string;
      fieldName: string;
      fieldLabel: string;
      factState: HomeTwinFactState;
      reason: string;
      correctionDestination: string | null;
      isConflict: boolean;
    }> = [];

    for (const component of components) {
      const componentLabel = component.label ?? COMPONENT_LABELS[component.componentType] ?? component.componentType;

      // A homeowner-confirmed component is settled — its facts don't need
      // attention regardless of how the system originally derived them.
      if (component.isUserConfirmed) continue;

      for (const fact of component.projectedFacts) {
        if (fact.factState === 'VERIFIED' || fact.factState === 'REPORTED' || fact.factState === 'DOCUMENT_DERIVED') {
          knownFactCount++;
          continue;
        }
        if (!NEEDS_ATTENTION_STATES.has(fact.factState)) continue; // INFERRED: not surfaced as an action item

        needsAttentionCount++;
        const fieldLabel = FIELD_LABELS[fact.fieldName] ?? fact.fieldName;
        items.push({
          componentId: component.id,
          componentType: component.componentType,
          componentLabel,
          fieldName: fact.fieldName,
          fieldLabel,
          factState: fact.factState,
          reason: reasonFor(fact.factState, fieldLabel, componentLabel),
          correctionDestination: fact.correctionDestination,
          isConflict: fact.factState === 'CONFLICTED',
        });
      }
    }

    // Conflicts first (most material), then defaults/unknowns.
    items.sort((a, b) => Number(b.isConflict) - Number(a.isConflict));

    return {
      hasTwin: true,
      knownFactCount,
      needsAttentionCount,
      confirmedComponentCount: components.filter((c) => c.isUserConfirmed).length,
      totalComponentCount: components.length,
      items,
    };
  }

  /**
   * Confirms (or un-confirms) a component's currently derived values as
   * accurate. A confirmed component is left untouched by future rebuilds
   * (see HomeDigitalTwinBuilderService.upsertComponent) — this is the
   * "leave as reviewed" action, not a value-correction API. Correcting a
   * wrong value still happens at the canonical source (property edit,
   * inventory, ...); confirming only records that the homeowner reviewed
   * and accepted what the projection currently shows.
   */
  async setComponentConfirmed(propertyId: string, componentId: string, isUserConfirmed: boolean) {
    const component = await prisma.homeTwinComponent.findFirst({
      where: { id: componentId, propertyId },
      select: { id: true },
    });
    if (!component) {
      throw new APIError('Component not found', 404, 'COMPONENT_NOT_FOUND');
    }

    return prisma.homeTwinComponent.update({
      where: { id: componentId },
      data: { isUserConfirmed },
    });
  }
}
