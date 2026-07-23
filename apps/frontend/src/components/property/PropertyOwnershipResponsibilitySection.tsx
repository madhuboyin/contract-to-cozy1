"use client";

import * as React from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Home,
  KeyRound,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";

import type { PropertyResponsibilityScope, ResponsibleParty } from "@/types";
import {
  RESPONSIBILITY_SCOPES,
  RESPONSIBLE_PARTY_OPTIONS,
  defaultResponsibilityParties,
  getResponsibilityPreset,
  type ResponsibilityParties,
} from "@/lib/property/propertyContextForm";
import { cn } from "@/lib/utils";

export const OWNERSHIP_FORM_OPTIONS = [
  "FEE_SIMPLE",
  "CONDOMINIUM",
  "COOPERATIVE",
  "LEASEHOLD",
  "OTHER",
  "UNKNOWN",
] as const;
export const PROPERTY_USE_OPTIONS = [
  "PRIMARY_RESIDENCE",
  "SECOND_HOME",
  "LONG_TERM_RENTAL",
  "SHORT_TERM_RENTAL",
  "VACANT",
  "UNDER_RENOVATION",
  "FOR_SALE",
  "OTHER",
  "UNKNOWN",
] as const;
export const OCCUPANCY_STATUS_OPTIONS = [
  "OWNER_OCCUPIED",
  "TENANT_OCCUPIED",
  "FAMILY_OCCUPIED",
  "MIXED",
  "VACANT",
  "UNKNOWN",
] as const;

export type OwnershipForm = (typeof OWNERSHIP_FORM_OPTIONS)[number];
export type PropertyUse = (typeof PROPERTY_USE_OPTIONS)[number];
export type OccupancyStatus = (typeof OCCUPANCY_STATUS_OPTIONS)[number];

export const OWNERSHIP_FORM_LABELS: Record<OwnershipForm, string> = {
  FEE_SIMPLE: "Owned directly",
  CONDOMINIUM: "Condominium",
  COOPERATIVE: "Co-op",
  LEASEHOLD: "Land or home is leased",
  OTHER: "Something else",
  UNKNOWN: "I’m not sure",
};

const OWNERSHIP_FORM_DESCRIPTIONS: Record<OwnershipForm, string> = {
  FEE_SIMPLE: "You own the home and usually the land. This is the most common choice for a detached house.",
  CONDOMINIUM: "You own your unit, while an association usually manages some shared building areas.",
  COOPERATIVE: "You own shares in the building organization rather than owning the unit directly.",
  LEASEHOLD: "The home or land is occupied under a long-term lease.",
  OTHER: "Choose this when none of the common ownership setups fits.",
  UNKNOWN: "That’s okay. We’ll ask who handles specific work before making a recommendation.",
};

export const PROPERTY_USE_LABELS: Record<PropertyUse, string> = {
  PRIMARY_RESIDENCE: "My primary home",
  SECOND_HOME: "A second home",
  LONG_TERM_RENTAL: "A long-term rental",
  SHORT_TERM_RENTAL: "A short-term rental",
  VACANT: "Currently unused",
  UNDER_RENOVATION: "Under renovation",
  FOR_SALE: "For sale",
  OTHER: "Something else",
  UNKNOWN: "I’m not sure",
};

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  OWNER_OCCUPIED: "I live here",
  TENANT_OCCUPIED: "Tenants live here",
  FAMILY_OCCUPIED: "Family members live here",
  MIXED: "A mix of people",
  VACANT: "No one right now",
  UNKNOWN: "I’m not sure",
};

const RESPONSIBILITY_PRESETS = [
  {
    value: "OWNER",
    label: "I handle most maintenance",
    description: "Use this for a home you primarily maintain yourself.",
    icon: Home,
  },
  {
    value: "ASSOCIATION",
    label: "My association handles most",
    description: "Common for condos, co-ops, and HOA-managed homes.",
    icon: Building2,
  },
  {
    value: "LANDLORD",
    label: "My landlord handles most",
    description: "Best when a landlord arranges repairs and upkeep.",
    icon: KeyRound,
  },
  {
    value: "SHARED",
    label: "Responsibilities are shared",
    description: "Use this when maintenance is usually coordinated together.",
    icon: UsersRound,
  },
] as const;

