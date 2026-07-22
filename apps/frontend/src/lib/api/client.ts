// apps/frontend/src/lib/api/client.ts

import {
  APIResponse,
  LoginInput,
  LoginResponse,
  AuthLoginResponse,
  RegisterInput,
  RegisterResponse,
  MfaStatusResponse,
  MfaRecoveryCodesResponse,
  User,
  Provider,
  Service,
  Booking,
  CreateBookingInput,
  PaginationParams,
  Property,
  MaintenanceTaskTemplate,
  MaintenanceTaskConfig,
  // NEW HOME MANAGEMENT IMPORTS
  CreateExpenseInput,
  UpdateExpenseInput,
  Expense,
  CreateWarrantyInput,
  UpdateWarrantyInput,
  Warranty,
  CreateInsurancePolicyInput,
  UpdateInsurancePolicyInput,
  InsurancePolicy,
  InsuranceProtectionGapSummary,
  HomeEquitySummary,
  APISuccess, 
  // NEW DOCUMENT IMPORTS
  Document,
  DocumentUploadInput,
  // FIX 1: Add Checklist and ChecklistItem types
  Checklist, 
  ChecklistItem,
  UpdateChecklistItemInput, 
  // NEW RISK ASSESSMENT TYPES
  RiskAssessmentReport,
  AssetRiskDetail,
  PrimaryRiskSummary, // [NEW IMPORT]
  // NEW FINANCIAL EFFICIENCY TYPES
  FinancialEfficiencyReport, // [NEW IMPORT]
  FinancialReportSummary, // [NEW IMPORT]
  PropertyScoreSnapshotSummary,
  HomeScoreReport,
  HomeScoreCorrection,
  HomeScoreReason,
  HomeScoreTrendPoint,
  // [NEW IMPORTS] for AI Report Typing
  OracleReport, 
  BudgetForecast,
  CommunityEvent,
  CommunityEventsResponse,
  // LOCAL UPDATES
  LocalUpdate,
  // NEW ORCHESTRATION TYPES 
  OrchestratedActionDTO,
  OrchestrationSummaryDTO,
  SuppressionReason,
  ServiceCategory,
  CompletionResponseDTO,
  CompletionDataDTO,
  CompletionPhotoDTO,
  VaultShareLinkResponse,

  HomeBuyerChecklist,
  HomeBuyerTask,
  HomeBuyerTaskStats,
  BuyerImportReadiness,
  BuyerEvidenceReview,
  BuyerFindingDisposition,
  BuyerAcceptanceStatus,
  NewHomeDocumentAvailability,
  NewHomePilotAssessment,
  NewHomeSetupOverview,
  NewHomeSetupPlan,
  NewHomeSetupTask,
  HomeBuyerTaskStatus,
  ToolDiscoveryAvailabilityDTO,
  ToolLifecycleEventDTO,
  CreateHomeBuyerTaskInput,
  UpdateHomeBuyerTaskInput,
  PropertyMaintenanceTask,
  MaintenanceTaskStats,
  MaintenanceTaskStatus,
  MaintenanceTaskFilters,
  CreateMaintenanceTaskInput,
  CreateMaintenanceTaskFromActionCenterInput,
  CreateMaintenanceTasksFromTemplatesInput,
  UpdateMaintenanceTaskInput,
  SeasonalMaintenanceResult,
  RemoveSeasonalMaintenanceResult,
  LinkBookingResponse,
  MaintenancePrediction,
  MaintenancePredictionStatus,
  MaintenanceForecastSummary,

  InventoryImportBatch,
  PropertyDashboardBootstrap,
  PropertyNarrativeRun,
  RadarFeedItem,
  RadarMatchDetail,
  RadarUserState,
  ResolutionCenterPayload,
  EnvironmentReportDTO,
  FoundationType,
  PropertyContextCompleteness,
  PropertyContextScope,
  PropertyContextSnapshot,
  PropertyExteriorProfile,
  DwellingType,
  OwnershipForm,
  PropertyUse,
  OccupancyStatus,
  PropertyResponsibilityInput,
  ActivationEntryContextInput,
  ActivationFirstValueDTO,
  ActivationTriggerEvidenceInput,
  HomeActionCommand,
  HomeActionFeedDTO,
  UnifiedHomeDTO,
} from '@/types';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import type { FeatureContextCaptureResult, FeatureContextEvaluation } from '@/components/property-context/featureContextTypes';

// REMOVED: import { RiskReportSummary } from '@/app/(dashboard)/dashboard/types'; as it was not defined or needed.

// FIX 1: Define a custom Error class to carry API error messages and status

