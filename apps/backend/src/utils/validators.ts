import { z } from 'zod';

// ============================================================================
// PROPERTY ENUMS (Phase 2 Additions)
// ============================================================================

const DwellingTypeEnum = z.enum([
  'DETACHED_SINGLE_FAMILY', 'ATTACHED_SINGLE_FAMILY', 'TOWNHOUSE', 'CONDO_UNIT',
  'APARTMENT_UNIT', 'DUPLEX', 'MULTI_FAMILY', 'MANUFACTURED_HOME', 'OTHER', 'UNKNOWN',
]);
const OwnershipFormEnum = z.enum(['FEE_SIMPLE', 'CONDOMINIUM', 'COOPERATIVE', 'LEASEHOLD', 'OTHER', 'UNKNOWN']);
const PropertyUseEnum = z.enum([
  'PRIMARY_RESIDENCE', 'SECOND_HOME', 'LONG_TERM_RENTAL', 'SHORT_TERM_RENTAL',
  'VACANT', 'UNDER_RENOVATION', 'FOR_SALE', 'OTHER', 'UNKNOWN',
]);
const OccupancyStatusEnum = z.enum(['OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'FAMILY_OCCUPIED', 'MIXED', 'VACANT', 'UNKNOWN']);
const OutdoorSpaceTypeEnum = z.enum(['PRIVATE_YARD', 'BALCONY', 'PATIO', 'DECK', 'GARDEN_BED', 'SHARED_YARD', 'ROOFTOP']);

const PropertyExteriorProfileSchema = z.object({
  hasPrivateOutdoorSpace: z.boolean().nullable().optional(),
  outdoorSpaceTypes: z.array(OutdoorSpaceTypeEnum).optional(),
  lotSizeSqFt: z.number().positive().nullable().optional(),
  hasLawn: z.boolean().nullable().optional(),
  hasTreesOrShrubs: z.boolean().nullable().optional(),
  hasDriveway: z.boolean().nullable().optional(),
  hasFence: z.boolean().nullable().optional(),
  hasPoolOrSpa: z.boolean().nullable().optional(),
  hasIrrigation: z.boolean().nullable().optional(),
  hasOutdoorFaucets: z.boolean().nullable().optional(),
  hasDrainageIssues: z.boolean().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.hasPrivateOutdoorSpace === false && (value.outdoorSpaceTypes?.length ?? 0) > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['outdoorSpaceTypes'],
      message: 'Outdoor space types cannot be set when private outdoor space is explicitly absent',
    });
  }
});

const PropertyResponsibilityInputSchema = z.object({
  scope: z.enum([
    'ROOF', 'BUILDING_EXTERIOR', 'LANDSCAPING', 'TREES_SHRUBS',
    'DRIVEWAY_WALKWAYS', 'DECK_PATIO_BALCONY', 'PLUMBING', 'HVAC',
    'COMMON_SAFETY', 'SNOW_ICE', 'PEST_CONTROL', 'SHARED_SYSTEMS',
  ]),
  party: z.enum(['OWNER', 'ASSOCIATION', 'LANDLORD', 'SHARED', 'UNKNOWN']),
  notes: z.string().trim().max(500).nullable().optional(),
});

const HeatingTypeEnum = z.enum(['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN']);

const CoolingTypeEnum = z.enum(['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN']);

const WaterHeaterTypeEnum = z.enum(['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN']);

const RoofTypeEnum = z.enum(['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN']);

const FOUNDATION_TYPE_VALUES = [
  'BASEMENT',
  'CRAWL_SPACE',
  'SLAB',
  'PIER_AND_BEAM',
  'RAISED',
  'MIXED',
  'OTHER',
  'UNKNOWN',
] as const;

/**
 * Keep property updates compatible with clients deployed before foundation type
 * became a canonical Prisma enum. Older Environment Report bundles submit
 * display labels such as "Slab" and "Crawl space"; normalize those labels at
 * the API boundary so Prisma only ever receives enum-safe values.
 */
const normalizeFoundationType = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const legacyAliases: Record<string, typeof FOUNDATION_TYPE_VALUES[number]> = {
    CRAWLSPACE: 'CRAWL_SPACE',
    PIER_BEAM: 'PIER_AND_BEAM',
    RAISED_FOUNDATION: 'RAISED',
    NOT_SURE: 'UNKNOWN',
  };

  if (legacyAliases[normalized]) return legacyAliases[normalized];
  return normalized;
};

