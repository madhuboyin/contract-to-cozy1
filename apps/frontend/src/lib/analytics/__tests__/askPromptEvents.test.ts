import { getFaro } from '@/lib/monitoring/faro';
import { track } from '../events';

jest.mock('@/lib/monitoring/faro', () => ({ getFaro: jest.fn() }));
jest.mock('@/features/tools/toolLifecycleTelemetry', () => ({ persistToolLifecycleEvents: jest.fn() }));

describe('Ask prompt analytics', () => {
  it('records selection and outcome without capturing question text', () => {
    const pushEvent = jest.fn();
    (getFaro as jest.Mock).mockReturnValue({ api: { pushEvent } });

    track('ask_prompt_selected', { propertyId: 'property-1', promptId: 'protect-coverage', categoryId: 'PROTECT', source: 'DISCOVERY' });
    track('ask_prompt_outcome', { propertyId: 'property-1', promptId: 'protect-coverage', categoryId: 'PROTECT', source: 'DISCOVERY', executionId: 'execution-1', operationId: 'COVERAGE_GAPS', status: 'ANSWERED', succeeded: true });

    expect(pushEvent).toHaveBeenCalledWith('ask_prompt_selected', expect.objectContaining({ promptId: 'protect-coverage', categoryId: 'PROTECT' }));
    expect(pushEvent).toHaveBeenCalledWith('ask_prompt_outcome', expect.objectContaining({ executionId: 'execution-1', operationId: 'COVERAGE_GAPS', succeeded: 'true' }));
    for (const [, attributes] of pushEvent.mock.calls) expect(attributes).not.toHaveProperty('question');
  });
});
