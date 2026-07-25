const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

export function resolveDashboardCommandPaletteCatalog(input: {
  explicitPropertyId?: string;
  pathname?: string | null;
  selectedPropertyId?: string | null;
  isAdmin: boolean;
  open: boolean;
}): { propertyId?: string; enabled: boolean } {
  const propertyIdFromPath = input.pathname?.match(PROPERTY_ID_IN_PATH)?.[1];

  return {
    propertyId:
      input.explicitPropertyId ||
      propertyIdFromPath ||
      input.selectedPropertyId ||
      undefined,
    enabled: !input.isAdmin && input.open,
  };
}
