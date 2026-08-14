import { prisma } from '../../../lib/prisma';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import {
  PROPERTY_IDENTITY_CONTEXT_OPERATIONS,
  PROPERTY_IDENTITY_CONTEXT_PROVIDER,
} from './propertyIdentityContext.contract';

export interface PropertyIdentityContext {
  propertyId: string;
  recordUpdatedAt: string;
}

const definition: SkillContextProviderDefinition<PropertyIdentityContext> = {
  ...PROPERTY_IDENTITY_CONTEXT_PROVIDER,
  canonicalOwner: 'Living Home Record / Property',
  description: 'Canonical selected-property identity and record version required before property-scoped Skill execution.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 1_000,
  maxSerializedBytes: 1_024,
  supportedOperations: [...PROPERTY_IDENTITY_CONTEXT_OPERATIONS],
  async load({ propertyId }) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, updatedAt: true },
    });
    if (!property) {
      return {
        status: 'UNKNOWN',
        detail: 'The selected property record does not exist.',
        sourceVersion: null,
        observedAt: null,
        entityCount: 0,
        factCount: 0,
      };
    }
    const updatedAt = property.updatedAt.toISOString();
    return {
      status: 'AVAILABLE',
      data: { propertyId: property.id, recordUpdatedAt: updatedAt },
      sourceVersion: updatedAt,
      observedAt: updatedAt,
      entityCount: 1,
      factCount: 2,
    };
  },
};

export const propertyIdentityContextProvider = Object.freeze(definition);
