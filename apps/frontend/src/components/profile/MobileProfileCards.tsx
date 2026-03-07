'use client';

import { Lock } from 'lucide-react';
import { toTitleCase } from '@/lib/utils/formatters';
import {
  IconBadge,
  MetricRow,
  MobileCard,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';

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

function initialsFromName(firstName: string, lastName: string): string {
  const firstInitial = firstName.trim().charAt(0);
  const lastInitial = lastName.trim().charAt(0);
  return `${firstInitial}${lastInitial}`.toUpperCase() || 'U';
}

function formatAddressLines(formData: ProfileFormData): { line1: string; line2: string } {
  const line1 = toTitleCase(formData.address?.trim() || '') || 'Address not set';
  const city = toTitleCase(formData.city?.trim() || '');
  const state = formData.state?.trim();
  const zip = formData.zipCode?.trim();

  let line2Raw = '';
  if (city && state && zip) line2Raw = `${city}, ${state} ${zip}`;
  else if (city && state) line2Raw = `${city}, ${state}`;
  else if (city && zip) line2Raw = `${city} ${zip}`;
  else if (state && zip) line2Raw = `${state} ${zip}`;
  else line2Raw = city || state || zip || '';

  return {
    line1,
    line2: line2Raw || 'Add city, state, and ZIP code',
  };
}

export function ProfileHeroCard({
  formData,
  accountTypeLabel,
  profileEditing,
  savingProfile,
  messageEmailSupport = true,
  isSendingPasswordReset,
  onEditPassword,
  onStartEditing,
  onCancelEditing,
  onSave,
  onFieldChange,
}: {
  formData: ProfileFormData;
  accountTypeLabel: string;
  profileEditing: boolean;
  savingProfile: boolean;
  messageEmailSupport?: boolean;
  isSendingPasswordReset: boolean;
  onEditPassword: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onFieldChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fullName = `${formData.firstName} ${formData.lastName}`.trim() || 'Your name';

  return (
    <MobileCard variant="hero" className="bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))]">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--mobile-brand-strong))] text-lg font-bold text-white">
          {initialsFromName(formData.firstName, formData.lastName)}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-0 truncate text-xl font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            {fullName}
          </p>
          <p className="mb-0 mt-1 truncate text-sm text-[hsl(var(--mobile-text-secondary))]">
            {formData.email || 'Email not available'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusChip tone="info">{accountTypeLabel}</StatusChip>
            <StatusChip tone="good">Active</StatusChip>
          </div>
        </div>

        {!profileEditing ? (
          <button
            type="button"
            onClick={onStartEditing}
            className="inline-flex min-h-[34px] items-center rounded-full border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            Edit Profile
          </button>
        ) : null}
      </div>

      {!profileEditing ? (
        <div className="mt-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white">
          <div className="border-b border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5">
            <p className="mb-0 text-[1.05rem] font-semibold text-[hsl(var(--mobile-text-primary))]">Personal Info</p>
          </div>

          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <IconBadge tone="info">
                <Lock className="h-4 w-4" />
              </IconBadge>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">Password</p>
                <p className="mb-0 mt-0.5 text-sm tracking-[0.14em] text-[hsl(var(--mobile-text-primary))]">••••••••••••</p>
              </div>
              <button
                type="button"
                onClick={onEditPassword}
                disabled={isSendingPasswordReset}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-1.5 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))] disabled:opacity-60"
              >
                {isSendingPasswordReset ? 'Sending...' : 'Protected'}
              </button>
            </div>
          </div>

          {messageEmailSupport ? (
            <div className="border-t border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5">
              <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                We&apos;ll send a reset link to your registered email.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={onFieldChange}
              className="h-11 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
              placeholder="First name"
            />
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={onFieldChange}
              className="h-11 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
              placeholder="Last name"
            />
          </div>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={onFieldChange}
            className="h-11 w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
            placeholder="(555) 123-4567"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancelEditing}
              disabled={savingProfile}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={savingProfile}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </MobileCard>
  );
}

