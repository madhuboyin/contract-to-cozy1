// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/reports/reportsApi.ts

// ✅ FIXED: Import the main API client which handles base URL and auth
import { api } from '@/lib/api/client';

export type HomeReportExportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | 'EXPIRED' | 'DELETED';
export type HomeReportExportType =
  | 'HOME_SUMMARY'
  | 'INVENTORY'
  | 'MAINTENANCE_HISTORY'
  | 'COVERAGE_SNAPSHOT'
  | 'HOME_REPORT_PACK';

export type HomeReportExportDTO = {
  id: string;
  userId: string;
  propertyId: string;
  type: HomeReportExportType;
  status: HomeReportExportStatus;
  requestedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;

  shareToken?: string | null;
  shareExpiresAt?: string | null;
  shareRevokedAt?: string | null;
};

type CreateExportResponse = { exportId: string; status: HomeReportExportStatus };
type ListExportsResponse = { exports: HomeReportExportDTO[] };
type DownloadResponse = { url: string };
type ShareResponse = { shareToken: string; shareExpiresAt: string | null; shareRevokedAt?: string | null };
type RegenerateResponse = { exportId: string; status: HomeReportExportStatus };
type DeleteResponse = { ok: boolean };

/** POST /api/properties/:propertyId/reports/exports */
export async function createHomeReportExport(propertyId: string, body?: { type?: HomeReportExportType; sections?: any }) {
  const response = await api.post<CreateExportResponse>(
    `/api/properties/${propertyId}/reports/exports`, 
    body ?? { type: 'HOME_REPORT_PACK' }
  );
  return response.data;
}

/** GET /api/properties/:propertyId/reports/exports */
export async function listHomeReportExports(propertyId: string) {
  const response = await api.get<ListExportsResponse>(`/api/properties/${propertyId}/reports/exports`);
  return response.data;
}

/** GET /api/reports/exports/:exportId/download  -> { url } */
export async function getDownloadUrl(exportId: string) {
  const response = await api.get<DownloadResponse>(`/api/reports/exports/${exportId}/download`);
  return response.data;
}

/** POST /api/reports/exports/:exportId/share */
export async function createShareLink(exportId: string, expiresInDays = 14) {
  const response = await api.post<ShareResponse>(
    `/api/reports/exports/${exportId}/share`,
    { expiresInDays }
  );
  return response.data;
}

/** POST /api/reports/exports/:exportId/share/revoke */
export async function revokeShareLink(exportId: string) {
  const response = await api.post<{ ok: boolean }>(`/api/reports/exports/${exportId}/share/revoke`);
  return response.data;
}

/** POST /api/reports/exports/:exportId/regenerate -> { exportId, status } */
export async function regenerateHomeReportExport(exportId: string) {
  const response = await api.post<RegenerateResponse>(
    `/api/reports/exports/${exportId}/regenerate`,
    {} // POST body optional; keep {} to avoid some clients sending null
  );
  return response.data;
}

/** DELETE /api/reports/exports/:exportId -> { ok: true } */
export async function deleteHomeReportExport(exportId: string) {
  const response = await api.delete<DeleteResponse>(`/api/reports/exports/${exportId}`);
  return response.data;
}

