import { Request, Response } from 'express';
import * as propertyService from '../services/property.service';
import { externalPropertyDataService } from '../services/externalPropertyData.service';
import { AuthRequest } from '../types';
// IMPORT REQUIRED: Assuming you have defined these in your validators.ts file (Phase 2)
import { CreatePropertyInput, UpdatePropertyInput } from '../utils/validators';
import { computeSetupStatus } from '../services/propertyOnboarding.service';
import { getOrCreateActiveNarrativeRun } from '../services/narrativeRun.service';
import { NeighborhoodIntelligenceService } from '../neighborhoodIntelligence/neighborhoodIntelligenceService';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getPropertyRecordOverview } from '../services/propertyRecordOverview.service';
import {
  isAddressAutocompleteConfigured,
  resolveAddress,
  suggestAddresses,
} from '../services/addressAutocomplete.service';

const neighborhoodService = new NeighborhoodIntelligenceService();

export const autocompleteAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const input = String(req.query.input || '').trim();
    const sessionToken = String(req.query.sessionToken || '').trim();
    if (input.length < 3 || input.length > 200 || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionToken)) {
      return res.status(400).json({ success: false, message: 'Invalid autocomplete request' });
    }
    if (!isAddressAutocompleteConfigured()) {
      return res.status(503).json({ success: false, message: 'Address suggestions are not configured' });
    }
    const suggestions = await suggestAddresses(input, sessionToken);
    return res.json({ success: true, data: suggestions });
  } catch (error) {
    logger.warn({ err: error }, 'Address autocomplete unavailable');
    return res.status(503).json({ success: false, message: 'Address suggestions are temporarily unavailable' });
  }
};

export const getAddressDetails = async (req: AuthRequest, res: Response) => {
  try {
    const placeId = String(req.query.placeId || '').trim();
    const sessionToken = String(req.query.sessionToken || '').trim();
    if (!placeId || placeId.length > 300 || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionToken)) {
      return res.status(400).json({ success: false, message: 'Invalid address details request' });
    }
    if (!isAddressAutocompleteConfigured()) {
      return res.status(503).json({ success: false, message: 'Address suggestions are not configured' });
    }
    const address = await resolveAddress(placeId, sessionToken);
    if (!address) return res.status(404).json({ success: false, message: 'Address details unavailable' });
    return res.json({ success: true, data: address });
  } catch (error) {
    logger.warn({ err: error }, 'Address details unavailable');
    return res.status(503).json({ success: false, message: 'Address details unavailable' });
  }
};

/**
 * List all properties for the authenticated user
 */
export const listProperties = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const properties = await propertyService.getUserProperties(userId);

    res.json({
      success: true,
      data: { properties },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error listing properties');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve properties',
    });
  }
};

/**
 * Create a new property
 */
export const createProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    // CRITICAL FIX: Explicitly cast req.body to the complete CreatePropertyInput type
    const propertyData = req.body as CreatePropertyInput; 

    const property = await propertyService.createProperty(userId, propertyData);

    // Fire-and-forget: bootstrap neighborhood radar for the new property.
    void neighborhoodService.recomputePropertyNeighborhoodRadar(property.id).catch((err) => {
      logger.error({ err }, `[NeighborhoodRadar] Bootstrap failed for property ${property.id}`);
    });

    res.status(201).json({
      success: true,
      data: property,
      message: 'Property created successfully',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error creating property');
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create property',
    });
  }
};

/**
 * Get a single property by ID
 */
export const getProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const property = await propertyService.getPropertyById(id, userId);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId: id,
      moduleKey: AnalyticsModule.PROPERTY,
      featureKey: AnalyticsFeature.PROPERTY_PROFILE,
      metadataJson: {},
    });

    // NOTE: The property service returns the full Property object, ensuring new fields are included here.
    res.json({
      success: true,
      data: property,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting property');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve property',
    });
  }
};

