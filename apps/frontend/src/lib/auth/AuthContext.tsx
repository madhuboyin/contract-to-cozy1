// apps/frontend/src/lib/auth/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, LoginInput, RegisterInput, LoginResponse, HomeownerSegment, MfaChallengeResponse } from '@/types';
import { api } from '@/lib/api/client';
import { useRouter } from 'next/navigation';

type AuthLoginResult = LoginResponse | MfaChallengeResponse;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginInput) => Promise<AuthLoginResult | null>;
  completeMfaChallenge: (mfaToken: string, code: string) => Promise<LoginResponse | null>;
  completeMfaRecoveryChallenge: (mfaToken: string, recoveryCode: string) => Promise<LoginResponse | null>;
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

function extractApiData<T>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

/**
 * Fetches the current user data using the active cookie-backed session.
 */
const fetchCurrentUser = async (): Promise<User | null> => {
  try {
    const response = await api.getCurrentUser();

    if (response.success) {
      return response.data;
    }
  } catch (error) {
    console.error('Failed to fetch current user:', error);
    api.clearSessionTokens();
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
    api.logout().catch(() => undefined);
    api.clearSessionTokens();
    setUser(null);
    router.push('/login');
  }, [router]);

  // FIX 3: Define refreshUser using the common fetchCurrentUser logic
  const refreshUser = useCallback(async () => {
    const freshUser = await fetchCurrentUser();
    if (freshUser) {
      setUser(freshUser);
    } else {
      setUser(null);
    }
  }, [logout]);


  const login = useCallback(async (data: LoginInput): Promise<AuthLoginResult | null> => {
    const response = await api.login(data);

    if (response.success) {
      const loginData = extractApiData<AuthLoginResult>(response.data);

      if ((loginData as MfaChallengeResponse).mfaRequired) {
        return loginData;
      }

      const { accessToken, refreshToken, user } = loginData as LoginResponse;

      setUser(user);
      return { success: true, accessToken, refreshToken, user };
    }
    return null;
  }, []);

  const completeMfaChallenge = useCallback(
    async (mfaToken: string, code: string): Promise<LoginResponse | null> => {
      const response = await api.verifyMfaChallenge(mfaToken, code);
      if (!response.success) return null;

      const freshUser = await fetchCurrentUser();
      if (!freshUser) return null;

      setUser(freshUser);
      const tokenData = extractApiData<{ accessToken: string; refreshToken: string }>(response.data);
      return {
        success: true,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        user: freshUser,
      };
    },
    []
  );

  const completeMfaRecoveryChallenge = useCallback(
    async (mfaToken: string, recoveryCode: string): Promise<LoginResponse | null> => {
      const response = await api.verifyMfaRecoveryChallenge(mfaToken, recoveryCode);
      if (!response.success) return null;

      const freshUser = await fetchCurrentUser();
      if (!freshUser) return null;

      setUser(freshUser);
      const tokenData = extractApiData<{ accessToken: string; refreshToken: string }>(response.data);
      return {
        success: true,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        user: freshUser,
      };
    },
    []
  );

  const register = useCallback(async (data: RegisterInput): Promise<LoginResponse | null> => {
    try {
      const response = await api.register(data);

      if (response.success && response.data.user) {
        // After registration, immediately log them in or grab tokens if provided
        // For simplicity, assuming the backend immediately gives them a valid session to use 'me' endpoint
        const loginResponse = await login({ email: data.email, password: data.password });
        if (loginResponse && !('mfaRequired' in loginResponse)) {
          return loginResponse;
        }
        return null;
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
      const freshUser = await fetchCurrentUser();
      if (freshUser) {
        setUser(freshUser);
      } else {
        setUser(null);
      }

      setLoading(false);
    };

    initializeAuth();
  }, [logout]);

  const value = {
    user,
    loading,
    login,
    completeMfaChallenge,
    completeMfaRecoveryChallenge,
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
