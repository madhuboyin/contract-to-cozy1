'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

type EditableSection = 'profile' | 'address';

type ProfileFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

function SectionCard({
  title,
  action,
  children,
  footer,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className || ''}`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6">
        <h2 className="text-xl font-semibold uppercase tracking-wide text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      {footer && <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 sm:px-6">{footer}</div>}
    </section>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
      <div className="text-sm font-semibold text-gray-800">{label}</div>
      <div className="text-base break-words text-gray-900">{value}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [editingSection, setEditingSection] = useState<EditableSection | null>(null);
  const [savingSection, setSavingSection] = useState<EditableSection | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const savedFormData = useRef<ProfileFormData>(formData);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) return;

        const result = await response.json();
        const profileData = result.data;
        const loaded: ProfileFormData = {
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
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const startEditing = (section: EditableSection) => {
    setMessage(null);
    setEditingSection(section);
  };

  const cancelEditing = (section: EditableSection) => {
    if (section === 'profile') {
      setFormData((prev) => ({
        ...prev,
        firstName: savedFormData.current.firstName,
        lastName: savedFormData.current.lastName,
        phone: savedFormData.current.phone,
      }));
    }

    if (section === 'address') {
      setFormData((prev) => ({
        ...prev,
        address: savedFormData.current.address,
        city: savedFormData.current.city,
        state: savedFormData.current.state,
        zipCode: savedFormData.current.zipCode,
      }));
    }

    setEditingSection(null);
    setMessage(null);
  };

  const saveSection = async (section: EditableSection) => {
    setSavingSection(section);
    setMessage(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || 'Failed to update profile';
        if (data.details && Array.isArray(data.details) && data.details.length > 0) {
          const firstDetail = data.details[0];
          let fieldName = firstDetail.path.join('.') || 'A field';
          fieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
          errorMessage = `Validation Error: ${fieldName} - ${firstDetail.message}`;
        }
        setMessage({ type: 'error', text: errorMessage });
        return;
      }

      const updated: ProfileFormData = {
        firstName: data.data?.firstName || '',
        lastName: data.data?.lastName || '',
        email: data.data?.email || '',
        phone: data.data?.phone || '',
        address: data.data?.address || '',
        city: data.data?.city || '',
        state: data.data?.state || '',
        zipCode: data.data?.zipCode || '',
      };

      setFormData(updated);
      savedFormData.current = updated;
      setEditingSection(null);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
      await refreshUser();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile due to a network error.' });
    } finally {
      setSavingSection(null);
    }
  };

  const profileEditing = editingSection === 'profile';
  const addressEditing = editingSection === 'address';
  const actionLinkClass = 'text-base font-medium text-brand-primary underline decoration-transparent underline-offset-4 transition-colors hover:text-brand-primary-light hover:decoration-brand-primary-light';

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-brand-primary';

  return (
    <div className="mx-auto max-w-6xl pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="mt-2 text-gray-600">Manage your account information</p>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg border p-4 ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          className="h-full"
          title="Profile"
          action={
            !profileEditing ? (
              <button
                onClick={() => startEditing('profile')}
                className={actionLinkClass}
              >
                Edit Profile
              </button>
            ) : undefined
          }
          footer={
            profileEditing ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  onClick={() => cancelEditing('profile')}
                  disabled={savingSection === 'profile'}
                  className="min-h-[44px] w-full rounded-lg border border-gray-300 px-6 py-2.5 text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveSection('profile')}
                  disabled={savingSection === 'profile'}
                  className="min-h-[44px] w-full rounded-lg bg-brand-primary px-6 py-2.5 text-white transition-colors hover:bg-brand-primary-light disabled:opacity-50 sm:w-auto"
                >
                  {savingSection === 'profile' ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : undefined
          }
        >
          <FieldRow
            label="First Name"
            value={
              profileEditing ? (
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={inputClass}
                />
              ) : (
                formData.firstName || '—'
              )
            }
          />
          <FieldRow
            label="Last Name"
            value={
              profileEditing ? (
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={inputClass}
                />
              ) : (
                formData.lastName || '—'
              )
            }
          />
          <FieldRow
            label="Phone Number"
            value={
              profileEditing ? (
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  className={inputClass}
                />
              ) : (
                formData.phone || '—'
              )
            }
          />
        </SectionCard>

        <SectionCard className="h-full" title="Email">
          <FieldRow label="E-Mail Address" value={formData.email || '—'} />
          <p className="mt-2 text-sm text-gray-500">
            Email is currently managed by account authentication settings.
          </p>
        </SectionCard>

        <SectionCard
          className="h-full"
          title="Address"
          action={
            !addressEditing ? (
              <button
                onClick={() => startEditing('address')}
                className={actionLinkClass}
              >
                Edit Address
              </button>
            ) : undefined
          }
          footer={
            addressEditing ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  onClick={() => cancelEditing('address')}
                  disabled={savingSection === 'address'}
                  className="min-h-[44px] w-full rounded-lg border border-gray-300 px-6 py-2.5 text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveSection('address')}
                  disabled={savingSection === 'address'}
                  className="min-h-[44px] w-full rounded-lg bg-brand-primary px-6 py-2.5 text-white transition-colors hover:bg-brand-primary-light disabled:opacity-50 sm:w-auto"
                >
                  {savingSection === 'address' ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : undefined
          }
        >
          <FieldRow
            label="Street Address"
            value={
              addressEditing ? (
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="123 Main Street"
                  className={inputClass}
                />
              ) : (
                formData.address || '—'
              )
            }
          />

          <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-3">
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800">City</div>
              {addressEditing ? (
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="City"
                />
              ) : (
                <div className="break-words text-gray-900">{formData.city || '—'}</div>
              )}
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800">State</div>
              {addressEditing ? (
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select State</option>
                  {STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-gray-900">{formData.state || '—'}</div>
              )}
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800">ZIP Code</div>
              {addressEditing ? (
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  maxLength={5}
                  className={inputClass}
                  placeholder="10001"
                />
              ) : (
                <div className="text-gray-900">{formData.zipCode || '—'}</div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard className="h-full" title="Account">
          <FieldRow
            label="Account Type"
            value={<span className="capitalize">{user?.role?.toLowerCase() || 'Homeowner'}</span>}
          />
          <FieldRow
            label="Member Since"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
          />
          <FieldRow
            label="Account Status"
            value={
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}
