// apps/frontend/src/lib/auth/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, LoginInput, RegisterInput, LoginResponse, HomeownerSegment, UserRole, APISuccess, APIError } from '@/types';
import { api } from '@/lib/api/client';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginInput) => Promise<LoginResponse | null>;
  logout: () => void;
  register: (data: RegisterInput) => Promise<LoginResponse | null>;
  isAuthenticated: boolean;
  isHomeowner: boolean;
  isProvider: boolean;
  isAdmin: boolean;
  userSegment: HomeownerSegment | undefined;
  // FIX 1: Add refreshUser to the context type
  refreshUser: () => Promise<void>; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// TODO: Migrate tokens from localStorage to httpOnly cookies set by the backend.
// localStorage tokens are readable by any JS on the page, making them exfiltrable
// via XSS. Migration requires:
//   1. Backend sets httpOnly, Secure, SameSite=Strict cookies on login/refresh
//   2. Frontend stops reading/writing tokens to localStorage
//   3. API client removes Authorization header (browser sends cookies automatically)
//   4. Add CSRF protection (double-submit cookie or Synchronizer Token)
const USER_STORAGE_KEY = 'user';
const TOKEN_STORAGE_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const isBrowser = typeof window !== 'undefined';

// Helper to set a cookie manually on the client
const setCookie = (name: string, value: string, days = 7) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
};
/**
 * Fetches the current user data using the stored token.
 */
const fetchCurrentUser = async (token: string | null): Promise<User | null> => {
  if (!token) return null;

  try {
    // We already fixed the client to allow passing the token
    const response = await api.getCurrentUser(token); 

    if (response.success) {
      // Type is now narrowed to APISuccess<User>, which guarantees response.data
      // Store user data in localStorage to persist minimal info needed for segment check
      if (isBrowser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data));
      }
      return response.data;
    }
  } catch (error) {
    console.error('Failed to fetch current user:', error);
    // If fetching fails (e.g., token expired), clear local storage
    if (isBrowser) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }
  return null;
};

/**
 * AuthProvider component to wrap the application and provide authentication context.
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // --- Utility Getters ---
  const isAuthenticated = !!user;
  const isHomeowner = user?.role === 'HOMEOWNER';
  const isProvider = user?.role === 'PROVIDER';
  const isAdmin = user?.role === 'ADMIN';
  const userSegment = user?.segment;

  // --- Authentication Handlers ---
  
  // FIX 2: Define logout first to be used in refreshUser
  const logout = useCallback(() => {
    if (isBrowser) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
    setUser(null);
    router.push('/login');
  }, [router]);

  // FIX 3: Define refreshUser using the common fetchCurrentUser logic
  const refreshUser = useCallback(async () => {
    if (!isBrowser) return;

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
        return; 
    }
    
    const freshUser = await fetchCurrentUser(token);
    if (freshUser) {
      setUser(freshUser);
    } else {
      // Token failed validation, log out to clear bad token/user data
      logout(); 
    }
  }, [logout]);


  const login = useCallback(async (data: LoginInput): Promise<LoginResponse | null> => {
    try {
      const response = await api.login(data);
      
      if (response.success) {
        const loginData = (response.data as any).data || response.data; 
        const { accessToken, refreshToken, user } = loginData; 
  
        if (isBrowser) {
          localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
          
          // ADD THIS: Synchronize the cookie for the middleware
          setCookie('accessToken', accessToken);
        }
        setUser(user);
        return { success: true, accessToken, refreshToken, user };
      }
      return null;
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  }, []);

  const register = useCallback(async (data: RegisterInput): Promise<LoginResponse | null> => {
    try {
      const response = await api.register(data);

      if (response.success && response.data.user) {
        // After registration, immediately log them in or grab tokens if provided
        // For simplicity, assuming the backend immediately gives them a valid session to use 'me' endpoint
        const loginResponse = await login({ email: data.email, password: data.password }); 
        return loginResponse;
      }
      return null;
    } catch (error) {
      console.error('Registration failed:', error);
      return null;
    }
  }, [login]);


  // --- Initialization Effect ---
  useEffect(() => {
    const initializeAuth = async () => {
      let storedUser: User | null = null;
      let token: string | null = null;

      if (isBrowser) {
        token = localStorage.getItem(TOKEN_STORAGE_KEY);
        const userJson = localStorage.getItem(USER_STORAGE_KEY);
        if (userJson) {
          try {
            storedUser = JSON.parse(userJson);
          } catch (e) {
            console.error('Failed to parse stored user:', e);
            localStorage.removeItem(USER_STORAGE_KEY);
          }
        }
      }

      // If token exists, try to fetch fresh user data
      if (token) {
        const freshUser = await fetchCurrentUser(token);
        if (freshUser) {
          setUser(freshUser);
        } else {
          // Token failed validation, log out to clear bad token/user data
          logout();
        }
      }

      setLoading(false);
    };

    initializeAuth();
  }, [logout]);

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    isAuthenticated,
    isHomeowner,
    isProvider,
    isAdmin,
    userSegment,
    // FIX 4: Add refreshUser to the context value
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};