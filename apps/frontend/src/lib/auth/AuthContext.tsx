// apps/frontend/src/lib/auth/AuthContext.tsx

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { User, LoginInput, RegisterInput } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginInput) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterInput) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);
  
  const loadUser = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
  
    try {
      const response = await api.getCurrentUser();
      if (response.success) {
        setUser(response.data);
      } else {
        // Token is invalid, clear it
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginInput) => {
    try {
      const response = await api.login(credentials);
      
      if (response.success) {
      // Store tokens in localStorage
        localStorage.setItem('accessToken', response.data.accessToken);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        
        setUser(response.data.user);
        return { success: true };
      } else {
        return {
          success: false,
          error: response.message || 'Login failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred',
      };
    }
  };

  const register = async (data: RegisterInput) => {
    try {
      const response = await api.register(data);
      
      if (response.success) {
        // After registration, log them in
        const loginResponse = await api.login({
          email: data.email,
          password: data.password,
        });
        
        if (loginResponse.success) {
          // Store tokens in localStorage
          localStorage.setItem('accessToken', loginResponse.data.accessToken);
          localStorage.setItem('refreshToken', loginResponse.data.refreshToken);
          setUser(loginResponse.data.user);
          return { success: true };
        }
      }
      
      return {
        success: false,
        error: response.message || 'Registration failed',
      };
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred',
      };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear tokens from localStorage
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      router.push('/login');
    }
  };

  const refreshUser = async () => {
    await loadUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