const RESPONSIBILITY_SCOPE_LABELS: Record<PropertyResponsibilityScope, string> = {
  ROOF: "Roof",
  BUILDING_EXTERIOR: "Building exterior",
  LANDSCAPING: "Landscaping",
  TREES_SHRUBS: "Trees & shrubs",
  DRIVEWAY_WALKWAYS: "Driveway & walkways",
  DECK_PATIO_BALCONY: "Deck, patio & balcony",
  PLUMBING: "Plumbing",
  HVAC: "Central HVAC",
  COMMON_SAFETY: "Common-area safety",
  SNOW_ICE: "Snow & ice",
  PEST_CONTROL: "Pest control",
  SHARED_SYSTEMS: "Shared systems",
};

const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  OWNER: "You",
  ASSOCIATION: "Association",
  LANDLORD: "Landlord",
  SHARED: "Shared",
  UNKNOWN: "Not sure",
};

const RESPONSIBILITY_GROUPS: Array<{
  title: string;
  description: string;
  scopes: PropertyResponsibilityScope[];
}> = [
  {
    title: "Structure & exterior",
    description: "Building envelope and private outdoor areas",
    scopes: ["ROOF", "BUILDING_EXTERIOR", "DRIVEWAY_WALKWAYS", "DECK_PATIO_BALCONY"],
  },
  {
    title: "Grounds & seasonal care",
    description: "Routine outdoor and seasonal upkeep",
    scopes: ["LANDSCAPING", "TREES_SHRUBS", "SNOW_ICE", "PEST_CONTROL"],
  },
  {
    title: "Systems & shared safety",
    description: "Core equipment and common building systems",
    scopes: ["PLUMBING", "HVAC", "COMMON_SAFETY", "SHARED_SYSTEMS"],
  },
];

type Props = {
  ownershipForm: string;
  propertyUse: string;
  occupancyStatus: string;
  responsibilities: ResponsibilityParties;
  onOwnershipFormChange: (value: OwnershipForm) => void;
  onPropertyUseChange: (value: PropertyUse) => void;
  onOccupancyStatusChange: (value: OccupancyStatus) => void;
  onResponsibilitiesChange: (value: ResponsibilityParties) => void;
  firstStepNumber?: number;
  idPrefix?: string;
};

const selectClassName =
  "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100";

