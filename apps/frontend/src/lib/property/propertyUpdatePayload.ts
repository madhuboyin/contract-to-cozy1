type DirtyFieldMap = Record<string, unknown>;

type SparsePayloadOptions = {
  coverPhotoDocumentId?: string | null;
};

const DIRECT_FIELD_NAMES = [
  'name', 'address', 'unit', 'city', 'state', 'zipCode', 'timezone', 'isPrimary',
  'dwellingType', 'ownershipForm', 'propertyUse', 'occupancyStatus',
  'propertySize', 'yearBuilt', 'bedrooms', 'bathrooms',
  'heatingType', 'coolingType', 'waterHeaterType', 'roofType',
  'hvacInstallYear', 'waterHeaterInstallYear', 'roofReplacementYear',
  'foundationType', 'basementConfiguration', 'sidingType', 'electricalPanelAge',
  'hasSmokeDetectors', 'hasCoDetectors', 'hasDrainageIssues',
  'hasSecuritySystem', 'hasFireExtinguisher', 'hasIrrigation',
  'utilityProvider', 'gasProvider', 'inHistoricDistrict', 'historicRegistryStatus',
  'inHurricaneZone', 'inFloodZone', 'inWildfireZone', 'isCoastal',
] as const;

const EXTERIOR_FIELD_NAMES = [
  'hasPrivateOutdoorSpace', 'outdoorSpaceTypes', 'lotSizeSqFt', 'hasLawn',
  'hasTreesOrShrubs', 'hasDriveway', 'hasFence', 'hasPoolOrSpa',
  'hasOutdoorFaucets', 'hasIrrigation', 'hasDrainageIssues',
] as const;

/**
 * Converts the fully normalized Property Details form payload into the partial
 * API update contract. Undefined values are intentionally omitted: for
 * tri-state controls, undefined means the homeowner did not assert Yes or No.
 */
export function buildSparsePropertyUpdatePayload(
  payload: Record<string, unknown>,
  dirtyFields: DirtyFieldMap,
  options: SparsePayloadOptions = {},
): Record<string, unknown> {
  const sparsePayload: Record<string, unknown> = {};

  for (const fieldName of DIRECT_FIELD_NAMES) {
    if (dirtyFields[fieldName] && payload[fieldName] !== undefined) {
      sparsePayload[fieldName] = payload[fieldName];
    }
  }

  if (
    dirtyFields.dwellingType
    || dirtyFields.ownershipForm
    || EXTERIOR_FIELD_NAMES.some((fieldName) => Boolean(dirtyFields[fieldName]))
  ) {
    sparsePayload.exteriorProfile = payload.exteriorProfile;
  }

  if (dirtyFields.responsibilities) sparsePayload.responsibilities = payload.responsibilities;
  if (dirtyFields.purchasePriceDollars) sparsePayload.purchasePriceCents = payload.purchasePriceCents;
  if (dirtyFields.purchaseDate) sparsePayload.purchaseDate = payload.purchaseDate;
  if (dirtyFields.lastAppraisedValueDollars) sparsePayload.lastAppraisedValue = payload.lastAppraisedValue;
  if (dirtyFields.lastAppraisalDate) sparsePayload.lastAppraisalDate = payload.lastAppraisalDate;
  if (dirtyFields.appliances) sparsePayload.majorAppliances = payload.majorAppliances;
  if (options.coverPhotoDocumentId !== undefined) {
    sparsePayload.coverPhotoDocumentId = options.coverPhotoDocumentId;
  }

  return sparsePayload;
}
