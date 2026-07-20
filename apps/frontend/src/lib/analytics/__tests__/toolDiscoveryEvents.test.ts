import { getFaro } from '@/lib/monitoring/faro';
import { track } from '../events';

jest.mock('@/lib/monitoring/faro', () => ({ getFaro: jest.fn() }));

describe('tool discovery analytics', () => {
  const pushEvent = jest.fn();

  beforeEach(() => {
    pushEvent.mockClear();
    window.sessionStorage.clear();
    (getFaro as jest.Mock).mockReturnValue({ api: { pushEvent } });
  });

  it('attributes a completed workflow to its discovery click', () => {
    track('tool_discovery_clicked', {
      propertyId: 'property-1',
      surface: 'unified_home',
      toolId: 'coverage-options',
      recommendationReason: 'unified-home-tools-v2:COVERAGE_GAPS_PRESENT',
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
});