export default function PropertyOwnershipResponsibilitySection({
  ownershipForm,
  propertyUse,
  occupancyStatus,
  responsibilities,
  onOwnershipFormChange,
  onPropertyUseChange,
  onOccupancyStatusChange,
  onResponsibilitiesChange,
  firstStepNumber = 1,
  idPrefix = "property",
}: Props) {
  const preset = React.useMemo(() => getResponsibilityPreset(responsibilities), [responsibilities]);
  const [detailsExpanded, setDetailsExpanded] = React.useState(preset === "CUSTOM");

  React.useEffect(() => {
    if (preset === "CUSTOM") setDetailsExpanded(true);
  }, [preset]);

  const selectedOwnership = OWNERSHIP_FORM_OPTIONS.includes(ownershipForm as OwnershipForm)
    ? (ownershipForm as OwnershipForm)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">No paperwork needed.</span>{" "}
          Choose the closest match. These answers help us avoid suggesting work that belongs to an association or landlord.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/30 sm:p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            {firstStepNumber}
          </span>
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-slate-50">How this home is owned and used</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Plain-language details are enough.</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            How is this home owned?
            <span className="mt-1 block min-h-8 text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
              Choose the closest legal setup. You can select “I’m not sure.”
            </span>
            <select
              id={`${idPrefix}-ownership-form`}
              value={ownershipForm}
              onChange={(event) => onOwnershipFormChange(event.target.value as OwnershipForm)}
              className={selectClassName}
            >
              <option value="">Choose the closest match</option>
              {OWNERSHIP_FORM_OPTIONS.map((option) => (
                <option key={option} value={option}>{OWNERSHIP_FORM_LABELS[option]}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            How do you use this home?
            <span className="mt-1 block min-h-8 text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
              For example, your main home or a rental.
            </span>
            <select
              id={`${idPrefix}-property-use`}
              value={propertyUse}
              onChange={(event) => onPropertyUseChange(event.target.value as PropertyUse)}
              className={selectClassName}
            >
              <option value="">Choose how it is used</option>
              {PROPERTY_USE_OPTIONS.map((option) => (
                <option key={option} value={option}>{PROPERTY_USE_LABELS[option]}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Who lives here now?
            <span className="mt-1 block min-h-8 text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
              Choose the closest match today.
            </span>
            <select
              id={`${idPrefix}-occupancy-status`}
              value={occupancyStatus}
              onChange={(event) => onOccupancyStatusChange(event.target.value as OccupancyStatus)}
              className={selectClassName}
            >
              <option value="">Choose who lives here</option>
              {OCCUPANCY_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{OCCUPANCY_STATUS_LABELS[option]}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedOwnership && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {OWNERSHIP_FORM_LABELS[selectedOwnership]}:
            </span>{" "}
            {OWNERSHIP_FORM_DESCRIPTIONS[selectedOwnership]}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/30 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            {firstStepNumber + 1}
          </span>
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-slate-50">Who takes care of most maintenance?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Start with one general answer, then add only the exceptions.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {RESPONSIBILITY_PRESETS.map((option) => {
            const selected = preset === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onResponsibilitiesChange(defaultResponsibilityParties(option.value));
                  setDetailsExpanded(false);
                }}
                className={cn(
                  "flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                  selected
                    ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/30"
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-white/10 dark:bg-slate-950/40",
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 font-medium text-slate-950 dark:text-slate-50">
                    {option.label}
                    {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-slate-500 dark:text-slate-400">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {preset === "UNKNOWN" ? "Not sure yet? You can review each area." : "Only customize the areas that work differently."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RESPONSIBLE_PARTY_OPTIONS.map((party) => {
                const count = RESPONSIBILITY_SCOPES.filter((scope) => responsibilities[scope] === party).length;
                if (!count) return null;
                return (
                  <span key={party} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                    {RESPONSIBLE_PARTY_LABELS[party]} · {count}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDetailsExpanded((expanded) => !expanded)}
            aria-expanded={detailsExpanded}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200"
          >
            <Wrench className="mr-2 h-4 w-4" />
            {detailsExpanded ? "Hide details" : "Review exceptions"}
            <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", detailsExpanded && "rotate-180")} />
          </button>
        </div>

        {detailsExpanded && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-800">
            <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950/70">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Responsibility details</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Use “Shared” when you coordinate the work with another party.</p>
            </div>
            <div className="grid gap-px lg:grid-cols-3">
              {RESPONSIBILITY_GROUPS.map((group) => (
                <section key={group.title} className="bg-white p-4 dark:bg-slate-950/55">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.title}</h4>
                  <p className="mb-4 mt-1 min-h-8 text-xs leading-4 text-slate-500 dark:text-slate-400">{group.description}</p>
                  <div className="space-y-2">
                    {group.scopes.map((scope) => (
                      <label key={scope} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-white/5 dark:bg-slate-900/70">
                        <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-700 dark:text-slate-200">{RESPONSIBILITY_SCOPE_LABELS[scope]}</span>
                        <select
                          id={`${idPrefix}-responsibility-${scope}`}
                          value={responsibilities[scope]}
                          onChange={(event) => onResponsibilitiesChange({
                            ...responsibilities,
                            [scope]: event.target.value as ResponsibleParty,
                          })}
                          className="h-9 w-[122px] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
                        >
                          {RESPONSIBLE_PARTY_OPTIONS.map((party) => (
                            <option key={party} value={party}>{RESPONSIBLE_PARTY_LABELS[party]}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
