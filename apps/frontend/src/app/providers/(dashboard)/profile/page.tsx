// apps/frontend/src/app/providers/(dashboard)/profile/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { toast } from '@/components/ui/use-toast';
import { ServiceCategory } from '@/types';
import { ALL_SERVICE_CATEGORIES, getCategoryDisplayLabel } from '@/lib/config/serviceCategoryMapping';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobileFilterSurface,
  MobileKpiStrip,
  MobileKpiTile,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { MfaSettingsPanel } from '@/components/security/MfaSettingsPanel';

interface BusinessInfo {
  businessName: string;
  businessType: string;
  description: string;
  website: string;
  yearsInBusiness: string;
  teamSize: string;
  serviceRadius: string;
  serviceCategories: ServiceCategory[];
}

interface ContactInfo {
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

const EMPTY_BUSINESS: BusinessInfo = {
  businessName: '',
  businessType: '',
  description: '',
  website: '',
  yearsInBusiness: '',
  teamSize: '',
  serviceRadius: '',
  serviceCategories: [],
};

const EMPTY_CONTACT: ContactInfo = { phone: '', address: '', city: '', state: '', zipCode: '' };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium tracking-normal text-slate-500">{children}</label>;
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
      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base md:text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
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
      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base md:text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
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
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(EMPTY_BUSINESS);
  const [contactInfo, setContactInfo] = useState<ContactInfo>(EMPTY_CONTACT);
  // Snapshots to restore on "Cancel edits" without a refetch.
  const [savedBusinessInfo, setSavedBusinessInfo] = useState<BusinessInfo>(EMPTY_BUSINESS);
  const [savedContactInfo, setSavedContactInfo] = useState<ContactInfo>(EMPTY_CONTACT);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const [profileRes, userRes] = await Promise.all([api.getMyProviderProfile(), api.getUserProfile()]);

      if (profileRes.success) {
        const p = profileRes.data;
        const next: BusinessInfo = {
          businessName: p.businessName || '',
          businessType: p.businessType || '',
          description: p.description || '',
          website: p.website || '',
          yearsInBusiness: p.yearsInBusiness != null ? String(p.yearsInBusiness) : '',
          teamSize: p.teamSize != null ? String(p.teamSize) : '',
          serviceRadius: String(p.serviceRadius ?? ''),
          serviceCategories: p.serviceCategories || [],
        };
        setBusinessInfo(next);
        setSavedBusinessInfo(next);
      }

