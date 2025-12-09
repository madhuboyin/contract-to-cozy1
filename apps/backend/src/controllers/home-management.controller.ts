// apps/backend/src/controllers/home-management.controller.ts

import { Response, NextFunction, Request } from 'express';
import { AuthRequest } from '../types/auth.types';
import * as HomeManagementService from '../services/home-management.service';
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO,
  CreateExpenseDTO, UpdateExpenseDTO,
  DocumentType,
} from '../types'; 
// NOTE: We rely on the PrismaClient type for consistency for Document 
import { Document } from '@prisma/client'; 
import multer from 'multer';

// ============================================================================
// FILE UPLOAD SETUP
// ============================================================================
// Use memory storage for simplicity and mock cloud storage integration
export const upload = multer({ storage: multer.memoryStorage() }); 
// ============================================================================

// Utility function to get homeownerProfileId from the request (assuming Auth is implemented)
const getHomeownerId = (req: AuthRequest) => (req.user as any)?.homeownerProfile?.id as string;

// Temporary type augmentation for Multer to recognize req.file and req.body as multipart
interface UploadAuthRequest extends Request {
    user: AuthRequest['user'];
    file: Express.Multer.File; 
    body: {
        type: DocumentType;
        name: string;
        description?: string;
        propertyId?: string;
        warrantyId?: string;
        policyId?: string;
    };
}


// --- EXPENSE CONTROLLERS ---

export const postExpense = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const expenseData: CreateExpenseDTO = req.body;
    
    // DEBUG 1: Log incoming request data
    console.log('DEBUG (Controller): POST /expenses received data:', expenseData);

    const expense = await HomeManagementService.createExpense(homeownerProfileId, expenseData);
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    // DEBUG 2: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in postExpense:', error);
    next(error);
  }
};

export const getExpenses = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { propertyId } = req.query; // Optional filter

    // DEBUG 3: Log API call initiation
    console.log(`DEBUG (Controller): GET /expenses for user ${homeownerProfileId}`);

    const expenses = await HomeManagementService.listExpenses(
      homeownerProfileId, 
      propertyId as string
    );
    res.status(200).json({ success: true, data: { expenses } });
  } catch (error) {
    // DEBUG 4: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in getExpenses:', error);
    next(error);
  }
};

export const patchExpense = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { expenseId } = req.params;
    const updateData: UpdateExpenseDTO = req.body;

    const expense = await HomeManagementService.updateExpense(
      expenseId, 
      homeownerProfileId, 
      updateData
    );
    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { expenseId } = req.params;

    await HomeManagementService.deleteExpense(expenseId, homeownerProfileId);
    res.status(200).json({ success: true, message: 'Expense deleted successfully.' });
  } catch (error) {
    next(error);
  }
};


// --- WARRANTY CONTROLLERS (Similar CRUD structure) ---

export const postWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const warrantyData: CreateWarrantyDTO = req.body;
    
    // DEBUG 5: Log incoming request data
    console.log('DEBUG (Controller): POST /warranties received data:', warrantyData);

    const warranty = await HomeManagementService.createWarranty(homeownerProfileId, warrantyData);
    res.status(201).json({ success: true, data: warranty });
  } catch (error) {
    // DEBUG 6: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in postWarranty:', error);
    next(error);
  }
};

export const getWarranties = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    
    // DEBUG 7: Log API call initiation
    console.log(`DEBUG (Controller): GET /warranties for user ${homeownerProfileId}`);

    const warranties = await HomeManagementService.listWarranties(homeownerProfileId);
    res.status(200).json({ success: true, data: { warranties } });
  } catch (error) {
    // DEBUG 8: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in getWarranties:', error);
    next(error);
  }
};

export const patchWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { warrantyId } = req.params;
    const updateData: UpdateWarrantyDTO = req.body;

    const warranty = await HomeManagementService.updateWarranty(
      warrantyId, 
      homeownerProfileId, 
      updateData
    );
    res.status(200).json({ success: true, data: warranty });
  } catch (error) {
    next(error);
  }
};

