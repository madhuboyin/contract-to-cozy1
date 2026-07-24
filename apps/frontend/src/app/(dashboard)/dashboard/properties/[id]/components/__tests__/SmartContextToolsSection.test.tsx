import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  CapabilitySuggestionDTO,
  CapabilitySuggestionResponseDTO,
} from '@/types';

const mockUseQuery = jest.fn();
const mockGetCapabilitySuggestions = jest.fn();
const mockRecordHomeActionOpened = jest.fn(() => Promise.resolve());
const mockTrack = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement>
  >(({ href, children, ...rest }, ref) => (
    <a ref={ref} href={String(href)} {...rest}>{children}</a>
  )),
}));
jest.mock('@/lib/api/client', () => ({
  api: {
    getCapabilitySuggestions: mockGetCapabilitySuggestions,
    recordHomeActionOpened: mockRecordHomeActionOpened,
  },
}));
jest.mock('@/lib/analytics/events', () => ({ track: mockTrack }));
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

import { SmartContextToolsSection } from '../SmartContextToolsSection';

function suggestion(
  capabilityId: string,
  rank: number,
): CapabilitySuggestionDTO {
  return {
    suggestionId: `${capabilityId}:HOME_ACTION:action-1:context-v8`,
    capabilityId,
    manifestVersion: 1,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v8',
    rank,
    scoreBand: 'HIGH',
    label: `Server ${capabilityId}`,
    shortDescription: 'Server suggestion',
    iconName: 'SPARKLES',
    outcomeCategory: 'UNDERSTAND_HOME',
    reasonCode: `PROPERTY_REASON_${rank}`,
    whyNow: `Property why-now ${rank}`,
    expectedOutcome: `Property outcome ${rank}`,
    readiness: {
      state: 'READY',
      reasonCodes: [],
      missingFactKeys: [],
      explanations: ['Ready from the authorized property context.'],
    },
    evidence: {
      mode: 'STRUCTURED_ONLY',
      summary: 'Authorized context.',
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
      sourceVersion: 'action-v2',
      observedAt: '2026-07-24T12:00:00.000Z',
    },
    launch: {
      label: `Open ${capabilityId}`,
      href: `/dashboard/properties/property-1/tools/${capabilityId}`,
    },
  };
}

function response(
  suggestions: CapabilitySuggestionDTO[],
): CapabilitySuggestionResponseDTO {
  return {
    contractVersion: 'capability-suggestions-v1',
    registryVersion: 'registry-v8',
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v8',
    generatedAt: '2026-07-24T12:00:00.000Z',
    surface: 'PROPERTY',
    suggestions,
  };
}

describe('SmartContextToolsSection', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockGetCapabilitySuggestions.mockReset();
    mockRecordHomeActionOpened.mockClear();
    mockTrack.mockClear();
  });

  it('requests and renders only bounded PROPERTY suggestions from the server', async () => {
    const data = response([
      suggestion('material-specs', 1),
      suggestion('plant-advisor', 2),
      suggestion('home-digital-will', 3),
      suggestion('seller-prep', 4),
    ]);
    mockUseQuery.mockReturnValue({
      data,
      isLoading: false,
      isError: false,
    });
    mockGetCapabilitySuggestions.mockResolvedValue(data);

    render(<SmartContextToolsSection propertyId="property-1" />);

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey).toEqual([
      'capability-suggestions',
      'property-1',
      'PROPERTY',
      3,
    ]);
    await options.queryFn();
    expect(mockGetCapabilitySuggestions).toHaveBeenCalledWith(
      'property-1',
      { surface: 'PROPERTY', limit: 3 },
    );
    expect(screen.getByText('Server material-specs')).toBeInTheDocument();
    expect(screen.getByText('Server plant-advisor')).toBeInTheDocument();
    expect(screen.getByText('Server home-digital-will')).toBeInTheDocument();
    expect(screen.queryByText('Server seller-prep')).not.toBeInTheDocument();
    expect(screen.getByText('Property why-now 1')).toBeInTheDocument();
    expect(screen.getByText('Property outcome 1')).toBeInTheDocument();
  });

  it('preserves property launch attribution and source-action opening', () => {
    mockUseQuery.mockReturnValue({
      data: response([suggestion('material-specs', 1)]),
      isLoading: false,
      isError: false,
    });

    render(<SmartContextToolsSection propertyId="property-1" />);
    const link = screen.getByTestId('smart-context-tool-material-specs');
    expect(link.getAttribute('href')).toContain('launchSurface=property_detail');
    expect(link.getAttribute('href')).toContain('sourceActionId=action-1');
    expect(link.getAttribute('href')).toContain('sourceEntityId=item-1');
    expect(link.getAttribute('href')).toContain('contextVersion=context-v8');
    expect(link.getAttribute('href')).toContain('journeyId=journey-1');
    expect(link.getAttribute('href')).toContain(
      'recommendationReason=capability-recommendation-v1%3APROPERTY_REASON_1',
    );

    fireEvent.click(link);
    expect(mockTrack).toHaveBeenCalledWith(
      'tool_discovery_clicked',
      expect.objectContaining({
        surface: 'property_detail',
        toolId: 'material-specs',
        sourceActionId: 'action-1',
        journeyId: 'journey-1',
      }),
    );
    expect(mockRecordHomeActionOpened).toHaveBeenCalledWith(
      'property-1',
      'action-1',
    );
  });

  it('keeps the All tools fallback when the endpoint is unavailable', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<SmartContextToolsSection propertyId="property-1" />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All tools/i }))
      .toHaveAttribute(
        'href',
        '/dashboard/home-tools?propertyId=property-1',
      );
  });
});
