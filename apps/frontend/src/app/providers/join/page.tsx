'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Eye, EyeOff, KeyRound, Mail, Phone, User } from 'lucide-react';
import ProviderAuthTemplate from '@/components/providers/ProviderAuthTemplate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/AuthContext';
import { APIError } from '@/types';

type JoinField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'businessName'
  | 'phone'
  | 'serviceCategories';

type JoinErrors = Partial<Record<JoinField, string>>;

const SERVICE_OPTIONS = [
  { value: 'HOME_INSPECTION', label: 'Home Inspection' },
  { value: 'PEST_INSPECTION', label: 'Pest Inspection' },
  { value: 'RADON_TESTING', label: 'Radon Testing' },
  { value: 'MOLD_INSPECTION', label: 'Mold Inspection' },
  { value: 'SEPTIC_INSPECTION', label: 'Septic Inspection' },
  { value: 'WELL_INSPECTION', label: 'Well Inspection' },
  { value: 'MINOR_REPAIRS', label: 'Minor Repairs' },
  { value: 'FIXTURE_INSTALLATION', label: 'Fixture Installation' },
  { value: 'FURNITURE_ASSEMBLY', label: 'Furniture Assembly' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'DRYWALL_REPAIR', label: 'Drywall Repair' },
  { value: 'APPLIANCE_INSTALLATION', label: 'Appliance Installation' },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProviderJoinPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<JoinErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    businessName: '',
    phone: '',
    serviceCategories: [] as string[],
  });

  const setField = (field: JoinField, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError('');
  };

  const validateStepOne = (): JoinErrors => {
    const nextErrors: JoinErrors = {};

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

    return nextErrors;
  };

  const validateStepTwo = (): JoinErrors => {
    const nextErrors: JoinErrors = {};

    if (!formData.businessName.trim()) nextErrors.businessName = 'Business name is required.';
    if (!formData.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (formData.serviceCategories.length === 0) {
      nextErrors.serviceCategories = 'Select at least one service category.';
    }

    return nextErrors;
  };

  const handleNextStep = () => {
    const stepErrors = validateStepOne();
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    setErrors({});
    setCurrentStep(2);
  };

  const toggleServiceCategory = (serviceKey: string) => {
    setField(
      'serviceCategories',
      formData.serviceCategories.includes(serviceKey)
        ? formData.serviceCategories.filter((service) => service !== serviceKey)
        : [...formData.serviceCategories, serviceKey]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const stepErrors = validateStepTwo();
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
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
        role: 'PROVIDER',
      });

      if (result && result.success) {
        router.push('/providers/dashboard');
        return;
      }

      const errorResponse = result as APIError | null;
      setFormError(
        errorResponse?.error?.message || errorResponse?.message || 'Unable to create provider account. Please try again.'
      );
    } catch (err: any) {
      setFormError(err?.message || 'Unable to create provider account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputErrorClass = (field: JoinField) =>
    errors[field] ? 'border-rose-300 focus-visible:ring-rose-400' : 'border-slate-300';

  return (
    <ProviderAuthTemplate
      activeRoute="join"
      title="Join as a provider"
      subtitle="Set up your provider account so homeowners can quickly understand your fit and availability."
      footer={
        <p className="text-center text-xs text-slate-500">
          Already have a provider account?{' '}
          <Link href="/providers/login" className="font-medium text-brand-700 hover:text-brand-900">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/55 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                currentStep >= 1 ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {currentStep > 1 ? <Check className="h-3.5 w-3.5" /> : '1'}
            </span>
            <p className="mb-0 text-xs font-semibold tracking-normal text-slate-700">Account setup</p>
          </div>

          <div className="h-px flex-1 bg-brand-200" />

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                currentStep === 2 ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <p className="mb-0 text-xs font-semibold tracking-normal text-slate-700">Business profile</p>
          </div>
        </div>
      </div>

      {formError ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </div>
      ) : null}

      {currentStep === 1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNextStep();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  value={formData.firstName}
                  onChange={(e) => setField('firstName', e.target.value)}
                  className={`pl-9 ${inputErrorClass('firstName')}`}
                  placeholder="Jamie"
                />
              </div>
              {errors.firstName ? <p className="mt-1.5 text-xs text-rose-700">{errors.firstName}</p> : null}
            </div>

            <div>
              <Label htmlFor="lastName">Last name</Label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  value={formData.lastName}
                  onChange={(e) => setField('lastName', e.target.value)}
                  className={`pl-9 ${inputErrorClass('lastName')}`}
                  placeholder="Doe"
                />
              </div>
              {errors.lastName ? <p className="mt-1.5 text-xs text-rose-700">{errors.lastName}</p> : null}
            </div>
          </div>

          <div>
            <Label htmlFor="email">Work email</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setField('email', e.target.value)}
                className={`pl-9 ${inputErrorClass('email')}`}
                placeholder="team@yourbusiness.com"
              />
            </div>
            {errors.email ? <p className="mt-1.5 text-xs text-rose-700">{errors.email}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setField('password', e.target.value)}
                  className={`pl-9 pr-11 ${inputErrorClass('password')}`}
                  placeholder="At least 8 characters"
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
              {errors.password ? (
                <p className="mt-1.5 text-xs text-rose-700">{errors.password}</p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Use 8+ characters.</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => setField('confirmPassword', e.target.value)}
                  className={`pl-9 pr-11 ${inputErrorClass('confirmPassword')}`}
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword ? <p className="mt-1.5 text-xs text-rose-700">{errors.confirmPassword}</p> : null}
            </div>
          </div>

          <Button type="submit" className="min-h-[46px] w-full text-sm sm:text-base">
            Continue to business profile
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => setField('businessName', e.target.value)}
              className={`mt-1.5 ${inputErrorClass('businessName')}`}
              placeholder="Summit Home Services"
            />
            {errors.businessName ? <p className="mt-1.5 text-xs text-rose-700">{errors.businessName}</p> : null}
          </div>

          <div>
            <Label htmlFor="phone">Business phone</Label>
            <div className="relative mt-1.5">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={`pl-9 ${inputErrorClass('phone')}`}
                placeholder="(555) 123-4567"
              />
            </div>
            {errors.phone ? <p className="mt-1.5 text-xs text-rose-700">{errors.phone}</p> : null}
          </div>

          <div>
            <Label>Service categories</Label>
            <p className="mt-1 text-xs text-slate-500">Select every service you actively offer.</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SERVICE_OPTIONS.map((service) => {
                const selected = formData.serviceCategories.includes(service.value);
                return (
                  <button
                    key={service.value}
                    type="button"
                    onClick={() => toggleServiceCategory(service.value)}
                    className={`inline-flex min-h-[40px] items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'border-brand-500 bg-brand-50 text-brand-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span>{service.label}</span>
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </div>
            {errors.serviceCategories ? <p className="mt-1.5 text-xs text-rose-700">{errors.serviceCategories}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setCurrentStep(1);
                setErrors({});
              }}
            >
              Back
            </Button>
            <Button type="submit" disabled={loading} className="min-h-[44px]">
              {loading ? 'Creating account...' : 'Create provider account'}
            </Button>
          </div>
        </form>
      )}
    </ProviderAuthTemplate>
  );
}