export function SecuritySummaryCard({
  isSendingPasswordReset,
  onEditPassword,
  compact = false,
}: {
  isSendingPasswordReset: boolean;
  onEditPassword: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <MobileCard variant="compact" className="h-full">
        <p className="mb-0 text-[1.05rem] font-semibold text-[hsl(var(--mobile-text-primary))]">Security</p>
        <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
          <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">Password</p>
          <p className="mb-0 mt-1 text-sm tracking-[0.14em] text-[hsl(var(--mobile-text-primary))]">••••••••••••</p>
        </div>
        <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
          <button
            type="button"
            onClick={onEditPassword}
            disabled={isSendingPasswordReset}
            className="inline-flex min-h-[34px] items-center rounded-full border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))] disabled:opacity-60"
          >
            {isSendingPasswordReset ? 'Sending...' : 'Protected'}
          </button>
        </div>
      </MobileCard>
    );
  }

  return (
    <SummaryCard
      title="Security"
      action={
        <button
          type="button"
          onClick={onEditPassword}
          disabled={isSendingPasswordReset}
          className="inline-flex min-h-[40px] items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-1.5 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] disabled:opacity-60"
        >
          {isSendingPasswordReset ? 'Sending...' : 'Edit Password'}
        </button>
      }
    >
      <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5">
        <IconBadge tone="info">
          <Lock className="h-4 w-4" />
        </IconBadge>
        <div className="min-w-0 flex-1">
          <p className="mb-0 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">Password</p>
          <p className="mb-0 mt-1 text-sm tracking-[0.14em] text-[hsl(var(--mobile-text-primary))]">••••••••••••</p>
        </div>
        <StatusChip tone="protected">Protected</StatusChip>
      </div>
      <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
        We&apos;ll send a secure reset link to your registered email.
      </p>
    </SummaryCard>
  );
}

export function AddressSummaryCard({
  formData,
  states,
  addressEditing,
  savingAddress,
  compact = false,
  onStartEditing,
  onCancelEditing,
  onSave,
  onFieldChange,
}: {
  formData: ProfileFormData;
  states: string[];
  addressEditing: boolean;
  savingAddress: boolean;
  compact?: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onFieldChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  const { line1, line2 } = formatAddressLines(formData);

  if (compact && !addressEditing) {
    return (
      <MobileCard variant="compact" className="h-full">
        <p className="mb-0 text-[1.05rem] font-semibold text-[hsl(var(--mobile-text-primary))]">Address</p>
        <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
          <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">{line1}</p>
          <p className="mb-0 mt-1 text-sm text-[hsl(var(--mobile-text-secondary))]">{line2}</p>
        </div>
        <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
          <button
            type="button"
            onClick={onStartEditing}
            className="inline-flex min-h-[34px] items-center rounded-full border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            Edit Address
          </button>
        </div>
      </MobileCard>
    );
  }

  return (
    <SummaryCard
      title="Address"
      action={
        !addressEditing ? (
          <button
            type="button"
            onClick={onStartEditing}
            className="inline-flex min-h-[40px] items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-1.5 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            Edit Address
          </button>
        ) : undefined
      }
    >
      {!addressEditing ? (
        <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-3">
          <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">{line1}</p>
          <p className="mb-0 mt-1 text-sm text-[hsl(var(--mobile-text-secondary))]">{line2}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={onFieldChange}
            className="h-11 w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
            placeholder="Street address"
          />
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={onFieldChange}
            className="h-11 w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
            placeholder="City"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              name="state"
              value={formData.state}
              onChange={onFieldChange}
              className="h-11 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
            >
              <option value="">State</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="zipCode"
              value={formData.zipCode}
              onChange={onFieldChange}
              maxLength={5}
              className="h-11 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm text-[hsl(var(--mobile-text-primary))] outline-none focus:border-[hsl(var(--mobile-brand-border))]"
              placeholder="ZIP"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancelEditing}
              disabled={savingAddress}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={savingAddress}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingAddress ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </SummaryCard>
  );
}

export function AccountSummaryCard({
  accountTypeLabel,
  memberSince,
}: {
  accountTypeLabel: string;
  memberSince: string;
}) {
  return (
    <MobileCard variant="standard">
      <div className="flex items-start justify-between gap-3">
        <p className="mb-0 text-[1.05rem] font-semibold text-[hsl(var(--mobile-text-primary))]">Account</p>
        <StatusChip tone="good">Active</StatusChip>
      </div>
      <div className="mt-3 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
        <MetricRow label="Account type" value={accountTypeLabel} />
        <MetricRow label="Member since" value={memberSince || '—'} />
      </div>
    </MobileCard>
  );
}
