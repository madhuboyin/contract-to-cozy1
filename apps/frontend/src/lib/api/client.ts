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
  propertyId?: string;
}

interface ChatResponse {
  text: string; // The backend returns the model's text in the 'text' field
}
// -----------------------------


// NOTE: Changed to API_BASE_URL to match common convention
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
    
    // The Authorization header is ONLY set if a token is found in localStorage
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // --- DEBUG LOG 1: Log Request Details ---
    const bodyPreview = typeof body === 'string' ? body.substring(0, 200) : null;
    console.log('API DEBUG: Sending Request:', {
        endpoint: `${this.baseURL}${endpoint}`,
        method: options.method || 'GET',
        headers: headers,
        bodyPreview: bodyPreview, 
    });
    // ----------------------------------------

    try {
      let response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        body, // Use the prepared JSON body
        headers,
      });

      // --- DEBUG LOG 2: Log Raw Response Status ---
      console.log('API DEBUG: Received Response Status:', response.status, 'for endpoint:', endpoint);
      // --------------------------------------------

      // --- START: MODIFIED LOGIC (Token Refresh) ---

      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        // Token expired or invalid, and it's not an auth endpoint
        
        if (this.isRefreshing) {
          // A refresh is already in progress. Add this request to the queue.
          return new Promise((resolve, reject) => {
            const cleanHeaders = { ...headers };
            delete cleanHeaders['Authorization']; 
            this.failedQueue.push({ resolve, reject, endpoint, options, headers: cleanHeaders });
          });
        }

        this.isRefreshing = true;
        
        const refreshResponse = await this.refreshToken();

        if (refreshResponse.success) {
          // Refresh was successful. 
          const newToken = refreshResponse.data.accessToken;
          this.isRefreshing = false;
          this.processFailedQueue(null, newToken);

          // Retry the original request with the new token
          const newHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
          response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            body,
            headers: newHeaders,
          });

        } else {
          // Refresh failed. Log user out.
          this.isRefreshing = false;
          const error = new Error('Session expired. Please log in again.');
          this.processFailedQueue(error, null);
          
          this.removeToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          // FIX: Throw error on session expiry instead of returning an error object
          throw new APIError('Session expired. Please log in again.', '401');
        }
      }

      // --- END: MODIFIED LOGIC (Token Refresh) ---


      // --- START: FIX FOR 204 AND BODY STREAM READ ERROR ---
      let data;
      let text = ''; 
      
      // FIX: Read the body once only if content is expected. This prevents the 'body stream already read' error.
      if (response.status !== 204 && response.status !== 205 && response.status !== 304) {
          text = await response.text();
      }

      if (text) {
        try {
            data = JSON.parse(text);
        } catch (e) {
            // FIX: Throw error for non-JSON body
            throw new APIError(`Server returned status ${response.status}. Body was not JSON.`, response.status);
        }
      }
      // --- END: FIX FOR 204 AND BODY STREAM READ ERROR ---
      
      // FIX 3: Critical Error Handling Logic (Replaced previous logic)

      // 3a. Check for generic non-OK response (e.g., 400, 404, 500)
      if (!response.ok) {
        const errorMessage = (data && data.error) || (data && data.message) || `HTTP Error: ${response.status}`;
        // CRITICAL FIX: THROW an error instead of returning a success: false object
        throw new APIError(errorMessage, response.status);
      }

      // 3b. Check for API logic failure (e.g., backend uses HTTP 200 but sends { success: false })
      if (data && data.success === false) {
          const errorMessage = data.message || (data.error && data.error.message) || 'Request failed due to business logic error.';
          // CRITICAL FIX: THROW an error for business logic failure
          throw new APIError(errorMessage, response.status); 
      }
      // --- END: FIX 3 ---


      // --- DEBUG LOG 3: Log Final Data ---
      console.log('API DEBUG: Final Response Data:', data);
      // -----------------------------------

      // If status was 204/205 (No Content), return explicit success with empty data
      if (response.status === 204 || response.status === 205) {
          return { success: true, data: {} as T, message: "No Content" } as APIResponse<T>;
      }

      // If HTTP 2xx and explicit { success: true } or no success field
      return data; 

    } catch (error) {
      console.error('API Request Error (Catch Block):', error);
      // FIX 4: Re-throw custom errors, otherwise throw generic network error
      if (error instanceof APIError) {
          throw error;
      }
      throw new APIError('Network error. Please check your connection.', 'NETWORK');
    }
  }

  /**
   * Make HTTP request specifically for multipart/form-data (NEW HELPER)
   */
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

    // --- DEBUG LOG 4: Log Form Data Request Details ---
    console.log('API DEBUG: Sending FormData Request:', {
        endpoint: `${this.baseURL}${endpoint}`,
        method: 'POST',
        headers: headers,
        bodyType: 'FormData',
    });
    // ----------------------------------------------------
    
    try {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST', // File uploads are typically POST
            // Do NOT set Content-Type header; let the browser set it for FormData
            headers,
            body: formData,
        });

        // --- DEBUG LOG 5: Log Raw Form Data Response Status ---
        console.log('API DEBUG: Received Form Data Response Status:', response.status, 'for endpoint:', endpoint);
        // --------------------------------------------------------

        const data = await response.json();

        // --- DEBUG LOG 6: Log Final Form Data ---
        console.log('API DEBUG: Final Form Data Response Data:', data);
        // ------------------------------------------

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
    
    // If a token is provided in the call, inject it directly into the headers
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

  /**
   * Sends a message to the secure backend Gemini proxy.
   */
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

  /**
   * Create booking
   */
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

  /**
   * Get all user properties
   */
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

  /**
   * List insurance policies
   * FIX: Added propertyId to the function signature
   */
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

  /**
   * Uploads a document and associates it with a parent entity.
   */
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

    /**
     * Lists all documents uploaded by the homeowner. (NEW)
     */
    async listDocuments(): Promise<APIResponse<{ documents: Document[] }>> {
      return this.request<{ documents: Document[] }>('/api/home-management/documents');
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
   * [ORIGINAL METHOD] Fetch the lightweight risk summary for the primary property
   */
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

  /**
   * Fetches the lightweight financial efficiency summary for the dashboard card.
   * Calls GET /api/v1/financial-efficiency/summary?propertyId=... 
   */
  async getFinancialReportSummary(propertyId: string): Promise<FinancialReportSummary | null> {
    const response = await this.request<FinancialReportSummary>(`/api/v1/financial-efficiency/summary?propertyId=${propertyId}`);

    if (response.success && response.data) {
        // Convert the financialExposureTotal (AC_Total) back to a number
        const processedData: FinancialReportSummary = {
            ...response.data,
            financialExposureTotal: parseFloat(response.data.financialExposureTotal.toString()),
        };
        return processedData;
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

  /**
   * Lists the authenticated homeowner's favorite providers.
   */
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

  /**
   * Generates and downloads the Risk Assessment Report as a PDF.
   * This is typically a premium feature.
   */
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

}

// Export singleton instance
export const api = new APIClient(API_BASE_URL);