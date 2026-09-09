jest.mock('next/server', () => ({
  NextRequest: class NextRequest {},
  NextResponse: { json: jest.fn() },
}));

import {
  sanitizeActivationContext,
  sanitizePayload,
} from '@/app/api/onboarding-lookup-session/route';

const incompatibleOwnerContext = {
  entryPath: 'EXISTING_OWNER_TRIGGER',
  ownershipState: 'ESTABLISHED_OWNER',
  propertyOrigin: 'EXISTING_HOME',
  activeTrigger: {
    type: 'NONE_EXPLORING',
    label: 'Just understand my home',
    detail: null,
    entityType: 'PROPERTY',
    entityId: null,
    source: 'USER_SELECTED',
  },
};

describe('onboarding lookup session activation context', () => {
  it('rejects an exploration-only trigger on an owner path for new writes', () => {
    expect(sanitizeActivationContext(incompatibleOwnerContext)).toBeUndefined();
    expect(sanitizePayload({
      address: '1 Main St',
      city: 'Princeton',
      state: 'NJ',
      zipCode: '08540',
      activationContext: incompatibleOwnerContext,
    })).toBeNull();
  });

  it('can read a legacy incompatible context so confirmation can repair it', () => {
    expect(sanitizeActivationContext(incompatibleOwnerContext, { allowIncompatible: true }))
      .toMatchObject({
        entryPath: 'EXISTING_OWNER_TRIGGER',
        activeTrigger: { type: 'NONE_EXPLORING' },
      });
    expect(sanitizePayload({
      address: '1 Main St',
      city: 'Princeton',
      state: 'NJ',
      zipCode: '08540',
      committedPropertyId: '4df2ac7b-b715-4ad9-9400-4ce0d10c4e78',
      activationContext: incompatibleOwnerContext,
    }, { allowIncompatibleActivationContext: true })).toMatchObject({
      committedPropertyId: '4df2ac7b-b715-4ad9-9400-4ce0d10c4e78',
      activationContext: {
        entryPath: 'EXISTING_OWNER_TRIGGER',
        activeTrigger: { type: 'NONE_EXPLORING' },
      },
    });
  });
});
