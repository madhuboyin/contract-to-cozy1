import { prisma } from '../../../lib/prisma';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import {
  operatingModeForOwnershipState,
  PROPERTY_JOURNEY_CONTEXT_OPERATIONS,
  PROPERTY_JOURNEY_CONTEXT_PROVIDER,
  type PropertyJourneyContext,
} from './propertyJourneyContext.contract';

const definition: SkillContextProviderDefinition<PropertyJourneyContext> = {
  ...PROPERTY_JOURNEY_CONTEXT_PROVIDER,
  canonicalOwner: 'PropertyOnboarding / Entry Context',
  description: 'Canonical, bounded ownership-lifecycle context for audience applicability and homeowner guidance.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 1_000,
  maxSerializedBytes: 2_048,
  supportedOperations: [...PROPERTY_JOURNEY_CONTEXT_OPERATIONS],
  async load({ propertyId }) {
    const onboarding = await prisma.propertyOnboarding.findUnique({
      where: { propertyId },
      select: {
        propertyId: true,
        ownershipState: true,
        entryPath: true,
        propertyOrigin: true,
        entryContextVersion: true,
        entryContextCapturedAt: true,
        updatedAt: true,
      },
    });
    if (!onboarding?.ownershipState || onboarding.ownershipState === 'UNKNOWN') {
      return {
        status: 'UNKNOWN',
        detail: 'The selected property does not yet have a confirmed ownership lifecycle.',
        sourceVersion: onboarding?.entryContextVersion ?? null,
        observedAt: onboarding?.updatedAt.toISOString() ?? null,
        entityCount: onboarding ? 1 : 0,
        factCount: 0,
      };
    }

    const observedAt = (onboarding.entryContextCapturedAt ?? onboarding.updatedAt).toISOString();
    const contextVersion = onboarding.entryContextVersion ?? onboarding.updatedAt.toISOString();
    return {
      status: 'AVAILABLE',
      data: {
        propertyId: onboarding.propertyId,
        ownershipState: onboarding.ownershipState,
        operatingMode: operatingModeForOwnershipState(onboarding.ownershipState),
        entryPath: onboarding.entryPath,
        propertyOrigin: onboarding.propertyOrigin,
        contextVersion,
        capturedAt: onboarding.entryContextCapturedAt?.toISOString() ?? null,
      },
      sourceVersion: contextVersion,
      observedAt,
      entityCount: 1,
      factCount: 6,
    };
  },
};

export const propertyJourneyContextProvider = Object.freeze(definition);
