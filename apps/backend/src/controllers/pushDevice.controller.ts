// apps/backend/src/controllers/pushDevice.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types';
import { logger } from '../lib/logger';
import {
  registerDevice,
  unregisterDevice,
  listDevices,
} from '../services/pushDevice.service';
import type {
  RegisterPushDeviceInput,
  UnregisterPushDeviceInput,
} from '../validators/pushDevice.validators';

export const registerPushDevice = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const device = await registerDevice(userId, req.body as RegisterPushDeviceInput);
    res.status(201).json({ success: true, data: device });
  } catch (error) {
    logger.error({ err: error }, 'Error registering push device');
    res.status(500).json({ success: false, message: 'Failed to register the device.' });
  }
};

export const unregisterPushDevice = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    await unregisterDevice(userId, req.body as UnregisterPushDeviceInput);
    res.json({ success: true, data: { message: 'Device unregistered.' } });
  } catch (error) {
    logger.error({ err: error }, 'Error unregistering push device');
    res.status(500).json({ success: false, message: 'Failed to unregister the device.' });
  }
};

export const getPushDevices = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const devices = await listDevices(userId);
    res.json({ success: true, data: { devices } });
  } catch (error) {
    logger.error({ err: error }, 'Error listing push devices');
    res.status(500).json({ success: false, message: 'Failed to load devices.' });
  }
};
