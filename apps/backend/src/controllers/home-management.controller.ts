// apps/backend/src/controllers/home-management.controller.ts

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import * as HomeManagementService from '../services/home-management.service';
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO,
  CreateExpenseDTO, UpdateExpenseDTO 
} from '../types'; 

// Utility function to get homeownerProfileId from the request (assuming Auth is implemented)
// NOTE: This assumes `req.user` is set by `auth.middleware.ts`
const getHomeownerId = (req: AuthRequest) => (req.user as any)?.homeownerProfile?.id as string;

// --- EXPENSE CONTROLLERS ---

export const postExpense = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const expenseData: CreateExpenseDTO = req.body;
    
    // NOTE: Validation middleware should ensure expenseData integrity

    const expense = await HomeManagementService.createExpense(homeownerProfileId, expenseData);
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

export const getExpenses = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const { propertyId } = req.query; // Optional filter

    const expenses = await HomeManagementService.listExpenses(
      homeownerProfileId, 
      propertyId as string
    );
    res.status(200).json({ success: true, data: { expenses } });
  } catch (error) {
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
    const warranty = await HomeManagementService.createWarranty(homeownerProfileId, warrantyData);
    res.status(201).json({ success: true, data: warranty });
  } catch (error) {
    next(error);
  }
};

export const getWarranties = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const warranties = await HomeManagementService.listWarranties(homeownerProfileId);
    res.status(200).json({ success: true, data: { warranties } });
  } catch (error) {
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
    const policy = await HomeManagementService.createInsurancePolicy(homeownerProfileId, policyData);
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
};

export const getInsurancePolicies = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const homeownerProfileId = getHomeownerId(req);
    const policies = await HomeManagementService.listInsurancePolicies(homeownerProfileId);
    res.status(200).json({ success: true, data: { policies } });
  } catch (error) {
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