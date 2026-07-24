import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  CapabilitySuggestionDTO,
  UnifiedHomeDTO,
} from '@/types';

const mockTrack = jest.fn();
const mockRecordHomeActionOpened = jest.fn(() => Promise.resolve());

jest.mock('next/link', () => ({
  __esModule: true,
  default: React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement>
  >(({ href, children, ...rest }, ref) => (
    <a ref={ref} href={String(href)} {...rest}>{children}</a>
  )),
}));

jest.mock('@/lib/analytics/events', () => ({ track: mockTrack }));
jest.mock('@/lib/api/client', () => ({
  api: { recordHomeActionOpened: mockRecordHomeActionOpened },
}));
jest.mock('@/features/tools/useCapabilityImpression', () => ({
  useCapabilityImpression: () => () => undefined,
}));
jest.mock('@/features/tools/toolDiscoveryRegistry', () => ({
  getDiscoverableTool: () => ({
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg aria-label="tool icon" {...props} />
    ),
  }),
}));

import { UnifiedHomeToolsSection } from '../UnifiedHomeToolsSection';

function suggestion(
  capabilityId: string,
  rank: number,
  overrides: Partial<CapabilitySuggestionDTO> = {},
): CapabilitySuggestionDTO {
  return {
    suggestionId: `${capabilityId}:JOURNEY:source-${rank}:context-v3`,
    capabilityId,
    manifestVersion: 1,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v3',
    rank,
    scoreBand: 'HIGH',
    label: `Server ${capabilityId}`,
    shortDescription: `Server description for ${capabilityId}`,
    iconName: 'SPARKLES',
    outcomeCategory: 'UNDERSTAND_HOME',
    reasonCode: `REASON_${rank}`,
    whyNow: `Server why-now ${rank}`,
    expectedOutcome: `Server outcome ${rank}`,
    readiness: {
      state: 'READY',
      reasonCodes: [],
      missingFactKeys: [],
      explanations: [],
    },
    evidence: {
      mode: 'STRUCTURED_ONLY',
      summary: 'Based on the authorized Home context.',
      sourceObservedAt: '2026-07-24T12:00:00.000Z',
      actionConfidence: null,
      contextWarningCodes: [],
    },
    source: {
      kind: 'HOME_ACTION',
      id: 'action-1',
      actionId: 'action-1',
      journeyId: 'journey-1',
      entityType: 'INVENTORY_ITEM',
      entityId: 'item-1',
      sourceVersion: 'action-v4',
      observedAt: '2026-07-24T12:00:00.000Z',
    },
    launch: {
      label: `Open ${capabilityId}`,
      href: `/dashboard/properties/property-1/tools/${capabilityId}`,
    },
    ...overrides,
  };
}

function home(
  suggestions: CapabilitySuggestionDTO[],
  status: UnifiedHomeDTO['capabilitySuggestions']['status'] = 'AVAILABLE',
): UnifiedHomeDTO {
  return {
    propertyContext: { contextVersion: 'context-v3' },
    capabilitySuggestions: {
      status,
      contractVersion: 'capability-suggestions-v1',
      registryVersion: 'registry-v7',
      recommendationVersion: 'capability-recommendation-v1',
      contextVersion: 'context-v3',
      generatedAt: '2026-07-24T12:00:00.000Z',
      surface: 'HOME',
      suggestions,
    },
  } as UnifiedHomeDTO;
}

describe('UnifiedHomeToolsSection', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    mockRecordHomeActionOpened.mockClear();
  });

  it('renders only the bounded server suggestions with reviewed copy', () => {
    render(
      <UnifiedHomeToolsSection
        home={home([
          suggestion('plant-advisor', 1),
          suggestion('material-specs', 2, {
            readiness: {
              state: 'NEEDS_CONTEXT',
              reasonCodes: ['SOURCE_CONTEXT_UNKNOWN'],
              missingFactKeys: [],
              explanations: ['Choose a project or room first.'],
            },
          }),
          suggestion('home-digital-will', 3),
          suggestion('seller-prep', 4),
        ])}
        propertyId="property-1"
      />,
    );

    expect(screen.getByText('Server plant-advisor')).toBeInTheDocument();
    expect(screen.getByText('Server material-specs')).toBeInTheDocument();
    expect(screen.getByText('Server home-digital-will')).toBeInTheDocument();
    expect(screen.queryByText('Server seller-prep')).not.toBeInTheDocument();
    expect(screen.getByText('Server why-now 1')).toBeInTheDocument();
    expect(screen.getByText('Server outcome 1')).toBeInTheDocument();
    expect(screen.getByText('Choose a project or room first.')).toBeInTheDocument();
  });

  it('preserves launch attribution and records its source action open', () => {
    render(
      <UnifiedHomeToolsSection
        home={home([suggestion('plant-advisor', 1)])}
        propertyId="property-1"
      />,
    );

    const link = screen.getByTestId('unified-home-tool-plant-advisor');
    expect(link.getAttribute('href')).toContain('launchSurface=unified_home');
    expect(link.getAttribute('href')).toContain('sourceActionId=action-1');
    expect(link.getAttribute('href')).toContain('sourceEntityType=INVENTORY_ITEM');
    expect(link.getAttribute('href')).toContain('sourceEntityId=item-1');
    expect(link.getAttribute('href')).toContain('contextVersion=context-v3');
    expect(link.getAttribute('href')).toContain('journeyId=journey-1');
    expect(link.getAttribute('href')).toContain('itemId=item-1');
    expect(link.getAttribute('href')).toContain(
      'recommendationReason=capability-recommendation-v1%3AREASON_1',
    );

    fireEvent.click(link);
    expect(mockTrack).toHaveBeenCalledWith('tool_discovery_clicked', expect.objectContaining({
      toolId: 'plant-advisor',
      sourceActionId: 'action-1',
      journeyId: 'journey-1',
      contextVersion: 'context-v3',
    }));
    expect(mockRecordHomeActionOpened).toHaveBeenCalledWith(
      'property-1',
      'action-1',
    );
  });

  it('keeps Explore Tools available when server suggestions fail closed', () => {
    render(
      <UnifiedHomeToolsSection
        home={home([], 'UNAVAILABLE')}
        propertyId="property-1"
      />,
    );

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    const explore = screen.getByRole('link', { name: /Explore all tools/i });
    expect(explore.getAttribute('href')).toContain(
      '/dashboard/home-tools?propertyId=property-1',
    );
  });
});
