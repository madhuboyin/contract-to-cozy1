import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import * as hubService from '../services/inspectionHub.service';
import { ingestInspectionReport } from '../services/inspectionExtraction.service';
import { applyWriteBacks, getWriteBackPreview } from '../services/inspectionWriteBack.service';
import { APIError } from '../middleware/error.middleware';

// ── Hub overview ──────────────────────────────────────────────────────────────

export async function getHub(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await hubService.getHub(req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const reports = await hubService.listReports(req.params.propertyId);
    res.json({ success: true, data: { reports } });
  } catch (err) { next(err); }
}

export async function uploadReport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new APIError('PDF file is required', 400, 'FILE_REQUIRED');
    const userId = req.user!.userId;
    const { reportType, inspectionDate, inspectorName, inspectorLicense, inspectorCompany } = req.body;

    const reportId = await ingestInspectionReport({
      propertyId: req.params.propertyId,
      userId,
      pdfBuffer: req.file.buffer,
      fileName: req.file.originalname,
      reportType,
      inspectionDate,
      inspectorName,
      inspectorLicense,
      inspectorCompany,
    });

    res.status(201).json({ success: true, data: { reportId } });
  } catch (err) { next(err); }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await hubService.getReport(req.params.reportId, req.params.propertyId);
    res.json({ success: true, data: { report } });
  } catch (err) { next(err); }
}

export async function archiveReport(req: Request, res: Response, next: NextFunction) {
  try {
    await hubService.archiveReport(req.params.reportId, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Findings ──────────────────────────────────────────────────────────────────

export async function listFindings(req: Request, res: Response, next: NextFunction) {
  try {
    const grouped = req.query.grouped === 'true';
    const findings = await hubService.listFindings(
      req.params.reportId,
      req.params.propertyId,
      { groupBySystem: grouped },
    );
    res.json({ success: true, data: { findings } });
  } catch (err) { next(err); }
}

export async function updateFinding(req: Request, res: Response, next: NextFunction) {
  try {
    const finding = await hubService.updateFinding(
      req.params.findingId,
      req.params.reportId,
      req.params.propertyId,
      req.body,
    );
    res.json({ success: true, data: { finding } });
  } catch (err) { next(err); }
}

export async function dismissFinding(req: Request, res: Response, next: NextFunction) {
  try {
    const finding = await hubService.dismissFinding(
      req.params.findingId,
      req.params.reportId,
      req.params.propertyId,
      req.body.reason,
    );
    res.json({ success: true, data: { finding } });
  } catch (err) { next(err); }
}

// ── Write-back ────────────────────────────────────────────────────────────────

export async function getWriteBackPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = await getWriteBackPreview(req.params.reportId, req.params.propertyId);
    res.json({ success: true, data: { preview } });
  } catch (err) { next(err); }
}

export async function confirmReport(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const result = await applyWriteBacks(req.params.reportId, req.params.propertyId, userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Open items ────────────────────────────────────────────────────────────────

export async function listOpenItems(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await hubService.listOpenItems(req.params.propertyId, {
      severity: req.query.severity as any,
      homeSystem: req.query.homeSystem as any,
      reportId: req.query.reportId as string | undefined,
      limit: Number(req.query.limit ?? 50),
      cursor: req.query.cursor as string | undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function resolveFinding(req: Request, res: Response, next: NextFunction) {
  try {
    const finding = await hubService.resolveFinding(
      req.params.findingId,
      req.params.propertyId,
      req.body,
    );
    res.json({ success: true, data: { finding } });
  } catch (err) { next(err); }
}

// ── Comparison ────────────────────────────────────────────────────────────────

export async function compareReports(req: Request, res: Response, next: NextFunction) {
  try {
    const { reportA, reportB } = req.query as { reportA?: string; reportB?: string };
    if (!reportA || !reportB) {
      throw new APIError('reportA and reportB query params are required', 400, 'VALIDATION_ERROR');
    }
    const result = await hubService.compareReports(req.params.propertyId, reportA, reportB);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Negotiation package ───────────────────────────────────────────────────────

export async function generateNegotiationPackage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await hubService.generateNegotiationPackage(
      req.params.reportId,
      req.params.propertyId,
      req.body.findingIds,
      req.body.decisions,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Seller fix / disclose ─────────────────────────────────────────────────────

export async function getFixDisclosureDecisions(req: Request, res: Response, next: NextFunction) {
  try {
    const findings = await hubService.getFixDisclosureDecisions(
      req.params.reportId,
      req.params.propertyId,
    );
    res.json({ success: true, data: { findings } });
  } catch (err) { next(err); }
}

export async function saveFixDisclosureDecisions(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await hubService.saveFixDisclosureDecisions(
      req.params.reportId,
      req.params.propertyId,
      req.body.decisions,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
