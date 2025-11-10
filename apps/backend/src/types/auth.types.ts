import { Request } from 'express';

// User roles enum
export enum UserRole {
  HOMEOWNER = 'HOMEOWNER',
  PROVIDER = 'PROVIDER',
  ADMIN = 'ADMIN',
}

// User status enum
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

// Authenticated user (attached to request after JWT verification)
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  status: UserStatus;
}

// Extended Express Request with user
export interface AuthRequest extends Request {
  user?: AuthUser;
}

// User object in API responses (uses 'id' not 'userId')
export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
}

// Login response
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
}

// Register response
export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  emailVerificationToken?: string; // For development/testing
}

// Refresh token response
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

// API Error response
export interface APIError {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

// API Success response
export interface APISuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

// Generic API response
export type APIResponse<T = any> = APISuccess<T> | APIError;