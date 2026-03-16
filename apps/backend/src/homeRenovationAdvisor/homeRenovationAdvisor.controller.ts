// apps/backend/src/homeRenovationAdvisor/homeRenovationAdvisor.controller.ts
//
// Controllers for the Home Renovation Risk Advisor feature.
// Pattern: static methods, try/catch with next(err), structured responses.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { HomeRenovationAdvisorService } from './homeRenovationAdvisor.service';
import {
  CreateSessionBody,
  EvaluateSessionBody,
  UpdateComplianceChecklistBody,
  UpdateSessionBody,
} from './validators/homeRenovationAdvisor.validators';
import { ListSessionsQuery } from './types/homeRenovationAdvisor.types';

const service = new HomeRenovationAdvisorService();

export class HomeRenovationAdvisorController {
  // POST /api/home-renovation-advisor/sessions
  static async createSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const input = req.body as CreateSessionBody;
      const session = await service.createSession(userId, input);
      res.status(201).json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }

  // PATCH /api/home-renovation-advisor/sessions/:id
  static async updateSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const updates = req.body as UpdateSessionBody;
      const session = await service.updateSession(userId, id, updates);
      res.json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/home-renovation-advisor/sessions/:id/evaluate
  static async evaluateSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const input = req.body as EvaluateSessionBody;
      const session = await service.evaluateSession(userId, id, input);
      res.json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/home-renovation-advisor/sessions/:id
  static async getSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const session = await service.getSession(userId, id);
      res.json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/properties/:propertyId/home-renovation-advisor/sessions
  static async listSessions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { propertyId } = req.params;
      const query: ListSessionsQuery = {
        propertyId,
        status: req.query.status as any,
        renovationType: req.query.renovationType as any,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        cursor: req.query.cursor as string | undefined,
      };
      const result = await service.listSessionsForProperty(userId, propertyId, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/home-renovation-advisor/sessions/:id/archive
  static async archiveSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      await service.archiveSession(userId, id);
      res.json({ success: true, message: 'Session archived' });
    } catch (err) {
      next(err);
    }
  }

  // PATCH /api/home-renovation-advisor/sessions/:id/compliance
  static async updateComplianceChecklist(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const data = req.body as UpdateComplianceChecklistBody;
      const session = await service.updateComplianceChecklist(userId, id, data);
      res.json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/properties/:propertyId/home-renovation-advisor/retroactive-candidates
  static async detectRetroactiveCandidates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { propertyId } = req.params;
      const candidates = await service.detectRetroactiveCandidates(userId, propertyId);
      res.json({ success: true, data: { candidates } });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/home-renovation-advisor/metadata
  static getMetadata(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const metadata = service.getMetadata();
      res.json({ success: true, data: metadata });
    } catch (err) {
      next(err);
    }
  }
}
