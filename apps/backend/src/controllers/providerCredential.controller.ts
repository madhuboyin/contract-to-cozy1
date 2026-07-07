// apps/backend/src/controllers/providerCredential.controller.ts
//
// Provider Trust & Compliance Verification — provider-facing credential
// management + admin review queue. See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Sections 8-9.

import { Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../types/auth.types';
import { providerCredentialService } from '../services/providerCredential.service';
import {
  SubmitCredentialSchema,
  RenewCredentialSchema,
  RejectCredentialSchema,
  RevokeCredentialSchema,
  AdminQueueQuerySchema,
} from '../validators/providerCredential.validators';

function handleError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, message: 'Invalid input', errors: error.issues });
    return;
  }
  if (error instanceof Error) {
    const statusCode = (error as any)?.statusCode;
    const details = (error as any)?.details;
    res.status(typeof statusCode === 'number' ? statusCode : 400).json({
      success: false,
      message: error.message,
      ...(details ? { details } : {}),
    });
    return;
  }
  next(error);
}

export class ProviderCredentialController {
  // ── Provider-facing ──────────────────────────────────────────────────────

  static async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerProfileId = req.user?.providerProfile?.id;
      if (!providerProfileId) {
        res.status(404).json({ success: false, message: 'Provider profile not found' });
        return;
      }

      const credentials = await providerCredentialService.list(providerProfileId);
      res.status(200).json({ success: true, data: credentials });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async submit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerProfileId = req.user?.providerProfile?.id;
      if (!providerProfileId) {
        res.status(404).json({ success: false, message: 'Provider profile not found' });
        return;
      }

      const input = SubmitCredentialSchema.parse(req.body);
      const credential = await providerCredentialService.submit(providerProfileId, input);
      res.status(201).json({ success: true, data: credential });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async renew(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerProfileId = req.user?.providerProfile?.id;
      if (!providerProfileId) {
        res.status(404).json({ success: false, message: 'Provider profile not found' });
        return;
      }

      const { id } = req.params;
      const input = RenewCredentialSchema.parse(req.body);
      const renewal = await providerCredentialService.renew(providerProfileId, id, input);
      res.status(201).json({ success: true, data: renewal });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async getCategoryEligibility(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerProfileId = req.user?.providerProfile?.id;
      if (!providerProfileId) {
        res.status(404).json({ success: false, message: 'Provider profile not found' });
        return;
      }

      const eligibility = await providerCredentialService.getCategoryEligibility(providerProfileId);
      res.status(200).json({ success: true, data: eligibility });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async listComplianceAlerts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerProfileId = req.user?.providerProfile?.id;
      if (!providerProfileId) {
        res.status(404).json({ success: false, message: 'Provider profile not found' });
        return;
      }

      const alerts = await providerCredentialService.listComplianceAlerts(providerProfileId);
      res.status(200).json({ success: true, data: alerts });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  // ── Admin-facing ─────────────────────────────────────────────────────────

  static async listQueue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, serviceCategory } = AdminQueueQuerySchema.parse(req.query);
      const queue = await providerCredentialService.listQueue({ type, serviceCategory });
      res.status(200).json({ success: true, data: queue });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async approve(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const adminUserId = req.user!.userId;
      const credential = await providerCredentialService.approve(id, adminUserId);
      res.status(200).json({ success: true, data: credential });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async reject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const adminUserId = req.user!.userId;
      const { rejectionReason } = RejectCredentialSchema.parse(req.body);
      const credential = await providerCredentialService.reject(id, adminUserId, rejectionReason);
      res.status(200).json({ success: true, data: credential });
    } catch (error) {
      handleError(error, res, next);
    }
  }

  static async revoke(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const adminUserId = req.user!.userId;
      const { reason } = RevokeCredentialSchema.parse(req.body);
      const credential = await providerCredentialService.revoke(id, adminUserId, reason);
      res.status(200).json({ success: true, data: credential });
    } catch (error) {
      handleError(error, res, next);
    }
  }
}
