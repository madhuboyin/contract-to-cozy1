// apps/backend/src/localUpdates/localUpdates.controller.ts
import { Response } from "express";
import { CustomRequest } from "../types";
import { prisma } from "../lib/prisma";
import { getPlanningContextEnvelope } from "../services/planningContext/context";
import {
  getOwnerLocalUpdates,
  dismissLocalUpdate,
} from "./localUpdates.service";

export async function getLocalUpdates(req: CustomRequest, res: Response) {
  const user = req.user!;

  // propertyAuth middleware only attaches { id } — load the canonical
  // location/dwelling facts the targeting logic actually needs.
  const propertyId = req.property?.id ?? req.params.propertyId;
  if (!propertyId) {
    return res.status(400).json({ error: "Property context missing" });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { city: true, state: true, zipCode: true, dwellingType: true },
  });
  if (!property) {
    return res.status(404).json({ error: "Property not found" });
  }

  // One authoritative targeting decision for this surface.
  const context = await getPlanningContextEnvelope(propertyId, user.userId, "LOCAL_UPDATES");
  if (context.decision.status === "NOT_APPLICABLE") {
    return res.json({ success: true, data: { updates: [], context } });
  }

  const updates = await getOwnerLocalUpdates({
    userId: user.userId,
    zip: property.zipCode || "",
    city: property.city,
    state: property.state,
    dwellingType:
      property.dwellingType && property.dwellingType !== "UNKNOWN"
        ? String(property.dwellingType)
        : undefined,
  });

  res.json({
    success: true,
    data: { updates, context }
  });
}

export async function dismissUpdate(req: CustomRequest, res: Response) {
  await dismissLocalUpdate(req.user!.userId, req.params.id);
  res.status(204).send();
}
