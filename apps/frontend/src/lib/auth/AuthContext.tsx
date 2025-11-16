// apps/frontend/src/lib/auth/AuthContext.tsx
// FIXED: Proper 401 error handling

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client'; // --- NEW: Import the smart API client ---

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
  segment?: string; // <-- ADD THIS LINE
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<any>;
  register: (data: any) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUser = async () => {
    // --- USE API CLIENT ---
    // This will now auto-refresh if the token is expired
    const response = await api.getCurrentUser();

    if (response.success) {
      setUser(response.data);
    } else {
      // Don't remove token here, api.request will handle it if refresh fails
      setUser(null);
    }
    setLoading(false);
    // --- END MODIFICATION ---
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  useEffect(() => {
    // Only fetch user if we don't have one and there's a token
    // This prevents re-fetching if user is already set by login/register
    if (!user && localStorage.getItem('accessToken')) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    try {
      // --- USE API CLIENT ---
      const response = await api.login(credentials);

      if (response.success) {
        setUser(response.data.user);
        return { success: true, data: response.data };
      }

      return { 
        success: false, 
        error: response.message || 'Invalid email or password' 
      };
      // --- END MODIFICATION ---

    } catch (error) {
      console.error('Login network error:', error);
      return { 
        success: false, 
        error: 'Network error. Please check your connection.' 
      };
    }
  };

  const register = async (data: any) => {
    try {
      // --- USE API CLIENT ---
      const response = await api.register(data);

      if (response.success) {
        setUser(response.data.user);
        return { success: true, data: response.data };
      }
      
      return { 
        success: false, 
        error: response.message || 'Registration failed' 
      };
      // --- END MODIFICATION ---

    } catch (error) {
      console.error('Registration network error:', error);
      return { 
        success: false, 
        error: 'Network error. Please check your connection.' 
      };
    }
  };

  const logout = async () => {
    try {
      // --- USE API CLIENT ---
      // api.logout() already calls removeToken() internally
      await api.logout();
      // --- END MODIFICATION ---
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
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