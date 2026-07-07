// apps/backend/src/services/providerCredential.service.ts
//
// Credential CRUD, submission, document linking, and the admin
// approve/reject/revoke lifecycle. See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Sections 3, 8.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { NotificationService } from './notification.service';
import { providerComplianceService } from './providerCompliance.service';
import { uploadDocumentBuffer } from './storage/reportStorage';
import { DocumentType, ProviderCredentialType, ServiceCategory, UserRole } from '@prisma/client';

const DOCUMENT_TYPE_BY_CREDENTIAL_TYPE: Record<ProviderCredentialType, DocumentType> = {
  TRADE_LICENSE: DocumentType.LICENSE,
  LIABILITY_INSURANCE: DocumentType.INSURANCE_CERTIFICATE,
  WORKERS_COMP_INSURANCE: DocumentType.INSURANCE_CERTIFICATE,
  BONDING: DocumentType.OTHER,
  CERTIFICATION: DocumentType.OTHER,
  BACKGROUND_CHECK: DocumentType.OTHER,
};

export type SubmitCredentialInput = {
  type: ProviderCredentialType;
  serviceCategories: ServiceCategory[];
  issuingAuthority: string;
  credentialNumber?: string | null;
  issueDate?: string | Date | null;
  expiryDate?: string | Date | null;
  documentId?: string | null;
};

type CredentialDecision = 'REJECTED' | 'REVOKED';

