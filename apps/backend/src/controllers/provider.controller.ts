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
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Validate query parameters
      const query = providerSearchSchema.parse(req.query) as ProviderSearchQuery;

      // Search providers
      const result = await ProviderService.searchProviders(query);

      res.status(200).json({
        success: true,
        data: result,
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

}
