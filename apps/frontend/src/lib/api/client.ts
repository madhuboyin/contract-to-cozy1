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
  MaintenanceTaskConfig, // <-- ADDED THIS IMPORT
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * API Client for Contract to Cozy Backend
 */
class APIClient {
  private baseURL: string;

  // --- NEW ---
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
        headers,
      });

      // --- START: MODIFIED LOGIC ---

      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        // Token expired or invalid, and it's not an auth endpoint
        
        if (this.isRefreshing) {
          // A refresh is already in progress. Add this request to the queue.
          return new Promise((resolve, reject) => {
            this.failedQueue.push({ resolve, reject, endpoint, options, headers });
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
            headers: newHeaders,
          });

        } else {
          // Refresh failed. Log user out.
          this.isRefreshing = false;
          const error = new Error('Session expired. Please log in again.');
          // Reject all waiting requests
          this.processFailedQueue(error, null);
          
          this.removeToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          return { success: false, message: 'Session expired. Please log in again.' };
        }
      }

      // Process the final response (original, retry, or non-401 error)
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || 'An error occurred',
          error: data.error,
        };
      }

      // Normalize response: if backend returns data directly (without success wrapper), wrap it
      if (data.success === undefined) {
        return {
          success: true,
          data: data,
        };
      }

      return data; // This is the APIResponse, which should have { success: true, ... }
      
      // --- END: MODIFIED LOGIC ---

    } catch (error) {
      console.error('API Request Error:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection.',
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
      body: JSON.stringify(input),
    });
  }

  /**
   * Login user
   */
  async login(input: LoginInput): Promise<APIResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    // Save tokens on successful login
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
   * Get current user
   */
  async getCurrentUser(): Promise<APIResponse<User>> {
    return this.request<User>('/api/auth/me');
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

    // Use fetch directly here to avoid circular dependency in request()
    // and to ensure we don't try to refresh a failed refresh token
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
      body: JSON.stringify(input),
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
      body: JSON.stringify(updates),
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
      body: JSON.stringify(data),
    });
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: string, reason: string): Promise<APIResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
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
      body: JSON.stringify(data),
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
      body: JSON.stringify(data),
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
   * Get the user's checklist
   */
  async getChecklist(): Promise<APIResponse<{
    id: string;
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
      serviceCategory: string | null;
      createdAt: string;
    }>;
  }>> {
    return this.request('/api/checklist');
  }

  /**
   * Update a checklist item's status
   */
  async updateChecklistItem(
    itemId: string,
    status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED'
  ): Promise<APIResponse<{
    id: string;
    title: string;
    description: string | null;
    status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
    serviceCategory: string | null;
    createdAt: string;
  }>> {
    return this.request(`/api/checklist/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

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
      body: JSON.stringify(data),
    });
  }

  // --- NEW FUNCTION FOR PHASE 3 ---
  /**
   * Creates new custom maintenance items from a user-defined config.
   * @param data An object containing an array of task config objects.
   */
  async createCustomMaintenanceItems(data: {
    tasks: MaintenanceTaskConfig[];
  }): Promise<APIResponse<{ count: number }>> {
    return this.request('/api/maintenance-templates/custom-items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  // --- END NEW FUNCTION ---

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
      body: JSON.stringify(data),
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
      body: JSON.stringify(data),
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

  // Add this method to your api client
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

}

// Export singleton instance
export const api = new APIClient(API_URL);