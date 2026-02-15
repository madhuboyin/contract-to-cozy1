import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  CreateDoNothingScenarioInput,
  DoNothingSimulatorService,
  RunDoNothingSimulationInput,
  UpdateDoNothingScenarioInput,
} from '../services/doNothingSimulator.service';

const service = new DoNothingSimulatorService();

export async function listDoNothingScenarios(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.listScenarios(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error listing do-nothing scenarios:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to list do-nothing scenarios.',
    });
  }
}

export async function createDoNothingScenario(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = req.body as CreateDoNothingScenarioInput;
    const result = await service.createScenario(propertyId, userId, payload);
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error creating do-nothing scenario:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to create do-nothing scenario.',
    });
  }
}

export async function updateDoNothingScenario(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const scenarioId = req.params.scenarioId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = req.body as UpdateDoNothingScenarioInput;
    const result = await service.updateScenario(propertyId, scenarioId, userId, payload);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error updating do-nothing scenario:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update do-nothing scenario.',
    });
  }
}

export async function deleteDoNothingScenario(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const scenarioId = req.params.scenarioId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    await service.deleteScenario(propertyId, scenarioId, userId);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting do-nothing scenario:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to delete do-nothing scenario.',
    });
  }
}

export async function getLatestDoNothingRun(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const scenarioId =
      typeof req.query.scenarioId === 'string' && req.query.scenarioId.length > 0
        ? req.query.scenarioId
        : undefined;

    const horizonMonths =
      typeof req.query.horizonMonths === 'string' && req.query.horizonMonths.length > 0
        ? Number(req.query.horizonMonths)
        : undefined;

    const result = await service.getLatestRun(propertyId, userId, {
      scenarioId,
      horizonMonths: Number.isFinite(horizonMonths) ? horizonMonths : undefined,
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching latest do-nothing run:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch do-nothing run.',
    });
  }
}

export async function runDoNothingSimulation(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = req.body as RunDoNothingSimulationInput;
    const result = await service.run(propertyId, userId, payload);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error running do-nothing simulation:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run do-nothing simulation.',
    });
  }
}
