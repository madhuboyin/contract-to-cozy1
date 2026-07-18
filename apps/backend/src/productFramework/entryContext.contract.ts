import { z } from 'zod';

export const OWNERSHIP_STATES = [
  'SHOPPING',
  'UNDER_CONTRACT',
  'RECENT_OWNER',
  'ESTABLISHED_OWNER',
  'PREPARING_TRANSFER',
  'UNKNOWN',
] as const;

export const PROPERTY_ORIGINS = [
  'EXISTING_HOME',
  'NEW_CONSTRUCTION',
  'UNKNOWN',
] as const;

export const HOMEOWNER_ENTRY_PATHS = [
  'EXISTING_OWNER_TRIGGER',
  'EXISTING_HOME_PURCHASE',
  'NEW_HOME_SETUP',
  'MAJOR_MOMENT',
  'EXPLORATION',
] as const;

export const ACTIVE_TRIGGER_TYPES = [
  'REPAIR',
  'REPLACEMENT',
  'CONTRACTOR_QUOTE',
  'MAINTENANCE_BACKLOG',
  'INSURANCE_COVERAGE',
  'RENEWAL_DEADLINE',
  'PROJECT',
  'ANTICIPATED_COST',
  'INSPECTION_FINDING',
  'PUNCH_LIST_WARRANTY',
  'CLAIM_DAMAGE',
  'SELLING_TRANSFER',
  'OTHER',
  'NONE_EXPLORING',
] as const;

export const TRIGGER_ENTITY_TYPES = [
  'PROPERTY',
  'INVENTORY_ITEM',
  'HOME_SYSTEM',
  'DOCUMENT',
  'QUOTE',
  'POLICY',
  'WARRANTY',
  'PROJECT',
  'INCIDENT',
  'FREE_TEXT',
  'UNKNOWN',
] as const;

export const FIRST_VALUE_TYPES = [
  'TRIGGER_GUIDANCE',
  'HOME_HEALTH_BASELINE',
  'PRIORITIZED_12_MONTH_PLAN',
  'INSPECTION_90_DAY_PLAN',
  'NEW_HOME_PROTECTION_PLAN',
] as const;

export const OwnershipStateSchema = z.enum(OWNERSHIP_STATES);
export const PropertyOriginSchema = z.enum(PROPERTY_ORIGINS);
export const HomeownerEntryPathSchema = z.enum(HOMEOWNER_ENTRY_PATHS);
export const ActiveTriggerTypeSchema = z.enum(ACTIVE_TRIGGER_TYPES);
export const TriggerEntityTypeSchema = z.enum(TRIGGER_ENTITY_TYPES);
export const FirstValueTypeSchema = z.enum(FIRST_VALUE_TYPES);

export const HomeownerEntryContextSchema = z.object({
  id: z.string().trim().min(1).max(120),
  propertyId: z.string().trim().min(1).max(120),
  userId: z.string().trim().min(1).max(120),
  entryPath: HomeownerEntryPathSchema,
  ownershipState: OwnershipStateSchema,
  propertyOrigin: PropertyOriginSchema,
  activeTrigger: z.object({
    type: ActiveTriggerTypeSchema,
    label: z.string().trim().min(1).max(240),
    detail: z.string().trim().max(2000).nullable(),
    entityType: TriggerEntityTypeSchema,
    entityId: z.string().trim().min(1).max(120).nullable(),
    identifiedAt: z.string().datetime(),
    source: z.enum(['USER_SELECTED', 'CONVERSATION', 'DOCUMENT', 'PHOTO', 'SYSTEM_SIGNAL', 'OTHER']),
  }),
  firstValue: z.object({
    type: FirstValueTypeSchema,
    deliveredAt: z.string().datetime().nullable(),
    firstActionResolvedAt: z.string().datetime().nullable(),
  }),
  contextVersion: z.string().trim().min(1).max(80),
  consentContext: z.string().trim().min(1).max(300).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((value, ctx) => {
  if (value.entryPath === 'NEW_HOME_SETUP' && value.propertyOrigin !== 'NEW_CONSTRUCTION') {
    ctx.addIssue({
      code: 'custom',
      path: ['propertyOrigin'],
      message: 'The new-home setup entry path requires NEW_CONSTRUCTION property origin.',
    });
  }

  if (value.entryPath === 'EXISTING_HOME_PURCHASE' && value.propertyOrigin !== 'EXISTING_HOME') {
    ctx.addIssue({
      code: 'custom',
      path: ['propertyOrigin'],
      message: 'The existing-home purchase entry path requires EXISTING_HOME property origin.',
    });
  }

  if (value.activeTrigger.type === 'NONE_EXPLORING' && value.entryPath !== 'EXPLORATION') {
    ctx.addIssue({
      code: 'custom',
      path: ['activeTrigger', 'type'],
      message: 'NONE_EXPLORING is only valid for the EXPLORATION entry path.',
    });
  }
});

export type HomeownerEntryContext = z.infer<typeof HomeownerEntryContextSchema>;

export function parseHomeownerEntryContext(input: unknown): HomeownerEntryContext {
  return HomeownerEntryContextSchema.parse(input);
}
