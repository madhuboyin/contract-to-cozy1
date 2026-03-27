import { trackPlantAdvisorEvent } from '../plantAdvisorApi';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  api: {
    trackHomeEventRadarEvent: jest.fn(),
  },
}));

describe('trackPlantAdvisorEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults section to plant_advisor when section is omitted', async () => {
    await trackPlantAdvisorEvent('property-1', {
      event: 'PLANT_ADVISOR_OPENED',
      metadata: { launch_surface: 'test' },
    });

    expect(api.trackHomeEventRadarEvent).toHaveBeenCalledWith('property-1', {
      event: 'PLANT_ADVISOR_OPENED',
      section: 'plant_advisor',
      metadata: { launch_surface: 'test' },
    });
  });

  it('preserves explicit section value', async () => {
    await trackPlantAdvisorEvent('property-1', {
      event: 'PLANT_ADVISOR_PROFILE_EDITED',
      section: 'profile',
      metadata: { field: 'lightLevel' },
    });

    expect(api.trackHomeEventRadarEvent).toHaveBeenCalledWith('property-1', {
      event: 'PLANT_ADVISOR_PROFILE_EDITED',
      section: 'profile',
      metadata: { field: 'lightLevel' },
    });
  });
});