class APIError extends Error {
  constructor(
    message: string,
    public status: number | string = 'API_ERROR',
    public payload?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// FIX 2: Define a temporary structural type for ProviderProfile to resolve the 'Cannot find name' error.
type ProviderProfile = Provider & {
  user: User & { phone: string | null }; 
  services: Service[];
};

// --- NEW GEMINI CHAT TYPES ---
interface SendMessageToChatPayload {
  sessionId: string;
  message: string;
  propertyId?: string; // [MODIFICATION] Add optional propertyId
}

interface ChatResponse {
  text: string;
  groundingMode: 'PROPERTY' | 'GENERAL';
  knownFacts: Array<{ key: string; label: string; value: unknown; source: string | null; observedAt: string | null }>;
  assumptions: string[];
  missingFacts: string[];
  evidence: Array<{ factKey: string; label: string; source: string | null; observedAt: string | null; confidence: number | null }>;
  confidence: { score: number | null; label: 'LOW' | 'MEDIUM' | 'HIGH'; rationale: string };
  safetyBoundary: string;
  nextAction: string;
  proposals: Array<{ id: string; kind: string; summary: string; requiresConfirmation: true }>;
  propertyContext?: PropertyContextEnvelope;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const MAX_BOOKINGS_LIST_LIMIT = 50;

/** Safely coerce Prisma Decimal / string values to a JS number. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * API Client for ContractToCozy Backend
 * Uses a class structure for token refresh logic and state management.
 */
class APIClient {
  private static readonly PROPERTIES_CACHE_TTL_MS = 60_000;
  private static readonly PROPERTIES_SESSION_FALLBACK_KEY = 'ctc:properties-cache:v1';
  private baseURL: string;
  private csrfToken: string | null = null;
  private csrfTokenRequest: Promise<string | null> | null = null;
  private propertiesCache: {
    data: APIResponse<{ properties: Property[] }>;
    expiresAt: number;
  } | null = null;
  private propertiesRequest: Promise<APIResponse<{ properties: Property[] }>> | null = null;

  // Add state to prevent multiple refresh attempts at the same time
  private isRefreshing = false;
  private failedQueue: {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    endpoint: string;
    options: RequestInit;
    headers: Record<string, string>;
  }[] = [];

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private buildQueryString(params?: Record<string, any>): string {
    if (!params) return '';

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      query.append(key, String(value));
    });

    const serialized = query.toString();
    return serialized ? `?${serialized}` : '';
  }

  private readStoredPropertiesCache(): APIResponse<{ properties: Property[] }> | null {
    if (typeof window === 'undefined') return null;

    try {
      const raw = window.sessionStorage.getItem(APIClient.PROPERTIES_SESSION_FALLBACK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        data?: APIResponse<{ properties: Property[] }>;
      } | null;
      if (!parsed?.data?.success || !Array.isArray(parsed.data.data?.properties)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeStoredPropertiesCache(data: APIResponse<{ properties: Property[] }>): void {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(
        APIClient.PROPERTIES_SESSION_FALLBACK_KEY,
        JSON.stringify({ data, savedAt: Date.now() }),
      );
    } catch {
      // Ignore storage failures and continue with in-memory cache.
    }
  }

  /**
   * Drop the properties cache (in-memory + sessionStorage fallback). Must run on
   * login/logout so a stale or cross-account property list is never served after
   * a session change in the same tab.
   */
  private resetPropertiesCache(): void {
    this.propertiesCache = null;
    this.propertiesRequest = null;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(APIClient.PROPERTIES_SESSION_FALLBACK_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  private shouldAttachCsrf(endpoint: string, method?: string): boolean {
    const normalizedMethod = (method || 'GET').toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return false;
    return endpoint.startsWith('/api/');
  }

  private async getCsrfToken(): Promise<string | null> {
    if (this.csrfToken) return this.csrfToken;
    if (this.csrfTokenRequest) return this.csrfTokenRequest;

    this.csrfTokenRequest = fetch(`${this.baseURL}/api/csrf-token`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json().catch(() => null);
        const token =
          data && typeof data === 'object' && typeof data.csrfToken === 'string'
            ? data.csrfToken
            : null;
        this.csrfToken = token;
        return token;
      })
      .catch(() => null)
      .finally(() => {
        this.csrfTokenRequest = null;
      });

    return this.csrfTokenRequest;
  }

  private clearCsrfToken(): void {
    this.csrfToken = null;
    this.csrfTokenRequest = null;
  }

  private validateFile(file: File, options?: { maxSizeMB?: number; allowedTypes?: string[] }) {
    const maxSize = (options?.maxSizeMB ?? 10) * 1024 * 1024;
    const allowedTypes = options?.allowedTypes ?? [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (file.size > maxSize) {
      throw new APIError(`File too large. Maximum size is ${options?.maxSizeMB ?? 10}MB.`, 400);
    }
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      throw new APIError(`File type "${file.type || 'unknown'}" is not allowed.`, 400);
    }
  }

  // --- HELPER TO PROCESS WAITING REQUESTS ---
  private processFailedQueue(error: Error | null, _token: string | null = null) {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        fetch(`${this.baseURL}${prom.endpoint}`, {
          ...prom.options,
          credentials: 'include',
          headers: prom.headers,
        })
          .then(res => res.json())
          .then(data => {
            // We resolve with the JSON data, assuming the retry was successful.
            prom.resolve(data);
          })
          .catch(err => prom.reject(err));
      }
    });
    this.failedQueue = [];
  }

  /**
   * Get auth token from localStorage
   */
  private getToken(): string | null {
    return null;
  }

  /**
   * Set auth token in localStorage
   */
  private setToken(_token: string): void {
  }

  /**
   * Remove auth token from localStorage
   */
  private removeToken(): void {
    this.clearCsrfToken();
  }

  clearSessionTokens(): void {
    this.removeToken();
  }

  /**
   * Make HTTP request
   */
// apps/frontend/src/lib/api/client.ts

  private async request<T>(
    endpoint: string,
    options: Omit<RequestInit, 'body'> & { body?: any } = {}
  ): Promise<APIResponse<T>> {
    let body = options.body;

    // ✅ Detect FormData / binary payloads
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;
    const isBlob =
      typeof Blob !== 'undefined' && body instanceof Blob;
    const isArrayBuffer =
      typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer;

    // ✅ Only JSON stringify plain objects (NOT FormData / Blob / ArrayBuffer)
    if (body && typeof body !== 'string' && !isFormData && !isBlob && !isArrayBuffer) {
      body = JSON.stringify(body);
    }

    // Save the original body so token-refresh retry can re-send it.
    // FormData/Blob streams are consumed by fetch, so we keep the reference
    // to the original (unconsumed) value for the retry path.
    const originalBody = body;
    
    // ✅ Only set JSON Content-Type when body is JSON (not FormData)
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    
    if (!isFormData) {
      // If caller didn't set Content-Type explicitly, default to JSON.
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    
    if (this.shouldAttachCsrf(endpoint, options.method) && !headers['x-csrf-token']) {
      const csrfToken = await this.getCsrfToken();
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
    }

    try {
      let response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        body,
        credentials: 'include',
        headers,
      });

      // --- TOKEN REFRESH LOGIC ---
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        if (this.isRefreshing) {
          return new Promise((resolve, reject) => {
            const cleanHeaders = { ...headers };
            this.failedQueue.push({ resolve, reject, endpoint, options, headers: cleanHeaders });
          });
        }

        this.isRefreshing = true;
        const refreshResponse = await this.refreshToken();

        if (refreshResponse.success) {
          this.isRefreshing = false;
          this.processFailedQueue(null, null);

          response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            body: originalBody,
            credentials: 'include',
            headers,
          });
        } else {
          this.isRefreshing = false;
          const error = new APIError('Session expired. Please log in again.', 401);
          this.processFailedQueue(error, null);
          this.removeToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=session_expired';
          }
          throw error;
        }
      }

      // --- ROBUST BODY HANDLING ---
      let data: any = null;
      let text = ''; 
      
      // Read the body once as text to prevent "body stream already read" errors later
      const hasContent = ![204, 205, 304].includes(response.status);
      if (hasContent) {
          text = await response.text();
      }

      if (text) {
        try {
            data = JSON.parse(text);
        } catch (e) {
            // If JSON parsing fails (e.g. server returned HTML 500 page), throw a clear APIError
            throw new APIError(`Invalid server response format (${response.status})`, response.status);
        }
      }

      // --- ERROR EXTRACTION ---
      if (!response.ok || (data && data.success === false)) {
        let rawError = data?.message || data?.error || `Request failed (${response.status})`;
        
        // Flatten error objects if they exist
        if (typeof rawError === 'object' && rawError !== null) {
            rawError = (rawError as any).message || JSON.stringify(rawError);
        }
        
        const errorMessage = typeof rawError === 'string' ? rawError : 'An unexpected error occurred';
        throw new APIError(errorMessage, response.status, data);
      }

      // --- SUCCESS HANDLING ---
      if (response.status === 204 || response.status === 205) {
          return { success: true, data: {} as T, message: "No Content" } as APIResponse<T>;
      }

      return data; 

    } catch (error) {
      // Critical: Ensure every error path results in a thrown error so the UI catch/finally blocks run
      if (error instanceof APIError) {
        if (error.status === 429) {
          console.warn('API Request Rate Limited:', error.message);
        } else {
          console.error('API Request Error:', error);
        }
        throw error;
      }

      console.error('API Request Error:', error);
      // Convert generic network errors (like DNS failure or Timeout) into APIErrors
      throw new APIError('Network error. Please check your connection.', 'NETWORK');
    }
  }

  private async formDataRequest<T>(
    endpoint: string,
    formData: FormData
  ): Promise<APIResponse<T>> {
    const headers: Record<string, string> = {};

    if (this.shouldAttachCsrf(endpoint, 'POST')) {
      const csrfToken = await this.getCsrfToken();
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
    }

    try {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST', // File uploads are typically POST
            // Do NOT set Content-Type header; let the browser set it for FormData
            credentials: 'include',
            headers,
            body: formData,
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          const errorMessage =
            (data?.error && (typeof data.error === 'string' ? data.error : data.error.message)) ||
            data?.message ||
            `HTTP Error: ${response.status}`;

          // FIX: Throw error
          throw new APIError(errorMessage, response.status, data);
        }

        return data; // This is the APIResponse
        
    } catch (error) {
        console.error('API Form Data Request Error:', error);
        // FIX: Re-throw custom errors, otherwise throw generic network error
        if (error instanceof APIError) {
            throw error;
        }
        throw new APIError('Network error or session issue during file upload.', 'NETWORK');
    }
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<APIResponse<T>> {
    return this.formDataRequest<T>(endpoint, formData);
  }

  // ==========================================================================
  // AUTH ENDPOINTS 
  // ==========================================================================

  /**
   * Register new user
   */
  async register(input: RegisterInput): Promise<APIResponse<RegisterResponse>> {
    return this.request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: input,
    });
  }

  /**
   * Login user
   */
  async login(input: LoginInput): Promise<APIResponse<AuthLoginResponse>> {
    this.resetPropertiesCache();
    return this.request<AuthLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: input,
    });
  }

  /**
   * Verify TOTP code for MFA login challenge.
   */
  async verifyMfaChallenge(
    mfaToken: string,
    code: string
  ): Promise<APIResponse<LoginResponse>> {
    return this.request<LoginResponse>('/api/auth/mfa/challenge', {
      method: 'POST',
      body: { mfaToken, code },
    });
  }

  /**
   * Verify one-time recovery code for MFA login challenge.
   */
  async verifyMfaRecoveryChallenge(
    mfaToken: string,
    recoveryCode: string
  ): Promise<APIResponse<LoginResponse>> {
    return this.request<LoginResponse>('/api/auth/mfa/challenge/recovery', {
      method: 'POST',
      body: { mfaToken, recoveryCode },
    });
  }

  /**
   * Begin MFA setup and return otpauth URI + base32 secret.
   */
  async setupMfa(): Promise<APIResponse<{ otpauthUri: string; base32Secret: string }>> {
    return this.request('/api/auth/mfa/setup', {
      method: 'POST',
    });
  }

  /**
   * Verify initial setup TOTP and receive recovery codes.
   */
  async verifyMfaSetup(code: string): Promise<APIResponse<{ message: string; recoveryCodes: string[] }>> {
    return this.request('/api/auth/mfa/setup/verify', {
      method: 'POST',
      body: { code },
    });
  }

  /**
   * Disable MFA after verifying current TOTP code.
   */
  async disableMfa(code: string): Promise<APIResponse<{ message: string }>> {
    return this.request('/api/auth/mfa/disable', {
      method: 'POST',
      body: { code },
    });
  }

  /**
   * Regenerate recovery codes after verifying current TOTP code.
   */
  async regenerateMfaRecoveryCodes(code: string): Promise<APIResponse<MfaRecoveryCodesResponse>> {
    return this.request('/api/auth/mfa/recovery-codes/regenerate', {
      method: 'POST',
      body: { code },
    });
  }

  /**
   * Fetch MFA status and remaining recovery code count.
   */
  async getMfaStatus(): Promise<APIResponse<MfaStatusResponse>> {
    return this.request('/api/auth/mfa/status', {
      method: 'GET',
    });
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', {
        method: 'POST',
      });
    } catch (e) {
      // Ignore errors on logout request, the tokens are being cleared anyway
    } finally {
      this.removeToken();
      this.resetPropertiesCache();
    }
  }

  /**
   * Request password reset email.
   * Keeps anti-enumeration behavior: treat 4xx as a generic success message.
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseURL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.status >= 500) {
      throw new APIError('Server error. Please try again later.', response.status, data);
    }

    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  /**
   * Reset password using token from email flow.
   */
  async resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await fetch(`${this.baseURL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        success: false,
        error:
          data?.error?.message ||
          data?.message ||
          'Password reset failed. The link may be expired or invalid.',
      };
    }

    return {
      success: true,
      message: data?.message || 'Your password has been reset successfully.',
    };
  }

  /**
   * Deactivate current user account.
   */
  async deactivateMyAccount(): Promise<APIResponse<{ status: string; deactivatedAt: string }>> {
    return this.request<{ status: string; deactivatedAt: string }>('/api/users/account/deactivate', {
      method: 'POST',
    });
  }

  /**
   * Delete current user account.
   */
  async deleteMyAccount(): Promise<APIResponse<{ status: string; deletedAt: string }>> {
    return this.request<{ status: string; deletedAt: string }>('/api/users/account', {
      method: 'DELETE',
    });
  }

  /**
   * Get current user (Restored name: getCurrentUser)
   */
  async getCurrentUser(tokenOverride?: string): Promise<APIResponse<User>> {
    const options: RequestInit = {};

    if (tokenOverride) {
      options.headers = { 'Authorization': `Bearer ${tokenOverride}` };
    }
    
    return this.request<User>('/api/auth/me', options);
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<APIResponse<{ sessionRefreshed: true }>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const csrfToken = await this.getCsrfToken();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
        return {
            success: false,
            message: data.message || 'Failed to refresh token',
        };
    }

    return data;
  }

  // ==========================================================================
  // GENERIC HTTP METHODS (for use by API wrapper files)
  // ==========================================================================

  /**
   * Generic GET request
   */
  async get<T = any>(
    endpoint: string,
    options?: { params?: Record<string, any>; responseType?: 'blob' }
  ): Promise<{ data: T }> {
    const url = `${endpoint}${this.buildQueryString(options?.params)}`;

    // Handle blob responses separately
    if (options?.responseType === 'blob') {
      const headers: Record<string, string> = {};

      const response = await fetch(`${this.baseURL}${url}`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        throw new APIError(`Request failed (${response.status})`, response.status);
      }

      const blob = await response.blob();
      return { data: blob as T };
    }

    const response: any = await this.request<any>(url, { method: 'GET' });

    // ✅ Robust unwrap: if response has .data use it, otherwise treat response as payload
    const payload = (response && typeof response === 'object' && 'data' in response) ? response.data : response;

    return { data: payload as T };
  }

  /**
   * Generic POST request
   */
  async post<T = any>(endpoint: string, data?: any): Promise<{ data: T }> {
    const response: any = await this.request<any>(endpoint, {
      method: 'POST',
      body: data,
    });

    const payload = (response && typeof response === 'object' && 'data' in response) ? response.data : response;

    return { data: payload as T };
  }

  /**
   * Generic PUT request
   */
  async put<T = any>(endpoint: string, data?: any): Promise<{ data: T }> {
    const response: any = await this.request<any>(endpoint, {
      method: 'PUT',
      body: data,
    });

    const payload = (response && typeof response === 'object' && 'data' in response) ? response.data : response;

    return { data: payload as T };
  }

  /**
   * Generic DELETE request
   */
  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    const response: any = await this.request<any>(endpoint, { method: 'DELETE' });

    const payload = (response && typeof response === 'object' && 'data' in response) ? response.data : response;

    return { data: payload as T };
  }

  // ==========================================================================
  // CHECKLIST ENDPOINTS 
  // ==========================================================================
  
  /**
   * Fetches the user's full checklist and items.
   */
  async getChecklist(): Promise<APIResponse<Checklist & { items: ChecklistItem[] }>> {
    return this.request<Checklist & { items: ChecklistItem[] }>('/api/checklist');
  }

  /**
   * Updates an existing checklist item.
   */
  async updateChecklistItem(
    id: string,
    data: UpdateChecklistItemInput
  ): Promise<APIResponse<ChecklistItem>> {
    return this.request<ChecklistItem>(`/api/checklist/items/${id}`, {
      method: 'PATCH', // Use PATCH for partial updates
      body: data,
    });
  }

  /**
   * Deletes a checklist item.
   */
  async deleteChecklistItem(id: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/checklist/items/${id}`, {
      method: 'DELETE',
    });
  }
  // ==========================================================================
  // NEW GEMINI/AI CHAT ENDPOINTS 
  // ==========================================================================

  async sendMessageToChat(payload: SendMessageToChatPayload): Promise<APIResponse<ChatResponse>> {
    return this.request<ChatResponse>('/api/gemini/chat', {
      method: 'POST',
      body: payload,
    });
  }
  async createGroundedAskProposal(payload: {
    sessionId: string; propertyId?: string | null; kind: string; summary: string;
    payload: Record<string, unknown>;
    evidence: Array<{ factKey: string; source: string | null; observedAt: string | null }>;
  }): Promise<APIResponse<{ id: string; requiresConfirmation: true }>> {
    return this.request('/api/gemini/proposals', { method: 'POST', body: payload });
  }
  async confirmGroundedAskProposal(id: string): Promise<APIResponse<{ id: string; artifactType: string }>> {
    return this.request(`/api/gemini/proposals/${id}/confirm`, { method: 'POST' });
  }
  async rejectGroundedAskProposal(id: string): Promise<APIResponse<{ rejected: true }>> {
    return this.request(`/api/gemini/proposals/${id}/reject`, { method: 'POST' });
  }
  // ==========================================================================
  // PROVIDER ENDPOINTS 
  // ==========================================================================

  /**
   * Search providers
   */
  async searchProviders(params: {
    propertyId?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    category?: string;
    workCategory?: string;
    minRating?: number;
    verifiedOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<APIResponse<{
    providers: Provider[];
    pagination: any;
    propertyContext?: PropertyContextEnvelope;
  }>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    return this.request(`/api/providers/search?${queryParams.toString()}`);
  }

  /**
   * Get provider by ID
   */
  async getProvider(id: string): Promise<APIResponse<Provider>> {
    return this.request(`/api/providers/${id}`);
  }

  /**
   * Get provider services
   */
  async getProviderServices(id: string): Promise<APIResponse<{ services: Service[] }>> {
    return this.request(`/api/providers/${id}/services`);
  }

  /**
   * Get provider reviews
   */
  async getProviderReviews(
    id: string,
    params?: PaginationParams
  ): Promise<APIResponse<any>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request(`/api/providers/${id}/reviews?${queryParams.toString()}`);
  }

  /**
   * Public/homeowner-safe verification summary — powers the "Verified Pro" badge
   */
  async getProviderVerificationSummary(
    id: string
  ): Promise<import('@/types').ProviderVerificationSummary> {
    const res = await this.get<import('@/types').ProviderVerificationSummary>(
      `/api/providers/${id}/verification-summary`
    );
    return res.data ?? { verifiedCategories: [], unverifiedCategories: [], credentialTypesPresent: [] };
  }

  // ==========================================================================
  // PROVIDER TRUST & COMPLIANCE VERIFICATION
  // ==========================================================================

  async listProviderCredentials(): Promise<import('@/types').ProviderCredential[]> {
    const res = await this.get<import('@/types').ProviderCredential[]>('/api/providers/me/credentials');
    return res.data ?? [];
  }

  async submitProviderCredential(
    payload: import('@/types').SubmitProviderCredentialPayload
  ): Promise<import('@/types').ProviderCredential> {
    const res = await this.post<import('@/types').ProviderCredential>('/api/providers/me/credentials', payload);
    if (!res.data) throw new APIError('Failed to submit credential', 500);
    return res.data;
  }

  async renewProviderCredential(
    credentialId: string,
    payload: import('@/types').RenewProviderCredentialPayload
  ): Promise<import('@/types').ProviderCredential> {
    const res = await this.post<import('@/types').ProviderCredential>(
      `/api/providers/me/credentials/${credentialId}/renew`,
      payload
    );
    if (!res.data) throw new APIError('Failed to submit renewal', 500);
    return res.data;
  }

  /**
   * Uploads the credential's evidence document (PDF/image) and returns its
   * documentId, to be passed as SubmitProviderCredentialPayload.documentId.
   */
  async uploadProviderCredentialDocument(
    file: File,
    credentialType?: import('@/types').ProviderCredentialType
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    if (credentialType) formData.append('credentialType', credentialType);

    const res = await this.formDataRequest<{ id: string }>(
      '/api/providers/me/credentials/documents',
      formData
    );
    if (!res.success || !res.data?.id) throw new APIError('Failed to upload document', 500);
    return res.data.id;
  }

  async getProviderCategoryEligibility(): Promise<import('@/types').ProviderCategoryEligibility[]> {
    const res = await this.get<import('@/types').ProviderCategoryEligibility[]>(
      '/api/providers/me/category-eligibility'
    );
    return res.data ?? [];
  }

  async listProviderComplianceAlerts(): Promise<import('@/types').ProviderComplianceAlert[]> {
    const res = await this.get<import('@/types').ProviderComplianceAlert[]>(
      '/api/providers/me/compliance-alerts'
    );
    return res.data ?? [];
  }

  async adminListProviderCredentialQueue(filters?: {
    type?: import('@/types').ProviderCredentialType;
    serviceCategory?: import('@/types').ServiceCategory;
  }): Promise<import('@/types').ProviderCredential[]> {
    const res = await this.get<import('@/types').ProviderCredential[]>(
      '/api/admin/provider-credentials/queue',
      { params: filters }
    );
    return res.data ?? [];
  }

  async adminApproveProviderCredential(credentialId: string): Promise<import('@/types').ProviderCredential> {
    const res = await this.post<import('@/types').ProviderCredential>(
      `/api/admin/provider-credentials/${credentialId}/approve`
    );
    if (!res.data) throw new APIError('Failed to approve credential', 500);
    return res.data;
  }

  async adminRejectProviderCredential(
    credentialId: string,
    rejectionReason: string
  ): Promise<import('@/types').ProviderCredential> {
    const res = await this.post<import('@/types').ProviderCredential>(
      `/api/admin/provider-credentials/${credentialId}/reject`,
      { rejectionReason }
    );
    if (!res.data) throw new APIError('Failed to reject credential', 500);
    return res.data;
  }

  async adminRevokeProviderCredential(
    credentialId: string,
    reason: string
  ): Promise<import('@/types').ProviderCredential> {
    const res = await this.post<import('@/types').ProviderCredential>(
      `/api/admin/provider-credentials/${credentialId}/revoke`,
      { reason }
    );
    if (!res.data) throw new APIError('Failed to revoke credential', 500);
    return res.data;
  }

  // ==========================================================================
  // BOOKING ENDPOINTS
  // ==========================================================================
  async createBooking(input: CreateBookingInput): Promise<APIResponse<Booking>> {
    return this.request<Booking>('/api/bookings', {
      method: 'POST',
      body: input,
    });
  }

  /**
   * List bookings
   * FIX: Added propertyId to the parameter type definition
   */
  async listBookings(params?: {
    status?: string;
    category?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    propertyId?: string; // FIX: Added this parameter
  }): Promise<APIResponse<{
    bookings: Booking[];
    pagination: any;
    summary?: any;
  }>> {
    const queryParams = new URLSearchParams();
    if (params) {
      const normalizedParams = { ...params };
      if (typeof normalizedParams.limit === 'number') {
        normalizedParams.limit = Math.min(Math.max(normalizedParams.limit, 1), MAX_BOOKINGS_LIST_LIMIT);
      }

      Object.entries(normalizedParams).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request(`/api/bookings?${queryParams.toString()}`);
  }

  /**
   * Get booking by ID
   */
  async getBooking(id: string): Promise<APIResponse<Booking & { permissions: any }>> {
    return this.request(`/api/bookings/${id}`);
  }

  /**
   * Update booking
   */
  async updateBooking(
    id: string,
    updates: Partial<CreateBookingInput>
  ): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}`, {
      method: 'PUT',
      body: updates,
    });
  }

  /**
   * Confirm booking (provider only)
   */
  async confirmBooking(id: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/confirm`, {
      method: 'POST',
    });
  }

  /**
   * Start booking (provider only)
   */
  async startBooking(id: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/start`, {
      method: 'POST',
    });
  }

  /**
   * Complete booking (provider only)
   */
  async completeBooking(
    id: string,
    data: {
      actualStartTime: string;
      actualEndTime: string;
      finalPrice: number;
      internalNotes?: string;
    }
  ): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/complete`, {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: string, reason: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    });
  }

  // ==========================================================================
  // PROPERTY ENDPOINTS 
  // ==========================================================================
  async getProperties(): Promise<APIResponse<{ properties: Property[] }>> {
    const now = Date.now();
    if (this.propertiesCache && this.propertiesCache.expiresAt > now) {
      return this.propertiesCache.data;
    }

    const storedCache = this.readStoredPropertiesCache();

    if (this.propertiesRequest) {
      return this.propertiesRequest;
    }

    this.propertiesRequest = this.get<{ properties: Property[] }>('/api/properties')
      .then((res) => {
        const response: APIResponse<{ properties: Property[] }> = { success: true, data: res.data };
        this.propertiesCache = {
          data: response,
          expiresAt: Date.now() + APIClient.PROPERTIES_CACHE_TTL_MS,
        };
        this.writeStoredPropertiesCache(response);
        return response;
      })
      .catch((error) => {
        const fallback = this.propertiesCache?.data ?? storedCache;
        const status = error instanceof APIError ? error.status : null;
        if (fallback && (status === 429 || status === 'NETWORK')) {
          this.propertiesCache = {
            data: fallback,
            expiresAt: Date.now() + APIClient.PROPERTIES_CACHE_TTL_MS,
          };
          return fallback;
        }
        throw error;
      })
      .finally(() => {
        this.propertiesRequest = null;
      });

    return this.propertiesRequest;
  }

  /**
   * Lookup property data by address (Public record lookup)
   */
  async lookupProperty(address: string, zipCode?: string): Promise<APIResponse<any>> {
    const params = new URLSearchParams({ address });
    if (zipCode) params.append('zipCode', zipCode);
    const res = await this.get<any>(`/api/properties/lookup?${params.toString()}`);
    return { success: true, data: res.data };
  }

  async suggestAddresses(input: string, sessionToken: string): Promise<APIResponse<Array<{ placeId: string; label: string }>>> {
    const params = new URLSearchParams({ input, sessionToken });
    const res = await this.get<Array<{ placeId: string; label: string }>>(`/api/properties/address-suggestions?${params}`);
    return { success: true, data: res.data };
  }

  async getAddressDetails(placeId: string, sessionToken: string): Promise<APIResponse<{
    address: string;
    city: string;
    state: string;
    zipCode: string;
  }>> {
    const params = new URLSearchParams({ placeId, sessionToken });
    const res = await this.get<{ address: string; city: string; state: string; zipCode: string }>(
      `/api/properties/address-details?${params}`,
    );
    return { success: true, data: res.data };
  }


  /**
   * Get a single property by ID
   */
  async getProperty(id: string): Promise<APIResponse<Property>> {
    return this.request(`/api/properties/${id}`);
  }

  /**
   * Get the Environment report for a property (weather, air quality,
   * drought, flood & elevation, radon, hazards, climate). Each section is
   * independently ok/unavailable — a 200 response doesn't guarantee every
   * section has data.
   */
  async getEnvironmentReport(propertyId: string): Promise<APIResponse<EnvironmentReportDTO>> {
    return this.request(`/api/environment/report/${propertyId}`);
  }

  /**
   * Get active resolutions (analyses) for a property
   */
  async getPropertyResolutions(id: string): Promise<APIResponse<any[]>> {
    const res = await this.get<any[]>(`/api/properties/${id}/resolutions`);
    return { success: true, data: res.data };
  }

  /**
   * Get aggregated Resolution Center data for a property.
   */
  async getPropertyResolutionCenter(id: string): Promise<APIResponse<ResolutionCenterPayload>> {
    const res = await this.get<ResolutionCenterPayload>(`/api/properties/${id}/resolution-center`);
    const normalizedActions = (res.data.urgentActions || []).map((action) => ({
      ...action,
      dueDate: action.dueDate ? new Date(action.dueDate) : null,
    }));

    return {
      success: true,
      data: {
        ...res.data,
        urgentActions: normalizedActions,
      },
    };
  }

  /**
   * Get dashboard bootstrap payload for a property (property + onboarding + narrative run)
   */
  async getPropertyDashboardBootstrap(id: string): Promise<APIResponse<PropertyDashboardBootstrap>> {
    return this.request(`/api/properties/${id}/dashboard-bootstrap`);
  }

  async getEntryContext(propertyId: string): Promise<APIResponse<unknown | null>> {
    return this.request(`/api/properties/${propertyId}/onboarding/entry-context`);
  }

  async captureEntryContext(
    propertyId: string,
    input: ActivationEntryContextInput,
  ): Promise<APIResponse<unknown>> {
    return this.request(`/api/properties/${propertyId}/onboarding/entry-context`, {
      method: 'PUT',
      body: input,
    });
  }

  async getActivationFirstValue(propertyId: string): Promise<APIResponse<ActivationFirstValueDTO>> {
    return this.request(`/api/properties/${propertyId}/onboarding/first-value`);
  }

  async addActivationTriggerEvidence(
    propertyId: string,
    input: ActivationTriggerEvidenceInput,
  ): Promise<APIResponse<Array<ActivationTriggerEvidenceInput & { id: string; capturedAt: string }>>> {
    return this.request(`/api/properties/${propertyId}/onboarding/trigger-evidence`, {
      method: 'POST',
      body: input,
    });
  }

  async recordFirstValueFeedback(
    propertyId: string,
    feedback: 'USEFUL_NEW' | 'USEFUL_KNOWN' | 'NOT_USEFUL',
  ): Promise<APIResponse<{ feedback: string; recordedAt: string }>> {
    return this.request(`/api/properties/${propertyId}/onboarding/first-value-feedback`, {
      method: 'POST',
      body: { feedback },
    });
  }

  async recordFirstActionResolution(
    propertyId: string,
    input: {
      disposition: 'COMPLETED' | 'INTENTIONALLY_DEFERRED' | 'DELIBERATELY_DISMISSED';
      reason: string;
      consequenceAcknowledged: boolean;
      nextTriggerAt?: string | null;
    },
  ): Promise<APIResponse<{ actionId: string; resolvedAt: string }>> {
    return this.request(`/api/properties/${propertyId}/onboarding/first-action-resolution`, {
      method: 'POST',
      body: input,
    });
  }

  async getPropertyContext(
    id: string,
    scopes?: PropertyContextScope[],
  ): Promise<APIResponse<PropertyContextSnapshot>> {
    const query = scopes?.length ? `?scopes=${encodeURIComponent(scopes.join(','))}` : '';
    return this.request(`/api/properties/${id}/context${query}`);
  }

  async getPropertyContextCompleteness(
    id: string,
    scopes?: PropertyContextScope[],
  ): Promise<APIResponse<PropertyContextCompleteness>> {
    const query = scopes?.length ? `?scopes=${encodeURIComponent(scopes.join(','))}` : '';
    return this.request(`/api/properties/${id}/context/completeness${query}`);
  }

  async evaluateFeatureContext(
    propertyId: string,
    input: { featureKey: string; operationKey: string; operationInput?: Record<string, unknown> },
  ): Promise<APIResponse<FeatureContextEvaluation>> {
    return this.request(`/api/properties/${propertyId}/context/feature-requirements/evaluate`, {
      method: 'POST',
      body: input,
    });
  }

  async captureFeatureContext(
    propertyId: string,
    input: {
      requirementId: string;
      captureKey: string;
      featureKey: string;
      operationKey: string;
      operationInput?: Record<string, unknown>;
      expectedContextVersion: string;
      idempotencyKey: string;
      answer: Record<string, unknown>;
    },
  ): Promise<APIResponse<FeatureContextCaptureResult>> {
    return this.request(`/api/properties/${propertyId}/context/captures`, {
      method: 'POST',
      body: input,
    });
  }

  /**
   * Create a new property
   */
  async createProperty(data: {
    name?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    isPrimary?: boolean;
    coverPhotoDocumentId?: string | null;
    dwellingType?: DwellingType;
    ownershipForm?: OwnershipForm;
    propertyUse?: PropertyUse;
    occupancyStatus?: OccupancyStatus;
    exteriorProfile?: PropertyExteriorProfile;
    responsibilities?: PropertyResponsibilityInput[];
    propertySize?: number | null;
    yearBuilt?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    purchasePriceCents?: number | null;
    purchaseDate?: Date | string | null;
  }): Promise<APIResponse<Property>> {
    const response = await this.request<Property>('/api/properties', {
      method: 'POST',
      body: data,
    });
    if (response.success) this.resetPropertiesCache();
    return response;
  }

