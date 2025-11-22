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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'user';
const TOKEN_STORAGE_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const isBrowser = typeof window !== 'undefined';

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

  const login = useCallback(async (data: LoginInput): Promise<LoginResponse | null> => {
    try {
      const response = await api.login(data);
      
      console.log('DEBUG: Full API Login Response:', response); // DEBUG 1

      // CRITICAL FIX: Check response.success first for type narrowing.
      if (response.success) {
        // Type is now narrowed to APISuccess<LoginResponse>, guaranteeing `response.data` exists.
        
        // Handle potential server nesting: attempt to pull from response.data.data first, 
        // otherwise use response.data (which should be the LoginResponse body itself).
        const loginData = (response.data as any).data || response.data; 
        
        console.log('DEBUG: Extracted Login Data (Before Destructuring):', loginData); // DEBUG 2

        // Ensure the data structure is complete
        const { accessToken, refreshToken, user } = loginData; 

        if (!accessToken || !user) {
             console.error("Login successful but missing required fields (tokens/user).");
             return null; // Safety check
        }
        
        console.log('DEBUG: Login SUCCESS. Setting User State.'); // DEBUG 3
        
        if (isBrowser) {
          localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        }
        setUser(user);
        
        // Return the full object structure expected by LoginResponse
        return { accessToken, refreshToken, user }; 
      }
      // If response.success is false, we return null (triggers 'Invalid email' message)
      console.warn('DEBUG: Login failed due to API response body (success: false).'); // DEBUG 4
      console.warn('DEBUG: Error Message:', (response as APIError).message);
      return null;
    } catch (error) {
      console.error('Login failed in Catch Block:', error); // DEBUG 5
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


  const logout = useCallback(() => {
    if (isBrowser) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
    setUser(null);
    router.push('/login');
  }, [router]);

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