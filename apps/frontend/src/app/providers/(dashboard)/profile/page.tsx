// apps/frontend/src/app/providers/(dashboard)/profile/page.tsx

'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { toast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobileFilterSurface,
  MobileKpiStrip,
  MobileKpiTile,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

interface BusinessInfo {
  businessName: string;
  description: string;
  yearsInBusiness: number;
  licenseNumber: string;
  insuranceNumber: string;
  serviceRadius: number;
}

interface ContactInfo {
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-[0.1em] text-slate-500">{children}</label>;
}

function TextField({
  isEditing,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  isEditing: boolean;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  if (!isEditing) {
    return <p className="mb-0 text-sm text-slate-900">{String(value) || '—'}</p>;
  }

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
    />
  );
}

function TextAreaField({
  isEditing,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  isEditing: boolean;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  if (!isEditing) {
    return <p className="mb-0 text-sm text-slate-900">{value || '—'}</p>;
  }

  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
    />
  );
}

const TABS = [
  { key: 'business', label: 'Business' },
  { key: 'contact', label: 'Contact' },
  { key: 'documents', label: 'Documents' },
  { key: 'settings', label: 'Settings' },
] as const;

export default function ProviderProfilePage() {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('business');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    businessName: 'ABC Home Inspections',
    description: 'Professional home inspection services with over 10 years of experience. Certified and insured.',
    yearsInBusiness: 10,
    licenseNumber: 'HI-12345',
    insuranceNumber: 'INS-67890',
    serviceRadius: 25,
  });

  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    email: user?.email || '',
    phone: '(609) 555-0123',
    website: 'https://abchomeinspections.com',
    address: '123 Main Street',
    city: 'Princeton',
    state: 'NJ',
    zipCode: '08540',
  });

  const [serviceAreas, setServiceAreas] = useState<string[]>(['Princeton, NJ', 'Trenton, NJ', 'Hamilton, NJ', 'Lawrence, NJ']);
  const [newServiceArea, setNewServiceArea] = useState('');

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    setIsEditing(false);
    alert('Profile updated successfully!');
  };

  const handleAddServiceArea = () => {
    if (newServiceArea.trim() && !serviceAreas.includes(newServiceArea.trim())) {
      setServiceAreas([...serviceAreas, newServiceArea.trim()]);
      setNewServiceArea('');
    }
  };

  const handleRemoveServiceArea = (area: string) => {
    setServiceAreas(serviceAreas.filter((existing) => existing !== area));
  };

  const handleFileUpload = (type: 'license' | 'insurance' | 'photo') => {
    alert(`Upload for ${type} is not available in this build yet. Please contact support to add this document.`);
  };

  const handleDeactivateAccount = async () => {
    if (isDeactivating || isDeleting) return;
    const confirmed = window.confirm(
      'Deactivate your account? Your provider profile will be hidden until support reactivates it.',
    );
    if (!confirmed) return;

    setIsDeactivating(true);
    try {
      const response = await api.deactivateMyAccount();
      if (!response.success) {
        throw new Error(response.message || 'Unable to deactivate account.');
      }

      toast({
        title: 'Account deactivated',
        description: 'Your provider profile is now inactive.',
      });
      logout();
    } catch (error: any) {
      toast({
        title: 'Deactivation failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeleting || isDeactivating) return;
    const typed = window.prompt('Type DELETE to permanently remove this account.');
    if (typed !== 'DELETE') {
      if (typed !== null) {
        toast({
          title: 'Deletion cancelled',
          description: 'Type DELETE exactly to confirm account deletion.',
        });
      }
      return;
    }

    setIsDeleting(true);
    try {
      const response = await api.deleteMyAccount();
      if (!response.success) {
        throw new Error(response.message || 'Unable to delete account.');
      }

      toast({
        title: 'Account deleted',
        description: 'Your account has been removed and access has been revoked.',
      });
      logout();
    } catch (error: any) {
      toast({
        title: 'Deletion failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ProviderShellTemplate
      title="Profile Settings"
      subtitle="Manage your public provider profile and account preferences."
      eyebrow="Provider Profile"
      primaryAction={{
        title: isEditing ? 'Save profile updates before leaving this screen.' : 'Keep your provider profile current.',
        description:
          'Homeowners trust providers with complete contact, license, and service-area details before booking.',
        primaryAction: isEditing ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Edit profile
          </button>
        ),
        supportingAction: isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel edits
          </button>
        ) : (
          <span className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
            Read-only mode
          </span>
        ),
        impactLabel: isEditing ? 'Draft changes open' : 'Public trust profile',
        confidenceLabel: `${serviceAreas.length} service area${serviceAreas.length === 1 ? '' : 's'} configured`,
      }}
      trust={{
        confidenceLabel: 'Profile confidence improves with complete contact info, coverage area, and credential records.',
        freshnessLabel: isEditing ? 'Unsaved edits in progress' : 'Profile matches saved account details',
        sourceLabel: 'Provider profile fields, credential uploads, and service-area settings.',
        rationale: 'Complete and current profile details reduce homeowner hesitation during selection.',
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile label="Years" value={businessInfo.yearsInBusiness} hint="In business" />
          <MobileKpiTile label="Radius" value={`${businessInfo.serviceRadius} mi`} hint="Service range" />
          <MobileKpiTile label="Areas" value={serviceAreas.length} hint="Coverage cities" tone={serviceAreas.length > 0 ? 'positive' : 'neutral'} />
        </MobileKpiStrip>
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Sections</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[36px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </MobileFilterSurface>
      }
    >
      {activeTab === 'business' ? (
        <div className="space-y-3">
          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Profile photo</p>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-xl font-semibold text-white">
                {user?.firstName?.charAt(0) || 'P'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-sm font-medium text-slate-900">{businessInfo.businessName}</p>
                <p className="mb-0 mt-0.5 text-xs text-slate-500">JPG, PNG, or GIF. Max 2MB.</p>
              </div>
              <button
                type="button"
                onClick={() => handleFileUpload('photo')}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Change
              </button>
            </div>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Business details</p>

            <div>
              <FieldLabel>Business name</FieldLabel>
              <TextField
                isEditing={isEditing}
                value={businessInfo.businessName}
                onChange={(value) => setBusinessInfo({ ...businessInfo, businessName: value })}
              />
            </div>

            <div>
              <FieldLabel>Description</FieldLabel>
              <TextAreaField
                isEditing={isEditing}
                value={businessInfo.description}
                onChange={(value) => setBusinessInfo({ ...businessInfo, description: value })}
                placeholder="Tell homeowners about your business"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Years in business</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  type="number"
                  value={businessInfo.yearsInBusiness}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, yearsInBusiness: parseInt(value, 10) || 0 })}
                />
              </div>
              <div>
                <FieldLabel>Service radius (miles)</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  type="number"
                  value={businessInfo.serviceRadius}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, serviceRadius: parseInt(value, 10) || 0 })}
                />
              </div>
            </div>

            <div>
              <FieldLabel>Service areas</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {serviceAreas.map((area) => (
                  <span key={area} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                    {area}
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveServiceArea(area)}
                        className="text-sky-700 hover:text-sky-900"
                        aria-label={`Remove ${area}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>

              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newServiceArea}
                    onChange={(e) => setNewServiceArea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddServiceArea();
                      }
                    }}
                    placeholder="Add city or ZIP"
                    className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                  <button
                    type="button"
                    onClick={handleAddServiceArea}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                  >
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          </MobileCard>
        </div>
      ) : null}

      {activeTab === 'contact' ? (
        <MobileCard variant="compact" className="space-y-3">
          <p className="mb-0 text-sm font-semibold text-slate-900">Contact information</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Email</FieldLabel>
              <TextField isEditing={isEditing} type="email" value={contactInfo.email} onChange={(value) => setContactInfo({ ...contactInfo, email: value })} />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <TextField isEditing={isEditing} type="tel" value={contactInfo.phone} onChange={(value) => setContactInfo({ ...contactInfo, phone: value })} />
            </div>
          </div>

          <div>
            <FieldLabel>Website</FieldLabel>
            <TextField
              isEditing={isEditing}
              type="url"
              value={contactInfo.website}
              onChange={(value) => setContactInfo({ ...contactInfo, website: value })}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <FieldLabel>Address</FieldLabel>
            <TextField isEditing={isEditing} value={contactInfo.address} onChange={(value) => setContactInfo({ ...contactInfo, address: value })} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel>City</FieldLabel>
              <TextField isEditing={isEditing} value={contactInfo.city} onChange={(value) => setContactInfo({ ...contactInfo, city: value })} />
            </div>
            <div>
              <FieldLabel>State</FieldLabel>
              <TextField isEditing={isEditing} value={contactInfo.state} onChange={(value) => setContactInfo({ ...contactInfo, state: value })} />
            </div>
            <div>
              <FieldLabel>ZIP code</FieldLabel>
              <TextField isEditing={isEditing} value={contactInfo.zipCode} onChange={(value) => setContactInfo({ ...contactInfo, zipCode: value })} />
            </div>
          </div>
        </MobileCard>
      ) : null}

      {activeTab === 'documents' ? (
        <div className="space-y-3">
          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Professional license</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>License number</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  value={businessInfo.licenseNumber}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, licenseNumber: value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => handleFileUpload('license')}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Upload license
                </button>
              </div>
            </div>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Insurance</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Policy number</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  value={businessInfo.insuranceNumber}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, insuranceNumber: value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => handleFileUpload('insurance')}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Upload certificate
                </button>
              </div>
            </div>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="mb-0 text-sm font-semibold text-slate-900">Certifications</p>
              <button className="inline-flex min-h-[36px] items-center rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary/90">
                + Add
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-0 text-sm font-medium text-slate-900">Certified Home Inspector</p>
              <p className="mb-0 mt-0.5 text-xs text-slate-500">Issued by ASHI • Expires: Dec 2026</p>
            </div>
          </MobileCard>
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div className="space-y-3">
          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Notification preferences</p>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Email notifications</p>
                <p className="mb-0 text-xs text-slate-500">Alerts for new bookings</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-primary" />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">SMS notifications</p>
                <p className="mb-0 text-xs text-slate-500">Urgent updates by text</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-primary" />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Marketing emails</p>
                <p className="mb-0 text-xs text-slate-500">Tips and updates</p>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-primary" />
            </label>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Change password</p>
            <input type="password" placeholder="Current password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <input type="password" placeholder="New password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <input type="password" placeholder="Confirm new password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <button className="inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90">
              Update password
            </button>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3 border-rose-200 bg-rose-50/40">
            <p className="mb-0 text-sm font-semibold text-rose-900">Danger zone</p>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Deactivate account</p>
                <p className="mb-0 text-xs text-slate-500">Temporarily disable your profile</p>
              </div>
              <button
                type="button"
                onClick={() => void handleDeactivateAccount()}
                disabled={isDeactivating || isDeleting}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Delete account</p>
                <p className="mb-0 text-xs text-slate-500">Permanently remove account and data</p>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeleting || isDeactivating}
                className="inline-flex min-h-[36px] items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </MobileCard>
        </div>
      ) : null}

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