/**
   * Update a property (Updated to support all detail fields)
   */
  async updateProperty(
    id: string,
    data: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      isPrimary?: boolean;
      
      // Layer 1 - Basic/Migrated Fields
      dwellingType?: DwellingType;
      ownershipForm?: OwnershipForm;
      propertyUse?: PropertyUse;
      occupancyStatus?: OccupancyStatus;
      exteriorProfile?: PropertyExteriorProfile;
      responsibilities?: PropertyResponsibilityInput[];
      propertySize?: number;
      yearBuilt?: number;
      
      // Layer 2 - Advanced Fields (Migrated and New)
      bedrooms?: number;
      bathrooms?: number;
      heatingType?: string;
      coolingType?: string;
      waterHeaterType?: string;
      roofType?: string;
      hvacInstallYear?: number;
      waterHeaterInstallYear?: number;
      roofReplacementYear?: number;
      foundationType?: FoundationType;
      sidingType?: string;
      electricalPanelAge?: number;
      lotSize?: number;
      hasIrrigation?: boolean;
      hasDrainageIssues?: boolean;
      hasSmokeDetectors?: boolean;
      hasCoDetectors?: boolean;
      hasSecuritySystem?: boolean;
      hasFireExtinguisher?: boolean;
      hasSumpPumpBackup?: boolean | null;
      primaryHeatingFuel?: string | null;
      hasSecondaryHeat?: boolean | null;
      isResilienceVerified?: boolean;
      isUtilityVerified?: boolean;
      purchasePriceCents?: number | null;
      purchaseDate?: string | null;
      lastAppraisedValue?: number | null;
      lastAppraisalDate?: string | null;
      isEquityVerified?: boolean;
      coverPhotoDocumentId?: string | null;
      applianceAges?: any;
    }
  ): Promise<APIResponse<Property>> {
    const response = await this.request<Property>(`/api/properties/${id}`, {
      method: 'PUT',
      body: data,
    });
    if (response.success) this.resetPropertiesCache();
    return response;
  }

  /**
   * Delete a property
   */
  async deleteProperty(id: string): Promise<APIResponse<void>> {
    const response = await this.request<void>(`/api/properties/${id}`, {
      method: 'DELETE',
    });
    if (response.success) this.resetPropertiesCache();
    return response;
  }

  async getOrCreatePropertyNarrativeRun(
    propertyId: string
  ): Promise<APIResponse<{ run: PropertyNarrativeRun | null }>> {
    return this.request(`/api/properties/${propertyId}/narrative/run`, {
      method: 'POST',
    });
  }

  async patchPropertyNarrativeRun(
    runId: string,
    data: {
      action: 'VIEWED' | 'CTA_CLICKED' | 'NUDGE_CLICKED' | 'COMPLETED' | 'DISMISSED';
      metadata?: Record<string, unknown>;
    }
  ): Promise<APIResponse<{ run: PropertyNarrativeRun }>> {
    return this.request(`/api/narrative/${runId}`, {
      method: 'PATCH',
      body: data,
    });
  }
    
  // ==========================================================================
  // CHECKLIST & MAINTENANCE ENDPOINTS (PHASE 3) 
  // ==========================================================================

  /**
   * Fetches the list of available maintenance task templates.
   */
  async getMaintenanceTemplates(propertyId?: string): Promise<
    APIResponse<{ templates: MaintenanceTaskTemplate[] }>
  > {
    const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
    return this.request(`/api/maintenance-templates${query}`);
  }

  /**
   * Creates new maintenance checklist items for the user.
   * @param data An object containing an array of template IDs.
   */
  async createMaintenanceItems(data: {
    templateIds: string[];
    propertyId: string; // FIX: Added propertyId
  }): Promise<APIResponse<{ count: number }>> {
    return this.request('/api/checklist/maintenance-items', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Creates new custom maintenance items from a user-defined config.
   * @param data An object containing an array of task config objects.
   */
  async createCustomMaintenanceItems(data: {
    tasks: MaintenanceTaskConfig[];
  }): Promise<APIResponse<{ count: number }>> {
    return this.request('/api/maintenance-templates/custom-items', {
      method: 'POST',
      body: data,
    });
  }

  // ==========================================================================
  // PROVIDER SERVICE ENDPOINTS (for provider portal) 
  // ==========================================================================

  /**
   * Get current provider's services
   */
  async getMyServices(): Promise<APIResponse<Service[]>> {
    return this.request<Service[]>('/api/providers/services');
  }

  /**
   * Create a new service (provider only)
   */
  async createService(data: {
    category: string;
    inspectionType?: string;
    handymanType?: string;
    name: string;
    description: string;
    basePrice: number;
    priceUnit: string;
    minimumCharge?: number;
    estimatedDuration?: number;
    isActive: boolean;
  }): Promise<APIResponse<Service>> {
    return this.request<Service>('/api/providers/services', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Update a service (provider only)
   */
  async updateService(
    id: string,
    data: Partial<{
      category: string;
      inspectionType?: string;
      handymanType?: string;
      name: string;
      description: string;
      basePrice: number;
      priceUnit: string;
      minimumCharge?: number;
      estimatedDuration?: number;
      isActive: boolean;
    }>
  ): Promise<APIResponse<Service>> {
    return this.request<Service>(`/api/providers/services/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  /**
   * Delete a service (provider only)
   */
  async deleteService(id: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/providers/services/${id}`, {
      method: 'DELETE',
    });
  }  

  /**
   * Get list of service categories
   */
  async getServiceCategories() {
    return this.request<{
      categories: Array<{
        category: string;
        displayName: string;
        description: string;
        icon: string;
      }>;
    }>('/api/service-categories');
  }

  // ==========================================================================
  // NEW HOME MANAGEMENT ENDPOINTS (Warranties, Insurance, Expenses)
  // ==========================================================================

  // --- EXPENSES ---
  async createExpense(data: CreateExpenseInput): Promise<APIResponse<Expense>> {
    return this.request<Expense>('/api/home-management/expenses', { method: 'POST', body: data });
  }
  
  async listExpenses(propertyId?: string): Promise<APIResponse<{ expenses: Expense[] }>> {
      const query = propertyId ? `?propertyId=${propertyId}` : '';
      return this.request<{ expenses: Expense[] }>(`/api/home-management/expenses${query}`);
  }

  async updateExpense(expenseId: string, data: UpdateExpenseInput): Promise<APIResponse<Expense>> {
    return this.request<Expense>(`/api/home-management/expenses/${expenseId}`, { method: 'PATCH', body: data });
  }

  async deleteExpense(expenseId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/expenses/${expenseId}`, { method: 'DELETE' });
  }
  // --- WARRANTIES ---
  async createWarranty(data: CreateWarrantyInput): Promise<APIResponse<Warranty>> {
    return this.request<Warranty>('/api/home-management/warranties', { method: 'POST', body: data });
  }
  /**
   * List warranties
   * FIX: Added propertyId to the function signature
   */
  async listWarranties(propertyId?: string): Promise<APIResponse<{ warranties: Warranty[] }>> {
    const query = propertyId ? `?propertyId=${propertyId}` : '';
    return this.request<{ warranties: Warranty[] }>('/api/home-management/warranties' + query);
  }

  async updateWarranty(warrantyId: string, data: UpdateWarrantyInput): Promise<APIResponse<Warranty>> {
    return this.request<Warranty>(`/api/home-management/warranties/${warrantyId}`, { method: 'PATCH', body: data });
  }

  async deleteWarranty(warrantyId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/warranties/${warrantyId}`, { method: 'DELETE' });
  }

  // --- INSURANCE POLICIES ---
  async createInsurancePolicy(data: CreateInsurancePolicyInput): Promise<APIResponse<InsurancePolicy>> {
    return this.request<InsurancePolicy>('/api/home-management/insurance-policies', { method: 'POST', body: data });
  }

  async listInsurancePolicies(propertyId?: string): Promise<APIResponse<{ policies: InsurancePolicy[] }>> {
    const query = propertyId ? `?propertyId=${propertyId}` : '';
    return this.request<{ policies: InsurancePolicy[] }>('/api/home-management/insurance-policies' + query);
  }

  async updateInsurancePolicy(policyId: string, data: UpdateInsurancePolicyInput): Promise<APIResponse<InsurancePolicy>> {
    return this.request<InsurancePolicy>(`/api/home-management/insurance-policies/${policyId}`, { method: 'PATCH', body: data });
  }

  async deleteInsurancePolicy(policyId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/insurance-policies/${policyId}`, { method: 'DELETE' });
  }

  async getInsuranceProtectionGap(
    propertyId: string
  ): Promise<APIResponse<InsuranceProtectionGapSummary>> {
    return this.request<InsuranceProtectionGapSummary>(
      `/api/properties/${propertyId}/insurance/protection-gap`,
      { method: 'GET' }
    );
  }

  async getHomeEquitySummary(
    propertyId: string
  ): Promise<APIResponse<HomeEquitySummary>> {
    return this.request<HomeEquitySummary>(
      `/api/properties/${propertyId}/value/home-equity`,
      { method: 'GET' }
    );
  }

  async extractInsuranceDeclaration(
    propertyId: string,
    policyId: string,
    file: File
  ): Promise<
    APIResponse<{
      policyId: string;
      provider: string;
      extracted: {
        personalPropertyLimitCents: number | null;
        deductibleCents: number | null;
      };
      signals: {
        personalPropertyLabel: string | null;
        deductibleLabel: string | null;
      };
      rawText: string;
    }>
  > {
    try {
      this.validateFile(file, {
        maxSizeMB: 8,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
    } catch (e) {
      return Promise.reject(e);
    }

    const formData = new FormData();
    formData.append('file', file);
    return this.formDataRequest(
      `/api/properties/${propertyId}/insurance/${policyId}/ocr/extract`,
      formData
    );
  }

  async confirmInsuranceDeclaration(
    propertyId: string,
    policyId: string,
    data: { personalPropertyLimitCents?: number | null; deductibleCents?: number | null }
  ): Promise<
    APIResponse<{
      policy: InsurancePolicy;
      streak: {
        currentStreak: number;
        longestStreak: number;
        bonusMultiplier: number;
        lastActivityDate: string | null;
        milestoneReached: boolean;
      } | null;
    }>
  > {
    return this.request<{
      policy: InsurancePolicy;
      streak: {
        currentStreak: number;
        longestStreak: number;
        bonusMultiplier: number;
        lastActivityDate: string | null;
        milestoneReached: boolean;
      } | null;
    }>(
      `/api/properties/${propertyId}/insurance/${policyId}/ocr/confirm`,
      { method: 'POST', body: data }
    );
  }

  // ==========================================================================
  // NEW DOCUMENT ENDPOINT (ADDED)
  // ==========================================================================

  async uploadDocument(file: File, data: DocumentUploadInput): Promise<APIResponse<Document>> {
      try { this.validateFile(file); } catch (e) { return Promise.reject(e); }
      const formData = new FormData();
      
      // Append file as 'file' - MUST match the backend multer field name
      formData.append('file', file);

      // Append metadata fields
      formData.append('type', data.type);
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      if (data.propertyId) formData.append('propertyId', data.propertyId);
      if (data.warrantyId) formData.append('warrantyId', data.warrantyId);
      if (data.policyId) formData.append('policyId', data.policyId);

      return this.formDataRequest<Document>('/api/home-management/documents/upload', formData);
  }

  // ==========================================================================
  // RISK ASSESSMENT ENDPOINTS 
  // ==========================================================================

  /**
   * Fetches the full risk assessment report, queuing a new calculation if stale.
   * @returns The RiskAssessmentReport object or the string 'QUEUED'.
   * * NOTE: This endpoint bypasses this.request() because the backend returns
   * the raw data directly, not wrapped in {success: true, data: ...}
   */
  async getRiskReportSummary(propertyId: string): Promise<RiskAssessmentReport | 'QUEUED'> {
    // Direct fetch to bypass the request() wrapper
    const response = await fetch(`${this.baseURL}/api/risk/report/${propertyId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new APIError(errorData.message || 'Risk report request failed.', response.status);
    }

    const data = await response.json();
    
    // Check if backend returned 'QUEUED' string
    if (typeof data === 'string' && data === 'QUEUED') {
      return 'QUEUED';
    }

    // Backend returns raw RiskAssessmentReport object
    const rawReport = data;

    // Process the report - convert decimal fields to numbers
    const processedReport: RiskAssessmentReport = {
      id: rawReport.id,
      propertyId: rawReport.propertyId,
      riskScore: rawReport.riskScore,
      financialExposureTotal: toNumber(rawReport.financialExposureTotal),
      lastCalculatedAt: rawReport.lastCalculatedAt,
      createdAt: rawReport.createdAt,
      updatedAt: rawReport.updatedAt,
      // The 'details' array should already be parsed from JSON by the backend
      details: rawReport.details as AssetRiskDetail[], 
    };

    return processedReport;
  }
  
  /**
   * [NEW METHOD] Fetch the lightweight risk summary for the selected property
   */
  async getRiskSummary(propertyId: string): Promise<PrimaryRiskSummary | null> {
    const response = await this.request<PrimaryRiskSummary>(`/api/risk/summary/${propertyId}`);

    if (response.success && response.data) {
        const processedData: PrimaryRiskSummary = {
            ...response.data,
            financialExposureTotal: toNumber(response.data.financialExposureTotal),
        };
        return processedData;
    }
    return null;
  }
  
  /**
   * Get AI-generated climate risk insights for a property
   */
  async getClimateRiskSummary(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/risk/${propertyId}/ai/climate-risk`);
  }

  async getPrimaryRiskSummary(): Promise<PrimaryRiskSummary | null> {
    // Uses the request helper since the new endpoint returns the standard { success: true, data: ... } wrapper
    const response = await this.request<PrimaryRiskSummary>('/api/risk/summary/primary');

    if (response.success && response.data) {
      // The backend response is wrapped in { success: true, data: ... }
      
      // Convert the financialExposureTotal back to a number since the controller converted it from Decimal
      const processedData: PrimaryRiskSummary = {
          ...response.data,
          financialExposureTotal: toNumber(response.data.financialExposureTotal),
      };
      
      return processedData;
    }

    return null;
  }
  
  // ==========================================================================
  // [NEW IMPLEMENTATION] FINANCIAL EFFICIENCY ENDPOINTS (PHASE 2.5)
  // ==========================================================================

  async getFinancialReportSummary(propertyId: string): Promise<FinancialReportSummary | null> {
    // The summary endpoint returns the data directly, not wrapped in success/data
    const response = await this.request<FinancialReportSummary>(`/api/v1/financial-efficiency/summary?propertyId=${propertyId}`);

    // FIX: Handle both wrapped and direct responses
    if (response.success && response.data) {
        // Wrapped response format
        const processedData: FinancialReportSummary = {
            ...response.data,
            financialExposureTotal: toNumber(response.data.financialExposureTotal),
        };
        return processedData;
    } else if ((response as any).propertyId) {
        // Direct response format (what the backend actually returns)
        const directResponse = response as any as FinancialReportSummary;
        return {
            ...directResponse,
            financialExposureTotal: toNumber(directResponse.financialExposureTotal),
        };
    }
    return null;
}

  async getPropertyScoreSnapshots(
    propertyId: string,
    weeks = 52
  ): Promise<PropertyScoreSnapshotSummary | null> {
    const response = await this.request<PropertyScoreSnapshotSummary>(
      `/api/properties/${propertyId}/score-snapshots?weeks=${weeks}`
    );

    if (response.success && response.data) {
      return response.data;
    }
    return null;
  }

  async getHomeScoreReport(
    propertyId: string,
    weeks = 26
  ): Promise<HomeScoreReport | null> {
    const response = await this.request<{ report: HomeScoreReport }>(
      `/api/properties/${propertyId}/home-score/report?weeks=${weeks}`
    );

    if (response.success && response.data?.report) {
      return response.data.report;
    }
    return null;
  }

  async refreshHomeScoreReport(
    propertyId: string,
    weeks = 26
  ): Promise<HomeScoreReport | null> {
    const response = await this.request<{ report: HomeScoreReport }>(
      `/api/properties/${propertyId}/home-score/report/refresh?weeks=${weeks}`,
      {
        method: 'POST',
        body: {},
      }
    );

    if (response.success && response.data?.report) {
      return response.data.report;
    }
    return null;
  }

  async getHomeScoreHistory(
    propertyId: string,
    weeks = 52
  ): Promise<HomeScoreTrendPoint[] | null> {
    const response = await this.request<{ history: HomeScoreTrendPoint[] }>(
      `/api/properties/${propertyId}/home-score/history?weeks=${weeks}`
    );

    if (response.success && Array.isArray(response.data?.history)) {
      return response.data.history;
    }
    return null;
  }

  async getHomeScoreFactors(
    propertyId: string,
    weeks = 26
  ): Promise<HomeScoreReason[] | null> {
    const response = await this.request<{ factors: HomeScoreReason[] }>(
      `/api/properties/${propertyId}/home-score/factors?weeks=${weeks}`
    );

    if (response.success && Array.isArray(response.data?.factors)) {
      return response.data.factors;
    }
    return null;
  }

  async getHomeScoreCorrections(
    propertyId: string,
    limit = 20
  ): Promise<HomeScoreCorrection[] | null> {
    const response = await this.request<{ corrections: HomeScoreCorrection[] }>(
      `/api/properties/${propertyId}/home-score/corrections?limit=${limit}`
    );

    if (response.success && Array.isArray(response.data?.corrections)) {
      return response.data.corrections;
    }
    return null;
  }

  async submitHomeScoreCorrection(
    propertyId: string,
    payload: {
      fieldKey: string;
      title?: string;
      detail: string;
      proposedValue?: string;
    }
  ): Promise<HomeScoreCorrection | null> {
    const response = await this.request<{ correction: HomeScoreCorrection }>(
      `/api/properties/${propertyId}/home-score/corrections`,
      {
        method: 'POST',
        body: payload,
      }
    );

    if (response.success && response.data?.correction) {
      return response.data.correction;
    }
    return null;
  }

  async trackHomeScoreEvent(
    propertyId: string,
    payload: {
      event: string;
      section?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/home-score/events`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  async trackNegotiationShieldEvent(
    propertyId: string,
    payload: {
      event: string;
      section?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/negotiation-shield/events`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  async trackServicePriceRadarEvent(
    propertyId: string,
    payload: {
      event: string;
      section?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/service-price-radar/events`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  async trackHomeEventRadarEvent(
    propertyId: string,
    payload: {
      event: string;
      section?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/radar/analytics-events`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  async trackHomeRiskReplayEvent(
    propertyId: string,
    payload: {
      event: string;
      section?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/risk-replay/events`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  async trackRouteRedirectEvent(
    propertyId: string,
    payload: {
      oldRoute: string;
      canonicalRoute: string;
      redirectType?: string;
      navTarget?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/properties/${propertyId}/navigation/route-redirects`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }

  /**
   * Fetches the full detailed FES report, queuing a new calculation if stale/missing.
   * @returns The FinancialEfficiencyReport object or the string 'QUEUED'.
   */
  async getDetailedFESReport(propertyId: string): Promise<FinancialEfficiencyReport | 'QUEUED'> {
    // Calls GET /api/v1/properties/:propertyId/financial-efficiency
    const response = await this.request<FinancialEfficiencyReport>(`/api/v1/properties/${propertyId}/financial-efficiency`);

    if (response.success) {
      const rawReport = response.data;
      
      // Check if backend returned 'QUEUED' status
      if ((rawReport as any).status === 'QUEUED') {
        return 'QUEUED';
      }

      // Process the report - convert decimal fields to numbers
      const processedReport: FinancialEfficiencyReport = {
        id: rawReport.id,
        propertyId: rawReport.propertyId,
        financialEfficiencyScore: rawReport.financialEfficiencyScore,
        // Convert all relevant decimal-based fields to number
        actualInsuranceCost: toNumber((rawReport as any).actualInsuranceCost),
        actualUtilityCost: toNumber((rawReport as any).actualUtilityCost),
        actualWarrantyCost: toNumber((rawReport as any).actualWarrantyCost),
        marketAverageTotal: toNumber((rawReport as any).marketAverageTotal), 
        lastCalculatedAt: rawReport.lastCalculatedAt,
        createdAt: rawReport.createdAt,
        updatedAt: rawReport.updatedAt,
      };

      return processedReport;
    } 
    // If response.success is false, request() would have thrown an APIError.
    throw new Error("Failed to retrieve detailed FES report."); 
  }
  
  /**
   * Triggers an on-demand FES calculation job.
   * Calls POST /api/v1/properties/:propertyId/financial-efficiency/recalculate
   */
  async recalculateFES(propertyId: string): Promise<APIResponse<{ success: boolean; status: 'QUEUED' }>> {
    return this.request<{ success: boolean; status: 'QUEUED' }>(`/api/v1/properties/${propertyId}/financial-efficiency/recalculate`, {
      method: 'POST',
      body: {},
    });
  }
  
  // ==========================================================================
  // NEW FAVORITES ENDPOINTS (PHASE 1)
  // ==========================================================================
  async listFavorites(): Promise<APIResponse<{ favorites: ProviderProfile[] }>> {
    // NOTE: Backend returns ProviderProfile with embedded user and services
    return this.request<{ favorites: ProviderProfile[] }>('/api/users/favorites');
  }

  /**
   * Adds a provider to the homeowner's favorites.
   */
  async addFavorite(providerProfileId: string): Promise<APIResponse<any>> {
    // NOTE: This relies on the request method correctly throwing the APIError
    const response = await this.request('/api/users/favorites', {
      method: 'POST',
      body: { providerProfileId },
    });
    return response;
  }

  /**
   * Removes a provider from the homeowner's favorites.
   */
  async removeFavorite(providerProfileId: string): Promise<APIResponse<void>> {
    // NOTE: This relies on the request method correctly throwing the APIError
    const response = await this.request<void>(`/api/users/favorites/${providerProfileId}`, {
      method: 'DELETE',
    });
    return response;
  }

// ==========================================================================
  // NEW RISK ASSESSMENT ENDPOINTS (PDF - PHASE 3.4)
  // ==========================================================================

  async downloadRiskReportPdf(propertyId: string): Promise<Blob> {
    const response = await fetch(`${this.baseURL}/api/risk/report/${propertyId}/pdf`, {
        method: 'GET',
        credentials: 'include',
    });

    if (!response.ok) {
        let errorMessage = 'Failed to download PDF.';
        let errorData: any = null;
        try {
            // Attempt to read error message if provided as JSON, otherwise rely on status text
            errorData = await response.json();
            errorMessage = errorData.message || response.statusText;
        } catch {
            errorMessage = response.statusText;
        }
        const err: any = new APIError(errorMessage, response.status);
        err.payload = errorData;          // ✅ attach backend JSON
        err.status = response.status; // ✅ normalize
        throw err;
    }

    // Return the response body as a Blob
    return response.blob();
  }

// Find the APIClient class and add these methods

  // ==========================================================================
  // EMERGENCY TROUBLESHOOTER ENDPOINTS
  // ==========================================================================

  async emergencyChat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    propertyId?: string
  ): Promise<APIResponse<{
    severity: string;
    classification?: string;
    message: string;
    resolution?: string;
    steps?: string[];
    confidence?: number;
  }>> {
    return this.request('/api/emergency/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, propertyId: propertyId || undefined }),
    });
  }

  // ==========================================================================
  // DOCUMENT INTELLIGENCE ENDPOINTS
  // ==========================================================================

  async analyzeDocument(
    file: File,
    propertyId: string,
    autoCreateWarranty: boolean = true
  ): Promise<APIResponse<{
    document: any;
    insights: any;
    warranty: any | null;
  }>> {
    try { this.validateFile(file); } catch (e) { return Promise.reject(e); }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('propertyId', propertyId);
    formData.append('autoCreateWarranty', autoCreateWarranty.toString());

    return this.formDataRequest('/api/documents/analyze', formData);
  }

  /**
   * List all documents
   */
  async listDocuments(propertyId?: string): Promise<APIResponse<{
    documents: Document[];
  }>> {
    const queryParams = new URLSearchParams();
    if (propertyId) {
      queryParams.append('propertyId', propertyId);
    }
    const query = queryParams.toString();
    const url = query ? `/api/documents?${query}` : '/api/documents';
    return this.request<{ documents: Document[] }>(url);
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<APIResponse<void>> {
    return this.request(`/api/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // APPLIANCE ORACLE ENDPOINTS
  // ==========================================================================

  async getApplianceOracle(propertyId: string): Promise<APIResponse<any>> {
    return this.request<OracleReport>(`/api/oracle/predict/${propertyId}`);
  }

  /**
   * Get summary of critical appliances across all properties
   */
  async getOracleSummary(): Promise<APIResponse<any>> {
    return this.request('/api/oracle/summary');
  }
  /**
   * Get 12-month maintenance budget forecast
   */
  async getBudgetForecast(propertyId: string): Promise<APIResponse<any>> {
    return this.request<BudgetForecast>(`/api/budget/forecast/${propertyId}`);
  }

  async getClimateRisk(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/climate/analyze/${propertyId}`);
  }
  async getHomeModifications(propertyId: string, userNeeds: string[]): Promise<APIResponse<any>> {
    return this.request('/api/modifications/recommend', {
      method: 'POST',
      body: JSON.stringify({ propertyId, userNeeds }),
    });
  }
  async getPropertyAppreciation(propertyId: string, purchasePrice?: number, purchaseDate?: string): Promise<APIResponse<any>> {
    return this.request(`/api/appreciation/analyze/${propertyId}`, {
      method: 'POST',
      body: JSON.stringify({ purchasePrice, purchaseDate }),
    });
  }
  async getEnergyAudit(formData: FormData): Promise<APIResponse<any>> {
    return this.formDataRequest('/api/energy/audit', formData);
  }
  async analyzePropertyImages(formData: FormData): Promise<APIResponse<any>> {
    return this.formDataRequest('/api/visual-inspector/analyze', formData);
  }
  async extractTaxBill(formData: FormData) {
    return this.formDataRequest('/api/tax-appeal/extract-bill', formData);
  }
  
  async analyzeTaxAppeal(data: {
    propertyId: string;
    taxBillData: any;
    userMarketEstimate?: number;
    comparableSales?: any[];
    propertyConditionNotes?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/api/tax-appeal/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async generateMovingPlan(data: {
    propertyId: string;
    closingDate: string;
    currentAddress: string;
    newAddress: string;
    homeSize: number;
    numberOfRooms: number;
    familySize: number;
    hasPets: boolean;
    hasValuableItems: boolean;
    movingDistance: string;
    specialRequirements?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/api/moving-concierge/generate-plan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async saveMovingPlan(propertyId: string, planData: any): Promise<APIResponse<any>> {
    return this.request('/api/moving-concierge/save-plan', {
      method: 'POST',
      body: JSON.stringify({ propertyId, planData }),
    });
  }
  
  async getMovingPlan(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/moving-concierge/get-plan/${propertyId}`, {
      method: 'GET',
    });
  }
  
  async updateCompletedTasks(propertyId: string, completedTaskIds: string[]): Promise<APIResponse<any>> {
    return this.request('/api/moving-concierge/update-tasks', {
      method: 'POST',
      body: JSON.stringify({ propertyId, completedTaskIds }),
    });
  }
  
  async deleteMovingPlan(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/moving-concierge/delete-plan/${propertyId}`, {
      method: 'DELETE',
    });
  }
  async getCommunityEvents(
    propertyId: string,
    params?: {
      limit?: number;
      category?: string;
    }
  ): Promise<APIResponse<CommunityEventsResponse>> {
    const queryParams = new URLSearchParams();
    const encodedPropertyId = encodeURIComponent(propertyId);
    
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    
    if (params?.category) {
      queryParams.append('category', params.category);
    }
  
    const query = queryParams.toString();
    const url = query
      ? `/api/v1/properties/${encodedPropertyId}/community/events?${query}`
      : `/api/v1/properties/${encodedPropertyId}/community/events`;
  
    return this.request<CommunityEventsResponse>(url, {
      method: 'GET',
    });
  }
  
  /**
   * Fetch community alerts for a property
   */
  async getCommunityAlerts(
    propertyId: string,
    params?: {
      limit?: number;
    }
  ): Promise<APIResponse<any>> {
    const queryParams = new URLSearchParams();
    queryParams.append('propertyId', propertyId);
  
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
  
    const url = `/api/community/alerts?${queryParams.toString()}`;
    return this.request(url, {
      method: 'GET',
    });
  }
  
  /**
   * Fetch community trash/recycling info for a property
   */
  async getCommunityTrash(
    propertyId: string,
    params?: {
      limit?: number;
    }
  ): Promise<APIResponse<any>> {
    const queryParams = new URLSearchParams();
    queryParams.append('propertyId', propertyId);
  
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
  
    const url = `/api/community/trash?${queryParams.toString()}`;
    return this.request(url, {
      method: 'GET',
    });
  }
  
  /**
   * Fetch AI-powered trash schedule for a property
   */
  async getTrashSchedule(
    propertyId: string
  ): Promise<APIResponse<any>> {
    const url = `/api/community/trash-schedule?propertyId=${propertyId}`;
    return this.request(url, {
      method: 'GET',
    });
  }

  // ==========================================================================
  // SELLER PREP ENDPOINTS
  // ==========================================================================

  /**
   * Get seller prep overview for a property
   */
  async getSellerPrepOverview(
    propertyId: string
  ): Promise<APIResponse<any>> {
    return this.request(`/api/seller-prep/overview/${propertyId}`, {
      method: 'GET',
    });
  }

  /**
   * Update seller prep item status
   */
  async updateSellerPrepItem(
    itemId: string,
    status: string
  ): Promise<APIResponse<void>> {
    return this.request(`/api/seller-prep/item/${itemId}`, {
      method: 'PATCH',
      body: { status },
    });
  }

// =======================
// SELLER PREP ENDPOINTS
// =======================

  async getSellerPrepROI(propertyId: string) {
    return this.request(`/api/seller-prep/roi/${propertyId}`);
  }

  async getSellerPrepComparables(propertyId: string) {
    return this.request(`/api/seller-prep/comparables/${propertyId}`);
  }

  async getSellerPrepCurbAppeal(propertyId: string) {
    return this.request(`/api/seller-prep/curb-appeal/${propertyId}`);
  }

  async getSellerPrepStaging(propertyId: string) {
    return this.request(`/api/seller-prep/staging/${propertyId}`);
  }

  async getSellerPrepAgentGuide() {
    return this.request(`/api/seller-prep/agent-guide`);
  }

  /**
   * Get seller prep readiness report for a property
   */
  async getSellerPrepReport(
    propertyId: string
  ): Promise<APIResponse<any>> {
    return this.request(`/api/seller-prep/report/${propertyId}`, {
      method: 'GET',
    });
  }

  /**
   * Create a seller prep lead (for contractor/agent/stager connections)
   */
  async createSellerPrepLead(
    propertyId: string,
    leadType: 'CONTRACTOR' | 'AGENT' | 'STAGER',
    context: {
      tasks?: string[];
      otherTask?: string;
      timeline?: string;
      notes?: string;
    },
    contactInfo: {
      email?: string;
      phone?: string;
      contactMethod?: string;
      fullName?: string;
    }
  ): Promise<APIResponse<any>> {
    return this.request('/api/seller-prep/lead', {
      method: 'POST',
      body: {
        propertyId,
        leadType,
        context: JSON.stringify(context),
        ...contactInfo,
      },
    });
  }

  /**
   * Save seller prep preferences for a property
   */
  async saveSellerPrepPreferences(
    propertyId: string,
    preferences: {
      timeline: string;
      budget: string;
      propertyType: string;
      priority: string;
      condition: string;
    }
  ): Promise<APIResponse<any>> {
    return this.request(`/api/seller-prep/preferences/${propertyId}`, {
      method: 'POST',
      body: preferences,
    });
  }

  /**
   * Submit seller prep feedback
   */
  async submitSellerPrepFeedback(
    propertyId: string,
    rating: 'helpful' | 'not-helpful',
    comment?: string,
    page?: string
  ): Promise<APIResponse<any>> {
    return this.request('/api/seller-prep/feedback', {
      method: 'POST',
      body: {
        propertyId,
        rating,
        comment,
        page: page || 'seller-prep',
      },
    });
  }

  /**
   * Submit app-wide pilot feedback (thumbs up/down + optional comment) from
   * any dashboard page. See also submitSellerPrepFeedback above, which is
   * the earlier seller-prep-specific variant of this same mechanism.
   */
  async submitFeedback(
    rating: 'up' | 'down',
    comment: string | undefined,
    page: string
  ): Promise<APIResponse<any>> {
    return this.request('/api/feedback', {
      method: 'POST',
      body: {
        rating,
        comment,
        page,
      },
    });
  }

  /**
   * Delete an agent interview
   */
  async deleteAgentInterview(interviewId: string): Promise<APIResponse<void>> {
    return this.request(`/api/seller-prep/agent-interview/${interviewId}`, {
      method: 'DELETE',
    });
  }
  async uploadLegacyInspectionReport(formData: FormData): Promise<APIResponse<any>> {
    return this.formDataRequest<any>('/api/inspection-reports/upload', formData);
  }

  async getLegacyInspectionReport(reportId: string): Promise<APIResponse<any>> {
    return this.request(`/api/inspection-reports/${reportId}`, {
      method: 'GET',
    });
  }

  /**
   * Get all inspection reports for a property
   */
  async getPropertyInspectionReports(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/inspection-reports/property/${propertyId}`, {
      method: 'GET',
    });
  }

  /**
   * Get maintenance calendar from inspection report
   */
  async getInspectionMaintenanceCalendar(reportId: string): Promise<APIResponse<any>> {
    return this.request(`/api/inspection-reports/${reportId}/maintenance-calendar`, {
      method: 'GET',
    });
  }

  /**
   * Get user profile with homeowner profile information
   */
  async getUserProfile(): Promise<APIResponse<User & { homeownerProfile?: { id: string } | null }>> {
    return this.request('/api/users/profile', {
      method: 'GET',
    });
  }

  /**
   * Update user profile.
   */
  async updateUserProfile(payload: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }): Promise<APIResponse<User & { homeownerProfile?: { id: string } | null }>> {
    return this.request('/api/users/profile', {
      method: 'PUT',
      body: payload,
    });
  }

  /**
   * Fetch personalized local home updates for owners
   */
  async getLocalUpdates(propertyId: string): Promise<APIResponse<{ updates: LocalUpdate[] }>> {
    return this.request(`/api/local-updates/${propertyId}`, {
      method: 'GET',
    });
  }
  
  async dismissLocalUpdate(id: string): Promise<void> {
    await this.request(`/api/local-updates/${id}/dismiss`, {
      method: 'POST',
    });
  }

// ==========================================================================
// ORCHESTRATION ENDPOINTS (PHASE 6)
// ==========================================================================

/**
 * Fetch full orchestration summary for a property.
 * Returns backend decision model as-is (DTO).
 * UI transformation happens in orchestration.adapter.ts
 */
  async getOrchestrationSummary(
    propertyId: string
  ): Promise<OrchestrationSummaryDTO> {
    const response = await this.request<OrchestrationSummaryDTO>(
      `/api/orchestration/summary/${propertyId}`
    );

    if (response.success && response.data) {
      return response.data;
    }

    throw new APIError('Failed to load orchestration summary', 'ORCHESTRATION_ERROR');
  }

  async getHomeActions(propertyId: string): Promise<HomeActionFeedDTO> {
    const response = await this.request<HomeActionFeedDTO>(
      `/api/properties/${propertyId}/home-actions`,
    );
    if (response.success && response.data) return response.data;
    throw new APIError('Failed to load home actions', 'HOME_ACTIONS_ERROR');
  }

  async getUnifiedHome(propertyId: string): Promise<UnifiedHomeDTO> {
    const response = await this.request<UnifiedHomeDTO>(
      `/api/properties/${propertyId}/home`,
    );
    if (response.success && response.data) return response.data;
    throw new APIError('Failed to load Home', 'UNIFIED_HOME_ERROR');
  }

  async getToolDiscoveryAvailability(): Promise<ToolDiscoveryAvailabilityDTO> {
    const response = await this.request<ToolDiscoveryAvailabilityDTO>(
      '/api/tool-discovery/availability',
    );
    if (response.success && response.data) return response.data;
    throw new APIError('Failed to load tool availability', 'TOOL_DISCOVERY_AVAILABILITY_ERROR');
  }

  async recordToolLifecycleEvents(propertyId: string, events: ToolLifecycleEventDTO[]) {
    return this.request<{ accepted: number }>(
      `/api/properties/${encodeURIComponent(propertyId)}/tool-discovery/events`,
      { method: 'POST', body: JSON.stringify({ events }) },
    );
  }

  async executeHomeActionCommand(
    propertyId: string,
    actionId: string,
    input: {
      command: HomeActionCommand;
      reason?: string | null;
      nextTriggerAt?: string | null;
      consequenceAcknowledged?: boolean;
    },
  ) {
    return this.request<{
      actionId: string;
      command: HomeActionCommand;
      state: string;
      nextTriggerAt?: string | null;
      correctionHref?: string;
      recordedAt: string;
    }>(`/api/properties/${propertyId}/home-actions/${encodeURIComponent(actionId)}/commands`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async recordHomeActionOpened(propertyId: string, actionId: string) {
    return this.request<{ actionId: string; interaction: 'OPENED'; recordedAt: string }>(
      `/api/properties/${propertyId}/home-actions/${encodeURIComponent(actionId)}/interactions`,
      { method: 'POST', body: JSON.stringify({ interaction: 'OPENED' }) },
    );
  }

  /**
   * Lightweight orchestration count for dashboard badges.
   * Non-breaking, optional convenience method.
   */
  async getOrchestrationActionCount(
    propertyId: string
  ): Promise<number> {
    const summary = await this.getOrchestrationSummary(propertyId);
    return summary.pendingActionCount;
  }
  /**
   * Creates a new checklist item directly (used by orchestration / action center).
   * This bypasses maintenance templates.
   */
  async createChecklistItem(data: {
    title: string;
    description?: string | null;
    serviceCategory: ServiceCategory | string | null;
    propertyId: string;
    isRecurring: boolean;
    frequency?: string | null;
    nextDueDate: string; // ISO date string
    actionKey: string; // 🔑 CHANGED FROM orchestrationActionId
  }): Promise<APIResponse<ChecklistItem>> {
    return this.request<ChecklistItem>('/api/checklist/items', {
      method: 'POST',
      body: data,
    });
  }

  // ORCHESTRATION — Mark action as completed (CANONICAL)
  async markOrchestrationActionCompleted(
    propertyId: string,
    actionKey: string,
    completionData?: CompletionDataDTO
  ): Promise<APIResponse<{ success: boolean; completion: CompletionResponseDTO | null }>> {
    return this.request<{ success: boolean; completion: CompletionResponseDTO | null }>(
      `/api/orchestration/${propertyId}/actions/mark-completed`,
      {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          actionKey,
          completionData: completionData || undefined,
        }),
      }
    );
  }
  async undoOrchestrationActionCompleted(
    propertyId: string,
    actionKey: string
  ): Promise<APIResponse<{ success: boolean }>> {
    // URL-encode the actionKey since it contains colons
    const encodedActionKey = encodeURIComponent(actionKey);
    
    return this.request<{ success: boolean }>(
      `/api/orchestration/${propertyId}/actions/${encodedActionKey}/undo`,
      {
        method: 'POST',
        body: JSON.stringify({ propertyId }),
      }
    );
  }
  /**
   * Snooze an orchestration action
   */
  async snoozeOrchestrationAction(
    propertyId: string,
    actionKey: string,
    snoozeUntil: string, // ISO date string
    snoozeReason?: string
  ): Promise<APIResponse<{ success: boolean }>> {
    const encodedActionKey = encodeURIComponent(actionKey);
    
    return this.request<{ success: boolean }>(
      `/api/orchestration/${propertyId}/actions/${encodedActionKey}/snooze`,
      {
        method: 'POST',
        body: JSON.stringify({
          snoozeUntil,
          snoozeReason,
        }),
      }
    );
  }

  /**
   * Un-snooze an orchestration action
   */
  async unsnoozeOrchestrationAction(
    propertyId: string,
    actionKey: string
  ): Promise<APIResponse<{ success: boolean }>> {
    const encodedActionKey = encodeURIComponent(actionKey);
    
    return this.request<{ success: boolean }>(
      `/api/orchestration/${propertyId}/actions/${encodedActionKey}/unsnooze`,
      {
        method: 'POST',
      }
    );
  }

  async getOrchestrationDecisionTrace(propertyId: string, actionKey: string) {
    const encoded = encodeURIComponent(actionKey);
    return this.request<any>(`/api/orchestration/${propertyId}/actions/${encoded}/trace`, {
      method: 'GET',
    });
  }
  
  async getCompletion(
    propertyId: string,
    completionId: string
  ): Promise<APIResponse<CompletionResponseDTO>> {
    return this.request<CompletionResponseDTO>(
      `/api/orchestration/${propertyId}/completions/${completionId}`
    );
  }
  
  async updateCompletion(
    propertyId: string,
    completionId: string,
    data: Partial<CompletionDataDTO>
  ): Promise<APIResponse<CompletionResponseDTO>> {
    return this.request<CompletionResponseDTO>(
      `/api/orchestration/${propertyId}/completions/${completionId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }
  
  async uploadCompletionPhoto(
    propertyId: string,
    actionKey: string,
    file: File,
    orderIndex: number
  ): Promise<APIResponse<{ photo: CompletionPhotoDTO }>> {
    try {
      this.validateFile(file, {
        maxSizeMB: 5,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
    } catch (e) { return Promise.reject(e); }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('actionKey', actionKey);
    formData.append('orderIndex', orderIndex.toString());
  
    return this.request<{ photo: CompletionPhotoDTO }>(
      `/api/orchestration/${propertyId}/completions/photos`,
      {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      }
    );
  }
  
  async deleteCompletionPhoto(
    propertyId: string,
    photoId: string
  ): Promise<APIResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      `/api/orchestration/${propertyId}/completions/photos/${photoId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ==========================================================================
  // NOTIFICATIONS ENDPOINTS (PHASE 3)
  // ==========================================================================

  /**
   * Fetch all notifications for the current user
   */
  async listNotifications(
    options?: { limit?: number }
  ): Promise<APIResponse<any[]>> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    const query = params.toString();
    const url = query ? `/api/notifications?${query}` : '/api/notifications';
    return this.request<any[]>(url);
  }

  /**
   * Get unread notification count for badge
   */
  async getUnreadNotificationCount(): Promise<APIResponse<{ count: number }>> {
    return this.request<{ count: number }>('/api/notifications/unread-count');
  }

  /**
   * Mark a notification as read
   */
  async markNotificationAsRead(
    notificationId: string
  ): Promise<APIResponse<void>> {
    return this.request<void>(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }
  async markAllNotificationsRead() {
    return this.request<void>('/api/notifications/read-all', {
      method: 'POST',
    });
  }

  /**
   * Generic PATCH request
   */
  async patch<T = any>(endpoint: string, data?: any): Promise<{ data: T }> {
    const response = await this.request<T>(endpoint, {
      method: 'PATCH',
      body: data,
    });
    return { data: (response as APISuccess<T>).data };
  }

  // Add a specific helper for marking as unread to maintain clean code
  async markNotificationAsUnread(notificationId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/notifications/${notificationId}/unread`, {
      method: 'PATCH',
    });
  }

  async listNotificationPreferences(): Promise<APIResponse<any[]>> {
    return this.request<any[]>('/api/notifications/preferences');
  }

  async updateNotificationPreference(input: {
    propertyId?: string | null;
    memberUserId?: string | null;
    category: string;
    channel: string;
    enabled: boolean;
    cadence: string;
    quietStart?: string | null;
    quietEnd?: string | null;
    timezone: string;
  }): Promise<APIResponse<any>> {
    return this.request('/api/notifications/preferences', { method: 'PUT', body: input });
  }

  async recordNotificationOutcome(notificationId: string, type: 'OPENED' | 'USEFUL' | 'NOT_USEFUL' | 'MUTE_TYPE' | 'NOT_RELEVANT' | 'ALREADY_HANDLED') {
    return this.request(`/api/notifications/${notificationId}/outcomes`, { method: 'POST', body: { type } });
  }

  
  /**
   * Get or create HOME_BUYER checklist with 8 default tasks
   * 
   * @returns Checklist with default tasks (auto-created on first access)
   */
  async getHomeBuyerChecklist(propertyId: string): Promise<APIResponse<HomeBuyerChecklist>> {
    return this.request<HomeBuyerChecklist>(`/api/home-buyer-tasks/properties/${propertyId}/checklist`, {
      method: 'GET',
    });
  }

  /**
   * Get all HOME_BUYER tasks for authenticated user
   * 
   * @returns Array of tasks
   */
  async getHomeBuyerTasks(propertyId: string): Promise<APIResponse<HomeBuyerTask[]>> {
    return this.request<HomeBuyerTask[]>(`/api/home-buyer-tasks/properties/${propertyId}/tasks`, {
      method: 'GET',
    });
  }

  /**
   * Get single HOME_BUYER task by ID
   * 
   * @param taskId - Task ID
   * @returns Single task
   */
  async getHomeBuyerTask(propertyId: string, taskId: string): Promise<APIResponse<HomeBuyerTask>> {
    return this.request<HomeBuyerTask>(`/api/home-buyer-tasks/properties/${propertyId}/tasks/${taskId}`, {
      method: 'GET',
    });
  }

  /**
   * Get HOME_BUYER task statistics (progress, completion percentage)
   * 
   * @returns Task statistics
   */
  async getHomeBuyerTaskStats(propertyId: string): Promise<APIResponse<HomeBuyerTaskStats>> {
    return this.request<HomeBuyerTaskStats>(`/api/home-buyer-tasks/properties/${propertyId}/stats`, {
      method: 'GET',
    });
  }

  async getBuyerImportReadiness(propertyId: string): Promise<APIResponse<BuyerImportReadiness>> {
    return this.request<BuyerImportReadiness>(
      `/api/home-buyer-tasks/properties/${propertyId}/import-readiness`,
      { method: 'GET' },
    );
  }

  async getBuyerEvidenceReview(propertyId: string): Promise<APIResponse<BuyerEvidenceReview>> {
    return this.request<BuyerEvidenceReview>(
      `/api/home-buyer-tasks/properties/${propertyId}/evidence-review`,
      { method: 'GET' },
    );
  }

  async updateBuyerLifecycle(propertyId: string, input: {
    targetCloseDate?: string | null;
    ownershipStartedAt?: string | null;
  }): Promise<APIResponse<HomeBuyerChecklist>> {
    return this.request<HomeBuyerChecklist>(`/api/home-buyer-tasks/properties/${propertyId}/lifecycle`, {
      method: 'PATCH', body: JSON.stringify(input),
    });
  }

  async dispositionBuyerFinding(propertyId: string, findingId: string, input: {
    disposition: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>;
    notes?: string | null;
    assignedToUserId?: string | null;
    dueAt?: string | null;
  }): Promise<APIResponse<{ finding: unknown; taskId: string | null; guidanceJourneyId: string | null; repairJourneyId: string | null }>> {
    return this.request(`/api/home-buyer-tasks/properties/${propertyId}/findings/${findingId}/disposition`, {
      method: 'POST', body: JSON.stringify(input),
    });
  }

  async verifyBuyerDocument(propertyId: string, documentId: string, status: 'VERIFIED' | 'REJECTED', notes?: string | null) {
    return this.request(`/api/home-buyer-tasks/properties/${propertyId}/documents/${documentId}/verification`, {
      method: 'PATCH', body: JSON.stringify({ status, notes }),
    });
  }

  async handoffBuyerPlan(propertyId: string): Promise<APIResponse<{ handedOff: boolean; reason: string; taskCount: number }>> {
    return this.request(`/api/home-buyer-tasks/properties/${propertyId}/handoff`, { method: 'POST' });
  }

  async getBuyerAcceptanceStatus(propertyId: string): Promise<APIResponse<BuyerAcceptanceStatus>> {
    return this.request<BuyerAcceptanceStatus>(
      `/api/home-buyer-tasks/properties/${propertyId}/acceptance-status`,
      { method: 'GET' },
    );
  }

  async getNewHomeSetupOverview(propertyId: string): Promise<APIResponse<NewHomeSetupOverview>> {
    return this.request(`/api/new-home-setup/properties/${propertyId}/overview`);
  }

  async assessNewHomePilot(propertyId: string, input: {
    demandScore: number;
    documentAvailability: NewHomeDocumentAvailability;
    builderFollowupPainScore: number;
    engagementIntentScore: number;
    channelSource?: string | null;
    estimatedAcquisitionCents?: number | null;
    notes?: string | null;
  }): Promise<APIResponse<NewHomePilotAssessment>> {
    return this.request(`/api/new-home-setup/properties/${propertyId}/pilot-assessment`, {
      method: 'PUT', body: JSON.stringify(input),
    });
  }

  async getNewHomeSetupPlan(propertyId: string): Promise<APIResponse<NewHomeSetupPlan>> {
    return this.request(`/api/new-home-setup/properties/${propertyId}/plan`);
  }

  async updateNewHomeLifecycle(propertyId: string, input: {
    targetMoveInDate?: string | null;
    ownershipStartedAt?: string | null;
    builderWarrantyEndsAt?: string | null;
    oneYearInspectionDueAt?: string | null;
  }): Promise<APIResponse<NewHomeSetupPlan>> {
    return this.request(`/api/new-home-setup/properties/${propertyId}/lifecycle`, {
      method: 'PATCH', body: JSON.stringify(input),
    });
  }

  async updateNewHomeTask(propertyId: string, taskId: string, input: {
    status: HomeBuyerTaskStatus;
    assignedToUserId?: string | null;
    completionEvidence?: Record<string, unknown> | null;
  }): Promise<APIResponse<NewHomeSetupTask>> {
    return this.request(`/api/new-home-setup/properties/${propertyId}/tasks/${taskId}`, {
      method: 'PATCH', body: JSON.stringify(input),
    });
  }

  async createNewHomePunchListItem(propertyId: string, input: { title: string; description?: string | null; location?: string | null; priority?: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER'; builderContact?: string | null; promisedBy?: string | null; evidenceDocumentIds?: string[] }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/punch-list`, { method: 'POST', body: JSON.stringify(input) });
  }

  async addNewHomeBuilderResponse(propertyId: string, itemId: string, input: { responseType: 'COMMENT' | 'ACKNOWLEDGED' | 'SCHEDULED' | 'REJECTED' | 'RESOLVED'; message?: string | null; promisedBy?: string | null; verifyClosure?: boolean }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/punch-list/${itemId}/responses`, { method: 'POST', body: JSON.stringify(input) });
  }

  async createNewHomeWarrantyRight(propertyId: string, input: { coverageTitle: string; coverageSummary: string; expiresAt: string; sourceCitation: string; providerName?: string | null; noticeMethod?: string | null; noticeDestination?: string | null; noticeDeadlineAt?: string | null; sourceDocumentId?: string | null; extractionConfidence?: number | null; verified?: boolean }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/warranty-rights`, { method: 'POST', body: JSON.stringify(input) });
  }

  async promoteNewHomeWarrantyDocument(propertyId: string, input: { documentId: string; sourceCitation: string; noticeMethod?: string | null; noticeDestination?: string | null; noticeDeadlineAt?: string | null }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/warranty-rights/from-document`, { method: 'POST', body: JSON.stringify(input) });
  }

  async verifyNewHomeWarrantyRight(propertyId: string, rightId: string) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/warranty-rights/${rightId}/verify`, { method: 'PATCH' });
  }

  async upsertNewHomeRegistration(propertyId: string, input: { inventoryItemId: string; manufacturer: string; modelNumber: string; serialNumber: string; registrationUrl?: string | null; status?: 'NOT_STARTED' | 'SUBMITTED' | 'CONFIRMED' | 'NOT_REQUIRED'; confirmationDocumentId?: string | null; notes?: string | null }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/registrations`, { method: 'PUT', body: JSON.stringify(input) });
  }

  async addNewHomeEvidence(propertyId: string, input: { evidenceType: 'PERMIT' | 'FINAL_INSPECTION' | 'COMMISSIONING' | 'MANUAL' | 'CERTIFICATE' | 'PHOTO' | 'OTHER'; label: string; documentId?: string | null; sourceCitation?: string | null; observedAt?: string | null; verified?: boolean; notes?: string | null }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/evidence`, { method: 'POST', body: JSON.stringify(input) });
  }

  async ensureNewHomeInspectionBundles(propertyId: string) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/inspection-bundles`, { method: 'POST' });
  }

  async updateNewHomeInspectionBundle(propertyId: string, bundleId: string, input: { status: 'PREPARING' | 'READY' | 'COMPLETED'; inspectionReportId?: string | null }) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/inspection-bundles/${bundleId}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  async handoffNewHomePlan(propertyId: string) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/handoff`, { method: 'POST' });
  }

  async getNewHomeAcceptanceStatus(propertyId: string) {
    return this.request(`/api/new-home-setup/properties/${propertyId}/acceptance-status`);
  }

  /**
   * Create custom HOME_BUYER task (in addition to 8 defaults)
   * 
   * @param data - Task data
   * @returns Created task
   */
  async createHomeBuyerTask(
    propertyId: string,
    data: CreateHomeBuyerTaskInput
  ): Promise<APIResponse<HomeBuyerTask>> {
    return this.request<HomeBuyerTask>(`/api/home-buyer-tasks/properties/${propertyId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update HOME_BUYER task details (title, description, category, sort order)
   * 
   * @param taskId - Task ID
   * @param data - Updated fields
   * @returns Updated task
   */
  async updateHomeBuyerTask(
    propertyId: string,
    taskId: string,
    data: UpdateHomeBuyerTaskInput
  ): Promise<APIResponse<HomeBuyerTask>> {
    return this.request<HomeBuyerTask>(`/api/home-buyer-tasks/properties/${propertyId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update HOME_BUYER task status (PENDING → IN_PROGRESS → COMPLETED)
   * 
   * @param taskId - Task ID
   * @param status - New status
   * @returns Updated task
   */
  async updateHomeBuyerTaskStatus(
    propertyId: string,
    taskId: string,
    status: HomeBuyerTaskStatus
  ): Promise<APIResponse<HomeBuyerTask>> {
    return this.request<HomeBuyerTask>(`/api/home-buyer-tasks/properties/${propertyId}/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  /**
   * Delete custom HOME_BUYER task (cannot delete 8 default tasks)
   * 
   * @param taskId - Task ID
   */
  async deleteHomeBuyerTask(propertyId: string, taskId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-buyer-tasks/properties/${propertyId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Link HOME_BUYER task to booking
   * 
   * @param taskId - Task ID
   * @param bookingId - Booking ID
   * @returns Link confirmation
   */
  async linkHomeBuyerTaskBooking(
    propertyId: string,
    taskId: string,
    bookingId: string
  ): Promise<APIResponse<LinkBookingResponse>> {
    return this.request<LinkBookingResponse>(
      `/api/home-buyer-tasks/properties/${propertyId}/tasks/${taskId}/link-booking`,
      {
        method: 'POST',
        body: JSON.stringify({ bookingId }),
      }
    );
  }

  // ============================================================================
  // PROPERTY MAINTENANCE TASK ENDPOINTS (11 methods)
  // ============================================================================

  /**
   * Get EXISTING_OWNER maintenance tasks for a property with optional filters
   * 
   * @param propertyId - Property ID
   * @param filters - Optional filters (status, priority, source, etc.)
   * @returns Filtered maintenance tasks
   */
  async getMaintenanceTasks(
    propertyId: string,
    filters?: MaintenanceTaskFilters
  ): Promise<APIResponse<PropertyMaintenanceTask[]>> {
    const queryParams = new URLSearchParams();
    
    if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        statuses.forEach(s => queryParams.append('status', s));
      }
      if (filters.priority) {
        const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
        priorities.forEach(p => queryParams.append('priority', p));
      }
      if (filters.source) {
        const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
        sources.forEach(s => queryParams.append('source', s));
      }
      if (filters.serviceCategory) {
        const categories = Array.isArray(filters.serviceCategory) 
          ? filters.serviceCategory 
          : [filters.serviceCategory];
        categories.forEach(c => queryParams.append('serviceCategory', c));
      }
      if (filters.isOverdue !== undefined) {
        queryParams.append('isOverdue', filters.isOverdue.toString());
      }
      if (filters.isDueSoon !== undefined) {
        queryParams.append('isDueSoon', filters.isDueSoon.toString());
      }
      if (filters.isRecurring !== undefined) {
        queryParams.append('isRecurring', filters.isRecurring.toString());
      }
      if (filters.hasBooking !== undefined) {
        queryParams.append('hasBooking', filters.hasBooking.toString());
      }
      if (filters.includeCompleted !== undefined) {
        queryParams.append('includeCompleted', filters.includeCompleted.toString());
      }
      if (filters.search) {
        queryParams.append('search', filters.search);
      }
    }
    
    const queryString = queryParams.toString();
    const endpoint = `/api/maintenance-tasks/property/${propertyId}${queryString ? `?${queryString}` : ''}`;
    
    return this.request<PropertyMaintenanceTask[]>(endpoint, {
      method: 'GET',
    });
  }

  /**
   * Get single maintenance task by ID
   * 
   * @param taskId - Task ID
   * @returns Single maintenance task
   */
  async getMaintenanceTask(taskId: string): Promise<APIResponse<PropertyMaintenanceTask>> {
    return this.request<PropertyMaintenanceTask>(`/api/maintenance-tasks/${taskId}`, {
      method: 'GET',
    });
  }

  /**
   * Get maintenance task statistics for a property
   * 
   * @param propertyId - Property ID
   * @returns Task statistics (counts by status, priority, source, costs)
   */
  async getMaintenanceTaskStats(
    propertyId: string
  ): Promise<APIResponse<MaintenanceTaskStats>> {
    return this.request<MaintenanceTaskStats>(
      `/api/maintenance-tasks/property/${propertyId}/stats`,
      {
        method: 'GET',
      }
    );
  }

  /**
   * Create user-created maintenance task (source: USER_CREATED)
   * 
   * @param propertyId - Property ID
   * @param data - Task data
   * @returns Created maintenance task
   */
  async createMaintenanceTask(
    propertyId: string,
    data: CreateMaintenanceTaskInput
  ): Promise<APIResponse<PropertyMaintenanceTask>> {
    return this.request<PropertyMaintenanceTask>(
      `/api/maintenance-tasks/property/${propertyId}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Create maintenance task from Action Center (source: ACTION_CENTER)
   * PHASE 2.3 INTEGRATION: Idempotent via actionKey
   * 
   * @param data - Task data from Action Center
   * @returns Created/existing maintenance task
   */
  async createMaintenanceTaskFromActionCenter(
    data: CreateMaintenanceTaskFromActionCenterInput
  ): Promise<APIResponse<{ task: PropertyMaintenanceTask; deduped: boolean }>> {
    return this.request<{ task: PropertyMaintenanceTask; deduped: boolean }>(
      '/api/maintenance-tasks/from-action-center',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Create maintenance task from seasonal item (source: SEASONAL)
   * PHASE 2.5 INTEGRATION
   * 
   * @param seasonalItemId - Seasonal checklist item ID
   * @returns Created maintenance task
   */
  async createMaintenanceTaskFromSeasonal(
    seasonalItemId: string
  ): Promise<APIResponse<PropertyMaintenanceTask>> {
    return this.request<PropertyMaintenanceTask>(
      `/api/maintenance-tasks/from-seasonal/${seasonalItemId}`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Create maintenance tasks from templates (source: TEMPLATE)
   * 
   * @param data - Property ID and template IDs
   * @returns Created maintenance tasks
   */
  async createMaintenanceTasksFromTemplates(
    data: CreateMaintenanceTasksFromTemplatesInput
  ): Promise<APIResponse<{ tasks: PropertyMaintenanceTask[]; count: number }>> {
    return this.request<{ tasks: PropertyMaintenanceTask[]; count: number }>(
      '/api/maintenance-tasks/from-templates',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Update maintenance task details
   * 
   * @param taskId - Task ID
   * @param data - Updated fields
   * @returns Updated maintenance task
   */
  async updateMaintenanceTask(
    taskId: string,
    data: UpdateMaintenanceTaskInput
  ): Promise<APIResponse<PropertyMaintenanceTask>> {
    return this.request<PropertyMaintenanceTask>(`/api/maintenance-tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update maintenance task status
   * 
   * @param taskId - Task ID
   * @param data - Status update data (status and optional actualCost)
   * @returns Updated maintenance task
   */
  async updateMaintenanceTaskStatus(
    taskId: string,
    data: { status: MaintenanceTaskStatus; actualCost?: number; outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' }
  ): Promise<APIResponse<PropertyMaintenanceTask>> {
    return this.request<PropertyMaintenanceTask>(
      `/api/maintenance-tasks/${taskId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Generate or refresh 12-month maintenance predictions for a property.
   */
  async generateMaintenanceForecast(
    propertyId: string
  ): Promise<APIResponse<MaintenanceForecastSummary>> {
    return this.request<MaintenanceForecastSummary>(
      `/api/properties/${propertyId}/maintenance-predictions/generate`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Get maintenance predictions for timeline/next-up views.
   */
  async getMaintenanceForecast(
    propertyId: string,
    options?: {
      status?: MaintenancePredictionStatus[];
      limit?: number;
    }
  ): Promise<APIResponse<MaintenancePrediction[]>> {
    const query = new URLSearchParams();
    if (options?.status?.length) {
      query.set('status', options.status.join(','));
    }
    if (options?.limit && options.limit > 0) {
      query.set('limit', String(Math.floor(options.limit)));
    }

    const qs = query.toString();
    const endpoint = `/api/properties/${propertyId}/maintenance-predictions${qs ? `?${qs}` : ''}`;
    return this.request<MaintenancePrediction[]>(endpoint, { method: 'GET' });
  }

  /**
   * Update maintenance prediction status (COMPLETED / DISMISSED).
   */
  async updateMaintenancePredictionStatus(
    propertyId: string,
    predictionId: string,
    data: { status: MaintenancePredictionStatus }
  ): Promise<
    APIResponse<{
      prediction: MaintenancePrediction;
      streak: {
        currentStreak: number;
        longestStreak: number;
        bonusMultiplier: number;
        lastActivityDate: string | null;
        milestoneReached: boolean;
      } | null;
    }>
  > {
    return this.request<{
      prediction: MaintenancePrediction;
      streak: {
        currentStreak: number;
        longestStreak: number;
        bonusMultiplier: number;
        lastActivityDate: string | null;
        milestoneReached: boolean;
      } | null;
    }>(
      `/api/properties/${propertyId}/maintenance-predictions/${predictionId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Delete maintenance task
   * 
   * @param taskId - Task ID
   */
  async deleteMaintenanceTask(taskId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/maintenance-tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Link maintenance task to booking
   * 
   * @param taskId - Task ID
   * @param bookingId - Booking ID
   * @returns Link confirmation
   */
  async linkMaintenanceTaskBooking(
    taskId: string,
    bookingId: string
  ): Promise<APIResponse<LinkBookingResponse>> {
    return this.request<LinkBookingResponse>(
      `/api/maintenance-tasks/${taskId}/link-booking`,
      {
        method: 'POST',
        body: JSON.stringify({ bookingId }),
      }
    );
  }

  // ============================================================================
  // SEASONAL MAINTENANCE INTEGRATION ENDPOINTS (2 methods)
  // ============================================================================

  /**
   * Add seasonal checklist item to property maintenance
   * PHASE 2.5 INTEGRATION
   * 
   * Creates PropertyMaintenanceTask with source=SEASONAL
   * Links via seasonalChecklistItemId
   * Updates seasonal item status to 'ADDED'
   * 
   * @param itemId - Seasonal checklist item ID
   * @returns Created maintenance task
   */
  async addSeasonalTaskToMaintenance(
    itemId: string
  ): Promise<APIResponse<SeasonalMaintenanceResult>> {
    return this.request<SeasonalMaintenanceResult>(
      `/api/seasonal-checklist-items/${itemId}/add-to-maintenance`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Remove seasonal checklist item from property maintenance
   * PHASE 2.5 INTEGRATION
   * 
   * Unlinks seasonal item from maintenance task
   * Updates seasonal item status to 'RECOMMENDED'
   * Does NOT delete the maintenance task (user may have modified it)
   * 
   * @param itemId - Seasonal checklist item ID
   * @returns Removal confirmation
   */
  async removeSeasonalTaskFromMaintenance(
    itemId: string
  ): Promise<APIResponse<RemoveSeasonalMaintenanceResult>> {
    return this.request<RemoveSeasonalMaintenanceResult>(
      `/api/seasonal-checklist-items/${itemId}/remove-from-maintenance`,
      {
        method: 'DELETE',
      }
    );
  }
  async getRaw<T>(endpoint: string): Promise<{ data: T }> {
    const res = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) throw new APIError(`Request failed (${res.status})`, res.status);
  
    return { data: (await res.json()) as T };
  }
  
  async listInventoryImportBatches(propertyId: string) {
    const res = await this.get<{ batches: InventoryImportBatch[] }>(`/api/properties/${propertyId}/inventory/import-batches`);
    return res.data?.batches ?? [];
  }

  async rollbackInventoryImportBatch(propertyId: string, batchId: string) {
    const res = await this.post(`/api/properties/${propertyId}/inventory/import-batches/${batchId}/rollback`, {});
    return res.data;
  }

  /**
   * Seller's Vault — public endpoint, no auth required.
   * Uses a raw fetch to bypass the JWT token-refresh interceptor so that
   * a wrong-password 401 does NOT trigger a session-refresh / redirect-to-login.
   */
  async getVaultData(
    propertyId: string,
    credentials: { password?: string; accessToken?: string }
  ): Promise<APIResponse<import('@/types').VaultData>> {
    const res = await fetch(`${this.baseURL}/api/vault/access/${propertyId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return res.json() as Promise<APIResponse<import('@/types').VaultData>>;
  }

  /** Check whether a vault password has been set for a property (authenticated). */
  async getVaultStatus(propertyId: string): Promise<APIResponse<{ isConfigured: boolean }>> {
    return this.request<{ isConfigured: boolean }>(`/api/vault/status/${propertyId}`);
  }

  /** Set or replace the vault password for a property (authenticated, owner only). */
  async setVaultPassword(
    propertyId: string,
    password: string
  ): Promise<APIResponse<void>> {
    return this.request<void>(`/api/vault/setup/${propertyId}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async createVaultShareLink(
    propertyId: string,
    expiresInHours = 72
  ): Promise<APIResponse<VaultShareLinkResponse>> {
    return this.request<VaultShareLinkResponse>(`/api/vault/share-link/${propertyId}`, {
      method: 'POST',
      body: JSON.stringify({ expiresInHours }),
    });
  }

  // ==========================================================================
  // HOME EVENT RADAR
  // ==========================================================================

  async getRadarFeed(
    propertyId: string,
    params?: { severity?: string; includeResolved?: boolean; limit?: number; cursor?: string }
  ): Promise<{ items: RadarFeedItem[]; hasMore: boolean; nextCursor: string | null; propertyContext?: PropertyContextEnvelope }> {
    const query = new URLSearchParams();
    if (params?.severity) query.set('severity', params.severity);
    if (params?.includeResolved) query.set('includeResolved', 'true');
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await this.get<{ items: RadarFeedItem[]; hasMore: boolean; nextCursor: string | null; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/radar/feed${qs}`
    );
    return res.data ?? { items: [], hasMore: false, nextCursor: null, propertyContext: undefined };
  }

  async getRadarMatchDetail(propertyId: string, matchId: string): Promise<RadarMatchDetail | null> {
    const res = await this.get<{ detail: RadarMatchDetail }>(
      `/api/properties/${propertyId}/radar/matches/${matchId}`
    );
    return res.data?.detail ?? null;
  }

  async updateRadarMatchState(
    propertyId: string,
    matchId: string,
    state: RadarUserState,
    stateMetaJson?: Record<string, unknown>,
    guidance?: {
      guidanceJourneyId?: string | null;
      guidanceStepKey?: string | null;
      guidanceSignalIntentFamily?: string | null;
    }
  ): Promise<void> {
    await this.patch(`/api/properties/${propertyId}/radar/matches/${matchId}/state`, {
      state,
      stateMetaJson: stateMetaJson ?? null,
      guidanceJourneyId: guidance?.guidanceJourneyId ?? null,
      guidanceStepKey: guidance?.guidanceStepKey ?? null,
      guidanceSignalIntentFamily: guidance?.guidanceSignalIntentFamily ?? null,
    });
  }

  // ==========================================================================
  // HIDDEN ASSET FINDER
  // ==========================================================================

  async getHiddenAssetMatches(
    propertyId: string,
    params?: { category?: string; confidenceLevel?: string; includeDismissed?: boolean }
  ): Promise<import('@/types').HiddenAssetMatchListDTO | null> {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.confidenceLevel) qs.set('confidenceLevel', params.confidenceLevel);
    if (params?.includeDismissed) qs.set('includeDismissed', 'true');
    const q = qs.toString() ? `?${qs.toString()}` : '';
    const res = await this.get<import('@/types').HiddenAssetMatchListDTO>(
      `/api/properties/${propertyId}/hidden-assets${q}`
    );
    return res.data ?? null;
  }

  async refreshHiddenAssetMatches(
    propertyId: string
  ): Promise<import('@/types').HiddenAssetRefreshResultDTO | null> {
    const res = await this.post<import('@/types').HiddenAssetRefreshResultDTO>(
      `/api/properties/${propertyId}/hidden-assets/refresh`,
      {}
    );
    return res.data ?? null;
  }

  async getHiddenAssetProgramDetail(
    programId: string
  ): Promise<import('@/types').HiddenAssetProgramDetailDTO | null> {
    const res = await this.get<{ program: import('@/types').HiddenAssetProgramDetailDTO }>(
      `/api/hidden-asset-programs/${programId}`
    );
    return res.data?.program ?? null;
  }

  async updateHiddenAssetMatchStatus(
    matchId: string,
    status: 'VIEWED' | 'DISMISSED' | 'CLAIMED'
  ): Promise<import('@/types').HiddenAssetMatchDTO | null> {
    const res = await this.patch<{ match: import('@/types').HiddenAssetMatchDTO }>(
      `/api/property-hidden-asset-matches/${matchId}`,
      { status }
    );
    return res.data?.match ?? null;
  }

  // ==========================================================================
  // HOME DIGITAL TWIN
  // ==========================================================================

  async getHomeDigitalTwin(
    propertyId: string
  ): Promise<import('@/types').HomeDigitalTwinDTO | null> {
    const res = await this.get<{
      twin: import('@/types').HomeDigitalTwinDTO;
      context?: PropertyContextEnvelope | null;
    }>(
      `/api/properties/${propertyId}/home-digital-twin`
    );
    if (res.data?.twin) {
      res.data.twin.context = res.data.context ?? null;
    }
    return res.data?.twin ?? null;
  }

  async initHomeDigitalTwin(
    propertyId: string,
    forceRefresh?: boolean
  ): Promise<import('@/types').HomeDigitalTwinDTO | null> {
    const res = await this.post<{ twin: import('@/types').HomeDigitalTwinDTO }>(
      `/api/properties/${propertyId}/home-digital-twin/init`,
      { forceRefresh: forceRefresh ?? false }
    );
    return res.data?.twin ?? null;
  }

  async refreshHomeDigitalTwin(
    propertyId: string
  ): Promise<import('@/types').HomeDigitalTwinDTO | null> {
    const res = await this.post<{ twin: import('@/types').HomeDigitalTwinDTO }>(
      `/api/properties/${propertyId}/home-digital-twin/refresh`,
      {}
    );
    return res.data?.twin ?? null;
  }

  async getDigitalTwinRecommendations(
    propertyId: string
  ): Promise<import('@/types').ScenarioSuggestionDTO[] | null> {
    const res = await this.get<{ recommendations: import('@/types').ScenarioSuggestionDTO[] }>(
      `/api/properties/${propertyId}/home-digital-twin/recommended-scenarios`
    );
    return res.data?.recommendations ?? null;
  }

  async listDigitalTwinScenarios(
    propertyId: string,
    params?: { status?: string; includeArchived?: boolean }
  ): Promise<import('@/types').HomeTwinScenarioDTO[] | null> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.includeArchived) qs.set('includeArchived', 'true');
    const q = qs.toString() ? `?${qs.toString()}` : '';
    const res = await this.get<{ scenarios: import('@/types').HomeTwinScenarioDTO[] }>(
      `/api/properties/${propertyId}/home-digital-twin/scenarios${q}`
    );
    return res.data?.scenarios ?? null;
  }

  async createDigitalTwinScenario(
    propertyId: string,
    input: import('@/types').CreateScenarioInput
  ): Promise<import('@/types').HomeTwinScenarioDTO | null> {
    const res = await this.post<{ scenario: import('@/types').HomeTwinScenarioDTO }>(
      `/api/properties/${propertyId}/home-digital-twin/scenarios`,
      input
    );
    return res.data?.scenario ?? null;
  }

  async computeDigitalTwinScenario(
    propertyId: string,
    scenarioId: string
  ): Promise<import('@/types').HomeTwinScenarioDTO | null> {
    const res = await this.post<{ scenario: import('@/types').HomeTwinScenarioDTO }>(
      `/api/properties/${propertyId}/home-digital-twin/scenarios/${scenarioId}/compute`,
      {}
    );
    return res.data?.scenario ?? null;
  }

  async updateDigitalTwinScenario(
    propertyId: string,
    scenarioId: string,
    input: import('@/types').UpdateScenarioInput
  ): Promise<import('@/types').HomeTwinScenarioDTO | null> {
    const res = await this.patch<{ scenario: import('@/types').HomeTwinScenarioDTO }>(
      `/api/properties/${propertyId}/home-digital-twin/scenarios/${scenarioId}`,
      input
    );
    return res.data?.scenario ?? null;
  }

  // ==========================================================================
  // NEIGHBORHOOD CHANGE RADAR
  // ==========================================================================

  async getNeighborhoodRadarSummary(
    propertyId: string,
  ): Promise<import('@/types').NeighborhoodRadarSummaryDTO | null> {
    const res = await this.get<{
      summary: import('@/types').NeighborhoodRadarSummaryDTO;
      context?: PropertyContextEnvelope;
    }>(
      `/api/properties/${propertyId}/neighborhood-radar/summary`,
    );
    if (res.data?.summary) {
      res.data.summary.propertyContext = res.data.context;
    }
    return res.data?.summary ?? null;
  }

  async getNeighborhoodRadarEvents(
    propertyId: string,
    params?: {
      sortBy?: 'impact' | 'date';
      filterType?: string;
      filterEffect?: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
      limit?: number;
      offset?: number;
    },
  ): Promise<import('@/types').NeighborhoodEventListDTO | null> {
    const qs = new URLSearchParams();
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.filterType) qs.set('filterType', params.filterType);
    if (params?.filterEffect) qs.set('filterEffect', params.filterEffect);
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    const q = qs.toString() ? `?${qs.toString()}` : '';
    const res = await this.get<import('@/types').NeighborhoodEventListDTO>(
      `/api/properties/${propertyId}/neighborhood-radar/events${q}`,
    );
    return res.data ?? null;
  }

  async getNeighborhoodRadarEventDetail(
    propertyId: string,
    eventId: string,
  ): Promise<import('@/types').NeighborhoodEventDetailDTO | null> {
    const res = await this.get<{ event: import('@/types').NeighborhoodEventDetailDTO }>(
      `/api/properties/${propertyId}/neighborhood-radar/events/${eventId}`,
    );
    return res.data?.event ?? null;
  }

  async getNeighborhoodRadarTrends(
    propertyId: string,
  ): Promise<import('@/types').NeighborhoodTrendSummaryDTO | null> {
    const res = await this.get<{ trends: import('@/types').NeighborhoodTrendSummaryDTO }>(
      `/api/properties/${propertyId}/neighborhood-radar/trends`,
    );
    return res.data?.trends ?? null;
  }

  async getNeighborhoodSignals(
    propertyId: string,
  ): Promise<import('@/types').NeighborhoodSignal[]> {
    const res = await this.get<{ signals: import('@/types').NeighborhoodSignal[] }>(
      `/api/properties/${propertyId}/neighborhood-radar/signals`,
    );
    return res.data?.signals ?? [];
  }

  // HOME RENOVATION RISK ADVISOR

  async createRenovationAdvisorSession(
    input: import('@/types').CreateRenovationAdvisorSessionInput,
  ): Promise<import('@/types').RenovationAdvisorSession> {
    const res = await this.post<{ session: import('@/types').RenovationAdvisorSession }>(
      '/api/home-renovation-advisor/sessions',
      input,
    );
    if (!res.data?.session) {
      throw new APIError('Failed to create renovation advisor session', 500);
    }
    return res.data.session;
  }

  async updateRenovationAdvisorSession(
    sessionId: string,
    input: import('@/types').UpdateRenovationAdvisorSessionInput,
  ): Promise<import('@/types').RenovationAdvisorSession> {
    const res = await this.patch<{ session: import('@/types').RenovationAdvisorSession }>(
      `/api/home-renovation-advisor/sessions/${sessionId}`,
      input,
    );
    if (!res.data?.session) {
      throw new APIError('Failed to update renovation advisor session', 500);
    }
    return res.data.session;
  }

  async evaluateRenovationAdvisorSession(
    sessionId: string,
    input: import('@/types').EvaluateRenovationAdvisorSessionInput,
  ): Promise<import('@/types').RenovationAdvisorSession> {
    const res = await this.post<{ session: import('@/types').RenovationAdvisorSession }>(
      `/api/home-renovation-advisor/sessions/${sessionId}/evaluate`,
      input,
    );
    if (!res.data?.session) {
      throw new APIError('Failed to evaluate renovation advisor session', 500);
    }
    return res.data.session;
  }

  async getRenovationAdvisorSession(
    sessionId: string,
  ): Promise<import('@/types').RenovationAdvisorSession | null> {
    const res = await this.get<{ session: import('@/types').RenovationAdvisorSession }>(
      `/api/home-renovation-advisor/sessions/${sessionId}`,
    );
    return res.data?.session ?? null;
  }

  async listRenovationAdvisorSessions(
    propertyId: string,
  ): Promise<import('@/types').RenovationAdvisorSessionSummary[]> {
    const res = await this.get<{ sessions: import('@/types').RenovationAdvisorSessionSummary[] }>(
      `/api/properties/${propertyId}/home-renovation-advisor/sessions`,
    );
    return res.data?.sessions ?? [];
  }

  async archiveRenovationAdvisorSession(
    sessionId: string,
  ): Promise<void> {
    await this.post<{ message: string }>(
      `/api/home-renovation-advisor/sessions/${sessionId}/archive`,
      {},
    );
  }

  async getAdvisorSessionExport(sessionId: string) {
    return this.get<any>(`/api/home-renovation-advisor/sessions/${sessionId}/export`);
  }

  async getRetroactiveCandidates(
    propertyId: string,
  ): Promise<import('@/types').RetroactiveCandidate[]> {
    const res = await this.get<{ candidates: import('@/types').RetroactiveCandidate[] }>(
      `/api/properties/${propertyId}/home-renovation-advisor/retroactive-candidates`,
    );
    return res.data?.candidates ?? [];
  }

  async updateRenovationAdvisorCompliance(
    sessionId: string,
    input: Partial<import('@/types').RenovationAdvisorComplianceChecklist>,
  ): Promise<import('@/types').RenovationAdvisorSession> {
    const res = await this.patch<{ session: import('@/types').RenovationAdvisorSession }>(
      `/api/home-renovation-advisor/sessions/${sessionId}/compliance`,
      input,
    );
    if (!res.data?.session) {
      throw new APIError('Failed to update renovation advisor compliance', 500);
    }
    return res.data.session;
  }

  // ── Household Collaboration ───────────────────────────────────────────────────

  async listHouseholdMembers(propertyId: string): Promise<import('@/types').HouseholdMember[]> {
    const res = await this.get<{ members: import('@/types').HouseholdMember[] }>(
      `/api/properties/${propertyId}/household/members`,
    );
    return res.data?.members ?? [];
  }

  async getMyHouseholdMembership(propertyId: string): Promise<import('@/types').HouseholdMember> {
    const res = await this.get<{ member: import('@/types').HouseholdMember }>(
      `/api/properties/${propertyId}/household/members/me`,
    );
    if (!res.data?.member) throw new APIError('Membership not found', 404);
    return res.data.member;
  }

  async updateHouseholdMemberRole(
    propertyId: string,
    memberId: string,
    updates: { role?: import('@/types').HouseholdRole; displayName?: string | null },
  ): Promise<import('@/types').HouseholdMember> {
    const res = await this.patch<{ member: import('@/types').HouseholdMember }>(
      `/api/properties/${propertyId}/household/members/${memberId}`,
      updates,
    );
    if (!res.data?.member) throw new APIError('Failed to update member', 500);
    return res.data.member;
  }

  async removeHouseholdMember(propertyId: string, memberId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/household/members/${memberId}`);
  }

  async updateMyNotificationPreferences(
    propertyId: string,
    prefs: Partial<import('@/types').HouseholdNotificationPrefs>,
  ): Promise<void> {
    await this.patch(
      `/api/properties/${propertyId}/household/members/me/notifications`,
      prefs,
    );
  }

  async sendHouseholdInvite(
    propertyId: string,
    payload: import('@/types').SendInvitePayload,
  ): Promise<import('@/types').HouseholdInvite> {
    const res = await this.post<{ invite: import('@/types').HouseholdInvite }>(
      `/api/properties/${propertyId}/household/invites`,
      payload,
    );
    if (!res.data?.invite) throw new APIError('Failed to send invite', 500);
    return res.data.invite;
  }

  async listHouseholdInvites(propertyId: string): Promise<import('@/types').HouseholdInvite[]> {
    const res = await this.get<{ invites: import('@/types').HouseholdInvite[] }>(
      `/api/properties/${propertyId}/household/invites`,
    );
    return res.data?.invites ?? [];
  }

  async revokeHouseholdInvite(propertyId: string, inviteId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/household/invites/${inviteId}`);
  }

  async previewInvite(token: string): Promise<import('@/types').InvitePreview> {
    const res = await this.get<{ preview: import('@/types').InvitePreview }>(
      `/api/household/invites/${token}`,
    );
    if (!res.data?.preview) throw new APIError('Invite not found', 404);
    return res.data.preview;
  }

  async acceptInvite(token: string): Promise<{ propertyId: string }> {
    const res = await this.post<{ propertyId: string }>(
      `/api/household/invites/${token}/accept`,
      {},
    );
    if (!res.data?.propertyId) throw new APIError('Failed to accept invite', 500);
    return res.data;
  }

  async getHouseholdActivity(
    propertyId: string,
    params?: import('@/types').ActivityFeedParams,
  ): Promise<{ items: import('@/types').HouseholdActivityItem[]; nextCursor?: string }> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.activityTypes?.length) query.set('activityTypes', params.activityTypes.join(','));
    const qs = query.toString();
    const res = await this.get<{ items: import('@/types').HouseholdActivityItem[]; nextCursor?: string }>(
      `/api/properties/${propertyId}/household/activity${qs ? `?${qs}` : ''}`,
    );
    return { items: res.data?.items ?? [], nextCursor: res.data?.nextCursor };
  }

  async assignTask(
    propertyId: string,
    taskId: string,
    taskType: 'MAINTENANCE' | 'SEASONAL' | 'BUYER',
    assigneeUserId: string | null,
  ): Promise<void> {
    await this.patch(`/api/properties/${propertyId}/tasks/${taskId}/assign`, {
      taskType,
      assigneeUserId,
    });
  }

  // ─── Home Improvement Financing Center ─────────────────────────────────────

  async getFinancingProfile(propertyId: string): Promise<import('@/types').PropertyFinancingProfile | null> {
    const res = await this.get<{ profile: import('@/types').PropertyFinancingProfile | null; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/profile`,
    );
    return res.data?.profile
      ? { ...res.data.profile, propertyContext: res.data.propertyContext }
      : null;
  }

  async upsertFinancingProfile(
    propertyId: string,
    payload: import('@/types').FinancingProfilePayload,
  ): Promise<import('@/types').PropertyFinancingProfile> {
    const res = await this.put<{ profile: import('@/types').PropertyFinancingProfile; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/profile`,
      payload,
    );
    if (!res.data?.profile) throw new APIError('Failed to save financing profile', 500);
    return { ...res.data.profile, propertyContext: res.data.propertyContext };
  }

  async getEquityPosition(propertyId: string): Promise<import('@/types').EquityPosition> {
    const res = await this.get<{ equity: import('@/types').EquityPosition; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/equity`,
    );
    if (!res.data?.equity) throw new APIError('Equity position not found', 404);
    return { ...res.data.equity, propertyContext: res.data.propertyContext };
  }

  async refreshEquityPosition(propertyId: string): Promise<import('@/types').EquityPosition> {
    const res = await this.post<{ equity: import('@/types').EquityPosition; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/equity/refresh`,
      {},
    );
    if (!res.data?.equity) throw new APIError('Failed to refresh equity', 500);
    return { ...res.data.equity, propertyContext: res.data.propertyContext };
  }

  async getEquityHistory(propertyId: string): Promise<import('@/types').EquityPosition[]> {
    const res = await this.get<{ history: import('@/types').EquityPosition[] }>(
      `/api/properties/${propertyId}/financing/equity/history`,
    );
    return res.data?.history ?? [];
  }

  async calculateFinancing(
    propertyId: string,
    projectCostCents: number,
  ): Promise<import('@/types').FinancingResultSet> {
    const res = await this.post<{ results: import('@/types').FinancingResultSet; propertyContext?: PropertyContextEnvelope; calculationContext?: { mode: 'SCENARIO'; overrideFields: string[] } }>(
      `/api/properties/${propertyId}/financing/calculate`,
      { projectCostCents },
    );
    if (!res.data?.results) throw new APIError('Financing calculation failed', 500);
    return {
      ...res.data.results,
      propertyContext: res.data.propertyContext,
      calculationContext: res.data.calculationContext,
    };
  }

  async listFinancingScenarios(
    propertyId: string,
  ): Promise<import('@/types').FinancingScenarioSummary[]> {
    const res = await this.get<{ scenarios: import('@/types').FinancingScenarioSummary[]; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/scenarios`,
    );
    return (res.data?.scenarios ?? []).map((scenario) => ({
      ...scenario,
      propertyContext: res.data?.propertyContext,
    }));
  }

  async createFinancingScenario(
    propertyId: string,
    payload: import('@/types').CreateScenarioPayload,
  ): Promise<import('@/types').FinancingScenario> {
    const res = await this.post<{ scenario: import('@/types').FinancingScenario; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/scenarios`,
      payload,
    );
    if (!res.data?.scenario) throw new APIError('Failed to create scenario', 500);
    return { ...res.data.scenario, propertyContext: res.data.propertyContext };
  }

  async getFinancingScenario(
    propertyId: string,
    scenarioId: string,
  ): Promise<import('@/types').FinancingScenario> {
    const res = await this.get<{ scenario: import('@/types').FinancingScenario; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/scenarios/${scenarioId}`,
    );
    if (!res.data?.scenario) throw new APIError('Scenario not found', 404);
    return { ...res.data.scenario, propertyContext: res.data.propertyContext };
  }

  async updateFinancingScenario(
    propertyId: string,
    scenarioId: string,
    patch: import('@/types').UpdateScenarioPayload,
  ): Promise<import('@/types').FinancingScenario> {
    const res = await this.patch<{ scenario: import('@/types').FinancingScenario; propertyContext?: PropertyContextEnvelope }>(
      `/api/properties/${propertyId}/financing/scenarios/${scenarioId}`,
      patch,
    );
    if (!res.data?.scenario) throw new APIError('Failed to update scenario', 500);
    return { ...res.data.scenario, propertyContext: res.data.propertyContext };
  }

  async archiveFinancingScenario(propertyId: string, scenarioId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/financing/scenarios/${scenarioId}`);
  }

  // ─── DIY Project Center ────────────────────────────────────────────────────

  async getDiySkillProfile(): Promise<import('@/types').DiySkillProfile | null> {
    const res = await this.get<{ profile: import('@/types').DiySkillProfile | null }>('/api/diy/skill-profile');
    return res.data?.profile ?? null;
  }

  async upsertDiySkillProfile(payload: import('@/types').DiySkillProfilePayload): Promise<import('@/types').DiySkillProfile> {
    const res = await this.put<{ profile: import('@/types').DiySkillProfile }>('/api/diy/skill-profile', payload);
    if (!res.data?.profile) throw new APIError('Failed to save skill profile', 500);
    return res.data.profile;
  }

  async listDiyTemplates(params?: import('@/types').DiyTemplateListParams): Promise<{ items: import('@/types').DiyTemplateSummary[]; nextCursor?: string }> {
    const res = await this.get<{ items: import('@/types').DiyTemplateSummary[]; nextCursor?: string }>('/api/diy/templates', params as Record<string, any>);
    return { items: res.data?.items ?? [], nextCursor: res.data?.nextCursor };
  }

  async getFeaturedDiyTemplates(): Promise<import('@/types').DiyTemplateSummary[]> {
    const res = await this.get<{ templates: import('@/types').DiyTemplateSummary[] }>('/api/diy/templates/featured');
    return res.data?.templates ?? [];
  }

  async getDiyTemplateDetail(templateId: string): Promise<import('@/types').DiyTemplateDetail> {
    const res = await this.get<{ template: import('@/types').DiyTemplateDetail }>(`/api/diy/templates/${templateId}`);
    if (!res.data?.template) throw new APIError('Template not found', 404);
    return res.data.template;
  }

  async getDiyDecision(propertyId: string, payload: import('@/types').DiyDecisionInput): Promise<import('@/types').DiyDecisionResult> {
    const res = await this.post<import('@/types').DiyDecisionResult>(`/api/properties/${propertyId}/diy/decision`, payload);
    if (!res.data) throw new APIError('Decision failed', 500);
    return res.data;
  }

  async createDiyProject(propertyId: string, payload: import('@/types').CreateDiyProjectPayload): Promise<import('@/types').DiyProjectDetail> {
    const res = await this.post<{ project: import('@/types').DiyProjectDetail }>(`/api/properties/${propertyId}/diy/projects`, payload);
    if (!res.data?.project) throw new APIError('Failed to create project', 500);
    return res.data.project;
  }

  async listDiyProjects(propertyId: string, params?: import('@/types').DiyProjectListParams): Promise<{ items: import('@/types').DiyProjectSummary[]; nextCursor?: string }> {
    const res = await this.get<{ items: import('@/types').DiyProjectSummary[]; nextCursor?: string }>(`/api/properties/${propertyId}/diy/projects`, params as Record<string, any>);
    return { items: res.data?.items ?? [], nextCursor: res.data?.nextCursor };
  }

  async getDiyProject(propertyId: string, projectId: string): Promise<import('@/types').DiyProjectDetail> {
    const res = await this.get<{ project: import('@/types').DiyProjectDetail }>(`/api/properties/${propertyId}/diy/projects/${projectId}`);
    if (!res.data?.project) throw new APIError('Project not found', 404);
    return res.data.project;
  }

  async updateDiyProject(propertyId: string, projectId: string, patch: import('@/types').UpdateDiyProjectPayload): Promise<import('@/types').DiyProjectDetail> {
    const res = await this.patch<{ project: import('@/types').DiyProjectDetail }>(`/api/properties/${propertyId}/diy/projects/${projectId}`, patch);
    if (!res.data?.project) throw new APIError('Failed to update project', 500);
    return res.data.project;
  }

  async updateDiyProjectStep(propertyId: string, projectId: string, stepId: string, patch: { status: import('@/types').DiyStepStatus; notes?: string }): Promise<import('@/types').DiyProjectStep> {
    const res = await this.patch<{ step: import('@/types').DiyProjectStep }>(`/api/properties/${propertyId}/diy/projects/${projectId}/steps/${stepId}`, patch);
    if (!res.data?.step) throw new APIError('Failed to update step', 500);
    return res.data.step;
  }

  async completeDiyProject(propertyId: string, projectId: string, payload: { actualMinutes?: number; actualMaterialCostCents?: number; notes?: string }): Promise<{ homeEventId: string }> {
    const res = await this.post<{ homeEventId: string }>(`/api/properties/${propertyId}/diy/projects/${projectId}/complete`, payload);
    if (!res.data) throw new APIError('Failed to complete project', 500);
    return res.data;
  }

  async abandonDiyProject(propertyId: string, projectId: string, payload: { hireOut?: boolean }): Promise<void> {
    await this.post(`/api/properties/${propertyId}/diy/projects/${projectId}/abandon`, payload);
  }

  async generateDiyAiGuide(propertyId: string, userPrompt: string): Promise<{ guideId: string }> {
    const res = await this.post<{ guideId: string }>(`/api/properties/${propertyId}/diy/ai-guide`, { userPrompt });
    if (!res.data?.guideId) throw new APIError('Failed to start AI guide generation', 500);
    return res.data;
  }

  async getDiyAiGuide(propertyId: string, guideId: string): Promise<import('@/types').DiyAiGuide> {
    const res = await this.get<{ guide: import('@/types').DiyAiGuide }>(`/api/properties/${propertyId}/diy/ai-guide/${guideId}`);
    if (!res.data?.guide) throw new APIError('Guide not found', 404);
    return res.data.guide;
  }

  // ─── DIY Admin ──────────────────────────────────────────────────────────────

  async adminListDiyTemplates(params?: {
    status?: import('@/types').DiyTemplateStatus | import('@/types').DiyTemplateStatus[];
    category?: import('@/types').DiyProjectCategory;
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: import('@/types').AdminDiyTemplateSummary[]; nextCursor?: string }> {
    const res = await this.get<{ items: import('@/types').AdminDiyTemplateSummary[]; nextCursor?: string }>('/api/admin/diy/templates', params as Record<string, any>);
    return res.data ?? { items: [] };
  }

  async adminGetDiyTemplate(templateId: string): Promise<import('@/types').AdminDiyTemplateDetail> {
    const res = await this.get<{ template: import('@/types').AdminDiyTemplateDetail }>(`/api/admin/diy/templates/${templateId}`);
    if (!res.data?.template) throw new APIError('Template not found', 404);
    return res.data.template;
  }

  async adminCreateDiyTemplate(payload: import('@/types').AdminDiyTemplatePayload): Promise<import('@/types').AdminDiyTemplateDetail> {
    const res = await this.post<{ template: import('@/types').AdminDiyTemplateDetail }>('/api/admin/diy/templates', payload);
    if (!res.data?.template) throw new APIError('Failed to create template', 500);
    return res.data.template;
  }

  async adminUpdateDiyTemplate(templateId: string, payload: Partial<import('@/types').AdminDiyTemplatePayload>): Promise<import('@/types').AdminDiyTemplateDetail> {
    const res = await this.put<{ template: import('@/types').AdminDiyTemplateDetail }>(`/api/admin/diy/templates/${templateId}`, payload);
    if (!res.data?.template) throw new APIError('Failed to update template', 500);
    return res.data.template;
  }

  // Direct DIY status changes were removed (ADMIN_MODULE_FRD.md §10.6) —
  // lifecycle moves through transitionDiyTemplate in adminContentGovernance.ts.

  // ─── Permit History & Unpermitted Work Tracker ──────────────────────────────

  async triggerPermitFetch(propertyId: string): Promise<{ fetchJobId: string }> {
    const res = await this.post<{ fetchJobId: string }>(`/api/properties/${propertyId}/permits/fetch`, {});
    if (!res.data?.fetchJobId) throw new APIError('Failed to trigger permit fetch', 500);
    return res.data;
  }

  async getPermitFetchStatus(propertyId: string): Promise<import('@/types').PermitFetchJobSummary | null> {
    const res = await this.get<{ fetchJob: import('@/types').PermitFetchJobSummary | null }>(`/api/properties/${propertyId}/permits/fetch/status`);
    return res.data?.fetchJob ?? null;
  }

  async getPermitSummary(propertyId: string): Promise<import('@/types').PermitHubSummary> {
    const res = await this.get<import('@/types').PermitHubSummary>(`/api/properties/${propertyId}/permits/summary`);
    if (!res.data) throw new APIError('Failed to load permit summary', 500);
    return res.data;
  }

  async listPermits(propertyId: string, params?: import('@/types').PermitListParams): Promise<{ items: import('@/types').PermitSummary[]; nextCursor?: string }> {
    const res = await this.get<{ items: import('@/types').PermitSummary[]; nextCursor?: string }>(`/api/properties/${propertyId}/permits`, params as Record<string, any>);
    return res.data ?? { items: [] };
  }

  async createManualPermit(propertyId: string, payload: import('@/types').CreatePermitPayload): Promise<import('@/types').PermitDetail> {
    const res = await this.post<{ permit: import('@/types').PermitDetail }>(`/api/properties/${propertyId}/permits`, payload);
    if (!res.data?.permit) throw new APIError('Failed to create permit', 500);
    return res.data.permit;
  }

  async getPermitDetail(propertyId: string, permitId: string): Promise<import('@/types').PermitDetail> {
    const res = await this.get<{ permit: import('@/types').PermitDetail }>(`/api/properties/${propertyId}/permits/${permitId}`);
    if (!res.data?.permit) throw new APIError('Permit not found', 404);
    return res.data.permit;
  }

  async updatePermit(propertyId: string, permitId: string, patch: import('@/types').UpdatePermitPayload): Promise<import('@/types').PermitDetail> {
    const res = await this.patch<{ permit: import('@/types').PermitDetail }>(`/api/properties/${propertyId}/permits/${permitId}`, patch);
    if (!res.data?.permit) throw new APIError('Failed to update permit', 500);
    return res.data.permit;
  }

  async deletePermit(propertyId: string, permitId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/permits/${permitId}`);
  }

  async addInspectionMilestone(propertyId: string, permitId: string, payload: import('@/types').AddMilestonePayload): Promise<import('@/types').InspectionMilestone> {
    const res = await this.post<{ milestone: import('@/types').InspectionMilestone }>(`/api/properties/${propertyId}/permits/${permitId}/inspections`, payload);
    if (!res.data?.milestone) throw new APIError('Failed to add milestone', 500);
    return res.data.milestone;
  }

  async updateInspectionMilestone(propertyId: string, permitId: string, milestoneId: string, patch: import('@/types').UpdateMilestonePayload): Promise<import('@/types').InspectionMilestone> {
    const res = await this.patch<{ milestone: import('@/types').InspectionMilestone }>(`/api/properties/${propertyId}/permits/${permitId}/inspections/${milestoneId}`, patch);
    if (!res.data?.milestone) throw new APIError('Failed to update milestone', 500);
    return res.data.milestone;
  }

  async deleteInspectionMilestone(propertyId: string, permitId: string, milestoneId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/permits/${permitId}/inspections/${milestoneId}`);
  }

  async getHoaAssociation(propertyId: string): Promise<import('@/types').HoaAssociation | null> {
    const res = await this.get<{ association: import('@/types').HoaAssociation | null }>(`/api/properties/${propertyId}/hoa`);
    return res.data?.association ?? null;
  }

  async upsertHoaAssociation(propertyId: string, payload: import('@/types').UpsertHoaAssociationPayload): Promise<import('@/types').HoaAssociation> {
    const res = await this.put<{ association: import('@/types').HoaAssociation }>(`/api/properties/${propertyId}/hoa`, payload);
    if (!res.data?.association) throw new APIError('Failed to save HOA details', 500);
    return res.data.association;
  }

  async listHoaApprovalRecords(propertyId: string): Promise<import('@/types').HoaApprovalRecord[]> {
    const res = await this.get<{ records: import('@/types').HoaApprovalRecord[] }>(`/api/properties/${propertyId}/hoa/approvals`);
    return res.data?.records ?? [];
  }

  async createHoaApprovalRecord(propertyId: string, payload: import('@/types').CreateHoaApprovalRecordPayload): Promise<import('@/types').HoaApprovalRecord> {
    const res = await this.post<{ record: import('@/types').HoaApprovalRecord }>(`/api/properties/${propertyId}/hoa/approvals`, payload);
    if (!res.data?.record) throw new APIError('Failed to create approval record', 500);
    return res.data.record;
  }

  async updateHoaApprovalRecord(propertyId: string, recordId: string, patch: import('@/types').UpdateHoaApprovalRecordPayload): Promise<import('@/types').HoaApprovalRecord> {
    const res = await this.patch<{ record: import('@/types').HoaApprovalRecord }>(`/api/properties/${propertyId}/hoa/approvals/${recordId}`, patch);
    if (!res.data?.record) throw new APIError('Failed to update approval record', 500);
    return res.data.record;
  }

  async deleteHoaApprovalRecord(propertyId: string, recordId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/hoa/approvals/${recordId}`);
  }

  async reportHoaViolation(propertyId: string, payload: import('@/types').ReportHoaViolationPayload): Promise<void> {
    await this.post(`/api/properties/${propertyId}/hoa/violations`, payload);
  }

  async listHoaViolations(propertyId: string): Promise<import('@/types').HoaViolationSummary[]> {
    const res = await this.get<{ violations: import('@/types').HoaViolationSummary[] }>(`/api/properties/${propertyId}/hoa/violations`);
    return res.data?.violations ?? [];
  }

  async runInspectionReadinessCheck(propertyId: string, permitId: string, milestoneId: string, photos: File[]): Promise<import('@/types').InspectionReadinessCheckResult> {
    const formData = new FormData();
    photos.forEach((photo) => formData.append('photos', photo));
    const res = await this.postFormData<{ check: import('@/types').InspectionReadinessCheckResult }>(`/api/properties/${propertyId}/permits/${permitId}/inspections/${milestoneId}/readiness-checks`, formData);
    if (!res.success || !res.data?.check) throw new APIError('Failed to run readiness check', 500);
    return res.data.check;
  }

  async listInspectionReadinessChecks(propertyId: string, permitId: string, milestoneId: string): Promise<import('@/types').InspectionReadinessCheckResult[]> {
    const res = await this.get<{ checks: import('@/types').InspectionReadinessCheckResult[] }>(`/api/properties/${propertyId}/permits/${permitId}/inspections/${milestoneId}/readiness-checks`);
    return res.data?.checks ?? [];
  }

  async listPermitFlags(propertyId: string, params?: import('@/types').FlagListParams): Promise<{ items: import('@/types').PermitFlagItem[]; nextCursor?: string }> {
    const res = await this.get<{ items: import('@/types').PermitFlagItem[]; nextCursor?: string }>(`/api/properties/${propertyId}/permits/flags`, params as Record<string, any>);
    return res.data ?? { items: [] };
  }

  async updatePermitFlag(propertyId: string, flagId: string, patch: import('@/types').UpdateFlagPayload): Promise<import('@/types').PermitFlagItem> {
    const res = await this.patch<{ flag: import('@/types').PermitFlagItem }>(`/api/properties/${propertyId}/permits/flags/${flagId}`, patch);
    if (!res.data?.flag) throw new APIError('Failed to update flag', 500);
    return res.data.flag;
  }

  async createManualFlag(propertyId: string, payload: import('@/types').CreateFlagPayload): Promise<import('@/types').PermitFlagItem> {
    const res = await this.post<{ flag: import('@/types').PermitFlagItem }>(`/api/properties/${propertyId}/permits/flags`, payload);
    if (!res.data?.flag) throw new APIError('Failed to create flag', 500);
    return res.data.flag;
  }

  async runPermitDetectionScan(propertyId: string): Promise<{ flagsCreated: number }> {
    const res = await this.post<{ flagsCreated: number }>(`/api/properties/${propertyId}/permits/flags/scan`, {});
    return res.data ?? { flagsCreated: 0 };
  }

  async requestDisclosureExport(propertyId: string): Promise<{ exportId: string }> {
    const res = await this.post<{ exportId: string }>(`/api/properties/${propertyId}/permits/disclosure`, {});
    if (!res.data?.exportId) throw new APIError('Failed to request disclosure export', 500);
    return res.data;
  }

  async getDisclosureExport(propertyId: string, exportId: string): Promise<import('@/types').PermitDisclosureExportItem> {
    const res = await this.get<{ export: import('@/types').PermitDisclosureExportItem }>(`/api/properties/${propertyId}/permits/disclosure/${exportId}`);
    if (!res.data?.export) throw new APIError('Export not found', 404);
    return res.data.export;
  }

  async listDisclosureExports(propertyId: string): Promise<import('@/types').PermitDisclosureExportItem[]> {
    const res = await this.get<{ exports: import('@/types').PermitDisclosureExportItem[] }>(`/api/properties/${propertyId}/permits/disclosure`);
    return res.data?.exports ?? [];
  }

  // ─── Inspection Hub ──────────────────────────────────────────────────────────

  async getInspectionHub(propertyId: string): Promise<import('@/types').InspectionHubSummary> {
    const res = await this.get<import('@/types').InspectionHubSummary>(`/api/properties/${propertyId}/inspection-hub`);
    if (!res.data) throw new APIError('Failed to load inspection hub', 500);
    return res.data;
  }

  async listInspectionReports(propertyId: string): Promise<import('@/types').InspectionReportSummary[]> {
    const res = await this.get<{ reports: import('@/types').InspectionReportSummary[] }>(`/api/properties/${propertyId}/inspection-hub/reports`);
    return res.data?.reports ?? [];
  }

  async uploadInspectionReport(
    propertyId: string,
    file: File,
    meta: {
      reportType: string;
      inspectionDate: string;
      inspectorName?: string;
      inspectorLicense?: string;
      inspectorCompany?: string;
    },
  ): Promise<{ reportId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('reportType', meta.reportType);
    formData.append('inspectionDate', meta.inspectionDate);
    if (meta.inspectorName) formData.append('inspectorName', meta.inspectorName);
    if (meta.inspectorLicense) formData.append('inspectorLicense', meta.inspectorLicense);
    if (meta.inspectorCompany) formData.append('inspectorCompany', meta.inspectorCompany);
    const res = await this.formDataRequest<{ data: { reportId: string } }>(
      `/api/properties/${propertyId}/inspection-hub/reports`,
      formData,
    );
    const reportId = (res as any)?.data?.reportId ?? (res as any)?.reportId;
    if (!reportId) throw new APIError('Upload failed', 500);
    return { reportId };
  }

  async getInspectionReport(propertyId: string, reportId: string): Promise<import('@/types').InspectionReportSummary> {
    const res = await this.get<{ report: import('@/types').InspectionReportSummary }>(`/api/properties/${propertyId}/inspection-hub/reports/${reportId}`);
    if (!res.data?.report) throw new APIError('Report not found', 404);
    return res.data.report;
  }

  async archiveInspectionReport(propertyId: string, reportId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/inspection-hub/reports/${reportId}`);
  }

  async listInspectionFindings(propertyId: string, reportId: string, grouped = false): Promise<import('@/types').InspectionFinding[] | Record<string, import('@/types').InspectionFinding[]>> {
    const res = await this.get<{ findings: import('@/types').InspectionFinding[] | Record<string, import('@/types').InspectionFinding[]> }>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/findings${grouped ? '?grouped=true' : ''}`,
    );
    return res.data?.findings ?? (grouped ? {} : []);
  }

  async updateInspectionFinding(
    propertyId: string,
    reportId: string,
    findingId: string,
    patch: Partial<Pick<import('@/types').InspectionFinding, 'homeSystem' | 'subsystem' | 'location' | 'conditionRating' | 'severity' | 'aiInterpretation' | 'estimatedCostCentsLow' | 'estimatedCostCentsHigh'>>,
  ): Promise<import('@/types').InspectionFinding> {
    const res = await this.patch<{ finding: import('@/types').InspectionFinding }>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/findings/${findingId}`,
      patch,
    );
    if (!res.data?.finding) throw new APIError('Failed to update finding', 500);
    return res.data.finding;
  }

  async dismissInspectionFinding(propertyId: string, reportId: string, findingId: string, reason?: string): Promise<void> {
    await this.post(`/api/properties/${propertyId}/inspection-hub/reports/${reportId}/findings/${findingId}/dismiss`, { reason });
  }

  async getInspectionWriteBackPreview(propertyId: string, reportId: string): Promise<import('@/types').InspectionWriteBackPreview> {
    const res = await this.get<{ preview: import('@/types').InspectionWriteBackPreview }>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/write-back-preview`,
    );
    if (!res.data?.preview) throw new APIError('Failed to load preview', 500);
    return res.data.preview;
  }

  async confirmInspectionReport(propertyId: string, reportId: string): Promise<{ writeBackCount: number }> {
    const res = await this.post<{ writeBackCount: number }>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/confirm`,
      {},
    );
    return res.data ?? { writeBackCount: 0 };
  }

  async listInspectionOpenItems(
    propertyId: string,
    params?: { severity?: string; homeSystem?: string; reportId?: string; limit?: number; cursor?: string },
  ): Promise<{ findings: import('@/types').InspectionFinding[]; hasMore: boolean; nextCursor?: string }> {
    const res = await this.get<{ findings: import('@/types').InspectionFinding[]; hasMore: boolean; nextCursor?: string }>(
      `/api/properties/${propertyId}/inspection-hub/open-items`,
      params as Record<string, any>,
    );
    return res.data ?? { findings: [], hasMore: false };
  }

  async resolveInspectionFinding(
    propertyId: string,
    findingId: string,
    data: {
      resolutionMethod: import('@/types').InspectionResolutionMethod;
      resolutionNotes?: string;
      resolutionCostCents?: number;
      warrantyExpiresAt?: string;
    },
  ): Promise<import('@/types').InspectionFinding> {
    const res = await this.post<{ finding: import('@/types').InspectionFinding }>(
      `/api/properties/${propertyId}/inspection-hub/findings/${findingId}/resolve`,
      data,
    );
    if (!res.data?.finding) throw new APIError('Failed to resolve finding', 500);
    return res.data.finding;
  }

  async compareInspectionReports(propertyId: string, reportAId: string, reportBId: string) {
    const res = await this.get<any>(
      `/api/properties/${propertyId}/inspection-hub/compare`,
      { params: { reportA: reportAId, reportB: reportBId } },
    );
    return res.data;
  }

  async generateNegotiationPackage(
    propertyId: string,
    reportId: string,
    findingIds: string[],
    decisions: Record<string, 'negotiate_credit' | 'request_repair' | 'accept_as_is'>,
  ): Promise<import('@/types').InspectionNegotiationPackage> {
    const res = await this.post<import('@/types').InspectionNegotiationPackage>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/negotiation-package`,
      { findingIds, decisions },
    );
    if (!res.data) throw new APIError('Failed to generate package', 500);
    return res.data;
  }

  async getFixDisclosureDecisions(propertyId: string, reportId: string): Promise<import('@/types').InspectionFixDisclosureItem[]> {
    const res = await this.get<{ findings: import('@/types').InspectionFixDisclosureItem[] }>(
      `/api/properties/${propertyId}/inspection-hub/reports/${reportId}/fix-disclose`,
    );
    return res.data?.findings ?? [];
  }

  async saveFixDisclosureDecisions(
    propertyId: string,
    reportId: string,
    decisions: Array<{
      findingId: string;
      decision: 'FIX' | 'DISCLOSE_PRICE_ADJUST' | 'DISCLOSE_CREDIT';
      estimatedFixCostCents?: number;
      sellerNote?: string;
    }>,
  ): Promise<void> {
    await this.patch(`/api/properties/${propertyId}/inspection-hub/reports/${reportId}/fix-disclose`, { decisions });
  }

  // ── Project Tracker ──────────────────────────────────────────────────────────

  async listProjects(propertyId: string): Promise<import('@/types').ProjectRecord[]> {
    const res = await this.get<import('@/types').ProjectRecord[]>(`/api/properties/${propertyId}/projects`);
    return res.data ?? [];
  }

  async createProject(propertyId: string, payload: {
    name: string;
    projectType: string;
    contractorName?: string;
    contractorLicense?: string;
    contractorPhone?: string;
    contractorEmail?: string;
    contractorId?: string;
    description?: string;
    sourceType?: 'PRICE_FINALIZATION' | 'BOOKING' | 'GUIDANCE' | 'MANUAL';
    guidanceJourneyId?: string;
    inventoryItemId?: string;
    priceFinalizationId?: string;
    bookingId?: string;
    executionPath?: 'REPAIR' | 'REPLACEMENT';
    fulfillmentMode?: 'PROVIDER' | 'DIY';
    fundingMode?: 'SELF_PAID' | 'COVERED' | 'MIXED';
    complexity?: 'MINOR' | 'MAJOR';
    recommendationVersion?: string;
    providerRankingRationale?: string;
    commercialDisclosure?: {
      involvesCommercialAction: boolean;
      relationshipType: 'NONE' | 'SPONSORED' | 'REFERRAL_FEE' | 'COMMISSION' | 'OWNED' | 'AFFILIATE' | 'OTHER';
      compensationMayOccur: boolean;
      rankingInfluenced: boolean;
      summary: string;
      selectionCriteria: string[];
      nonCommercialAlternatives: string[];
    };
    contractAmountCents: number;
    startDate: string;
    expectedEndDate?: string;
    homeSystemsAffected?: string[];
    serviceCategory?: string;
    contractDocumentKey?: string;
    milestones?: Array<{ name: string; position: number; milestoneType?: string; scheduledDate?: string; requiresPhotoEvidence?: boolean }>;
  }): Promise<import('@/types').ProjectRecord> {
    const res = await this.post<import('@/types').ProjectRecord>(`/api/properties/${propertyId}/projects`, payload);
    if (!res.data) throw new APIError('Failed to create project', 500);
    return res.data;
  }

  async getProject(propertyId: string, projectId: string): Promise<import('@/types').ProjectRecord> {
    const res = await this.get<import('@/types').ProjectRecord>(`/api/properties/${propertyId}/projects/${projectId}`);
    if (!res.data) throw new APIError('Project not found', 404);
    return res.data;
  }

  async getProjectProviderReadiness(propertyId: string, providerId: string, serviceCategory: string): Promise<{
    provider: { id: string; businessName: string; status: string };
    serviceCategory: string;
    jurisdiction: string;
    jurisdictionStatus: 'VERIFIED' | 'INCOMPLETE';
    checkedAt: string;
    missingCredentialTypes: string[];
    requirements: Array<{ credentialType: string; stateCode: string | null; isRequired: boolean }>;
    credentials: Array<{ type: string; serviceCategories: string[]; issueDate: string | null; expiryDate: string | null; verifiedAt: string | null; verificationSource: string }>;
  }> {
    const params = new URLSearchParams({ serviceCategory });
    const res = await this.get<any>(`/api/properties/${propertyId}/projects/provider-readiness/${providerId}?${params}`);
    if (!res.data) throw new APIError('Failed to load provider readiness', 500);
    return res.data;
  }

  async completeMinorWork(propertyId: string, payload: {
    guidanceJourneyId: string;
    inventoryItemId: string;
    title: string;
    executionPath: 'REPAIR' | 'REPLACEMENT';
    fulfillmentMode: 'PROVIDER' | 'DIY';
    providerName?: string;
    providerRankingRationale?: string;
    commercialDisclosure?: {
      involvesCommercialAction: boolean;
      relationshipType: 'NONE' | 'SPONSORED' | 'REFERRAL_FEE' | 'COMMISSION' | 'OWNED' | 'AFFILIATE' | 'OTHER';
      compensationMayOccur: boolean;
      rankingInfluenced: boolean;
      summary: string;
      selectionCriteria: string[];
      nonCommercialAlternatives: string[];
    };
    actualEndDate?: string;
    actualCostCents: number;
    recommendationComprehensionConfirmed: true;
    notes?: string;
    proofDocuments?: Array<{ proofKey: string; documentId?: string; type: 'INVOICE' | 'PERMIT' | 'PHOTO' | 'OTHER'; name: string; fileUrl?: string; fileSize?: number; mimeType?: string; kind?: 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'PDF' | 'BEFORE' | 'AFTER' | 'OTHER' }>;
  }): Promise<{ homeEventId: string }> {
    const res = await this.post<{ homeEventId: string }>(`/api/properties/${propertyId}/projects/minor-completion`, payload);
    if (!res.data) throw new APIError('Failed to record minor work', 500);
    return res.data;
  }

  async updateProject(propertyId: string, projectId: string, patch: Partial<import('@/types').ProjectRecord>): Promise<import('@/types').ProjectRecord> {
    const res = await this.patch<import('@/types').ProjectRecord>(`/api/properties/${propertyId}/projects/${projectId}`, patch);
    if (!res.data) throw new APIError('Failed to update project', 500);
    return res.data;
  }

  async cancelProject(propertyId: string, projectId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/projects/${projectId}`);
  }

  async getMilestoneTemplates(projectType: string): Promise<Array<{ name: string; position: number; requiresPhotoEvidence: boolean }>> {
    const res = await this.get<{ templates: Array<{ name: string; position: number; requiresPhotoEvidence: boolean }> }>(`/api/projects/milestone-templates`, { params: { projectType } });
    return res.data?.templates ?? [];
  }

  // Milestones
  async listMilestones(propertyId: string, projectId: string): Promise<import('@/types').ProjectMilestone[]> {
    const res = await this.get<import('@/types').ProjectMilestone[]>(`/api/properties/${propertyId}/projects/${projectId}/milestones`);
    return res.data ?? [];
  }

  async createMilestone(propertyId: string, projectId: string, payload: {
    name: string; description?: string; milestoneType?: string; scheduledDate?: string;
    requiresPhotoEvidence?: boolean; position?: number; dependsOnMilestoneId?: string; linkedPermitMilestoneId?: string;
  }): Promise<import('@/types').ProjectMilestone> {
    const res = await this.post<import('@/types').ProjectMilestone>(`/api/properties/${propertyId}/projects/${projectId}/milestones`, payload);
    if (!res.data) throw new APIError('Failed to create milestone', 500);
    return res.data;
  }

  async updateMilestone(propertyId: string, projectId: string, milestoneId: string, patch: object): Promise<import('@/types').ProjectMilestone> {
    const res = await this.patch<import('@/types').ProjectMilestone>(`/api/properties/${propertyId}/projects/${projectId}/milestones/${milestoneId}`, patch);
    if (!res.data) throw new APIError('Failed to update milestone', 500);
    return res.data;
  }

  async completeMilestone(propertyId: string, projectId: string, milestoneId: string, payload?: { completionNotes?: string; actualCompletedDate?: string }): Promise<import('@/types').ProjectMilestone> {
    const res = await this.post<import('@/types').ProjectMilestone>(`/api/properties/${propertyId}/projects/${projectId}/milestones/${milestoneId}/complete`, payload ?? {});
    if (!res.data) throw new APIError('Failed to complete milestone', 500);
    return res.data;
  }

  async deleteMilestone(propertyId: string, projectId: string, milestoneId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/projects/${projectId}/milestones/${milestoneId}`);
  }

  // Payments
  async listPayments(propertyId: string, projectId: string): Promise<import('@/types').ProjectPayment[]> {
    const res = await this.get<import('@/types').ProjectPayment[]>(`/api/properties/${propertyId}/projects/${projectId}/payments`);
    return res.data ?? [];
  }

  async createPayment(propertyId: string, projectId: string, payload: {
    description: string; amountCents: number; triggerType?: string;
    triggerMilestoneId?: string; dueDate?: string; notes?: string;
  }): Promise<import('@/types').ProjectPayment> {
    const res = await this.post<import('@/types').ProjectPayment>(`/api/properties/${propertyId}/projects/${projectId}/payments`, payload);
    if (!res.data) throw new APIError('Failed to create payment', 500);
    return res.data;
  }

  async updatePayment(propertyId: string, projectId: string, paymentId: string, patch: object): Promise<import('@/types').ProjectPayment> {
    const res = await this.patch<import('@/types').ProjectPayment>(`/api/properties/${propertyId}/projects/${projectId}/payments/${paymentId}`, patch);
    if (!res.data) throw new APIError('Failed to update payment', 500);
    return res.data;
  }

  async markPaymentPaid(propertyId: string, projectId: string, paymentId: string, payload?: { paidDate?: string; paymentMethod?: string; receiptDocumentKey?: string }): Promise<import('@/types').ProjectPayment> {
    const res = await this.post<import('@/types').ProjectPayment>(`/api/properties/${propertyId}/projects/${projectId}/payments/${paymentId}/mark-paid`, payload ?? {});
    if (!res.data) throw new APIError('Failed to mark payment paid', 500);
    return res.data;
  }

  async deletePayment(propertyId: string, projectId: string, paymentId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/projects/${projectId}/payments/${paymentId}`);
  }

  // Change Orders
  async listChangeOrders(propertyId: string, projectId: string): Promise<import('@/types').ProjectChangeOrder[]> {
    const res = await this.get<import('@/types').ProjectChangeOrder[]>(`/api/properties/${propertyId}/projects/${projectId}/change-orders`);
    return res.data ?? [];
  }

  async createChangeOrder(propertyId: string, projectId: string, payload: {
    title: string; description: string; category: string; costDeltaCents: number;
    proposedByName: string; notes?: string;
  }): Promise<import('@/types').ProjectChangeOrder> {
    const res = await this.post<import('@/types').ProjectChangeOrder>(`/api/properties/${propertyId}/projects/${projectId}/change-orders`, payload);
    if (!res.data) throw new APIError('Failed to create change order', 500);
    return res.data;
  }

  async approveChangeOrder(propertyId: string, projectId: string, changeOrderId: string): Promise<import('@/types').ProjectChangeOrder> {
    const res = await this.post<import('@/types').ProjectChangeOrder>(`/api/properties/${propertyId}/projects/${projectId}/change-orders/${changeOrderId}/approve`, {});
    if (!res.data) throw new APIError('Failed to approve change order', 500);
    return res.data;
  }

  async rejectChangeOrder(propertyId: string, projectId: string, changeOrderId: string): Promise<import('@/types').ProjectChangeOrder> {
    const res = await this.post<import('@/types').ProjectChangeOrder>(`/api/properties/${propertyId}/projects/${projectId}/change-orders/${changeOrderId}/reject`, {});
    if (!res.data) throw new APIError('Failed to reject change order', 500);
    return res.data;
  }

  async voidChangeOrder(propertyId: string, projectId: string, changeOrderId: string): Promise<import('@/types').ProjectChangeOrder> {
    const res = await this.post<import('@/types').ProjectChangeOrder>(`/api/properties/${propertyId}/projects/${projectId}/change-orders/${changeOrderId}/void`, {});
    if (!res.data) throw new APIError('Failed to void change order', 500);
    return res.data;
  }

  // Progress Log
  async listProjectLogEntries(propertyId: string, projectId: string, params?: {
    milestoneId?: string; entryType?: string; from?: string; to?: string; limit?: number; cursor?: string;
  }): Promise<{ entries: import('@/types').ProjectProgressLog[]; nextCursor: string | null }> {
    const res = await this.get<{ entries: import('@/types').ProjectProgressLog[]; nextCursor: string | null }>(
      `/api/properties/${propertyId}/projects/${projectId}/log`, params as Record<string, any>
    );
    return res.data ?? { entries: [], nextCursor: null };
  }

  async createProjectLogEntry(propertyId: string, projectId: string, payload: {
    entryDate: string; entryType: string; notes?: string; photoKeys?: string[];
    milestoneId?: string; roomId?: string; materialType?: string; materialBrand?: string;
    materialModel?: string; materialColor?: string; materialSupplier?: string; materialQuantity?: string;
  }): Promise<import('@/types').ProjectProgressLog> {
    const res = await this.post<import('@/types').ProjectProgressLog>(`/api/properties/${propertyId}/projects/${projectId}/log`, payload);
    if (!res.data) throw new APIError('Failed to create log entry', 500);
    return res.data;
  }

  async deleteProjectLogEntry(propertyId: string, projectId: string, logId: string): Promise<void> {
    await this.delete(`/api/properties/${propertyId}/projects/${projectId}/log/${logId}`);
  }

  // Issues
  async listProjectIssues(propertyId: string, projectId: string): Promise<import('@/types').ProjectIssue[]> {
    const res = await this.get<import('@/types').ProjectIssue[]>(`/api/properties/${propertyId}/projects/${projectId}/issues`);
    return res.data ?? [];
  }

  async createProjectIssue(propertyId: string, projectId: string, payload: {
    title: string; description: string; severity: string; category: string;
    blocksPayment?: boolean; attachmentKeys?: string[];
  }): Promise<import('@/types').ProjectIssue> {
    const res = await this.post<import('@/types').ProjectIssue>(`/api/properties/${propertyId}/projects/${projectId}/issues`, payload);
    if (!res.data) throw new APIError('Failed to create issue', 500);
    return res.data;
  }

  async updateProjectIssue(propertyId: string, projectId: string, issueId: string, patch: object): Promise<import('@/types').ProjectIssue> {
    const res = await this.patch<import('@/types').ProjectIssue>(`/api/properties/${propertyId}/projects/${projectId}/issues/${issueId}`, patch);
    if (!res.data) throw new APIError('Failed to update issue', 500);
    return res.data;
  }

  async resolveProjectIssue(propertyId: string, projectId: string, issueId: string, resolutionNotes: string): Promise<import('@/types').ProjectIssue> {
    const res = await this.post<import('@/types').ProjectIssue>(`/api/properties/${propertyId}/projects/${projectId}/issues/${issueId}/resolve`, { resolutionNotes });
    if (!res.data) throw new APIError('Failed to resolve issue', 500);
    return res.data;
  }

  // Completion
  async getProjectCompletionChecklist(propertyId: string, projectId: string): Promise<import('@/types').ProjectCompletionChecklist> {
    const res = await this.get<import('@/types').ProjectCompletionChecklist>(`/api/properties/${propertyId}/projects/${projectId}/completion/checklist`);
    if (!res.data) throw new APIError('Failed to load checklist', 500);
    return res.data;
  }

  async confirmProjectCompletion(propertyId: string, projectId: string, payload: {
    actualEndDate?: string;
    outcomeStatus: 'VERIFIED_SUCCESS' | 'INCOMPLETE' | 'FAILED' | 'DISPUTED' | 'DELAYED' | 'UNSAFE';
    commissioningResult: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED';
    functionalVerificationResult: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED';
    safetyCheckResult: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED';
    inspectionResult: 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED';
    unresolvedExceptions: Array<{ type: 'QUALITY' | 'SAFETY' | 'SCOPE' | 'PERMIT' | 'FUNCTIONAL' | 'OTHER'; summary: string; blocksClosure: boolean }>;
    actualCostCents?: number;
    providerOutcome: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NOT_APPLICABLE';
    recommendationOverridden?: boolean;
    recommendationComprehensionConfirmed: boolean;
    modelNumber?: string;
    serialNumber?: string;
    proofDocuments?: Array<{ proofKey: string; documentId?: string; type: 'INVOICE' | 'PERMIT' | 'PHOTO' | 'OTHER'; name: string; fileUrl?: string; fileSize?: number; mimeType?: string; kind?: 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'PDF' | 'BEFORE' | 'AFTER' | 'OTHER' }>;
    contractorRatingQuality?: number;
    contractorRatingTimeline?: number;
    contractorRatingComms?: number;
    contractorRatingBudget?: number;
    contractorReviewText?: string;
    warrantyPeriodMonths?: number;
    warrantyDocumentKey?: string;
    completionRecordKey?: string;
    nextMaintenanceDate?: string;
    nextInspectionDate?: string;
    replacementHorizonDate?: string;
    followUpDate?: string;
  }): Promise<{ project: import('@/types').ProjectRecord }> {
    const res = await this.post<{ project: import('@/types').ProjectRecord }>(`/api/properties/${propertyId}/projects/${projectId}/completion/confirm`, payload);
    if (!res.data) throw new APIError('Failed to confirm completion', 500);
    return res.data;
  }
  // ── Neighbourhood Trust Network ──────────────────────────────────────────

  async getNeighbourhoodZipInfo(): Promise<APIResponse<import('@/types').NeighbourhoodZipInfo>> {
    return this.request('/api/neighbourhood/zip-info');
  }

  async getNeighbourhoodFeed(params?: { limit?: number }): Promise<APIResponse<{ feed: import('@/types').NeighbourhoodFeedEntry[]; zipCode: string }>> {
    const q = params?.limit ? `?limit=${params.limit}` : '';
    return this.request(`/api/neighbourhood/feed${q}`);
  }

  async getNeighbourhoodProviders(params?: { category?: string; limit?: number }): Promise<APIResponse<{ providers: import('@/types').NeighbourhoodProvider[]; zipCode: string }>> {
    const p = new URLSearchParams();
    if (params?.category) p.append('category', params.category);
    if (params?.limit) p.append('limit', String(params.limit));
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/api/neighbourhood/providers${q}`);
  }

  async submitNeighbourhoodEndorsement(
    bookingId: string,
    payload: { wouldHireAgain: boolean; highlightTags: string[]; anonymousToNeighbors?: boolean }
  ): Promise<APIResponse<{ endorsement: import('@/types').NeighbourhoodEndorsement }>> {
    return this.request(`/api/bookings/${bookingId}/endorse`, { method: 'POST', body: payload });
  }

  async getNeighbourhoodEndorsement(
    bookingId: string
  ): Promise<APIResponse<{ endorsement: import('@/types').NeighbourhoodEndorsement | null }>> {
    return this.request(`/api/bookings/${bookingId}/endorsement`);
  }

  async createBuyerShareToken(
    propertyId: string
  ): Promise<APIResponse<{ shareUrl: string; expiresAt: string; token: string }>> {
    return this.request(`/api/properties/${propertyId}/home-score/share`, { method: 'POST' });
  }

  async revokeBuyerShareToken(propertyId: string): Promise<APIResponse<void>> {
    return this.request(`/api/properties/${propertyId}/home-score/share/revoke`, { method: 'POST' });
  }

  async getBuyerReportPreview(propertyId: string): Promise<APIResponse<{ report: import('@/types').BuyerReportData }>> {
    return this.request(`/api/properties/${propertyId}/home-score/buyer-preview`);
  }
}

// Export singleton instance
export const api = new APIClient(API_BASE_URL);
