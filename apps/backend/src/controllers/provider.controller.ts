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
}
