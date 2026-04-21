'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, User } from 'lucide-react';

import AuthTemplate from '@/components/auth/AuthTemplate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/lib/auth/AuthContext';
import { APIError, HomeownerSegment } from '@/types';

type FieldName = 'email' | 'password' | 'confirmPassword' | 'firstName' | 'lastName' | 'segment';

type FieldErrors = Partial<Record<FieldName, string>>;

interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  segment: HomeownerSegment;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const { register, login } = useAuth();

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [formData, setFormData] = useState<SignupFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    segment: 'EXISTING_OWNER',
  });

  const setField = (field: FieldName, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError('');
  };

  const validate = (): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required.';
    if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required.';
    if (!formData.email.trim()) nextErrors.email = 'Email is required.';
    if (formData.email && !EMAIL_RE.test(formData.email)) nextErrors.email = 'Enter a valid email address.';
    if (!formData.password) nextErrors.password = 'Password is required.';
    if (formData.password && formData.password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    if (!formData.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.';
    if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    if (!formData.segment) nextErrors.segment = 'Select the option that best matches your situation.';

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
      setFormError('');

      const result = await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'HOMEOWNER',
        segment: formData.segment,
      });

      if (result && result.success) {
        const loginResult = await login({
          email: formData.email,
          password: formData.password,
        });

        if (loginResult && 'success' in loginResult && loginResult.success) {
          router.push('/dashboard');
          return;
        }

        const errorResponse = loginResult as APIError | null;
        setFormError(
          errorResponse?.error?.message ||
            errorResponse?.message ||
            'Account created, but we could not sign you in automatically. Please sign in manually.'
        );
        return;
      }

      const registerError = result as APIError | null;
      setFormError(registerError?.error?.message || registerError?.message || 'Could not create account. Please try again.');
    } catch (err: any) {
      setFormError(err.message || 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputErrorClass = (field: FieldName) =>
    fieldErrors[field] ? 'border-rose-300 focus-visible:ring-rose-400' : 'border-slate-300';

  return (
    <AuthTemplate
      activeRoute="signup"
      title="Create your homeowner account"
      subtitle="Get personalized guidance for maintenance, risk, and savings in one place."
      footer={
        <p className="text-center text-xs text-slate-500">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="font-medium text-brand-700 hover:text-brand-900">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-medium text-brand-700 hover:text-brand-900">
            Privacy Policy
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                value={formData.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                className={`pl-9 ${inputErrorClass('firstName')}`}
                placeholder="Jordan"
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
            </div>
            {fieldErrors.firstName ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.firstName}</p> : null}
          </div>

          <div>
            <Label htmlFor="lastName">Last name</Label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                value={formData.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                className={`pl-9 ${inputErrorClass('lastName')}`}
                placeholder="Smith"
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
            </div>
            {fieldErrors.lastName ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.lastName}</p> : null}
          </div>
        </div>

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
              placeholder="you@example.com"
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </div>
          {fieldErrors.email ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.email}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setField('password', e.target.value)}
                className={`pl-9 ${inputErrorClass('password')}`}
                placeholder="At least 8 characters"
                aria-invalid={Boolean(fieldErrors.password)}
              />
            </div>
            {fieldErrors.password ? (
              <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.password}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">Use at least 8 characters.</p>
            )}
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                className={`pl-9 ${inputErrorClass('confirmPassword')}`}
                placeholder="Re-enter password"
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
              />
            </div>
            {fieldErrors.confirmPassword ? (
              <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>
        </div>

        <fieldset>
          <Label className="text-sm">What best describes you?</Label>
          <RadioGroup
            value={formData.segment}
            onValueChange={(value) => setField('segment', value as HomeownerSegment)}
            className="mt-2 grid grid-cols-1 gap-2"
          >
            <label
              htmlFor="segment-home-buyer"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                formData.segment === 'HOME_BUYER'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <RadioGroupItem id="segment-home-buyer" value="HOME_BUYER" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-slate-900">I am buying a home</span>
                <span className="block text-xs text-slate-600">Get guidance for due diligence, risk checks, and first-year planning.</span>
              </span>
            </label>

            <label
              htmlFor="segment-existing-owner"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                formData.segment === 'EXISTING_OWNER'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <RadioGroupItem id="segment-existing-owner" value="EXISTING_OWNER" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-slate-900">I already own my home</span>
                <span className="block text-xs text-slate-600">Track maintenance, reduce risk, and find savings opportunities.</span>
              </span>
            </label>
          </RadioGroup>
          {fieldErrors.segment ? <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.segment}</p> : null}
        </fieldset>

        <Button type="submit" className="mt-2 min-h-[46px] w-full text-sm sm:text-base" disabled={loading}>
          {loading ? 'Creating account...' : 'Create my account'}
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="mb-0">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-900">
            Sign in
          </Link>
          .
        </p>
        <p className="mt-1.5 mb-0">
          Joining as a service provider?{' '}
          <Link href="/providers/join" className="font-semibold text-brand-700 hover:text-brand-900">
            Apply here
          </Link>
          .
        </p>
      </div>
    </AuthTemplate>
  );
}
