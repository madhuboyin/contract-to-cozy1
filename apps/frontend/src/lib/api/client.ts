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
} from '@/types';

// NOTE: Changed to API_BASE_URL to match common convention, but using the provided API_URL environment variable check
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
        // Here, options.body is the plain JS object, so we stringify it.
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
    
    // If the caller passed an Authorization header directly in options (e.g., in getCurrentUser), 
    // it will overwrite the localStorage token if needed. This relies on the spread operator above.

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

      // --- START: MODIFIED LOGIC (Token Refresh and Response Handling) ---

      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        // Token expired or invalid, and it's not an auth endpoint
        
        if (this.isRefreshing) {
          // A refresh is already in progress. Add this request to the queue.
          return new Promise((resolve, reject) => {
            // NOTE: Store the options without the potentially expired token header
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
          // Process all waiting requests
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
          return { success: false, message: 'Session expired. Please log in again.' };
        }
      }

      // Process the final response (original, retry, or non-401 error)
      const text = await response.text();
      let data;
      try {
          data = JSON.parse(text);
      } catch (e) {
          // If response body is not valid JSON (e.g., 500 HTML/text response)
          // Return a structured APIError for the 500 status
          const errorMessage = `Server returned status ${response.status}. Body was not JSON.`;
          // Safely check for substring existence on text
          const textPreview = text ? text.substring(0, 200) : 'Empty body';
          console.error('API DEBUG: Failed to parse JSON response. Raw body:', textPreview);
          return {
              success: false,
              message: errorMessage,
              error: { message: text.substring(0, 100), code: `HTTP_${response.status}` },
          } as APIResponse<T>;
      }


      // --- DEBUG LOG 3: Log Final Data ---
      console.log('API DEBUG: Final Response Data:', data);
      // -----------------------------------

      if (!response.ok) {
        return {
          success: false,
          message: data.message || 'An error occurred',
          error: data.error,
        };
      }
      
      // CRITICAL FIX: Ensure if the body explicitly contains { success: false }, we treat it as failure, 
      // even if the HTTP status was 200 OK (common in login responses)
      if (data && data.success === false) {
          return {
              success: false,
              message: data.message || 'Request failed due to business logic error.',
              error: data.error,
          } as APIResponse<T>;
      }

      // If HTTP 2xx and no explicit { success: false } in body
      return data; // This is the APIResponse, which should have { success: true, ... }
      
      // --- END: MODIFIED LOGIC ---

    } catch (error) {
      console.error('API Request Error (Catch Block):', error);
      return {
        success: false,
        message: 'Network error. Please check your connection.',
      };
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
            return {
                success: false,
                message: data.message || 'An error occurred during file upload.',
                error: data.error,
            } as APIResponse<T>;
        }

        return data; // This is the APIResponse
        
    } catch (error) {
        console.error('API Form Data Request Error:', error);
        return {
            success: false,
            message: 'Network error or session issue during file upload.',
        };
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
      // FIX: Cast object to BodyInit to satisfy RequestInit.body type
      body: input as unknown as BodyInit,
    });
  }

  /**
   * Login user
   */
  async login(input: LoginInput): Promise<APIResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      // FIX: Cast object to BodyInit to satisfy RequestInit.body type
      body: input as unknown as BodyInit,
    });

    // Save tokens on successful login, relying on response.success check in request()
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
    await this.request('/api/auth/logout', {
      method: 'POST',
    });
    this.removeToken();
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
      // FIX: Cast object to BodyInit
      body: input as unknown as BodyInit,
    });
  }

  /**
   * List bookings
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
      // FIX: Cast object to BodyInit
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
      // FIX: Cast object to BodyInit
      body: data as unknown as BodyInit,
    });
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: string, reason: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      // FIX: Cast object to BodyInit
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
      // FIX: Cast object to BodyInit
      body: data as unknown as BodyInit,
    });
  }

  /**
   * Update a property
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
    }
  ): Promise<APIResponse<Property>> {
    return this.request(`/api/properties/${id}`, {
      method: 'PUT',
      // FIX: Cast object to BodyInit
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
  }): Promise<APIResponse<{ count: number }>> {
    return this.request('/api/checklist/maintenance-items', {
      method: 'POST',
      // FIX: Cast object to BodyInit
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
      // FIX: Cast object to BodyInit
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
      // FIX: Cast object to BodyInit
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
      // FIX: Cast object to BodyInit
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
  
  // FIX: Changed return type to APIResponse to allow for failure handling
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

  // FIX: Changed return type to APIResponse to allow for failure handling
  async listWarranties(): Promise<APIResponse<{ warranties: Warranty[] }>> {
    return this.request<{ warranties: Warranty[] }>('/api/home-management/warranties');
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

  // FIX: Changed return type to APIResponse to allow for failure handling
  async listInsurancePolicies(): Promise<APIResponse<{ policies: InsurancePolicy[] }>> {
    return this.request<{ policies: InsurancePolicy[] }>('/api/home-management/insurance-policies');
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
   * @param file The file object (from a FileList).
   * @param data Metadata including the associated ID (propertyId, warrantyId, or policyId).
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

}

// Export singleton instance
export const api = new APIClient(API_BASE_URL);