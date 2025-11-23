import { Request, Response } from 'express';
import * as propertyService from '../services/property.service';
import { AuthRequest } from '../types';
// IMPORT REQUIRED: Assuming you have defined these in your validators.ts file (Phase 2)
import { CreatePropertyInput, UpdatePropertyInput } from '../utils/validators'; 

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
    console.error('Error listing properties:', error);
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

    res.status(201).json({
      success: true,
      data: property,
      message: 'Property created successfully',
    });
  } catch (error: any) {
    console.error('Error creating property:', error);
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

    // NOTE: The property service returns the full Property object, ensuring new fields are included here.
    res.json({
      success: true,
      data: property,
    });
  } catch (error) {
    console.error('Error getting property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve property',
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

    // Pass the comprehensive payload, allowing the service to save all fields
    const property = await propertyService.updateProperty(id, userId, updateData);

    res.json({
      success: true,
      data: property,
      message: 'Property updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating property:', error);
    
    if (error.message === 'Property not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update property',
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
    console.error('Error deleting property:', error);
    
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