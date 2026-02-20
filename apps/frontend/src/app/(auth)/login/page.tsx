// apps/frontend/src/app/(auth)/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  // Redirect if already authenticated — in useEffect to avoid render-time side effects
  useEffect(() => {
    if (user) {
      if (user.role === 'PROVIDER') {
        router.replace('/providers/dashboard');
      } else if (user.role === 'ADMIN') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, router]);

  // Show nothing while redirecting
  if (user) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
  
    try {
      setLoading(true); // Button greys out here
      const result = await login({ email: formData.email, password: formData.password });
  
      if (result) {
        const userRole = result.user.role; 

        if (userRole === 'PROVIDER') {
          router.replace('/providers/dashboard');
        } else if (userRole === 'ADMIN') {
          router.replace('/admin/dashboard');
        } else {
          router.replace('/dashboard');
        }

      } else {
        setError('Invalid email or password.');
      }
    } catch (err: any) {
      // The robust APIClient now ensures we hit this block for server crashes
      console.error('Login component caught network error:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      // This MUST run to un-grey the button
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#061018] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
        <header className="flex items-center justify-between py-2 sm:py-4">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-85">
            <span className="text-2xl">🏠</span>
            <span className="text-2xl font-semibold tracking-tight text-white">C2C</span>
          </Link>

          <Link
            href="/providers/join"
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white sm:text-sm"
          >
            For Providers
          </Link>
        </header>

        <main className="flex flex-1 flex-col justify-between">
          <section className="px-1 pb-6 pt-10 sm:max-w-xl sm:px-0 sm:pb-10 sm:pt-16">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Go ahead and set up your account
            </h1>
            <p className="mt-4 text-lg text-white/60">
              Sign in to continue managing your home with confidence.
            </p>
          </section>

          <section className="rounded-[32px] bg-white p-4 text-slate-900 shadow-[0_-12px_48px_-24px_rgba(0,0,0,0.55)] sm:p-6">
            <div className="rounded-2xl bg-slate-100 p-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <span className="inline-flex h-12 items-center justify-center rounded-xl bg-white text-base font-semibold text-slate-900 shadow-sm">
                  Login
                </span>
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center rounded-xl text-base font-medium text-slate-500 transition-colors hover:text-slate-700"
                >
                  Register
                </Link>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <div className="flex items-center space-x-2">
                  <svg className="h-5 w-5 flex-shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M9.401 3.003c1.155-1.121 3.2-1.121 4.356 0l4.46 4.321c1.155 1.121 1.155 3.2 0 4.356l-6.666 6.467a3.076 3.076 0 01-4.356 0l-6.666-6.467c-1.155-1.155-1.155-3.2 0-4.356l4.46-4.321zM12 9a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75s.75-.336.75-.75V9.75A.75.75 0 0012 9zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {/* Email */}
              <div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <label htmlFor="email" className="block text-xs font-medium text-slate-500">
                    Email Address
                  </label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Mail className="h-5 w-5 text-emerald-700" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full border-0 p-0 text-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              </div>

              {/* Password with Toggle */}
              <div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <label htmlFor="password" className="block text-xs font-medium text-slate-500">
                    Password
                  </label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Lock className="h-5 w-5 text-emerald-700" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full border-0 p-0 text-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                      placeholder="••••••••"
                    />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="rounded-full p-1.5 text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-full bg-[#709B7C] px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#638d70] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Login'}
              </button>
            </form>

            <div className="mt-6">
              <div className="flex items-center gap-3 text-slate-500">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-sm">Or login with</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                disabled
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-500"
                aria-label="Google login coming soon"
              >
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.657 32.657 29.201 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.054 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z" />
                  <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.054 29.27 4 24 4c-7.682 0-14.347 4.337-17.694 10.691z" />
                  <path fill="#4CAF50" d="M24 44c5.173 0 9.86-1.977 13.409-5.197l-6.19-5.238C29.143 35.091 26.715 36 24 36c-5.18 0-9.622-3.317-11.283-7.946l-6.522 5.025C9.5 39.556 16.227 44 24 44z" />
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.238-2.231 4.166-4.084 5.565l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.651-.389-3.917z" />
                </svg>
                Google (Coming soon)
              </button>
            </div>

            <div className="mt-5 text-center text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-medium text-emerald-700 hover:text-emerald-800">
                Register
              </Link>
            </div>

            <div className="mt-2 text-center text-sm text-slate-600">
              Are you a service provider?{' '}
              <Link href="/providers/join" className="font-medium text-emerald-700 hover:text-emerald-800">
                Join as provider
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
