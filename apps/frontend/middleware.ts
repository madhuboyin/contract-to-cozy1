// apps/frontend/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Decode JWT payload and extract user role.
 *
 * IMPORTANT: This is an UNVERIFIED decode — it reads the payload without
 * checking the signature. It is used ONLY for client-side routing hints
 * (e.g. redirecting providers to /providers/dashboard). It is NOT a security
 * boundary. All actual authorization is enforced by the backend API which
 * verifies the JWT signature on every request.
 *
 * We also reject obviously expired tokens so stale cookies don't cause
 * redirect loops.
 */
function getUserRoleFromToken(token: string | undefined): string | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    // A valid JWT has exactly 3 parts
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const decoded = JSON.parse(jsonPayload);

    // Reject expired tokens
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }

    const role = decoded.role;
    // Only accept known roles
    if (role === 'HOMEOWNER' || role === 'PROVIDER' || role === 'ADMIN') {
      return role;
    }
    return null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value;
  const { pathname } = request.nextUrl;
  
  // Get user role from token
  const userRole = getUserRoleFromToken(token);

  // ============================================
  // Public routes (no authentication required)
  // ============================================
  const publicRoutes = [
    '/login',
    '/signup', 
    '/providers/join',
    '/providers/login',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];
  
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  // Landing page and static assets are public
  if (pathname === '/' || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  
  // Allow access to public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // ============================================
  // Protected routes (authentication required)
  // ============================================
  
  // No token = redirect to login
  if (!token) {
    // Check which portal they're trying to access
    if (pathname.startsWith('/providers')) {
      return NextResponse.redirect(new URL('/providers/login', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ============================================
  // Provider portal protection
  // ============================================
  if (pathname.startsWith('/providers/dashboard') || 
      pathname.startsWith('/providers/services') ||
      pathname.startsWith('/providers/bookings') ||
      pathname.startsWith('/providers/calendar') ||
      pathname.startsWith('/providers/portfolio') ||
      pathname.startsWith('/providers/profile')) {
    
    // Only providers can access provider portal
    if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
      // Redirect non-providers to homeowner dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // ============================================
  // Homeowner portal protection
  // ============================================
  if (pathname.startsWith('/dashboard')) {
    // Only homeowners and admins can access homeowner dashboard
    if (userRole === 'PROVIDER') {
      // Redirect providers to their dashboard
      return NextResponse.redirect(new URL('/providers/dashboard', request.url));
    }
  }

  // ============================================
  // Admin portal protection (if exists)
  // ============================================
  if (pathname.startsWith('/admin')) {
    // Only admins can access admin portal
    if (userRole !== 'ADMIN') {
      // Redirect non-admins based on their role
      if (userRole === 'PROVIDER') {
        return NextResponse.redirect(new URL('/providers/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Allow the request to continue
  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
