// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/reports/reportsApi.ts

export type HomeReportExportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | 'EXPIRED';
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

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** POST /api/properties/:propertyId/reports/exports */
export async function createHomeReportExport(propertyId: string, body?: { type?: HomeReportExportType; sections?: any }) {
  return fetchJSON<CreateExportResponse>(`/api/properties/${propertyId}/reports/exports`, {
    method: 'POST',
    body: JSON.stringify(body ?? { type: 'HOME_REPORT_PACK' }),
  });
}

/** GET /api/properties/:propertyId/reports/exports */
export async function listHomeReportExports(propertyId: string) {
  return fetchJSON<ListExportsResponse>(`/api/properties/${propertyId}/reports/exports`, { method: 'GET' });
}

/** GET /api/reports/exports/:exportId/download  -> { url } */
export async function getDownloadUrl(exportId: string) {
  return fetchJSON<DownloadResponse>(`/api/reports/exports/${exportId}/download`, { method: 'GET' });
}

/** POST /api/reports/exports/:exportId/share */
export async function createShareLink(exportId: string, expiresInDays = 14) {
  return fetchJSON<ShareResponse>(`/api/reports/exports/${exportId}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays }),
  });
}

/** POST /api/reports/exports/:exportId/share/revoke */
export async function revokeShareLink(exportId: string) {
  return fetchJSON<{ ok: boolean }>(`/api/reports/exports/${exportId}/share/revoke`, {
    method: 'POST',
  });
}
