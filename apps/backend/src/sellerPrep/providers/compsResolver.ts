// apps/backend/src/sellerPrep/providers/compsResolver.ts
import { CompsProvider } from './comps.provider';
import { PublicCompsProvider } from './publicComps.provider';
import { CompsFallbackProvider } from './compsFallback.provider';

const SUPPORTED_REGIONS = ['NY', 'NJ', 'CA', 'TX', 'FL'];

export function resolveCompsProvider(input: {
  city: string;
  state: string;
  zipCode?: string;
  propertyType?: string;
}): CompsProvider {
  if (SUPPORTED_REGIONS.includes(input.state)) {
    return new PublicCompsProvider();
  }
  return new CompsFallbackProvider();
}
  