export const FoundationTypeEnum = z.preprocess(
  normalizeFoundationType,
  z.enum(FOUNDATION_TYPE_VALUES),
);
const BasementConfigurationEnum = z.enum(['NONE', 'UNFINISHED', 'FINISHED', 'UNKNOWN']);


// ============================================================================
// Major-appliance profile input; persistence is canonical InventoryItem.
// ============================================================================

const PropertyApplianceInputSchema = z.object({
  // ID is needed for the robust sync logic in the service (Update/Delete tracking)
  id: z.string().optional(), 
  type: z.string().min(1, 'Asset type is required'),
  installYear: z.number().int().min(1900, 'Invalid installation year'),
});


// ============================================================================
// AUTH & USER SCHEMAS (Existing)
// ============================================================================

// Registration schema
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  phone: z.string().optional(),
  role: z.enum(['HOMEOWNER', 'PROVIDER']).default('HOMEOWNER'),
  acceptedTerms: z.literal(true, {
    message: 'You must agree to the Terms of Service and Privacy Policy to create an account',
  }),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Email verification schema
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
});

// Update profile schema
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  bio: z.string().max(500).optional(),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
});

// ============================================================================
// PROPERTY SCHEMAS (Phase 2 Additions)
// ============================================================================

export const createPropertySchema = z.object({
  // Existing fields (Required for initial property creation)
  name: z.string().max(100).optional(),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 characters'),
  zipCode: z.string().regex(/^\d{5}$/, 'ZIP code must be 5 digits'),
  timezone: z.string().trim().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Timezone must be a valid IANA timezone').nullable().optional(),
  isPrimary: z.boolean().optional(),

  // Layer 1 - Basic/Migrated Fields
  dwellingType: DwellingTypeEnum.optional(),
  ownershipForm: OwnershipFormEnum.optional(),
  propertyUse: PropertyUseEnum.optional(),
  occupancyStatus: OccupancyStatusEnum.optional(),
  propertySize: z.number().int().positive().optional(),
  yearBuilt: z.number().int().min(1700).optional(),

  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().positive().optional(),
  heatingType: HeatingTypeEnum.optional(),
  coolingType: CoolingTypeEnum.optional(),
  waterHeaterType: WaterHeaterTypeEnum.optional(),
  roofType: RoofTypeEnum.optional(),
  hvacInstallYear: z.number().int().min(1700).optional(),
  waterHeaterInstallYear: z.number().int().min(1700).optional(),
  roofReplacementYear: z.number().int().min(1700).optional(),
  foundationType: FoundationTypeEnum.optional(),
  basementConfiguration: BasementConfigurationEnum.optional(),
  sidingType: z.string().max(100).optional(),
  electricalPanelAge: z.number().int().positive().optional(),
  lotSize: z.number().positive().optional(),
  hasIrrigation: z.boolean().optional(),
  hasDrainageIssues: z.boolean().optional(),
  exteriorProfile: PropertyExteriorProfileSchema.optional(),
  responsibilities: z.array(PropertyResponsibilityInputSchema).max(12).optional(),
  hasSmokeDetectors: z.boolean().optional(),
  hasCoDetectors: z.boolean().optional(),
  hasSecuritySystem: z.boolean().optional(),
  hasFireExtinguisher: z.boolean().optional(),
  hasSumpPump: z.boolean().nullable().optional(),
  hasSumpPumpBackup: z.boolean().nullable().optional(),
  primaryHeatingFuel: z.string().max(50).nullable().optional(),
  hasSecondaryHeat: z.boolean().nullable().optional(),
  utilityProvider: z.string().max(100).nullable().optional(),
  gasProvider: z.string().max(100).nullable().optional(),
  inHistoricDistrict: z.boolean().nullable().optional(),
  historicRegistryStatus: z.string().max(100).nullable().optional(),
  inHurricaneZone: z.boolean().nullable().optional(),
  inFloodZone: z.boolean().nullable().optional(),
  inWildfireZone: z.boolean().nullable().optional(),
  isResilienceVerified: z.boolean().optional(),
  isUtilityVerified: z.boolean().optional(),
  purchasePriceCents: z.number().int().nonnegative().nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  lastAppraisedValue: z.number().int().nonnegative().nullable().optional(),
  lastAppraisalDate: z.coerce.date().nullable().optional(),
  isEquityVerified: z.boolean().optional(),
  coverPhotoDocumentId: z.string().uuid().nullable().optional(),
  
  majorAppliances: z.array(PropertyApplianceInputSchema).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();


// TypeScript types inferred from schemas
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
