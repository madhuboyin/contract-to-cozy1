'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { isValidEmail, isValidPassword } from '@/lib/utils';

type ServiceCategory = 'INSPECTION' | 'HANDYMAN';

interface ProviderFormData {
  // Personal info
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  
  // Business info
  businessName: string;
  serviceCategories: ServiceCategory[];
  serviceRadius: number;
  yearsInBusiness: number;
  description: string;
  
  // Role (always PROVIDER)
  role: 'PROVIDER';
}

export default function ProviderJoinPage() {
  const router = useRouter();
  const { register } = useAuth();
  
  const [formData, setFormData] = useState<ProviderFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    businessName: '',
    serviceCategories: [],
    serviceRadius: 25,
    yearsInBusiness: 0,
    description: '',
    role: 'PROVIDER',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [currentStep, setCurrentStep] = useState(1);

  const validate = (step: number) => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      // Personal Information
      if (!formData.firstName.trim()) {
        newErrors.firstName = 'First name is required';
      }

      if (!formData.lastName.trim()) {
        newErrors.lastName = 'Last name is required';
      }

      if (!formData.email) {
        newErrors.email = 'Email is required';
      } else if (!isValidEmail(formData.email)) {
        newErrors.email = 'Invalid email format';
      }

      if (!formData.phone) {
        newErrors.phone = 'Phone number is required';
      } else if (!/^\+?1?\d{10,}$/.test(formData.phone.replace(/[\s-()]/g, ''))) {
        newErrors.phone = 'Invalid phone number format';
      }

      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (!isValidPassword(formData.password)) {
        newErrors.password = 'Password must be at least 8 characters with uppercase, lowercase, and number';
      }

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    if (step === 2) {
      // Business Information
      if (!formData.businessName.trim()) {
        newErrors.businessName = 'Business name is required';
      }

      if (formData.serviceCategories.length === 0) {
        newErrors.serviceCategories = 'Please select at least one service category';
      }

      if (!formData.serviceRadius || formData.serviceRadius < 5) {
        newErrors.serviceRadius = 'Service radius must be at least 5 miles';
      }

      if (!formData.yearsInBusiness || formData.yearsInBusiness < 0) {
        newErrors.yearsInBusiness = 'Years in business is required';
      }

      if (!formData.description.trim()) {
        newErrors.description = 'Business description is required';
      } else if (formData.description.trim().length < 50) {
        newErrors.description = 'Description must be at least 50 characters';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate(currentStep)) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleServiceCategory = (category: ServiceCategory) => {
    setFormData(prev => ({
      ...prev,
      serviceCategories: prev.serviceCategories.includes(category)
        ? prev.serviceCategories.filter(c => c !== category)
        : [...prev.serviceCategories, category]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!validate(2)) return;

    setIsLoading(true);

    // Prepare registration data for the existing auth API
    const { confirmPassword, ...registerData } = formData;
    
    const result = await register(registerData);

    if (result.success) {
      // Redirect to provider dashboard (will be created in future tasks)
      router.push('/providers/dashboard');
    } else {
      setApiError(result.error || 'Registration failed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2 text-2xl font-bold text-blue-600 mb-4">
            <span className="text-3xl">🏠</span>
            <span>Contract to Cozy</span>
          </Link>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Join as a Service Provider
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Connect with homeowners and grow your business
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-4">
              {/* Step 1 */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  1
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  currentStep >= 1 ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  Personal Info
                </span>
              </div>
              
              {/* Connector */}
              <div className={`h-1 w-16 ${
                currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'
              }`}></div>
              
              {/* Step 2 */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  2
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  currentStep >= 2 ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  Business Info
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white shadow-lg rounded-lg p-8">
          {/* API Error */}
          {apiError && (
            <div className="mb-6 rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{apiError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <form onSubmit={handleNextStep} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h3>
                
                {/* Name fields */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className={`appearance-none block w-full px-3 py-2 border ${
                        errors.firstName ? 'border-red-300' : 'border-gray-300'
                      } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                      placeholder="John"
                    />
                    {errors.firstName && (
                      <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className={`appearance-none block w-full px-3 py-2 border ${
                        errors.lastName ? 'border-red-300' : 'border-gray-300'
                      } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                      placeholder="Doe"
                    />
                    {errors.lastName && (
                      <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="john@example.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div className="mb-4">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.phone ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="+1 (555) 123-4567"
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Homeowners will use this to contact you about bookings
                  </p>
                </div>

                {/* Password */}
                <div className="mb-4">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="••••••••"
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters with uppercase, lowercase, and number
                  </p>
                </div>

                {/* Confirm Password */}
                <div className="mb-4">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="••••••••"
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>

              {/* Next Button */}
              <div>
                <button
                  type="submit"
                  className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue to Business Information →
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Business Information */}
          {currentStep === 2 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Business Information</h3>
                
                {/* Business Name */}
                <div className="mb-4">
                  <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                    Business name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="businessName"
                    name="businessName"
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.businessName ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="ABC Home Inspections LLC"
                  />
                  {errors.businessName && (
                    <p className="mt-1 text-sm text-red-600">{errors.businessName}</p>
                  )}
                </div>

                {/* Service Categories */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service categories <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-3">
                    <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      formData.serviceCategories.includes('INSPECTION')
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.serviceCategories.includes('INSPECTION')}
                        onChange={() => toggleServiceCategory('INSPECTION')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">🔍 Home Inspection Services</span>
                        <p className="text-xs text-gray-500 mt-1">
                          Pre-purchase inspections, pest inspection, radon testing, mold inspection, etc.
                        </p>
                      </div>
                    </label>

                    <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      formData.serviceCategories.includes('HANDYMAN')
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.serviceCategories.includes('HANDYMAN')}
                        onChange={() => toggleServiceCategory('HANDYMAN')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">🔧 Handyman Services</span>
                        <p className="text-xs text-gray-500 mt-1">
                          Minor repairs, fixture installation, furniture assembly, drywall repair, etc.
                        </p>
                      </div>
                    </label>
                  </div>
                  {errors.serviceCategories && (
                    <p className="mt-1 text-sm text-red-600">{errors.serviceCategories}</p>
                  )}
                </div>

                {/* Service Radius */}
                <div className="mb-4">
                  <label htmlFor="serviceRadius" className="block text-sm font-medium text-gray-700 mb-1">
                    Service radius (miles) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="serviceRadius"
                    name="serviceRadius"
                    type="number"
                    min="5"
                    max="200"
                    required
                    value={formData.serviceRadius}
                    onChange={(e) => setFormData({ ...formData, serviceRadius: parseInt(e.target.value) || 0 })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.serviceRadius ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="25"
                  />
                  {errors.serviceRadius && (
                    <p className="mt-1 text-sm text-red-600">{errors.serviceRadius}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    How far are you willing to travel for jobs?
                  </p>
                  <div className="mt-2">
                    <input
                      type="range"
                      min="5"
                      max="200"
                      value={formData.serviceRadius}
                      onChange={(e) => setFormData({ ...formData, serviceRadius: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>5 mi</span>
                      <span className="font-medium text-blue-600">{formData.serviceRadius} miles</span>
                      <span>200 mi</span>
                    </div>
                  </div>
                </div>

                {/* Years in Business */}
                <div className="mb-4">
                  <label htmlFor="yearsInBusiness" className="block text-sm font-medium text-gray-700 mb-1">
                    Years in business <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="yearsInBusiness"
                    name="yearsInBusiness"
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={formData.yearsInBusiness}
                    onChange={(e) => setFormData({ ...formData, yearsInBusiness: parseInt(e.target.value) || 0 })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.yearsInBusiness ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="5"
                  />
                  {errors.yearsInBusiness && (
                    <p className="mt-1 text-sm text-red-600">{errors.yearsInBusiness}</p>
                  )}
                </div>

                {/* Business Description */}
                <div className="mb-4">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Business description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      errors.description ? 'border-red-300' : 'border-gray-300'
                    } rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="Tell homeowners about your business, experience, and what makes you unique..."
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.description.length}/50 characters minimum
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="flex-1 flex justify-center py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating Account...' : 'Create Provider Account'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/providers/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Are you a homeowner?{' '}
            <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
              Create homeowner account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
