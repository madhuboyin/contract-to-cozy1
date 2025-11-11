// apps/frontend/src/app/providers/join/page.tsx
// Provider Registration with Home Navigation

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

type ServiceCategory = 
  | 'HOME_INSPECTION'
  | 'PEST_INSPECTION'
  | 'RADON_TESTING'
  | 'MOLD_INSPECTION'
  | 'SEPTIC_INSPECTION'
  | 'WELL_INSPECTION'
  | 'MINOR_REPAIRS'
  | 'FIXTURE_INSTALLATION'
  | 'FURNITURE_ASSEMBLY'
  | 'PAINTING'
  | 'DRYWALL_REPAIR'
  | 'APPLIANCE_INSTALLATION';

interface FormData {
  // Personal info
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  
  // Business info
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  yearsInBusiness: string;
  description: string;
  
  // Services
  services: ServiceCategory[];
  
  // Additional
  agreeToTerms: boolean;
}

interface FormErrors {
  [key: string]: string;
}

export default function ProviderJoinPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    businessName: '',
    businessPhone: '',
    businessEmail: '',
    yearsInBusiness: '',
    description: '',
    services: [],
    agreeToTerms: false,
  });

  const serviceOptions: { value: ServiceCategory; label: string; category: string }[] = [
    // Inspections
    { value: 'HOME_INSPECTION', label: 'Home Inspection', category: 'Inspection' },
    { value: 'PEST_INSPECTION', label: 'Pest Inspection', category: 'Inspection' },
    { value: 'RADON_TESTING', label: 'Radon Testing', category: 'Inspection' },
    { value: 'MOLD_INSPECTION', label: 'Mold Inspection', category: 'Inspection' },
    { value: 'SEPTIC_INSPECTION', label: 'Septic Inspection', category: 'Inspection' },
    { value: 'WELL_INSPECTION', label: 'Well Inspection', category: 'Inspection' },
    
    // Handyman
    { value: 'MINOR_REPAIRS', label: 'Minor Repairs', category: 'Handyman' },
    { value: 'FIXTURE_INSTALLATION', label: 'Fixture Installation', category: 'Handyman' },
    { value: 'FURNITURE_ASSEMBLY', label: 'Furniture Assembly', category: 'Handyman' },
    { value: 'PAINTING', label: 'Painting', category: 'Handyman' },
    { value: 'DRYWALL_REPAIR', label: 'Drywall Repair', category: 'Handyman' },
    { value: 'APPLIANCE_INSTALLATION', label: 'Appliance Installation', category: 'Handyman' },
  ];

  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';

    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.businessName) newErrors.businessName = 'Business name is required';
    if (!formData.businessPhone) newErrors.businessPhone = 'Business phone is required';
    if (!formData.businessEmail) newErrors.businessEmail = 'Business email is required';
    if (!formData.yearsInBusiness) newErrors.yearsInBusiness = 'Years in business is required';
    if (!formData.description) newErrors.description = 'Business description is required';
    else if (formData.description.length < 50) {
      newErrors.description = 'Description must be at least 50 characters';
    }

    if (formData.services.length === 0) {
      newErrors.services = 'Please select at least one service';
    }

    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = 'You must agree to the terms of service';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
      setErrors({});
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(1);
    setErrors({});
  };

  const handleServiceToggle = (service: ServiceCategory) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateStep2()) {
      return;
    }

    try {
      setIsLoading(true);
      const result = await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: 'PROVIDER',
        // These would normally be sent in a separate API call after registration
        businessName: formData.businessName,
        businessPhone: formData.businessPhone,
        businessEmail: formData.businessEmail,
        yearsInBusiness: parseInt(formData.yearsInBusiness),
        description: formData.description,
        services: formData.services,
      });

      if (result.success) {
        // Redirect to provider dashboard after successful registration
        router.push('/providers/dashboard');
      } else {
        setError(result.error || 'Failed to create provider account');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create provider account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col">
      {/* Navigation Header with Home Link */}
      <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo - Links to Home */}
            <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <span className="text-2xl">🏠</span>
              <span className="text-lg font-semibold text-gray-900">Contract to Cozy</span>
            </Link>

            {/* Right side navigation */}
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                Homeowner Sign Up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl w-full">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium mb-4">
                <span className="mr-1.5">🔧</span>
                Provider Registration
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Join as a Provider</h2>
              <p className="mt-2 text-sm text-gray-600">
                Connect with homeowners and grow your business
              </p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-center justify-center">
                <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
                  }`}>
                    {currentStep > 1 ? '✓' : '1'}
                  </div>
                  <span className="ml-2 text-sm font-medium">Account</span>
                </div>
                <div className={`w-16 h-1 mx-4 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
                  }`}>
                    2
                  </div>
                  <span className="ml-2 text-sm font-medium">Business</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Account Information */}
            {currentStep === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className={`w-full px-4 py-2.5 border ${
                        errors.firstName ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="John"
                    />
                    {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
                  </div>

                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className={`w-full px-4 py-2.5 border ${
                        errors.lastName ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="Doe"
                    />
                    {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-4 py-2.5 border ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="you@example.com"
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`w-full px-4 py-2.5 border ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="••••••••"
                  />
                  {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
                  <p className="mt-1 text-xs text-gray-500">At least 8 characters</p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={`w-full px-4 py-2.5 border ${
                      errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="••••••••"
                  />
                  {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                >
                  Continue →
                </button>
              </form>
            )}

            {/* Step 2: Business Information */}
            {currentStep === 2 && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Business Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Business Information</h3>
                  
                  <div>
                    <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="businessName"
                      name="businessName"
                      type="text"
                      required
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      className={`w-full px-4 py-2.5 border ${
                        errors.businessName ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="ABC Home Services"
                    />
                    {errors.businessName && <p className="mt-1 text-sm text-red-600">{errors.businessName}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="businessPhone" className="block text-sm font-medium text-gray-700 mb-1">
                        Business Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="businessPhone"
                        name="businessPhone"
                        type="tel"
                        required
                        value={formData.businessPhone}
                        onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                        className={`w-full px-4 py-2.5 border ${
                          errors.businessPhone ? 'border-red-300' : 'border-gray-300'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        placeholder="(555) 123-4567"
                      />
                      {errors.businessPhone && <p className="mt-1 text-sm text-red-600">{errors.businessPhone}</p>}
                    </div>

                    <div>
                      <label htmlFor="businessEmail" className="block text-sm font-medium text-gray-700 mb-1">
                        Business Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="businessEmail"
                        name="businessEmail"
                        type="email"
                        required
                        value={formData.businessEmail}
                        onChange={(e) => setFormData({ ...formData, businessEmail: e.target.value })}
                        className={`w-full px-4 py-2.5 border ${
                          errors.businessEmail ? 'border-red-300' : 'border-gray-300'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        placeholder="contact@business.com"
                      />
                      {errors.businessEmail && <p className="mt-1 text-sm text-red-600">{errors.businessEmail}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="yearsInBusiness" className="block text-sm font-medium text-gray-700 mb-1">
                      Years in Business <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="yearsInBusiness"
                      name="yearsInBusiness"
                      type="number"
                      min="0"
                      required
                      value={formData.yearsInBusiness}
                      onChange={(e) => setFormData({ ...formData, yearsInBusiness: e.target.value })}
                      className={`w-full px-4 py-2.5 border ${
                        errors.yearsInBusiness ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="5"
                    />
                    {errors.yearsInBusiness && <p className="mt-1 text-sm text-red-600">{errors.yearsInBusiness}</p>}
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                      Business Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      rows={4}
                      required
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={`w-full px-4 py-2.5 border ${
                        errors.description ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="Tell homeowners about your business, experience, and what makes you unique..."
                    />
                    {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
                    <p className="mt-1 text-xs text-gray-500">{formData.description.length}/50 characters minimum</p>
                  </div>
                </div>

                {/* Services Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Services Offered <span className="text-red-500">*</span>
                  </label>
                  {errors.services && <p className="mb-2 text-sm text-red-600">{errors.services}</p>}
                  
                  {/* Group by category */}
                  {['Inspection', 'Handyman'].map(category => (
                    <div key={category} className="mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">{category}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {serviceOptions
                          .filter(option => option.category === category)
                          .map(option => (
                            <label
                              key={option.value}
                              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                                formData.services.includes(option.value)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-300 hover:border-gray-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={formData.services.includes(option.value)}
                                onChange={() => handleServiceToggle(option.value)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Terms Agreement */}
                <div>
                  <label className="flex items-start">
                    <input
                      type="checkbox"
                      checked={formData.agreeToTerms}
                      onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      I agree to the{' '}
                      <Link href="/terms" className="text-blue-600 hover:text-blue-700">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
                        Privacy Policy
                      </Link>
                    </span>
                  </label>
                  {errors.agreeToTerms && <p className="mt-1 text-sm text-red-600">{errors.agreeToTerms}</p>}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="flex-1 py-3 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Provider Account'}
                  </button>
                </div>
              </form>
            )}

            {/* Footer Links */}
            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign in
                </Link>
              </p>
              <p className="text-sm text-gray-600">
                Are you a homeowner?{' '}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up as homeowner
                </Link>
              </p>
            </div>
          </div>

          {/* Help Text */}
          <p className="mt-6 text-center text-xs text-gray-500">
            Need help?{' '}
            <Link href="/contact" className="text-blue-600 hover:text-blue-700">
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
