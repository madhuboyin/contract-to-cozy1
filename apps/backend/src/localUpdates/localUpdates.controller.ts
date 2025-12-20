// apps/backend/src/localUpdates/localUpdates.controller.ts
import { Response } from "express";
import { CustomRequest } from "../types/express-extension.types";
import {
  getOwnerLocalUpdates,
  dismissLocalUpdate,
} from "./localUpdates.service";

export async function getLocalUpdates(req: CustomRequest, res: Response) {
  const user = req.user!;

  const property = req.property;
  if (!property) {
    return res.status(400).json({ error: "Property context missing" });
  }

  const updates = await getOwnerLocalUpdates({
    userId: user.userId,
    zip: property.zipCode || "",
    city: property.city,
    state: property.state,
    propertyType: property.propertyType ? String(property.propertyType) : undefined,
  });

  res.json({ updates });
}

export async function dismissUpdate(req: CustomRequest, res: Response) {
  await dismissLocalUpdate(req.user!.userId, req.params.id);
  res.status(204).send();
}
