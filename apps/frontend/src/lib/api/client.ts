// apps/frontend/src/lib/api/client.ts

import {
  APIResponse,
  LoginInput,
  LoginResponse,
  RegisterInput,
  RegisterResponse,
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
} from '@/types';

// REMOVED: import { RiskReportSummary } from '@/app/(dashboard)/dashboard/types'; as it was not defined or needed.

// FIX 1: Define a custom Error class to carry API error messages and status
class APIError extends Error {
  constructor(message: string, public status: number | string = 'API_ERROR') {
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
  text: string; // The backend returns the model's text in the 'text' field
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * API Client for Contract to Cozy Backend
 * Uses a class structure for token refresh logic and state management.
 */
class APIClient {
  private baseURL: string;

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

  // --- HELPER TO PROCESS WAITING REQUESTS ---
  private processFailedQueue(error: Error | null, token: string | null = null) {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        // Re-run the original request with the new token
        const newHeaders = { ...prom.headers, 'Authorization': `Bearer ${token}` };
        fetch(`${this.baseURL}${prom.endpoint}`, { ...prom.options, headers: newHeaders })
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
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  /**
   * Set auth token in localStorage
   */
  private setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('accessToken', token);
  }

  /**
   * Remove auth token from localStorage
   */
  private removeToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  /**
   * Make HTTP request
   */
// apps/frontend/src/lib/api/client.ts

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const token = this.getToken();
    
    // Ensure body is handled as JSON string if present
    let body = options.body;
    if (options.body && typeof options.body !== 'string') {
        body = JSON.stringify(options.body);
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        body,
        headers,
      });

      // --- TOKEN REFRESH LOGIC ---
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        if (this.isRefreshing) {
          return new Promise((resolve, reject) => {
            const cleanHeaders = { ...headers };
            delete cleanHeaders['Authorization']; 
            this.failedQueue.push({ resolve, reject, endpoint, options, headers: cleanHeaders });
          });
        }

        this.isRefreshing = true;
        const refreshResponse = await this.refreshToken();

        if (refreshResponse.success) {
          const newToken = refreshResponse.data.accessToken;
          this.isRefreshing = false;
          this.processFailedQueue(null, newToken);

          const newHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
          response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            body,
            headers: newHeaders,
          });
        } else {
          this.isRefreshing = false;
          const error = new APIError('Session expired. Please log in again.', 401);
          this.processFailedQueue(error, null);
          this.removeToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
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
        throw new APIError(errorMessage, response.status);
      }

      // --- SUCCESS HANDLING ---
      if (response.status === 204 || response.status === 205) {
          return { success: true, data: {} as T, message: "No Content" } as APIResponse<T>;
      }

      return data; 

    } catch (error) {
      // Critical: Ensure every error path results in a thrown error so the UI catch/finally blocks run
      console.error('API Request Error:', error);
      if (error instanceof APIError) {
          throw error;
      }
      // Convert generic network errors (like DNS failure or Timeout) into APIErrors
      throw new APIError('Network error. Please check your connection.', 'NETWORK');
    }
  }

  private async formDataRequest<T>(
    endpoint: string,
    formData: FormData
  ): Promise<APIResponse<T>> {
    const token = this.getToken();
    
    const headers: Record<string, string> = {};
    
    // Authorization header is required
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST', // File uploads are typically POST
            // Do NOT set Content-Type header; let the browser set it for FormData
            headers,
            body: formData,
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          const errorMessage = (data && data.error) || (data && data.message) || `HTTP Error: ${response.status}`;
          // FIX: Throw error
          throw new APIError(errorMessage, response.status);
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

  // ==========================================================================
  // AUTH ENDPOINTS 
  // ==========================================================================

  /**
   * Register new user
   */
  async register(input: RegisterInput): Promise<APIResponse<RegisterResponse>> {
    return this.request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: input as unknown as BodyInit,
    });
  }

  /**
   * Login user
   */
  async login(input: LoginInput): Promise<APIResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: input as unknown as BodyInit,
    });

    if (response.success) {
      this.setToken(response.data.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('refreshToken', response.data.refreshToken);
      }
    }

    return response;
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
    }
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
  async refreshToken(): Promise<APIResponse<{ accessToken: string; refreshToken: string }>> {
    const refreshToken = typeof window !== 'undefined' 
      ? localStorage.getItem('refreshToken') 
      : null;

    if (!refreshToken) {
      return {
        success: false,
        message: 'No refresh token available',
      };
    }

    const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();

    if (!response.ok) {
        return {
            success: false,
            message: data.message || 'Failed to refresh token',
        };
    }

    // Rely on backend sending { success: true/false, data: { ... } }
    if (data.success) {
      this.setToken(data.data.accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('refreshToken', data.data.refreshToken);
      }
    }
    return data;
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
      body: data as unknown as BodyInit,
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
      body: payload as unknown as BodyInit,
    });
  }
  // ==========================================================================
  // PROVIDER ENDPOINTS 
  // ==========================================================================

  /**
   * Search providers
   */
  async searchProviders(params: {
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    category?: string;
    minRating?: number;
    page?: number;
    limit?: number;
  }): Promise<APIResponse<{
    providers: Provider[];
    pagination: any;
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

  // ==========================================================================
  // BOOKING ENDPOINTS 
  // ==========================================================================
  async createBooking(input: CreateBookingInput): Promise<APIResponse<Booking>> {
    return this.request<Booking>('/api/bookings', {
      method: 'POST',
      body: input as unknown as BodyInit,
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
      Object.entries(params).forEach(([key, value]) => {
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
      body: updates as unknown as BodyInit,
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
      body: data as unknown as BodyInit,
    });
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: string, reason: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      body: { reason } as unknown as BodyInit,
    });
  }

  // ==========================================================================
  // PROPERTY ENDPOINTS 
  // ==========================================================================
  async getProperties(): Promise<APIResponse<{ properties: Property[] }>> {
    return this.request('/api/properties');
  }

  /**
   * Get a single property by ID
   */
  async getProperty(id: string): Promise<APIResponse<Property>> {
    return this.request(`/api/properties/${id}`);
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
  }): Promise<APIResponse<Property>> {
    return this.request('/api/properties', {
      method: 'POST',
      body: data as unknown as BodyInit,
    });
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
      propertyType?: string; // Expects enum string
      propertySize?: number;
      yearBuilt?: number;
      
      // Layer 2 - Advanced Fields (Migrated and New)
      bedrooms?: number;
      bathrooms?: number;
      ownershipType?: string; // Expects enum string
      occupantsCount?: number;
      heatingType?: string;
      coolingType?: string;
      waterHeaterType?: string;
      roofType?: string;
      hvacInstallYear?: number;
      waterHeaterInstallYear?: number;
      roofReplacementYear?: number;
      foundationType?: string;
      sidingType?: string;
      electricalPanelAge?: number;
      lotSize?: number;
      hasIrrigation?: boolean;
      hasDrainageIssues?: boolean;
      hasSmokeDetectors?: boolean;
      hasCoDetectors?: boolean;
      hasSecuritySystem?: boolean;
      hasFireExtinguisher?: boolean;
      applianceAges?: any;
    }
  ): Promise<APIResponse<Property>> {
    return this.request(`/api/properties/${id}`, {
      method: 'PUT',
      body: data as unknown as BodyInit,
    });
  }

  /**
   * Delete a property
   */
  async deleteProperty(id: string): Promise<APIResponse<void>> {
    return this.request(`/api/properties/${id}`, {
      method: 'DELETE',
    });
  }
    
  // ==========================================================================
  // CHECKLIST & MAINTENANCE ENDPOINTS (PHASE 3) 
  // ==========================================================================

  /**
   * Fetches the list of available maintenance task templates.
   */
  async getMaintenanceTemplates(): Promise<
    APIResponse<{ templates: MaintenanceTaskTemplate[] }>
  > {
    return this.request('/api/maintenance-templates');
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
      body: data as unknown as BodyInit,
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
      body: data as unknown as BodyInit,
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
      body: data as unknown as BodyInit,
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
      body: data as unknown as BodyInit,
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
      segment: string;
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
    return this.request<Expense>('/api/home-management/expenses', { method: 'POST', body: data as unknown as BodyInit });
  }
  
  async listExpenses(propertyId?: string): Promise<APIResponse<{ expenses: Expense[] }>> {
      const query = propertyId ? `?propertyId=${propertyId}` : '';
      return this.request<{ expenses: Expense[] }>(`/api/home-management/expenses${query}`);
  }

  async updateExpense(expenseId: string, data: UpdateExpenseInput): Promise<APIResponse<Expense>> {
    return this.request<Expense>(`/api/home-management/expenses/${expenseId}`, { method: 'PATCH', body: data as unknown as BodyInit });
  }

  async deleteExpense(expenseId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/expenses/${expenseId}`, { method: 'DELETE' });
  }
  // --- WARRANTIES ---
  async createWarranty(data: CreateWarrantyInput): Promise<APIResponse<Warranty>> {
    return this.request<Warranty>('/api/home-management/warranties', { method: 'POST', body: data as unknown as BodyInit });
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
    return this.request<Warranty>(`/api/home-management/warranties/${warrantyId}`, { method: 'PATCH', body: data as unknown as BodyInit });
  }

  async deleteWarranty(warrantyId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/warranties/${warrantyId}`, { method: 'DELETE' });
  }

  // --- INSURANCE POLICIES ---
  async createInsurancePolicy(data: CreateInsurancePolicyInput): Promise<APIResponse<InsurancePolicy>> {
    return this.request<InsurancePolicy>('/api/home-management/insurance-policies', { method: 'POST', body: data as unknown as BodyInit });
  }

  async listInsurancePolicies(propertyId?: string): Promise<APIResponse<{ policies: InsurancePolicy[] }>> {
    const query = propertyId ? `?propertyId=${propertyId}` : '';
    return this.request<{ policies: InsurancePolicy[] }>('/api/home-management/insurance-policies' + query);
  }

  async updateInsurancePolicy(policyId: string, data: UpdateInsurancePolicyInput): Promise<APIResponse<InsurancePolicy>> {
    return this.request<InsurancePolicy>(`/api/home-management/insurance-policies/${policyId}`, { method: 'PATCH', body: data as unknown as BodyInit });
  }

  async deleteInsurancePolicy(policyId: string): Promise<APIResponse<void>> {
    return this.request<void>(`/api/home-management/insurance-policies/${policyId}`, { method: 'DELETE' });
  }

  // ==========================================================================
  // NEW DOCUMENT ENDPOINT (ADDED)
  // ==========================================================================

  async uploadDocument(file: File, data: DocumentUploadInput): Promise<APIResponse<Document>> {
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
    const token = this.getToken();
    
    if (!token) {
      throw new APIError("Authentication required.", 401);
    }

    // Direct fetch to bypass the request() wrapper
    const response = await fetch(`${this.baseURL}/api/risk/report/${propertyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
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
      financialExposureTotal: parseFloat(rawReport.financialExposureTotal as unknown as string), 
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
            financialExposureTotal: parseFloat(response.data.financialExposureTotal.toString()),
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
          financialExposureTotal: parseFloat(response.data.financialExposureTotal.toString()),
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
            financialExposureTotal: parseFloat(response.data.financialExposureTotal.toString()),
        };
        return processedData;
    } else if ((response as any).propertyId) {
        // Direct response format (what the backend actually returns)
        const directResponse = response as any as FinancialReportSummary;
        return {
            ...directResponse,
            financialExposureTotal: parseFloat(directResponse.financialExposureTotal.toString()),
        };
    }
    return null;
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
        actualInsuranceCost: parseFloat((rawReport as any).actualInsuranceCost.toString()), 
        actualUtilityCost: parseFloat((rawReport as any).actualUtilityCost.toString()), 
        actualWarrantyCost: parseFloat((rawReport as any).actualWarrantyCost.toString()), 
        marketAverageTotal: parseFloat((rawReport as any).marketAverageTotal.toString()), 
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
      body: {} as unknown as BodyInit,
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
      body: { providerProfileId } as unknown as BodyInit,
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
    const token = this.getToken();
    
    if (!token) {
        throw new APIError("Authentication required for PDF download.", 401);
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${this.baseURL}/api/risk/report/${propertyId}/pdf`, {
        method: 'GET',
        headers: headers,
    });

    if (!response.ok) {
        let errorMessage = 'Failed to download PDF.';
        try {
            // Attempt to read error message if provided as JSON, otherwise rely on status text
            const errorData = await response.json();
            errorMessage = errorData.message || response.statusText;
        } catch {
            errorMessage = response.statusText;
        }
        throw new APIError(errorMessage, response.status);
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
    message: string;
    resolution?: string;
    steps?: string[];
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
    const formData = new FormData();
    formData.append('file', file);
    formData.append('propertyId', propertyId);
    formData.append('autoCreateWarranty', autoCreateWarranty.toString());

    const token = this.getToken();
    if (!token) {
      throw new APIError('Authentication required', 401);
    }

    const response = await fetch(`${this.baseURL}/api/documents/analyze`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.message || 'Upload failed', response.status);
    }

    return response.json();
  }

  /**
   * List all documents
   */
  async listDocuments(propertyId?: string): Promise<APIResponse<{
    documents: Document[];
  }>> {
    const queryParams = propertyId ? `?propertyId=${propertyId}` : '';
    return this.request<{ documents: Document[] }>(`/api/documents${queryParams}`);
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
    
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    
    if (params?.category) {
      queryParams.append('category', params.category);
    }
  
    const query = queryParams.toString();
    const url = query
      ? `/api/v1/properties/${propertyId}/community/events?${query}`
      : `/api/v1/properties/${propertyId}/community/events`;
  
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
      body: { status } as unknown as BodyInit,
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
      } as unknown as BodyInit,
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
      body: preferences as unknown as BodyInit,
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
      } as unknown as BodyInit,
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
  /**
   * Upload and analyze inspection report PDF
   */
  async uploadInspectionReport(formData: FormData): Promise<APIResponse<any>> {
    return this.formDataRequest<any>('/api/inspection-reports/upload', formData);
  }
  /**
   * Get inspection report by ID
   */
  async getInspectionReport(reportId: string): Promise<APIResponse<any>> {
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
  async getUserProfile(): Promise<APIResponse<User & { homeownerProfile?: { id: string; segment: string } | null }>> {
    return this.request('/api/users/profile', {
      method: 'GET',
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
    orchestrationActionId?: string | null;
  }): Promise<APIResponse<ChecklistItem>> {
    return this.request<ChecklistItem>('/api/checklist/items', {
      method: 'POST',
      body: data as unknown as BodyInit,
    });
  }

  // ORCHESTRATION — Mark action as completed (CANONICAL)
  async markOrchestrationActionCompleted(
    propertyId: string,
    actionKey: string
  ): Promise<APIResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      `/api/orchestration/${propertyId}/actions/mark-completed`,
      {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          actionKey,
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
}

// Export singleton instance
export const api = new APIClient(API_BASE_URL);