/**
 * Get dashboard bootstrap payload for a single property.
 * Includes property details + onboarding + active narrative run in one response.
 */
export const getPropertyDashboardBootstrap = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const property = await propertyService.getPropertyById(id, userId);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const [onboarding, narrativeRun, recordOverview] = await Promise.all([
      computeSetupStatus(id, userId),
      getOrCreateActiveNarrativeRun({ propertyId: id, userId }),
      getPropertyRecordOverview(id, userId, 'CONCIERGE_HOME'),
    ]);

    res.json({
      success: true,
      data: {
        property,
        onboarding,
        narrativeRun,
        recordOverview,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting property bootstrap');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve property bootstrap',
    });
  }
};

/**
 * Update a property
 */
export const updateProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    // CRITICAL FIX: Explicitly cast req.body to the complete UpdatePropertyInput type
    const updateData = req.body as UpdatePropertyInput; 
    // DEBUG LOG 1: Log incoming payload from frontend
    logger.info({ updateData }, `[DEBUG - Controller] Received Update Payload for Property ${id}`);

    // Pass the comprehensive payload, allowing the service to save all fields
    const property = await propertyService.updateProperty(id, userId, updateData);

    const locationFields = ['address', 'city', 'state', 'zipCode', 'latitude', 'longitude'];
    if (locationFields.some((field) => Object.prototype.hasOwnProperty.call(updateData, field))) {
      void neighborhoodService.recomputePropertyNeighborhoodRadar(id).catch((err) => {
        logger.error({ err }, `[NeighborhoodRadar] Location-change recompute failed for property ${id}`);
      });
    }

    res.json({
      success: true,
      data: property,
      message: 'Property updated successfully',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error updating property');
    
    if (error.message === 'Property not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      // The full database error is already captured by structured logging.
      // Do not expose Prisma/Postgres internals in an inline form error.
      message: 'Unable to save property details. Please try again.',
    });
  }
};

/**
 * Delete a property
 */
export const deleteProperty = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    await propertyService.deleteProperty(id, userId);

    res.json({
      success: true,
      message: 'Property deleted successfully',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error deleting property');
    
    if (error.message === 'Property not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete property',
    });
  }
};

/**
 * Lookup property data by address using external providers
 */
export const lookupProperty = async (req: Request, res: Response) => {
  try {
    const { address, zipCode } = req.query as { address: string; zipCode?: string };

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required',
      });
    }

    const data = await externalPropertyDataService.getPropertyByAddress(address, zipCode);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Property data not found',
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error looking up property');
    res.status(500).json({
      success: false,
      message: 'Failed to lookup property data',
    });
  }
};

/**
 * Get active resolutions (analyses) for a property
 */
export const getPropertyResolutions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const homeownerProfileId = req.user?.homeownerProfile?.id;

    if (!homeownerProfileId) {
      return res.status(403).json({
        success: false,
        message: 'Homeowner profile required',
      });
    }

    const candidateResolutions = await prisma.replaceRepairAnalysis.findMany({
      where: {
        propertyId: id,
        homeownerProfileId,
        status: 'READY',
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        computedAt: 'desc',
      },
      take: 50,
    });

    const resolutionsByItemId = new Map<string, (typeof candidateResolutions)[number]>();
    candidateResolutions.forEach((resolution) => {
      const existing = resolutionsByItemId.get(resolution.inventoryItemId);
      if (!existing) {
        resolutionsByItemId.set(resolution.inventoryItemId, resolution);
        return;
      }

      const resolutionIsCurrent = resolution.currentMarker === 'CURRENT';
      const existingIsCurrent = existing.currentMarker === 'CURRENT';
      if (resolutionIsCurrent && !existingIsCurrent) {
        resolutionsByItemId.set(resolution.inventoryItemId, resolution);
      }
    });

    const resolutions = [...resolutionsByItemId.values()]
      .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())
      .slice(0, 10);

    res.json({
      success: true,
      data: resolutions,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching property resolutions');
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property resolutions',
    });
  }
};
