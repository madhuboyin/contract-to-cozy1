// apps/backend/src/services/claims/claims.templates.ts

import { ClaimType } from '../../types/claims.types';
import type { ClaimDocumentType } from '@prisma/client';

export type ChecklistDocRequirement = {
  docTypes: ClaimDocumentType[];
  minCount: number;
};

export type ChecklistTemplateItem = {
  title: string;
  description?: string;
  required?: boolean;
  docRequirement?: ChecklistDocRequirement; // ✅ NEW
};


export const CLAIM_CHECKLIST_TEMPLATES: Record<ClaimType, ChecklistTemplateItem[]> = {
  WATER_DAMAGE: [
    { title: 'Take photos/videos of damaged areas and source', required: true },
    { title: 'Stop/mitigate further damage (shut-off, towels, etc.)', required: true },
    { title: 'Get plumber/mitigation invoice or estimate', required: true },
    { title: 'Locate policy declaration / coverage summary', required: false },
    { title: 'Record claim number + adjuster contact details', required: true },
  ],
  STORM_WIND_HAIL: [
    { title: 'Take exterior photos (roof, siding, windows)', required: true },
    { title: 'Temporary protective measures (tarps, boarding)', required: true },
    { title: 'Get contractor estimate', required: true },
    { title: 'Locate policy coverage summary', required: false },
    { title: 'Record claim number + adjuster contact details', required: true },
  ],
  HVAC: [
    { title: 'Take photos of unit / error codes', required: false },
    { title: 'Service visit invoice / diagnostic report', required: true },
    { title: 'Warranty coverage reference (if applicable)', required: false },
    { title: 'Record claim or work-order number', required: true },
  ],
  PLUMBING: [
    { title: 'Photos/videos of issue and affected areas', required: true },
    { title: 'Plumber invoice / estimate', required: true },
    { title: 'Record claim number + contact details', required: true },
  ],
  ELECTRICAL: [
    { title: 'Photos of panel / outlet / affected areas', required: false },
    { title: 'Electrician invoice / estimate', required: true },
    { title: 'Record claim number + contact details', required: true },
  ],
  APPLIANCE: [
    { title: 'Model/serial info + photos', required: false },
    { title: 'Repair estimate / invoice', required: true },
    { title: 'Warranty coverage reference', required: false },
    { title: 'Record claim or work-order number', required: true },
  ],
  FIRE_SMOKE: [
    { title: 'Photos/videos of affected areas', required: true },
    { title: 'Fire department report (if available)', required: false },
    { title: 'Mitigation/restoration estimate', required: true },
    { title: 'Record claim number + adjuster details', required: true },
  ],
  THEFT_VANDALISM: [
    { title: 'Police report number', required: true },
    { title: 'Photos of damage / missing items evidence', required: true },
    { title: 'Receipts / proof of ownership (if available)', required: false },
    { title: 'Record claim number + adjuster details', required: true },
  ],
  LIABILITY: [
    { title: 'Incident details (who/what/when/where)', required: true },
    { title: 'Photos and witness info (if any)', required: false },
    { title: 'Record claim number + adjuster details', required: true },
  ],
  OTHER: [
    { title: 'Describe incident and collect evidence', required: true },
    { title: 'Upload estimates/invoices', required: true },
    { title: 'Record claim number + contact details', required: true },
  ],
};
