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
import { logger } from '../lib/logger';
import {
  confirmPolicyFact,
  getPolicyRecord,
  PolicyFactValue,
} from '../services/insurancePolicyRecord.service';
import { APIError } from '../middleware/error.middleware';

// ============================================================================
// FILE UPLOAD SETUP
// ============================================================================
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});
// ============================================================================

// Utility function to get homeownerProfileId from the request (assuming Auth is implemented)
const getHomeownerId = (req: AuthRequest) => (req.user as any)?.homeownerProfile?.id as string;

function parsePolicyFactCorrection(value: unknown): PolicyFactValue | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new APIError('correction must be a typed fact value', 400, 'INVALID_POLICY_FACT_CORRECTION');
  }
  const correction = value as Record<string, unknown>;
  if (
    correction.valueType === 'AMOUNT' &&
    typeof correction.amountValue === 'number' &&
    Number.isFinite(correction.amountValue) &&
    correction.amountValue >= 0 &&
    (correction.currency === undefined ||
      (typeof correction.currency === 'string' && /^[A-Z]{3}$/.test(correction.currency)))
  ) {
    return {
      valueType: 'AMOUNT',
      amountValue: correction.amountValue,
      ...(typeof correction.currency === 'string' ? { currency: correction.currency } : {}),
    };
  }
  if (
    correction.valueType === 'TEXT' &&
    typeof correction.textValue === 'string' &&
    correction.textValue.trim().length > 0 &&
    correction.textValue.length <= 10_000
  ) {
    return { valueType: 'TEXT', textValue: correction.textValue.trim() };
  }
  if (correction.valueType === 'BOOLEAN' && typeof correction.booleanValue === 'boolean') {
    return { valueType: 'BOOLEAN', booleanValue: correction.booleanValue };
  }
  if (
    correction.valueType === 'JSON' &&
    correction.jsonValue !== undefined &&
    correction.jsonValue !== null
  ) {
    return { valueType: 'JSON', jsonValue: correction.jsonValue as any };
  }
  throw new APIError(
    'correction does not match its declared valueType',
    400,
    'INVALID_POLICY_FACT_CORRECTION'
  );
}

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
    
    logger.debug({ endpoint: 'POST /expenses', userId: homeownerProfileId }, 'expense create');

    const expense = await HomeManagementService.createExpense(homeownerProfileId, expenseData);
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    // DEBUG 2: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in postExpense');
    next(error);
  }
};

export const getExpenses = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { propertyId } = req.query; // Optional filter

    // DEBUG 3: Log API call initiation
    logger.info(`DEBUG (Controller): GET /expenses for user ${homeownerProfileId}`);

    const expenses = await HomeManagementService.listExpenses(
      homeownerProfileId, 
      propertyId as string
    );
    res.status(200).json({ success: true, data: { expenses } });
  } catch (error) {
    // DEBUG 4: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in getExpenses');
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
    
    logger.debug({ endpoint: 'POST /warranties', userId: homeownerProfileId }, 'warranty create');

    const warranty = await HomeManagementService.createWarranty(homeownerProfileId, warrantyData);
    res.status(201).json({ success: true, data: warranty });
  } catch (error) {
    // DEBUG 6: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in postWarranty');
    next(error);
  }
};

export const getWarranties = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    
    // DEBUG 7: Log API call initiation
    logger.info(`DEBUG (Controller): GET /warranties for user ${homeownerProfileId}`);

    const warranties = await HomeManagementService.listWarranties(homeownerProfileId);
    res.status(200).json({ success: true, data: { warranties } });
  } catch (error) {
    // DEBUG 8: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in getWarranties');
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

// --- INSURANCE POLICY CONTROLLERS (Similar CRUD structure) ---

export const postInsurancePolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const policyData: CreateInsurancePolicyDTO = req.body;
    
    logger.debug({ endpoint: 'POST /insurance-policies', userId: homeownerProfileId }, 'insurance policy create');

    const policy = await HomeManagementService.createInsurancePolicy(homeownerProfileId, policyData);
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    // DEBUG 10: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in postInsurancePolicy');
    next(error);
  }
};

export const getInsurancePolicies = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    
    // DEBUG 11: Log API call initiation
    logger.info(`DEBUG (Controller): GET /insurance-policies for user ${homeownerProfileId}`);

    const policies = await HomeManagementService.listInsurancePolicies(
      homeownerProfileId,
      typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined
    );
    res.status(200).json({ success: true, data: { policies } });
  } catch (error) {
    // DEBUG 12: Log the error being passed to Express's error handler
    logger.error({ err: error }, 'DEBUG (Controller): Error caught in getInsurancePolicies');
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

export const getInsurancePolicyRecord = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const policy = await getPolicyRecord(req.params.policyId, getHomeownerId(req));
    res.status(200).json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
};

export const patchInsurancePolicyFact = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const confirmationStatus = req.body?.confirmationStatus;
    if (confirmationStatus !== 'CONFIRMED' && confirmationStatus !== 'REJECTED') {
      throw new APIError(
        'confirmationStatus must be CONFIRMED or REJECTED',
        400,
        'INVALID_CONFIRMATION_STATUS'
      );
    }
    if (!req.user?.userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const fact = await confirmPolicyFact({
      policyId: req.params.policyId,
      factId: req.params.factId,
      homeownerProfileId: getHomeownerId(req),
      userId: req.user.userId,
      confirmationStatus,
      correction: parsePolicyFactCorrection(req.body?.correction),
    });
    res.status(200).json({ success: true, data: fact });
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
