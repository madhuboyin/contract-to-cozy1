// apps/frontend/src/lib/auth/AuthContext.tsx
// FIXED: Proper 401 error handling

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.data);
      } else {
        localStorage.removeItem('accessToken');
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('accessToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      // Parse response body first
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        return { 
          success: false, 
          error: 'Server error. Please try again.' 
        };
      }

      // Handle successful login (200)
      if (response.ok && data.data?.accessToken) {
        localStorage.setItem('accessToken', data.data.accessToken);
        setUser(data.data.user);
        return { success: true, data: data.data };
      }

      // Handle error responses (401, 400, etc.)
      // Backend returns: { success: false, error: { message: "...", code: "..." } }
      let errorMessage = 'Login failed';
      
      if (data.error) {
        // If error is an object with message property
        if (typeof data.error === 'object' && data.error.message) {
          errorMessage = data.error.message;
        } 
        // If error is a string
        else if (typeof data.error === 'string') {
          errorMessage = data.error;
        }
      } 
      // Fallback to message field
      else if (data.message) {
        errorMessage = data.message;
      }

      // Special handling for 401
      if (response.status === 401) {
        errorMessage = 'Invalid email or password';
      }

      console.error('Login failed:', response.status, data);
      return { success: false, error: errorMessage };

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        return { 
          success: false, 
          error: 'Server error. Please try again.' 
        };
      }

      if (response.ok && result.data?.accessToken) {
        localStorage.setItem('accessToken', result.data.accessToken);
        setUser(result.data.user);
        return { success: true, data: result.data };
      }

      // Extract error message
      let errorMessage = 'Registration failed';
      if (result.error) {
        if (typeof result.error === 'object' && result.error.message) {
          errorMessage = result.error.message;
        } else if (typeof result.error === 'string') {
          errorMessage = result.error;
        }
      } else if (result.message) {
        errorMessage = result.message;
      }

      console.error('Registration failed:', response.status, result);
      return { success: false, error: errorMessage };

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
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
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
