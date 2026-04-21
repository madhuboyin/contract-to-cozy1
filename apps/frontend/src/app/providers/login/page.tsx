'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import LoginSuccessTransition from '@/components/auth/LoginSuccessTransition';
import ProviderAuthTemplate from '@/components/providers/ProviderAuthTemplate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/AuthContext';
import { isValidEmail } from '@/lib/utils';
import { APIError, UserRole } from '@/types';

type FieldName = 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

function resolveRoleFromToken(): UserRole | null {
  try {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );

    const decoded = JSON.parse(jsonPayload) as { role?: UserRole };
    return decoded.role || null;
  } catch {
    return null;
  }
}

function destinationForRole(role: UserRole): string {
  if (role === 'PROVIDER') return '/providers/dashboard';
  if (role === 'ADMIN') return '/dashboard/knowledge-admin';
  return '/dashboard';
}

export default function ProviderLoginPage() {
  const router = useRouter();
  const { login, user, completeMfaChallenge, completeMfaRecoveryChallenge } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionRole, setTransitionRole] = useState<UserRole>('PROVIDER');
  const [transitionName, setTransitionName] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  useEffect(() => {
    if (user && !isTransitioning) {
      router.replace(destinationForRole(user.role));
    }
  }, [user, router, isTransitioning]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const setField = (field: FieldName, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError('');
  };

  const validate = (): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!formData.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!isValidEmail(formData.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!formData.password) {
      nextErrors.password = 'Password is required.';
    }

    return nextErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      const result = await login({ email: formData.email, password: formData.password });

      if (result && 'mfaRequired' in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setFormError('');
        return;
      }

      if (result && 'success' in result && result.success) {
        const resolvedRole = result.user?.role || user?.role || resolveRoleFromToken() || 'PROVIDER';

        setTransitionRole(resolvedRole);
        setTransitionName(result.user?.firstName || user?.firstName || '');
        setIsTransitioning(true);

        redirectTimerRef.current = setTimeout(() => {
          router.replace(destinationForRole(resolvedRole));
        }, 1100);
        return;
      }

      const errorResponse = result as APIError | null;
      setFormError(
        errorResponse?.error?.message ||
          errorResponse?.message ||
          'Sign in failed. Check your credentials and try again.'
      );
    } catch (err: any) {
      setFormError(err?.message || 'Sign in failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;

    try {
      setLoading(true);
      const result = useRecoveryCode
        ? await completeMfaRecoveryChallenge(mfaToken, recoveryCode)
        : await completeMfaChallenge(mfaToken, mfaCode);

      if (!result?.success) {
        setFormError(useRecoveryCode ? 'Invalid recovery code.' : 'Invalid authentication code.');
        return;
      }

      const resolvedRole = result.user?.role || user?.role || resolveRoleFromToken() || 'PROVIDER';

      setTransitionRole(resolvedRole);
      setTransitionName(result.user?.firstName || user?.firstName || '');
      setIsTransitioning(true);

      redirectTimerRef.current = setTimeout(() => {
        router.replace(destinationForRole(resolvedRole));
      }, 1100);
    } catch (err: any) {
      setFormError(err?.message || (useRecoveryCode ? 'Invalid recovery code.' : 'Invalid authentication code.'));
    } finally {
      setLoading(false);
    }
  };

  if (user) return null;

  if (isTransitioning) {
    return <LoginSuccessTransition role={transitionRole} firstName={transitionName} />;
  }

  const inputErrorClass = (field: FieldName) =>
    fieldErrors[field] ? 'border-rose-300 focus-visible:ring-rose-400' : 'border-slate-300';

  return (
    <ProviderAuthTemplate
      activeRoute="login"
      title="Provider sign in"
      subtitle="Access your booking queue, availability controls, and profile operations in one workspace."
      footer={
        <p className="text-center text-xs text-slate-500">
          Need a homeowner account instead?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:text-brand-900">
            Homeowner sign in
          </Link>
          .
        </p>
      }
    >
      {formError ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </div>
      ) : null}

      {!mfaToken ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setField('email', e.target.value)}
                className={`pl-9 ${inputErrorClass('email')}`}
                placeholder="provider@company.com"
                aria-invalid={Boolean(fieldErrors.email)}
              />
            </div>
            {fieldErrors.email ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.email}</p> : null}
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setField('password', e.target.value)}
                className={`pl-9 pr-11 ${inputErrorClass('password')}`}
                placeholder="Enter your password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.password}</p> : null}
          </div>

          <div className="flex items-center justify-between">
            <Link href="/reset-password" className="text-xs font-medium text-brand-700 hover:text-brand-900">
              Forgot password?
            </Link>
            <Link href="/providers/join" className="text-xs font-medium text-slate-600 hover:text-slate-900">
              Need a provider account?
            </Link>
          </div>

          <Button type="submit" disabled={loading} className="min-h-[46px] w-full text-sm sm:text-base">
            {loading ? 'Signing in...' : 'Sign in to provider workspace'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Enter your {useRecoveryCode ? 'recovery code' : '6-digit authenticator code'} to continue.
          </div>

          {!useRecoveryCode ? (
            <div>
              <Label htmlFor="mfaCode">Authenticator code</Label>
              <Input
                id="mfaCode"
                name="mfaCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="mt-1.5"
                placeholder="123456"
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="recoveryCode">Recovery code</Label>
              <Input
                id="recoveryCode"
                name="recoveryCode"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="mt-1.5"
                placeholder="ABCD-EF12"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="min-h-[46px] w-full text-sm sm:text-base">
            {loading ? 'Verifying…' : 'Verify and continue'}
          </Button>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setUseRecoveryCode((prev) => !prev)}
              className="font-medium text-brand-700 hover:text-brand-900"
            >
              {useRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode('');
                setRecoveryCode('');
                setUseRecoveryCode(false);
                setFormError('');
              }}
              className="font-medium text-slate-600 hover:text-slate-800"
            >
              Use another account
            </button>
          </div>
        </form>
      )}
    </ProviderAuthTemplate>
  );
}