export const deleteWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { warrantyId } = req.params;

    await HomeManagementService.deleteWarranty(warrantyId, homeownerProfileId);
    res.status(200).json({ success: true, message: 'Warranty deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// --- NEW ASSET CONTROLLERS (For populating linked asset drop-down) ---

/**
 * Gets a list of HomeAssets linked to a specific property for populating the drop-down.
 * This enforces the rule to only show assets linked to the property.
 */
export const getLinkedAssets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { propertyId } = req.query; 

    if (!propertyId || typeof propertyId !== 'string') {
        return res.status(400).json({ success: false, error: { message: 'A valid propertyId query parameter is required.', code: 'MISSING_PROPERTY_ID' } });
    }
    
    // Call the new service function implemented in home-management.service.ts
    const assets = await HomeManagementService.listLinkedHomeAssets(
      homeownerProfileId, 
      propertyId
    );

    res.status(200).json({ success: true, data: { assets } });
  } catch (error) {
    // Handle the custom error from the service (e.g., "Property not found or does not belong to homeowner.")
    if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ success: false, error: { message: error.message, code: 'RESOURCE_NOT_FOUND' } });
    }
    next(error);
  }
};


// --- INSURANCE POLICY CONTROLLERS (Similar CRUD structure) ---

export const postInsurancePolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const policyData: CreateInsurancePolicyDTO = req.body;
    
    // DEBUG 9: Log incoming request data
    console.log('DEBUG (Controller): POST /insurance-policies received data:', policyData);

    const policy = await HomeManagementService.createInsurancePolicy(homeownerProfileId, policyData);
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    // DEBUG 10: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in postInsurancePolicy:', error);
    next(error);
  }
};

export const getInsurancePolicies = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    
    // DEBUG 11: Log API call initiation
    console.log(`DEBUG (Controller): GET /insurance-policies for user ${homeownerProfileId}`);

    const policies = await HomeManagementService.listInsurancePolicies(homeownerProfileId);
    res.status(200).json({ success: true, data: { policies } });
  } catch (error) {
    // DEBUG 12: Log the error being passed to Express's error handler
    console.error('DEBUG (Controller): Error caught in getInsurancePolicies:', error);
    next(error);
  }
};

export const patchInsurancePolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { policyId } = req.params;
    const updateData: UpdateInsurancePolicyDTO = req.body;

    const policy = await HomeManagementService.updateInsurancePolicy(
      policyId, 
      homeownerProfileId, 
      updateData
    );
    res.status(200).json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
};

export const deleteInsurancePolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { policyId } = req.params;

    await HomeManagementService.deleteInsurancePolicy(policyId, homeownerProfileId);
    res.status(200).json({ success: true, message: 'Policy deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// --- DOCUMENT CONTROLLERS (UPDATED) ---

/**
 * NEW: Lists all documents for the authenticated homeowner.
 */
export const getDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);

    const documents = await HomeManagementService.listDocuments(homeownerProfileId);
    
    res.status(200).json({ success: true, data: { documents } });
  } catch (error) {
    next(error);
  }
};


export const postDocumentUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Cast request to include Multer-specific fields
    const uploadReq = req as UploadAuthRequest;
    
    const homeownerProfileId = getHomeownerId(req);
    
    // Check for uploaded file from middleware
    if (!uploadReq.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded.', code: 'NO_FILE' } });
    }

    const file = uploadReq.file;
    
    // Extract fields from the request body (these are usually strings in multipart form data)
    const { 
        type, 
        name, 
        description, 
        propertyId, 
        warrantyId, 
        policyId 
    } = uploadReq.body;
    
    // Basic validation
    if (!type || !name) {
      return res.status(400).json({ success: false, error: { message: 'Missing required document fields (type, name).', code: 'MISSING_FIELDS' } });
    }
    
    // Count how many related IDs are provided
    const relatedIds = [propertyId, warrantyId, policyId].filter(id => id);
    if (relatedIds.length > 1) {
      return res.status(400).json({ success: false, error: { message: 'Document must be linked to at most one entity (Property, Warranty, or Policy).', code: 'TOO_MANY_RELATIONS' } });
    }

    const documentData = {
        type: type as DocumentType, 
        name: name as string, 
        description: description as string | undefined, 
        propertyId: propertyId as string | undefined, 
        warrantyId: warrantyId as string | undefined, 
        policyId: policyId as string | undefined,
    };

    // Call the service to mock upload and create record 
    const document = await HomeManagementService.createDocument(
        homeownerProfileId, 
        documentData,
        file
    );
    
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    // Handle the custom error from the service
    if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ success: false, error: { message: error.message, code: 'RESOURCE_NOT_FOUND' } });
    }
    next(error);
  }
};