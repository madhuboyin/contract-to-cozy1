// apps/backend/src/services/inspectionReadiness.service.ts
//
// Inspection Check Advisor: reviews photos of completed renovation work
// against a stage-specific checklist and returns a readiness verdict before
// the homeowner calls for the real permit inspection. Scoped to a single
// PermitInspectionMilestone per run.

import { GoogleGenAI } from '@google/genai';
import { RenovationInspectionStageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { analyzeImagesWithPrompt } from './ai/geminiImageAnalysis.util';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import {
  getReadinessChecklist,
  INSPECTION_READINESS_CHECKLIST_VERSION,
  ReadinessChecklistItem,
} from '../homeRenovationAdvisor/engine/inspectionReadiness/inspectionReadinessChecklists.data';

interface ChecklistItemResult {
  itemKey: string;
  itemLabel: string;
  verdict: 'MET' | 'NOT_MET' | 'UNABLE_TO_VERIFY';
  aiNote: string;
}

interface ReadinessAiResponse {
  overallVerdict: 'READY' | 'NOT_READY' | 'NEEDS_REVIEW';
  overallSummary: string;
  checklistResults: Array<{ itemKey: string; verdict: ChecklistItemResult['verdict']; aiNote: string }>;
}

class InspectionReadinessService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[INSPECTION-READINESS] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : (null as any);
  }

  async runCheck(
    propertyId: string,
    permitId: string,
    milestoneId: string,
    userId: string,
    photos: Express.Multer.File[],
  ) {
    if (!this.ai) throw new APIError('AI service not configured', 500, 'AI_NOT_CONFIGURED');
    if (!photos.length) throw new APIError('At least one photo is required', 400, 'NO_PHOTOS');

    const milestone = await prisma.permitInspectionMilestone.findFirst({
      where: { id: milestoneId, permitRecordId: permitId, propertyId },
    });
    if (!milestone) throw new APIError('Inspection milestone not found', 404, 'NOT_FOUND');

    const checklist = getReadinessChecklist(milestone.stageType);
    if (checklist.length === 0) {
      throw new APIError(
        `Readiness checks aren't available for the ${milestone.stageName} stage`,
        400,
        'NO_CHECKLIST_FOR_STAGE',
      );
    }

    const photoDocumentIds = await this.uploadPhotos(propertyId, milestoneId, userId, photos);

    const prompt = this.buildPrompt(milestone.stageName, milestone.stageType, checklist);
    const { raw, parsed } = await analyzeImagesWithPrompt<ReadinessAiResponse>(
      this.ai,
      photos.map((file) => ({ buffer: file.buffer, mimeType: file.mimetype })),
      prompt,
    );

    const checklistResults = this.reconcileChecklistResults(checklist, parsed.checklistResults);

    const check = await prisma.inspectionReadinessCheck.create({
      data: {
        milestoneId,
        propertyId,
        permitRecordId: permitId,
        stageType: milestone.stageType,
        checklistVersion: INSPECTION_READINESS_CHECKLIST_VERSION,
        photoDocumentIds,
        overallVerdict: parsed.overallVerdict,
        overallSummary: parsed.overallSummary,
        checklistResults: checklistResults as any,
        rawAiResponseJson: { raw } as any,
        ranByUserId: userId,
      },
    });

    // Regardless of the overall verdict, sync per-item tasks: NOT_MET items get a
    // trackable task, and any item now MET auto-completes its prior task (if any).
    await this.syncGapTasks(userId, propertyId, milestone, checklistResults).catch((err) => {
      logger.error({ err, checkId: check.id }, '[INSPECTION-READINESS] Failed to sync gap tasks');
    });

    return this.mapCheck(check);
  }

  async listChecksForMilestone(propertyId: string, permitId: string, milestoneId: string) {
    const milestone = await prisma.permitInspectionMilestone.findFirst({
      where: { id: milestoneId, permitRecordId: permitId, propertyId },
    });
    if (!milestone) throw new APIError('Inspection milestone not found', 404, 'NOT_FOUND');

    const checks = await prisma.inspectionReadinessCheck.findMany({
      where: { milestoneId },
      orderBy: { createdAt: 'desc' },
    });
    return checks.map((check) => this.mapCheck(check));
  }

  async getCheck(propertyId: string, checkId: string) {
    const check = await prisma.inspectionReadinessCheck.findFirst({
      where: { id: checkId, propertyId },
    });
    if (!check) throw new APIError('Readiness check not found', 404, 'NOT_FOUND');
    return this.mapCheck(check);
  }

  private buildPrompt(
    stageName: string,
    stageType: RenovationInspectionStageType,
    checklist: ReadinessChecklistItem[],
  ): string {
    const checklistText = checklist
      .map((item) => `- key: "${item.key}" | criterion: "${item.label}" | what to look for: ${item.aiGuidance}`)
      .join('\n');

    return `You are helping a homeowner self-review photos of completed "${stageName}" (${stageType}) renovation work before they call for the official building inspection.

These are COMMONLY CHECKED ITEMS for general reference only — NOT authoritative code compliance or a substitute for the real inspector. Actual requirements vary by jurisdiction. Hedge your language accordingly (e.g. "appears to," "commonly expected").

Review the attached photo(s) against this checklist:
${checklistText}

For each checklist item, decide:
- "MET" — the photos show this criterion is satisfied
- "NOT_MET" — the photos show this criterion is clearly not satisfied
- "UNABLE_TO_VERIFY" — the photos don't show enough to judge this item

Return ONLY valid JSON (no markdown, no explanation) in this exact shape:
{
  "overallVerdict": "READY" | "NOT_READY" | "NEEDS_REVIEW",
  "overallSummary": "1-2 sentence hedged summary",
  "checklistResults": [
    { "itemKey": "<key from checklist above>", "verdict": "MET" | "NOT_MET" | "UNABLE_TO_VERIFY", "aiNote": "1 sentence explaining the verdict" }
  ]
}

overallVerdict rules:
- "READY" only if every item is "MET"
- "NOT_READY" if any item is clearly "NOT_MET"
- "NEEDS_REVIEW" if no items are "NOT_MET" but one or more are "UNABLE_TO_VERIFY" (photos too unclear to confirm readiness)

Include one entry in checklistResults for every checklist item listed above — do not omit or add items.`;
  }

  private reconcileChecklistResults(
    checklist: ReadinessChecklistItem[],
    aiResults: ReadinessAiResponse['checklistResults'],
  ): ChecklistItemResult[] {
    const byKey = new Map(aiResults.map((r) => [r.itemKey, r]));
    return checklist.map((item) => {
      const result = byKey.get(item.key);
      return {
        itemKey: item.key,
        itemLabel: item.label,
        verdict: result?.verdict ?? 'UNABLE_TO_VERIFY',
        aiNote: result?.aiNote ?? 'The AI did not return a verdict for this item.',
      };
    });
  }

  private async uploadPhotos(
    propertyId: string,
    milestoneId: string,
    userId: string,
    photos: Express.Multer.File[],
  ): Promise<string[]> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getS3Client } = await import('./storage/s3Client');
    const { presignGetObject } = await import('./storage/presign');

    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET is not set');
    const client = getS3Client();

    const documentIds: string[] = [];
    for (const file of photos) {
      const key = `inspection-readiness/${propertyId}/${milestoneId}/${Date.now()}-${file.originalname}`
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._/-]/g, '');

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ServerSideEncryption: 'AES256',
          Metadata: { propertyid: propertyId, milestoneid: milestoneId, originalname: file.originalname },
        }),
      );

      const fileUrl = await presignGetObject({ bucket, key, expiresInSeconds: 60 * 60 * 24 * 7 });

      const document = await prisma.document.create({
        data: {
          propertyId,
          uploadedBy: userId,
          type: 'PHOTO',
          name: file.originalname,
          fileUrl,
          fileSize: file.buffer.length,
          mimeType: file.mimetype,
          metadata: { milestoneId, bucket, key },
        },
      });
      documentIds.push(document.id);
    }
    return documentIds;
  }

  /**
   * Creates a trackable maintenance task for every NOT_MET item (idempotent via
   * actionKey), and auto-completes any prior task for an item that now reads MET.
   */
  private async syncGapTasks(
    userId: string,
    propertyId: string,
    milestone: { id: string; stageName: string; scheduledDate: Date | null },
    checklistResults: ChecklistItemResult[],
  ) {
    for (const item of checklistResults) {
      const actionKey = `inspection-readiness:${milestone.id}:${item.itemKey}`;

      if (item.verdict === 'NOT_MET') {
        await PropertyMaintenanceTaskService.createFromActionCenter(userId, propertyId, {
          title: `Inspection prep: ${milestone.stageName} — ${item.itemLabel}`,
          description: item.aiNote,
          assetType: 'INSPECTION_READINESS',
          priority: 'HIGH',
          nextDueDate: (milestone.scheduledDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString(),
          actionKey,
        }).catch((err) => {
          logger.error({ err, actionKey }, '[INSPECTION-READINESS] Failed to create gap task');
        });
      } else if (item.verdict === 'MET') {
        await prisma.propertyMaintenanceTask.updateMany({
          where: { propertyId, actionKey, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          data: { status: 'COMPLETED' },
        });
      }
      // UNABLE_TO_VERIFY: leave any existing task as-is — don't create noise for unclear photos.
    }
  }

  private mapCheck(check: {
    id: string;
    milestoneId: string;
    propertyId: string;
    permitRecordId: string;
    stageType: RenovationInspectionStageType;
    checklistVersion: string;
    photoDocumentIds: string[];
    overallVerdict: string;
    overallSummary: string | null;
    checklistResults: unknown;
    ranByUserId: string;
    createdAt: Date;
  }) {
    return {
      ...check,
      checklistResults: check.checklistResults as unknown as ChecklistItemResult[],
      createdAt: check.createdAt.toISOString(),
    };
  }
}

export const inspectionReadinessService = new InspectionReadinessService();
