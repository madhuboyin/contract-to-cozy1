import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CapabilitySuggestionDTO } from '@/types';

const mockTrack = jest.fn();
const mockRecordCapabilitySuggestionFeedback = jest.fn(
  (_input: unknown) => Promise.resolve(),
);
const mockUseCapabilityImpression = jest.fn((_input: unknown) => jest.fn());

jest.mock('next/link', () => {
  const MockLink = React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement>
  >(({ href, children, ...rest }, ref) => (
    <a ref={ref} href={String(href)} {...rest}>{children}</a>
  ));
  MockLink.displayName = 'MockLink';
  return {
    __esModule: true,
    default: MockLink,
  };
});
jest.mock('@/lib/analytics/events', () => ({ track: mockTrack }));
jest.mock('@/features/tools/capabilityApi', () => ({
  recordCapabilitySuggestionFeedback: (
    input: unknown,
  ) => mockRecordCapabilitySuggestionFeedback(input),
}));
jest.mock('@/features/tools/useCapabilityImpression', () => ({
  useCapabilityImpression: (input: unknown) => mockUseCapabilityImpression(input),
}));
jest.mock('@/features/tools/capabilityIconRegistry', () => ({
  resolveCapabilityIcon: () => (
    props: React.SVGProps<SVGSVGElement>,
  ) => <svg data-testid="capability-icon" {...props} />,
}));

import { InlineCapabilitySuggestion } from '../InlineCapabilitySuggestion';

function suggestion(
  overrides: Partial<CapabilitySuggestionDTO> = {},
): CapabilitySuggestionDTO {
  return {
    suggestionId: 'material-specs:PROJECT:project-1:context-v8',
    capabilityId: 'material-specs',
    manifestVersion: 2,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v8',
    rank: 1,
    scoreBand: 'HIGH',
    label: 'Material Specs',
    shortDescription: 'Record finishes and materials.',
    iconName: 'layers',
    outcomeCategory: 'UNDERSTAND_HOME',
    reasonCode: 'PROJECT_MATERIAL_RECORD',
    whyNow: 'Your project is ready for finish selections.',
    expectedOutcome: 'Create a reusable record of materials and finishes.',
    readiness: {
      state: 'READY',
      reasonCodes: [],
      missingFactKeys: [],
      explanations: ['Ready for this project.'],
    },
    evidence: {
      mode: 'STRUCTURED_ONLY',
      summary: null,
      sourceObservedAt: '2026-07-24T12:00:00.000Z',
      actionConfidence: null,
      contextWarningCodes: [],
    },
    source: {
      kind: 'PROJECT',
      id: 'project-1',
      actionId: 'action-1',
      journeyId: 'journey-1',
      entityType: 'PROJECT',
      entityId: 'project-1',
      sourceVersion: 'project-v3',
      observedAt: '2026-07-24T12:00:00.000Z',
    },
    launch: {
      label: 'Open Material Specs',
      href: '/dashboard/properties/property-1/tools/material-specs',
    },
    ...overrides,
  };
}

describe('InlineCapabilitySuggestion', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    mockRecordCapabilitySuggestionFeedback.mockClear();
    mockUseCapabilityImpression.mockClear();
  });

  it('renders the complete non-modal server suggestion and actual-view contract', () => {
    render(
      <InlineCapabilitySuggestion
        suggestion={suggestion()}
        propertyId="property-1"
        registryVersion="registry-v12"
        surface="workflow"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-icon')).toBeInTheDocument();
    expect(screen.getByText('Material Specs')).toBeInTheDocument();
    expect(screen.getByText('Your project is ready for finish selections.')).toBeInTheDocument();
    expect(screen.getByText('Create a reusable record of materials and finishes.')).toBeInTheDocument();
    expect(screen.getByText('Ready for this project.')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not relevant' })).not.toBeInTheDocument();
    expect(mockUseCapabilityImpression).toHaveBeenCalledWith({
      capabilityId: 'material-specs',
      propertyId: 'property-1',
      surface: 'workflow',
      registryVersion: 'registry-v12',
      recommendationReason: 'PROJECT_MATERIAL_RECORD',
      recommendationVersion: 'capability-recommendation-v1',
      contextVersion: 'context-v8',
      sourceActionId: 'action-1',
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      journeyId: 'journey-1',
    });
  });

  it('preserves launch lineage and records the open interaction', () => {
    const onOpen = jest.fn();
    const value = suggestion();
    render(
      <InlineCapabilitySuggestion
        suggestion={value}
        propertyId="property-1"
        registryVersion="registry-v12"
        surface="workflow"
        position={2}
        onOpen={onOpen}
      />,
    );

    const link = screen.getByRole('link', { name: /Open Material Specs/i });
    expect(link.getAttribute('href')).toContain('launchSurface=workflow');
    expect(link.getAttribute('href')).toContain('sourceActionId=action-1');
    expect(link.getAttribute('href')).toContain('sourceEntityType=PROJECT');
    expect(link.getAttribute('href')).toContain('sourceEntityId=project-1');
    expect(link.getAttribute('href')).toContain('contextVersion=context-v8');
    expect(link.getAttribute('href')).toContain('journeyId=journey-1');
    expect(link.getAttribute('href')).toContain(
      'recommendationReason=PROJECT_MATERIAL_RECORD',
    );
    expect(link.getAttribute('href')).toContain(
      'recommendationVersion=capability-recommendation-v1',
    );

    fireEvent.click(link);
    expect(mockTrack).toHaveBeenCalledWith(
      'tool_discovery_clicked',
      expect.objectContaining({
        propertyId: 'property-1',
        surface: 'workflow',
        toolId: 'material-specs',
        position: 2,
        sourceActionId: 'action-1',
        sourceEntityType: 'PROJECT',
        sourceEntityId: 'project-1',
        journeyId: 'journey-1',
      }),
    );
    expect(mockRecordCapabilitySuggestionFeedback).toHaveBeenCalledWith({
      propertyId: 'property-1',
      registryVersion: 'registry-v12',
      surface: 'workflow',
      suggestion: value,
      type: 'OPENED',
    });
    expect(onOpen).toHaveBeenCalledWith(value);
  });

  it('shows only permitted feedback controls and delegates decisions', () => {
    const onDismiss = jest.fn();
    const onNotRelevant = jest.fn();
    const value = suggestion({
      readiness: {
        state: 'NEEDS_CONTEXT',
        reasonCodes: ['SOURCE_CONTEXT_UNKNOWN'],
        missingFactKeys: [],
        explanations: [],
      },
    });
    const { rerender } = render(
      <InlineCapabilitySuggestion
        suggestion={value}
        propertyId="property-1"
        registryVersion="registry-v12"
        surface="workflow"
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('Needs context')).toBeInTheDocument();
    expect(screen.getByText(/Add the requested context/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not relevant' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith(value);

    rerender(
      <InlineCapabilitySuggestion
        suggestion={value}
        propertyId="property-1"
        registryVersion="registry-v12"
        surface="workflow"
        controlsDisabled
        onDismiss={onDismiss}
        onNotRelevant={onNotRelevant}
      />,
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not relevant' })).toBeDisabled();
  });
});
