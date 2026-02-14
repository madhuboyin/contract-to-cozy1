'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState<'personal' | 'address' | 'account'>('personal');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  // Store the last saved profile data for cancel/reset
  const savedFormData = useRef(formData);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          const profileData = result.data;
          
          const loaded = {
            firstName: profileData.firstName || '',
            lastName: profileData.lastName || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            address: profileData.address || '',
            city: profileData.city || '',
            state: profileData.state || '',
            zipCode: profileData.zipCode || '',
          };
          setFormData(loaded);
          savedFormData.current = loaded;
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setIsEditing(false);
        
        // Update form with returned data
        if (data.data) {
          const updated = {
            firstName: data.data.firstName || '',
            lastName: data.data.lastName || '',
            email: data.data.email || '',
            phone: data.data.phone || '',
            address: data.data.address || '',
            city: data.data.city || '',
            state: data.data.state || '',
            zipCode: data.data.zipCode || '',
          };
          setFormData(updated);
          savedFormData.current = updated;
        }
        
        await refreshUser();
      } else {
        // FIX: Improved error message handling to show validation details
        let errorMessage = data.error || 'Failed to update profile';
        
        if (data.details && Array.isArray(data.details) && data.details.length > 0) {
          // Use the first detailed error for a concise banner message
          const firstDetail = data.details[0];
          
          let fieldName = firstDetail.path.join('.') || 'A field';
          // Capitalize first part of the field name
          fieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
          
          errorMessage = `Validation Error: ${fieldName} - ${firstDetail.message}`;
        }
        
        setMessage({ type: 'error', text: errorMessage });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile due to a network error.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(savedFormData.current);
    setIsEditing(false);
    setMessage(null);
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setActiveMobileSection('personal');
  };

  const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  return (
    <div className="mx-auto max-w-4xl pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="mt-2 text-gray-600">Manage your account information</p>
        </div>
        {!isEditing && (
          <button
            onClick={handleStartEditing}
            // FIX: Use brand color utilities
            className="min-h-[44px] w-full rounded-lg bg-brand-primary px-4 py-2 text-white transition-colors hover:bg-brand-primary-light sm:w-auto"
          >
            Edit Profile
          </button>
        )}
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveMobileSection('personal')}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={activeMobileSection === 'personal'}
          >
            <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
            <ChevronDown
              className={`h-5 w-5 text-gray-500 transition-transform md:hidden ${
                activeMobileSection === 'personal' ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div className={`${activeMobileSection === 'personal' ? 'mt-4 block' : 'hidden'} md:block`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  // FIX: Use brand ring color utility
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                />
              ) : (
                <p className="text-gray-900 py-2.5">{formData.firstName || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  // FIX: Use brand ring color utility
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                />
              ) : (
                <p className="text-gray-900 py-2.5">{formData.lastName || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <p className="text-gray-900 py-2.5">{formData.email}</p>
              {isEditing && (
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  // FIX: Use brand ring color utility
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                />
              ) : (
                <p className="text-gray-900 py-2.5">{formData.phone || '—'}</p>
              )}
            </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setActiveMobileSection('address')}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={activeMobileSection === 'address'}
          >
            <h2 className="text-xl font-semibold text-gray-900">Address Information</h2>
            <ChevronDown
              className={`h-5 w-5 text-gray-500 transition-transform md:hidden ${
                activeMobileSection === 'address' ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div className={`${activeMobileSection === 'address' ? 'mt-4 block' : 'hidden'} md:block`}>
            <div className="grid grid-cols-1 gap-4 sm:gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Street Address
              </label>
              {isEditing ? (
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="123 Main Street"
                  // FIX: Use brand ring color utility
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                />
              ) : (
                <p className="text-gray-900 py-2.5">{formData.address || '—'}</p>
              )}
            </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="New York"
                    // FIX: Use brand ring color utility
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                  />
                ) : (
                  <p className="text-gray-900 py-2.5">{formData.city || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State
                </label>
                {isEditing ? (
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    // FIX: Use brand ring color utility
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                  >
                    <option value="">Select State</option>
                    {states.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-gray-900 py-2.5">{formData.state || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleChange}
                    placeholder="10001"
                    maxLength={5}
                    // FIX: Use brand ring color utility
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                  />
                ) : (
                <p className="text-gray-900 py-2.5">{formData.zipCode || '—'}</p>
              )}
            </div>
              </div>
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 sm:px-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="min-h-[44px] w-full rounded-lg border border-gray-300 px-6 py-2.5 text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              // FIX: Use brand color utilities
              className="min-h-[44px] w-full rounded-lg bg-brand-primary px-6 py-2.5 text-white transition-colors hover:bg-brand-primary-light disabled:opacity-50 sm:w-auto"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-6 bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setActiveMobileSection('account')}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={activeMobileSection === 'account'}
        >
          <h2 className="text-xl font-semibold text-gray-900">Account Information</h2>
          <ChevronDown
            className={`h-5 w-5 text-gray-500 transition-transform md:hidden ${
              activeMobileSection === 'account' ? 'rotate-180' : ''
            }`}
          />
        </button>
        <div className={`${activeMobileSection === 'account' ? 'mt-4 block' : 'hidden'} md:block`}>
          <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Account Type</span>
            <span className="font-medium text-gray-900 capitalize">
              {user?.role?.toLowerCase() || 'Homeowner'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Member Since</span>
            <span className="font-medium text-gray-900">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Account Status</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Active
            </span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