class ProviderCredentialService {
  async list(providerProfileId: string) {
    return prisma.providerCredential.findMany({
      where: { providerProfileId },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submit(providerProfileId: string, input: SubmitCredentialInput) {
    if (!input.serviceCategories?.length) {
      throw new APIError('At least one service category is required', 400, 'MISSING_SERVICE_CATEGORIES');
    }

    const credential = await prisma.providerCredential.create({
      data: {
        providerProfileId,
        type: input.type,
        serviceCategories: input.serviceCategories,
        issuingAuthority: input.issuingAuthority,
        credentialNumber: input.credentialNumber ?? null,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        status: 'PENDING_REVIEW',
      },
    });

    if (input.documentId) {
      await this.linkDocument(credential.id, input.documentId, providerProfileId);
    }

    await this.notifyAdminQueue(credential.id, providerProfileId);

    return credential;
  }

  /**
   * Submit a renewal — creates a new row linked via renewalOfCredentialId
   * rather than mutating the expiring one, preserving history (Section 4.2).
   */
  async renew(providerProfileId: string, credentialId: string, input: Partial<SubmitCredentialInput>) {
    const existing = await prisma.providerCredential.findFirst({
      where: { id: credentialId, providerProfileId },
    });
    if (!existing) throw new APIError('Credential not found', 404, 'NOT_FOUND');

    const renewal = await prisma.providerCredential.create({
      data: {
        providerProfileId,
        type: input.type ?? existing.type,
        serviceCategories: input.serviceCategories?.length ? input.serviceCategories : existing.serviceCategories,
        issuingAuthority: input.issuingAuthority ?? existing.issuingAuthority,
        credentialNumber: input.credentialNumber ?? existing.credentialNumber,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        status: 'PENDING_REVIEW',
        renewalOfCredentialId: existing.id,
      },
    });

    if (input.documentId) {
      await this.linkDocument(renewal.id, input.documentId, providerProfileId);
    }

    await this.notifyAdminQueue(renewal.id, providerProfileId);

    return renewal;
  }

  async approve(credentialId: string, adminUserId: string) {
    const credential = await prisma.providerCredential.update({
      where: { id: credentialId },
      data: {
        status: 'APPROVED',
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await providerComplianceService.recomputeProviderStatus(credential.providerProfileId);

    return credential;
  }

  async reject(credentialId: string, adminUserId: string, rejectionReason: string) {
    if (!rejectionReason?.trim()) {
      throw new APIError('rejectionReason is required', 400, 'MISSING_REJECTION_REASON');
    }

    const credential = await prisma.providerCredential.update({
      where: { id: credentialId },
      data: {
        status: 'REJECTED',
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        rejectionReason,
      },
    });

    await providerComplianceService.recomputeProviderStatus(credential.providerProfileId);
    await this.notifyProviderOfDecision(credential, 'REJECTED');

    return credential;
  }

  /** Admin-initiated, post-approval — distinct from natural expiry (Section 8). */
  async revoke(credentialId: string, adminUserId: string, reason: string) {
    if (!reason?.trim()) {
      throw new APIError('A revoke reason is required', 400, 'MISSING_REVOKE_REASON');
    }

    const credential = await prisma.providerCredential.update({
      where: { id: credentialId },
      data: {
        status: 'REVOKED',
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await providerComplianceService.recomputeProviderStatus(credential.providerProfileId);
    await this.notifyProviderOfDecision(credential, 'REVOKED');

    return credential;
  }

  async listQueue(filters: { type?: ProviderCredentialType; serviceCategory?: ServiceCategory } = {}) {
    return prisma.providerCredential.findMany({
      where: {
        status: 'PENDING_REVIEW',
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.serviceCategory ? { serviceCategories: { has: filters.serviceCategory } } : {}),
      },
      include: {
        providerProfile: { select: { id: true, businessName: true, userId: true } },
        documents: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCategoryEligibility(providerProfileId: string) {
    return prisma.providerCategoryEligibility.findMany({
      where: { providerProfileId },
      orderBy: { serviceCategory: 'asc' },
    });
  }

  async listComplianceAlerts(providerProfileId: string) {
    return prisma.providerComplianceAlert.findMany({
      where: { providerProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Public/homeowner-safe summary — booleans and category lists only, never
   * credentialNumber/documentId/issuingAuthority (Section 12).
   */
  async getVerificationSummary(providerProfileId: string) {
    const [eligibility, approvedCredentials] = await Promise.all([
      prisma.providerCategoryEligibility.findMany({
        where: { providerProfileId },
        select: { serviceCategory: true, isEligible: true },
      }),
      prisma.providerCredential.findMany({
        where: { providerProfileId, status: 'APPROVED' },
        select: { type: true },
        distinct: ['type'],
      }),
    ]);

    return {
      verifiedCategories: eligibility.filter((e) => e.isEligible).map((e) => e.serviceCategory),
      unverifiedCategories: eligibility.filter((e) => !e.isEligible).map((e) => e.serviceCategory),
      credentialTypesPresent: approvedCredentials.map((c) => c.type),
    };
  }

  /**
   * Uploads the credential's evidence document to storage and creates its
   * Document row, ahead of submit()/renew() linking it via
   * documentId (Section 3: "Create Document row, link via providerCredentialId").
   * Providers have no other document-upload surface — the existing one at
   * /api/home-management/documents/upload is homeowner-only.
   */
  async createCredentialDocument(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    credentialType?: ProviderCredentialType
  ) {
    const { key } = await uploadDocumentBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId,
      propertyId: null,
    });

    const type = credentialType ? DOCUMENT_TYPE_BY_CREDENTIAL_TYPE[credentialType] : DocumentType.OTHER;

    const document = await prisma.document.create({
      data: {
        uploadedBy: userId,
        type,
        name: file.originalname,
        fileUrl: key,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });

    return document;
  }

  private async linkDocument(credentialId: string, documentId: string, providerProfileId: string) {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: { userId: true },
    });

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.uploadedBy !== provider?.userId) {
      throw new APIError('Document not found or not uploaded by this provider', 404, 'DOCUMENT_NOT_FOUND');
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { providerCredentialId: credentialId },
    });
  }

  private async notifyAdminQueue(credentialId: string, providerProfileId: string) {
    try {
      const [admins, provider] = await Promise.all([
        prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } }),
        prisma.providerProfile.findUnique({ where: { id: providerProfileId }, select: { businessName: true } }),
      ]);

      await Promise.all(
        admins.map((admin) =>
          NotificationService.create({
            userId: admin.id,
            type: 'PROVIDER_CREDENTIAL_SUBMITTED',
            title: 'New provider credential pending review',
            message: `${provider?.businessName ?? 'A provider'} submitted a credential for review.`,
            entityType: 'ProviderCredential',
            entityId: credentialId,
            actionUrl: `/dashboard/admin/provider-compliance?credentialId=${credentialId}`,
          })
        )
      );
    } catch (error) {
      logger.warn({ error, credentialId }, '[PROVIDER_CREDENTIAL] admin queue notification failed');
    }
  }

  private async notifyProviderOfDecision(
    credential: { providerProfileId: string; id: string; rejectionReason: string | null },
    decision: CredentialDecision
  ) {
    try {
      const provider = await prisma.providerProfile.findUnique({
        where: { id: credential.providerProfileId },
        select: { userId: true },
      });
      if (!provider) return;

      await NotificationService.create({
        userId: provider.userId,
        type: `PROVIDER_CREDENTIAL_${decision}`,
        title: decision === 'REJECTED' ? 'Credential submission rejected' : 'Credential revoked',
        message: credential.rejectionReason ?? 'See your credentials page for details.',
        entityType: 'ProviderCredential',
        entityId: credential.id,
        actionUrl: '/providers/credentials',
      });
    } catch (error) {
      logger.warn({ error, credentialId: credential.id }, '[PROVIDER_CREDENTIAL] provider notification failed');
    }
  }
}

export const providerCredentialService = new ProviderCredentialService();