      if (userRes.success) {
        const u = userRes.data as any;
        const next: ContactInfo = {
          phone: u.phone || '',
          address: u.address || '',
          city: u.city || '',
          state: u.state || '',
          zipCode: u.zipCode || '',
        };
        setContactInfo(next);
        setSavedContactInfo(next);
      }
    } catch (err) {
      console.error('Error fetching provider profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const toggleServiceCategory = (category: ServiceCategory) => {
    setBusinessInfo((prev) => ({
      ...prev,
      serviceCategories: prev.serviceCategories.includes(category)
        ? prev.serviceCategories.filter((c) => c !== category)
        : [...prev.serviceCategories, category],
    }));
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const [profileRes, userRes] = await Promise.all([
        api.updateMyProviderProfile({
          businessName: businessInfo.businessName.trim(),
          businessType: businessInfo.businessType.trim() || null,
          description: businessInfo.description.trim() || null,
          website: businessInfo.website.trim() || null,
          yearsInBusiness: businessInfo.yearsInBusiness ? parseInt(businessInfo.yearsInBusiness, 10) : null,
          teamSize: businessInfo.teamSize ? parseInt(businessInfo.teamSize, 10) : null,
          serviceRadius: businessInfo.serviceRadius ? parseInt(businessInfo.serviceRadius, 10) : undefined,
          serviceCategories: businessInfo.serviceCategories,
        }),
        api.updateUserProfile({
          phone: contactInfo.phone,
          address: contactInfo.address,
          city: contactInfo.city,
          state: contactInfo.state,
          zipCode: contactInfo.zipCode,
        }),
      ]);

      if (!profileRes.success || !userRes.success) {
        throw new Error(profileRes.message || userRes.message || 'Failed to save profile');
      }

      setSavedBusinessInfo(businessInfo);
      setSavedContactInfo(contactInfo);
      setIsEditing(false);
      toast({ title: 'Profile updated', description: 'Your provider profile has been saved.' });
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err?.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdits = () => {
    setBusinessInfo(savedBusinessInfo);
    setContactInfo(savedContactInfo);
    setIsEditing(false);
    setError(null);
  };

  const handleFileUpload = (type: 'photo') => {
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
      await logout();
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
      await logout();
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
            onClick={handleCancelEdits}
            disabled={isSaving}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
          >
            Cancel edits
          </button>
        ) : (
          <span className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
            Read-only mode
          </span>
        ),
        impactLabel: isEditing ? 'Draft changes open' : 'Public trust profile',
        confidenceLabel: `${businessInfo.serviceCategories.length} categor${businessInfo.serviceCategories.length === 1 ? 'y' : 'ies'} listed`,
      }}
      trust={{
        confidenceLabel: 'Profile confidence improves with complete contact info, coverage area, and credential records.',
        freshnessLabel: isEditing ? 'Unsaved edits in progress' : 'Profile matches saved account details',
        sourceLabel: 'Provider profile fields, credential records, and service-category settings.',
        rationale: 'Complete and current profile details reduce homeowner hesitation during selection.',
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile label="Years" value={businessInfo.yearsInBusiness || '—'} hint="In business" />
          <MobileKpiTile label="Radius" value={businessInfo.serviceRadius ? `${businessInfo.serviceRadius} mi` : '—'} hint="Service range" />
          <MobileKpiTile
            label="Categories"
            value={businessInfo.serviceCategories.length}
            hint="Listed for search"
            tone={businessInfo.serviceCategories.length > 0 ? 'positive' : 'neutral'}
          />
        </MobileKpiStrip>
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium tracking-normal text-slate-500">Sections</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[44px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
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
      routeState={
        loading
          ? { state: 'loading', title: 'Loading profile', description: 'Fetching your provider profile.' }
          : null
      }
      hideContentWhenState={loading}
    >
      {error ? (
        <MobileCard variant="compact" className="border-rose-200 bg-rose-50 text-rose-800">
          {error}
        </MobileCard>
      ) : null}

      {activeTab === 'business' ? (
        <div className="space-y-3">
          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Profile photo</p>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-xl font-semibold text-white">
                {user?.firstName?.charAt(0) || 'P'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-sm font-medium text-slate-900">{businessInfo.businessName || 'Your business'}</p>
                <p className="mb-0 mt-0.5 text-xs text-slate-500">JPG, PNG, or GIF. Max 2MB.</p>
              </div>
              <button
                type="button"
                onClick={() => handleFileUpload('photo')}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
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
              <FieldLabel>Business type</FieldLabel>
              <TextField
                isEditing={isEditing}
                value={businessInfo.businessType}
                onChange={(value) => setBusinessInfo({ ...businessInfo, businessType: value })}
                placeholder="LLC, Sole Proprietor, Corporation..."
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

            <div>
              <FieldLabel>Website</FieldLabel>
              <TextField
                isEditing={isEditing}
                type="url"
                value={businessInfo.website}
                onChange={(value) => setBusinessInfo({ ...businessInfo, website: value })}
                placeholder="https://example.com"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>Years in business</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  type="number"
                  value={businessInfo.yearsInBusiness}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, yearsInBusiness: value })}
                />
              </div>
              <div>
                <FieldLabel>Team size</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  type="number"
                  value={businessInfo.teamSize}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, teamSize: value })}
                />
              </div>
              <div>
                <FieldLabel>Service radius (miles)</FieldLabel>
                <TextField
                  isEditing={isEditing}
                  type="number"
                  value={businessInfo.serviceRadius}
                  onChange={(value) => setBusinessInfo({ ...businessInfo, serviceRadius: value })}
                />
              </div>
            </div>

            <div>
              <FieldLabel>Service categories</FieldLabel>
              <p className="mb-2 text-xs text-slate-500">Homeowners filter provider search by these categories.</p>
              {!isEditing ? (
                <div className="flex flex-wrap gap-1.5">
                  {businessInfo.serviceCategories.length > 0 ? (
                    businessInfo.serviceCategories.map((category) => (
                      <span key={category} className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                        {getCategoryDisplayLabel(category)}
                      </span>
                    ))
                  ) : (
                    <p className="mb-0 text-sm text-slate-500">No categories selected — you won&apos;t appear in category-filtered search.</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SERVICE_CATEGORIES.map((category) => {
                    const selected = businessInfo.serviceCategories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleServiceCategory(category)}
                        className={`inline-flex min-h-[36px] items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-brand-primary bg-brand-primary text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                        }`}
                      >
                        {getCategoryDisplayLabel(category)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </MobileCard>
        </div>
      ) : null}

      {activeTab === 'contact' ? (
        <MobileCard variant="compact" className="space-y-3">
          <p className="mb-0 text-sm font-semibold text-slate-900">Contact information</p>

          <div>
            <FieldLabel>Email</FieldLabel>
            <p className="mb-0 text-sm text-slate-900">{user?.email || '—'}</p>
            <p className="mb-0 mt-0.5 text-[11px] text-slate-400">Contact support to change your account email.</p>
          </div>

          <div>
            <FieldLabel>Phone</FieldLabel>
            <TextField isEditing={isEditing} type="tel" value={contactInfo.phone} onChange={(value) => setContactInfo({ ...contactInfo, phone: value })} />
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
        <MobileCard variant="compact" className="space-y-3">
          <p className="mb-0 text-sm font-semibold text-slate-900">Licenses, insurance &amp; certifications</p>
          <p className="mb-0 text-sm text-slate-600">
            Credential verification (license, insurance, and certifications) is managed on a dedicated page — it
            drives your &ldquo;Verified Pro&rdquo; badge and category eligibility, so it&apos;s tracked separately from this
            profile.
          </p>
          <Link
            href="/providers/credentials"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Go to Credentials
          </Link>
        </MobileCard>
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
            <p className="mb-0 text-[11px] text-slate-400">Notification preferences aren&apos;t saved to your account yet.</p>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3">
            <p className="mb-0 text-sm font-semibold text-slate-900">Change password</p>
            <input type="password" autoComplete="current-password" placeholder="Current password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base md:text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <input type="password" autoComplete="new-password" placeholder="New password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base md:text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <input type="password" autoComplete="new-password" placeholder="Confirm new password" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base md:text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
            <button
              type="button"
              onClick={() => alert('Password change is not available in this build yet.')}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              Update password
            </button>
          </MobileCard>

          <MobileCard variant="compact" className="space-y-3">
            <MfaSettingsPanel />
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
                className="inline-flex min-h-[44px] items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="inline-flex min-h-[44px] items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
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
