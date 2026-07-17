// apps/backend/src/validators/adminCapability.validators.ts
import { z } from 'zod';
import { ADMIN_CAPABILITIES } from '../config/adminCapabilities';
import { ADMIN_PERSONA_BUNDLES } from '../config/adminCapabilities';

const capabilityEnum = z.enum(ADMIN_CAPABILITIES);
const bundleNameEnum = z.enum(Object.keys(ADMIN_PERSONA_BUNDLES) as [string, ...string[]]);

export const GrantCapabilityBodySchema = z
  .object({
    capability: capabilityEnum.optional(),
    bundleName: bundleNameEnum.optional(),
    reason: z.string().min(1, 'reason is required').max(2000),
    resourceScope: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.capability && !v.bundleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Either capability or bundleName is required' });
    }
    if (v.capability && v.bundleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide capability or bundleName, not both' });
    }
  });

export const RevokeCapabilityBodySchema = z.object({
  capability: capabilityEnum,
  reason: z.string().min(1, 'reason is required').max(2000),
});
