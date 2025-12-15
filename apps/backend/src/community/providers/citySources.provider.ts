// apps/backend/src/community/providers/citySources.provider.ts

import { CityLinkItem, CityOpenDataResponse } from '../types/community.types';

// IMPORTANT:
// These are official endpoints (pages/feeds). Some cities do NOT publish a clean schedule API.
// This is still “on-the-fly” because we fetch/return live links/feeds each request (with caching in service).

function normalize(city: string, state: string) {
  return `${city}`.trim().toLowerCase() + '|' + `${state}`.trim().toLowerCase();
}

export function getCityOpenDataSources(city: string, state: string): CityOpenDataResponse {
  const key = normalize(city, state);

  // Jersey City, NJ
  if (key === normalize('Jersey City', 'NJ')) {
    const items: CityLinkItem[] = [
      {
        category: 'TRASH_RECYCLING',
        title: 'Trash & Recycling (Official Info)',
        description: 'Official sanitation & recycling information for Jersey City.',
        url: 'https://www.jerseycitynj.gov/cityhall/dpw/sanitation',
        sourceName: 'City of Jersey City (DPW)'
      },
      {
        category: 'ANNOUNCEMENTS',
        title: 'City News / Announcements',
        description: 'Official city announcements and updates.',
        url: 'https://www.jerseycitynj.gov/news',
        sourceName: 'City of Jersey City'
      },
      {
        category: 'SNOW_EMERGENCY',
        title: 'Winter Weather / Snow Updates',
        description: 'Official winter weather updates and emergency notices.',
        url: 'https://www.jerseycitynj.gov/cityhall/publicsafety/oem',
        sourceName: 'Jersey City OEM'
      }
    ];

    return { city: 'Jersey City', state: 'NJ', items };
  }

  // Princeton, NJ
  if (key === normalize('Princeton', 'NJ')) {
    const items: CityLinkItem[] = [
      {
        category: 'TRASH_RECYCLING',
        title: 'Trash & Recycling (Official Info)',
        description: 'Official refuse and recycling information for Princeton.',
        url: 'https://www.princetonnj.gov/300/Trash-Recycling',
        sourceName: 'Princeton Municipality'
      },
      {
        category: 'ANNOUNCEMENTS',
        title: 'Township News / Alerts',
        description: 'Official Princeton announcements and notices.',
        url: 'https://www.princetonnj.gov/CivicAlerts.aspx',
        sourceName: 'Princeton Civic Alerts'
      },
      {
        category: 'SNOW_EMERGENCY',
        title: 'Snow / Emergency Information',
        description: 'Official emergency management and winter weather updates.',
        url: 'https://www.princetonnj.gov/291/Emergency-Management',
        sourceName: 'Princeton Emergency Management'
      }
    ];

    return { city: 'Princeton', state: 'NJ', items };
  }

  // NYC (citywide / Manhattan)
  if (
    key === normalize('New York', 'NY') ||
    key === normalize('NYC', 'NY') ||
    key === normalize('Manhattan', 'NY')
  ) {
    const items: CityLinkItem[] = [
      {
        category: 'TRASH_RECYCLING',
        title: 'Collection Schedule (NYC DSNY)',
        description: 'Find trash/recycling pickup schedule by address.',
        url: 'https://www.nyc.gov/site/dsny/collection/get-collection-schedule.page',
        sourceName: 'NYC DSNY'
      },
      {
        category: 'ANNOUNCEMENTS',
        title: 'NYC Official Press Releases',
        description: 'Citywide announcements and press releases.',
        url: 'https://www.nyc.gov/office-of-the-mayor/news.page',
        sourceName: 'NYC Mayor’s Office'
      },
      {
        category: 'SNOW_EMERGENCY',
        title: 'NYC Emergency Alerts / Notify NYC',
        description: 'Emergency alerts and snow emergencies.',
        url: 'https://a858-nycnotify.nyc.gov/notifynyc/',
        sourceName: 'Notify NYC'
      }
    ];

    return { city: 'New York', state: 'NY', items };
  }

  // Default fallback (unknown city)
  return {
    city,
    state,
    items: [
      {
        category: 'ANNOUNCEMENTS',
        title: 'No configured sources for this city',
        description: 'Add this city to citySources.provider.ts to enable official links/feeds.',
        url: '',
        sourceName: 'Contract to Cozy'
      }
    ]
  };
}
