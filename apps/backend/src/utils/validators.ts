import { z } from 'zod';

// ============================================================================
// PROPERTY ENUMS (Phase 2 Additions)
// ============================================================================

const PropertyTypeEnum = z.enum([
  'SINGLE_FAMILY', 
  'TOWNHOME', 
  'CONDO', 
  'APARTMENT', 
  'MULTI_UNIT', 
  'INVESTMENT_PROPERTY'
]);

const OwnershipTypeEnum = z.enum(['OWNER_OCCUPIED', 'RENTED_OUT']);

const HeatingTypeEnum = z.enum(['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN']);

const CoolingTypeEnum = z.enum(['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN']);

const WaterHeaterTypeEnum = z.enum(['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN']);

const RoofTypeEnum = z.enum(['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN']);


// ============================================================================
// NEW ASSET SCHEMA (Strategic Fix for HomeAsset Table)
// ============================================================================

// Schema for a single HomeAsset record being sent from the frontend
const HomeAssetInputSchema = z.object({
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
  segment: z.enum(['HOME_BUYER', 'EXISTING_OWNER']).optional(),
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
  isPrimary: z.boolean().optional(),

  // Layer 1 - Basic/Migrated Fields
  propertyType: PropertyTypeEnum.optional(),
  propertySize: z.number().int().positive().optional(),
  yearBuilt: z.number().int().min(1700).optional(),

  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().positive().optional(),
  ownershipType: OwnershipTypeEnum.optional(),
  occupantsCount: z.number().int().positive().optional(),
  heatingType: HeatingTypeEnum.optional(),
  coolingType: CoolingTypeEnum.optional(),
  waterHeaterType: WaterHeaterTypeEnum.optional(),
  roofType: RoofTypeEnum.optional(),
  hvacInstallYear: z.number().int().min(1700).optional(),
  waterHeaterInstallYear: z.number().int().min(1700).optional(),
  roofReplacementYear: z.number().int().min(1700).optional(),
  foundationType: z.string().max(100).optional(),
  sidingType: z.string().max(100).optional(),
  electricalPanelAge: z.number().int().positive().optional(),
  lotSize: z.number().positive().optional(),
  hasIrrigation: z.boolean().optional(),
  hasDrainageIssues: z.boolean().optional(),
  hasSmokeDetectors: z.boolean().optional(),
  hasCoDetectors: z.boolean().optional(),
  hasSecuritySystem: z.boolean().optional(),
  hasFireExtinguisher: z.boolean().optional(),
  hasSumpPumpBackup: z.boolean().nullable().optional(),
  primaryHeatingFuel: z.string().max(50).nullable().optional(),
  hasSecondaryHeat: z.boolean().nullable().optional(),
  isResilienceVerified: z.boolean().optional(),
  isUtilityVerified: z.boolean().optional(),
  
  // FIX: REMOVED applianceAges and ADDED homeAssets array
  homeAssets: z.array(HomeAssetInputSchema).optional(), // NEW STRUCTURED FIELD
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
