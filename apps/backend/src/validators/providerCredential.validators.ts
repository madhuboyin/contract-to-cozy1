// apps/backend/src/validators/providerCredential.validators.ts

import { z } from 'zod';
import { ProviderCredentialType, ServiceCategory } from '@prisma/client';

export const SubmitCredentialSchema = z.object({
  type: z.nativeEnum(ProviderCredentialType),
  serviceCategories: z.array(z.nativeEnum(ServiceCategory)).min(1),
  issuingAuthority: z.string().min(1).max(200),
  credentialNumber: z.string().max(100).optional(),
  issueDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  documentId: z.string().uuid().optional(),
});

export const RenewCredentialSchema = SubmitCredentialSchema.partial();

export const RejectCredentialSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
});

export const RevokeCredentialSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const AdminQueueQuerySchema = z.object({
  type: z.nativeEnum(ProviderCredentialType).optional(),
  serviceCategory: z.nativeEnum(ServiceCategory).optional(),
});
