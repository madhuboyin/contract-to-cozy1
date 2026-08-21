// apps/backend/src/controllers/provider.controller.ts

import { Request, Response, NextFunction } from 'express';
import { ProviderService } from '../services/provider.service';
import {
  providerSearchSchema,
  paginationSchema,
  ProviderSearchQuery,
  PaginationQuery,
} from '../types/provider.types';
import { ZodError } from 'zod';
import { ProviderManagementService } from '../services/provider-management.service';
import { AuthRequest } from '../types/auth.types';
import { z } from 'zod';
import { getProjectComplianceEnvelope } from '../services/projectCompliance/context';
import { prisma } from '../lib/prisma';
import { shouldPauseProviderSearch } from '../services/providerSearchApplicability';

const createServiceSchema = z.object({
  category: z.enum(['INSPECTION', 'HANDYMAN']),
  inspectionType: z.string().optional(),
  handymanType: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().min(10).max(1000),
  basePrice: z.number().positive(),
  priceUnit: z.string(),
  minimumCharge: z.number().positive().optional(),
  estimatedDuration: z.number().positive().optional(),
  isActive: z.boolean().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

export class ProviderController {
  /**
   * Search for providers
   * GET /api/providers/search
   */
  static async searchProviders(
    // --- FIX: Changed 'Request' to 'AuthRequest' ---
    req: AuthRequest,
    // --- END FIX ---
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Validate query parameters
      const query = providerSearchSchema.parse(req.query) as ProviderSearchQuery;

      // --- FIX: Get userId from authenticated request ---
      const userId = req.user?.userId;
      // --- END FIX ---

      const { propertyId, workCategory, ...providerQuery } = query;
      let propertyContext = null;
      let effectiveQuery = providerQuery;

      if (propertyId && userId) {
        propertyContext = await getProjectComplianceEnvelope(
          propertyId,
          userId,
          'PROVIDER_BOOKING',
          { serviceCategory: workCategory ?? providerQuery.category ?? 'UNSPECIFIED' },
        );
        const property = await prisma.property.findUnique({
          where: { id: propertyId },
          select: {
            city: true,
            state: true,
            zipCode: true,
            latitude: true,
            longitude: true,
            geocodedZipCode: true,
          },
        });
        if (property) {
          const coordinatesAreCurrent = property.geocodedZipCode === property.zipCode;
          effectiveQuery = {
            ...providerQuery,
            zipCode: property.zipCode,
            city: property.city,
            state: property.state,
            latitude: coordinatesAreCurrent ? property.latitude ?? undefined : undefined,
            longitude: coordinatesAreCurrent ? property.longitude ?? undefined : undefined,
          };
        }
      }

      // Unknown responsibility should not prevent discovery. Homeowners may browse
      // providers while confirming who will ultimately arrange the work. A known
      // association/landlord assignment remains a hard stop.
      const result = shouldPauseProviderSearch(propertyContext)
        ? {
          providers: [],
          pagination: {
            page: providerQuery.page,
            limit: providerQuery.limit,
            total: 0,
            totalPages: 0,
          },
          filters: {},
        }
        : await ProviderService.searchProviders(effectiveQuery, userId);

      res.status(200).json({
        success: true,
        data: propertyContext ? { ...result, propertyContext } : result,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: error.issues,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Get provider details by ID
   * GET /api/providers/:id
   */
  static async getProviderById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Provider ID is required',
        });
        return;
      }

      const provider = await ProviderService.getProviderById(id);

      if (!provider) {
        res.status(404).json({
          success: false,
          message: 'Provider not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: provider,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get services offered by a provider
   * GET /api/providers/:id/services
   */
  static async getProviderServices(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const activeOnly = req.query.activeOnly !== 'false'; // Default to true

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Provider ID is required',
        });
        return;
      }

      const services = await ProviderService.getProviderServices(id, activeOnly);

      res.status(200).json({
        success: true,
        data: {
          providerId: id,
          services,
          total: services.length,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Provider not found') {
        res.status(404).json({
          success: false,
          message: 'Provider not found',
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Public/homeowner-safe verification summary — powers the "Verified Pro" badge
   * GET /api/providers/:id/verification-summary
   */
  static async getVerificationSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Provider ID is required',
        });
        return;
      }

      const summary = await ProviderService.getVerificationSummary(id);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get reviews for a provider
   * GET /api/providers/:id/reviews
   */
  static async getProviderReviews(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Provider ID is required',
        });
        return;
      }

      // Validate pagination parameters
      const pagination = paginationSchema.parse(req.query) as PaginationQuery;

      const result = await ProviderService.getProviderReviews(id, pagination);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Provider not found') {
        res.status(404).json({
          success: false,
          message: 'Provider not found',
        });
      } else if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid pagination parameters',
          errors: error.issues,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Get current provider's services
   * GET /api/providers/services
   */
  static async getMyServices(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Provider role required.',
        });
        return;
      }

      const services = await ProviderManagementService.getProviderServices(userId);

      res.json({
        success: true,
        data: services,
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Create a service
   * POST /api/providers/services
   */
  static async createService(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Provider role required.',
        });
        return;
      }

      // Validate input
      const input = createServiceSchema.parse(req.body);

      // Create service
      const service = await ProviderManagementService.createService(userId, input);

      res.status(201).json({
        success: true,
        data: service,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid input',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Update a service
   * PATCH /api/providers/services/:id
   */
  static async updateService(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Provider role required.',
        });
        return;
      }

      // Validate input
      const input = updateServiceSchema.parse(req.body);

      // Update service
      const service = await ProviderManagementService.updateService(id, userId, input);

      res.json({
        success: true,
        data: service,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid input',
          errors: error.issues,
        });
      } else if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  /**
   * Delete a service
   * DELETE /api/providers/services/:id
   */
  static async deleteService(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Provider role required.',
        });
        return;
      }

      await ProviderManagementService.deleteService(id, userId);

      res.json({
        success: true,
        message: 'Service deleted successfully',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        next(error);
      }
    }
  }

  // ===========================================================================
  // Portfolio
  // ===========================================================================

  /**
   * Get current provider's portfolio items
   * GET /api/providers/portfolio
   */
  static async listPortfolio(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const items = await ProviderManagementService.listPortfolio(userId);
      res.json({ success: true, data: items });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ success: false, message: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Create a portfolio item (multipart: file + title/description/category)
   * POST /api/providers/portfolio
   */
  static async createPortfolioItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const file = (req as any).file as
        | { buffer: Buffer; originalname: string; mimetype: string; size: number }
        | undefined;
      if (!file) {
        res.status(400).json({ success: false, message: 'Image file is required' });
        return;
      }

      const item = await ProviderManagementService.createPortfolioItem(userId, req.body, file);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ success: false, message: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Update a portfolio item
   * PATCH /api/providers/portfolio/:id
   */
  static async updatePortfolioItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const item = await ProviderManagementService.updatePortfolioItem(id, userId, req.body);
      res.json({ success: true, data: item });
    } catch (error) {
      if (error instanceof Error) {
        res.status(error.message.includes('not found') ? 404 : 400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Delete a portfolio item
   * DELETE /api/providers/portfolio/:id
   */
  static async deletePortfolioItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      await ProviderManagementService.deletePortfolioItem(id, userId);
      res.json({ success: true, message: 'Portfolio item deleted successfully' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(error.message.includes('not found') ? 404 : 400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  // ===========================================================================
  // Availability
  // ===========================================================================

  /**
   * Get current provider's availability windows
   * GET /api/providers/availability
   */
  static async listAvailability(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const windows = await ProviderManagementService.listAvailability(userId);
      res.json({ success: true, data: windows });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ success: false, message: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Create an availability window
   * POST /api/providers/availability
   */
  static async createAvailabilityWindow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const window = await ProviderManagementService.createAvailabilityWindow(userId, req.body);
      res.status(201).json({ success: true, data: window });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ success: false, message: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Update an availability window
   * PATCH /api/providers/availability/:id
   */
  static async updateAvailabilityWindow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      const window = await ProviderManagementService.updateAvailabilityWindow(id, userId, req.body);
      res.json({ success: true, data: window });
    } catch (error) {
      if (error instanceof Error) {
        res.status(error.message.includes('not found') ? 404 : 400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * Delete an availability window
   * DELETE /api/providers/availability/:id
   */
  static async deleteAvailabilityWindow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Access denied. Provider role required.' });
        return;
      }

      await ProviderManagementService.deleteAvailabilityWindow(id, userId);
      res.json({ success: true, message: 'Availability window deleted successfully' });
    } catch (error) {
      if (error instanceof Error) {
        res.status(error.message.includes('not found') ? 404 : 400).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }
}
