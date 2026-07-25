import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';
import {
  homeDigitalWillDestinationSection,
  homeDigitalWillHandoffReadiness,
} from '../homeDigitalWillActivation';
import type { DigitalWill } from '../types';

function resolved(entityType: string): ResolvedToolDestinationContext {
  return {
    sourceAction: null,
    sourceActionFound: false,
    journey: null,
    nextJourneyLabel: null,
    contextVersionStatus: 'CURRENT',
    currentContextVersion: 'context-v1',
    recommendationLabel: 'Trusted transfer preparation',
    sourceTitle: 'Critical property document',
    sourceSummary: null,
    prefill: {
      entityType,
      entityId: 'document-1',
      itemId: null,
      journeyId: null,
      serviceKey: null,
      issueType: null,
      scopeCategory: null,
      scopeId: null,
    },
    actionPlanHref: null,
    journeyHref: null,
  };
}

function will(): Pick<DigitalWill, 'sections' | 'trustedContacts'> {
  return {
    sections: [{
      id: 'section-1',
      digitalWillId: 'will-1',
      type: 'EMERGENCY',
      title: 'Emergency',
      description: null,
      sortOrder: 0,
      isEnabled: true,
      entries: [{
        id: 'entry-1',
        sectionId: 'section-1',
        entryType: 'INSTRUCTION',
        title: 'Shutoff',
        content: null,
        summary: null,
        priority: 'CRITICAL',
        sortOrder: 0,
        isPinned: true,
        isEmergency: true,
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    trustedContacts: [{
      id: 'contact-1',
      digitalWillId: 'will-1',
      name: 'Primary contact',
      email: 'contact@example.com',
      phone: null,
      relationship: null,
      role: 'FAMILY_MEMBER',
      accessLevel: 'VIEW',
      isPrimary: true,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  };
}

describe('Home Digital Will activation', () => {
  it('focuses critical information for document-sourced recommendations', () => {
    expect(homeDigitalWillDestinationSection({
      toolId: 'home-digital-will',
      resolved: resolved('DOCUMENT'),
    })).toBe('CRITICAL_INFO');
  });

  it('does not infer a destination for unrelated source types', () => {
    expect(homeDigitalWillDestinationSection({
      toolId: 'home-digital-will',
      resolved: resolved('PROJECT'),
    })).toBeNull();
  });

  it('enables publishing only after governed handoff requirements are met', () => {
    expect(homeDigitalWillHandoffReadiness(will())).toEqual({
      state: 'READY',
      missingRequirements: [],
    });
    expect(homeDigitalWillHandoffReadiness({
      ...will(),
      trustedContacts: [],
    })).toEqual({
      state: 'NEEDS_CONTEXT',
      missingRequirements: ['Choose a primary trusted contact.'],
    });
  });
});
