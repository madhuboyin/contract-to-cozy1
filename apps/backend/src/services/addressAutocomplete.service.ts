const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

export interface AddressSuggestion {
  placeId: string;
  label: string;
}

export interface ResolvedAddress {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

function getApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

async function googlePlacesRequest(url: string, init: RequestInit): Promise<any | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Google Places request failed with status ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestAddresses(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
  if (!getApiKey() || input.trim().length < 3) return [];

  const data = await googlePlacesRequest(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
    body: JSON.stringify({
      input: input.trim(),
      sessionToken,
      includedRegionCodes: ['us'],
      includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
      languageCode: 'en-US',
    }),
  });

  return (data?.suggestions || []).flatMap((suggestion: any) => {
    const prediction = suggestion?.placePrediction;
    return prediction?.placeId && prediction?.text?.text
      ? [{ placeId: prediction.placeId, label: prediction.text.text }]
      : [];
  }).slice(0, 5);
}

function componentValue(components: any[], type: string, short = false): string {
  const component = components.find((item) => item?.types?.includes(type));
  return (short ? component?.shortText : component?.longText) || '';
}

export async function resolveAddress(placeId: string, sessionToken: string): Promise<ResolvedAddress | null> {
  if (!getApiKey()) return null;

  const params = new URLSearchParams({ sessionToken, languageCode: 'en-US' });
  const data = await googlePlacesRequest(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}?${params}`, {
    method: 'GET',
    headers: { 'X-Goog-FieldMask': 'addressComponents' },
  });
  const components = data?.addressComponents || [];
  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const address = [streetNumber, route].filter(Boolean).join(' ');
  const city = componentValue(components, 'locality')
    || componentValue(components, 'postal_town')
    || componentValue(components, 'sublocality_level_1');
  const state = componentValue(components, 'administrative_area_level_1', true);
  const zipCode = componentValue(components, 'postal_code');

  return address && city && state && /^\d{5}$/.test(zipCode)
    ? { address, city, state, zipCode }
    : null;
}
