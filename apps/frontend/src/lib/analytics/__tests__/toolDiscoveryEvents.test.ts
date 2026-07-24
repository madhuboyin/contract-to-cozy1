import { getFaro } from '@/lib/monitoring/faro';
import { track } from '../events';

jest.mock('@/lib/monitoring/faro', () => ({ getFaro: jest.fn() }));

const mockPersistToolLifecycleEvents = jest.fn();
jest.mock('@/features/tools/toolLifecycleTelemetry', () => ({
  persistToolLifecycleEvents: (...args: unknown[]) => mockPersistToolLifecycleEvents(...args),
}));

describe('tool discovery analytics', () => {
  const pushEvent = jest.fn();

  beforeEach(() => {
    pushEvent.mockClear();
    mockPersistToolLifecycleEvents.mockClear();
    window.sessionStorage.clear();
    (getFaro as jest.Mock).mockReturnValue({ api: { pushEvent } });
  });

  it('attributes a completed workflow to its discovery click', () => {
    track('tool_discovery_clicked', {
      propertyId: 'property-1',
      surface: 'unified_home',
      toolId: 'coverage-options',
      recommendationReason: 'capability-recommendation-v1:COVERAGE_GAPS_PRESENT',
      journeyId: 'journey-1',
    });
    track('workflow_completed', {
      tool: 'coverage-options',
      propertyId: 'property-1',
    });

    expect(pushEvent).toHaveBeenCalledWith('tool_discovery_clicked', expect.any(Object));
    expect(pushEvent).toHaveBeenCalledWith('tool_discovery_outcome', expect.objectContaining({
      toolId: 'coverage-options',
      sourceSurface: 'unified_home',
      outcome: 'workflow_completed',
    }));
    expect(mockPersistToolLifecycleEvents).toHaveBeenCalledWith(
      'property-1',
      expect.arrayContaining([
        expect.objectContaining({
          toolId: 'coverage-options',
          stage: 'COMPLETED',
          journeyId: 'journey-1',
        }),
      ]),
    );
  });

  it('consumes attribution only once', () => {
    track('tool_discovery_clicked', {
      surface: 'explore_tools',
      toolId: 'coverage-options',
    });
    track('workflow_completed', { tool: 'coverage-options', propertyId: 'property-1' });
    track('workflow_completed', { tool: 'coverage-options', propertyId: 'property-1' });

    expect(pushEvent.mock.calls.filter(([event]) => event === 'tool_discovery_outcome')).toHaveLength(1);
  });

  it('normalizes legacy workflow tool names before durable ingestion', () => {
    track('workflow_started', { tool: 'do-nothing', propertyId: 'property-1', entryPoint: 'direct' });

    expect(mockPersistToolLifecycleEvents).toHaveBeenCalledWith('property-1', [
      expect.objectContaining({ toolId: 'do-nothing-simulator', stage: 'STARTED' }),
    ]);
  });
});
