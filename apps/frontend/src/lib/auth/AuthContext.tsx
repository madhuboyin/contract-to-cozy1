// apps/frontend/src/lib/auth/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { 
  User, 
  LoginInput, 
  RegisterInput, 
  LoginResponse,
  APIResponse,
} from '@/types'; 

interface AuthContextType {
  user: User | null; 
  loading: boolean;
  login: (input: LoginInput) => Promise<APIResponse<LoginResponse>>;
  register: (input: RegisterInput) => Promise<APIResponse<any>>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); 
  const [loading, setLoading] = useState(true);

  const setAuthData = (data: LoginResponse) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
  };

  const clearAuthData = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  };

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      clearAuthData();
      setLoading(false);
      return;
    }

    const response = await api.getCurrentUser();
    if (response.success) {
      setUser(response.data);
      // DEBUG 1: Log the segment after successful fetch
      console.log('DEBUG 1: AuthContext: fetched user segment:', response.data.homeownerProfile?.segment);
    } else {
      clearAuthData();
      console.log('DEBUG 1: AuthContext: fetchCurrentUser failed.');
    }
    setLoading(false);
  };

  const login = async (input: LoginInput) => {
    setLoading(true);
    const response = await api.login(input);
    if (response.success) {
      setAuthData(response.data);
      // DEBUG 2: Log initial user data returned by /api/auth/login
      console.log('DEBUG 2: AuthContext: Login success (initial user data segment):', response.data.user.homeownerProfile?.segment);
      await fetchCurrentUser(); 
      console.log('DEBUG 2: AuthContext: Completed fetchCurrentUser after login. State should be updated.');
    } else {
      setLoading(false);
      console.log('DEBUG 2: AuthContext: Login failed.');
    }
    return response;
  };

  const register = async (input: RegisterInput) => {
    return api.register(input);
  };

  const logout = () => {
    api.logout(); 
    clearAuthData();
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    fetchCurrentUser,
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