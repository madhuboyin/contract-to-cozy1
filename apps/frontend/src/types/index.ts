// apps/frontend/src/types/index.ts

import React from 'react';

// === NEW DYNAMIC TYPES ===
export enum UserType {
  BUYER = 'BUYER',
  OWNER = 'OWNER',
  GUEST = 'GUEST'
}

export interface ServiceCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  imageUrl: string;
}

export interface MaintenanceTask {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ClosingMilestone {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}


// === EXISTING BACKEND TYPES (Partial list from backup) ===
// Note: If this file contains more existing types, you must ensure they are preserved.
export type UserRole = 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type BookingStatus = 
  | 'DRAFT'
  | 'PENDING' 
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';
export type ServiceCategory = 'INSPECTION' | 'HANDYMAN';

// === AUTH TYPES ===
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
  homeownerProfile?: {
    segment?: string;
    [key: string]: any;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// === API RESPONSE TYPES ===
export interface APIError {
  success: false;
  message: string;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  errors?: any[];
}

export interface APISuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T = any> = APISuccess<T> | APIError;