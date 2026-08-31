// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  Home as HomeIcon,
  KeyRound,
  Leaf,
  Loader2,
  PawPrint,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";

import {
  HeatingTypes,
  CoolingTypes,
  WaterHeaterTypes,
  RoofTypes,
  FoundationTypes,
  type OutdoorSpaceType,
} from "@/types"; 
import {
  DWELLING_TYPE_LABELS,
  DWELLING_TYPE_OPTIONS,
  OUTDOOR_SPACE_TYPE_OPTIONS,
  RESPONSIBILITY_SCOPES,
  RESPONSIBLE_PARTY_OPTIONS,
  defaultResponsibilityParties,
  getResponsibilityPreset,
  mapResponsibilitiesToForm,
  mapResponsibilitiesToPayload,
  normalizeOutdoorSpaceTypes,
} from "@/lib/property/propertyContextForm";
import { api } from "@/lib/api/client";
import { track } from "@/lib/analytics/events";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import OnboardingReturnBanner from "@/components/onboarding/OnboardingReturnBanner";
import { cn } from "@/lib/utils";
import { humanizeLabel } from "@/lib/utils/string";
import PropertyEditSection from "@/components/property/PropertyEditSection";
import PropertyEditSaveBar from "@/components/property/PropertyEditSaveBar";
import {
  OCCUPANCY_STATUS_LABELS,
  OCCUPANCY_STATUS_OPTIONS,
  OWNERSHIP_FORM_LABELS,
  OWNERSHIP_FORM_OPTIONS,
  PROPERTY_USE_LABELS,
  PROPERTY_USE_OPTIONS,
} from "@/components/property/PropertyOwnershipResponsibilitySection";
import FieldNudgeChip from "@/components/ui/FieldNudgeChip";
import { fieldSizeClass } from "@/components/ui/fieldSizing";
import {
  getPropertyEditPriorityState,
  PROPERTY_SECTION_ORDER,
  type PropertySectionId,
} from "@/components/property/propertyEditPriority";
import {
  MobileFilterStack,
  MobilePageIntro,
  ReadOnlySummaryBlock,
  StatusChip,
} from "@/components/mobile/dashboard/MobilePrimitives";


import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';
// --- Appliance Constants and Schemas ---
const CURRENT_YEAR = new Date().getFullYear();
const MAJOR_APPLIANCE_OPTIONS = [
    'DISHWASHER',
    'REFRIGERATOR',
    'OVEN_RANGE',
    'WASHER_DRYER',
    'MICROWAVE_HOOD',
    'WATER_SOFTENER',
];
const MAX_PROPERTY_PHOTO_SIZE_MB = 10;
const ALLOWED_PROPERTY_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const SIDING_TYPE_OPTIONS = [
  'Vinyl', 'Wood', 'Fiber cement', 'Brick', 'Stucco', 'Aluminum', 'Stone or masonry', 'Composite', 'Other',
] as const;
const RESPONSIBILITY_PRESETS = [
  { value: 'OWNER', label: 'I handle most maintenance', description: 'Use this for a home you primarily maintain yourself.', icon: HomeIcon },
  { value: 'ASSOCIATION', label: 'My association handles most', description: 'Common for condos, co-ops, and HOA-managed homes.', icon: Building2 },
  { value: 'LANDLORD', label: 'My landlord handles most', description: 'Best when a landlord arranges repairs and upkeep.', icon: KeyRound },
  { value: 'SHARED', label: 'Responsibilities are shared', description: 'Use this when maintenance is usually coordinated together.', icon: UsersRound },
] as const;

const PROPERTY_TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'America/Adak', label: 'Hawaii–Aleutian Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'America/Puerto_Rico', label: 'Atlantic Time' },
] as const;

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

type ResponsibilityScope = (typeof RESPONSIBILITY_SCOPES)[number];
type ResponsibleParty = (typeof RESPONSIBLE_PARTY_OPTIONS)[number];

const RESPONSIBILITY_SCOPE_LABELS: Record<ResponsibilityScope, string> = {
  ROOF: 'Roof',
  BUILDING_EXTERIOR: 'Building exterior',
  LANDSCAPING: 'Landscaping',
  TREES_SHRUBS: 'Trees & shrubs',
  DRIVEWAY_WALKWAYS: 'Driveway & walkways',
  DECK_PATIO_BALCONY: 'Deck, patio & balcony',
  PLUMBING: 'Plumbing',
  HVAC: 'Central HVAC',
  COMMON_SAFETY: 'Common-area safety',
  SNOW_ICE: 'Snow & ice',
  PEST_CONTROL: 'Pest control',
  SHARED_SYSTEMS: 'Shared systems',
};

const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  OWNER: 'You',
  ASSOCIATION: 'Association',
  LANDLORD: 'Landlord',
  SHARED: 'Shared',
  UNKNOWN: 'Not sure',
};

const RESPONSIBILITY_GROUPS: Array<{
  title: string;
  description: string;
  scopes: ResponsibilityScope[];
}> = [
  {
    title: 'Structure & exterior',
    description: 'Building envelope and private outdoor areas',
    scopes: ['ROOF', 'BUILDING_EXTERIOR', 'DRIVEWAY_WALKWAYS', 'DECK_PATIO_BALCONY'],
  },
  {
    title: 'Grounds & seasonal care',
    description: 'Routine outdoor and seasonal upkeep',
    scopes: ['LANDSCAPING', 'TREES_SHRUBS', 'SNOW_ICE', 'PEST_CONTROL'],
  },
  {
    title: 'Systems & shared safety',
    description: 'Core equipment and common building systems',
    scopes: ['PLUMBING', 'HVAC', 'COMMON_SAFETY', 'SHARED_SYSTEMS'],
  },
];

const APPLIANCE_DISPLAY_LABELS: Record<string, string> = {
  DISHWASHER: 'Dishwasher',
  REFRIGERATOR: 'Refrigerator',
  OVEN_RANGE: 'Oven / Range',
  WASHER_DRYER: 'Washer / Dryer',
  MICROWAVE_HOOD: 'Microwave Hood',
  WATER_SOFTENER: 'Water Softener',
};

function formatApplianceLabel(type: string): string {
  return (
    APPLIANCE_DISPLAY_LABELS[type] ??
    humanizeLabel(type)
  );
}

const SYSTEM_ENUM_DISPLAY_MAP: Record<string, string> = {
  SINGLE_FAMILY: "Single Family",
  TOWNHOME: "Townhome",
  CONDO: "Condo / Apartment",
  APARTMENT: "Apartment",
  MULTI_UNIT: "Multi-Unit",
  INVESTMENT_PROPERTY: "Investment Property",
  HVAC: "Central HVAC",
  FURNACE: "Furnace / Forced Air",
  HEAT_PUMP: "Heat Pump",
  RADIATORS: "Radiators / Boiler",
  UNKNOWN: "Unknown / Not Sure",
  CENTRAL_AC: "Central Air Conditioning",
  WINDOW_AC: "Window / Portable AC",
  TANK: "Tank Water Heater",
  TANKLESS: "Tankless (On-Demand)",
  SOLAR: "Solar Water Heater",
  SHINGLE: "Asphalt Shingle",
  TILE: "Tile Roof",
  FLAT: "Flat / TPO Roof",
  METAL: "Metal Roof",
  BASEMENT: "Basement",
  CRAWL_SPACE: "Crawl Space",
  SLAB: "Slab",
  PIER_AND_BEAM: "Pier and Beam",
  RAISED: "Raised Foundation",
  MIXED: "Mixed Foundation",
  OTHER: "Other",
  OWNER_OCCUPIED: "Owner Occupied",
  RENTED_OUT: "Rented Out",
};

function formatEnumLabel(value: string): string {
  return (
    SYSTEM_ENUM_DISPLAY_MAP[value] ??
    humanizeLabel(value)
  );
}

function getInstallYearFeedback(year: number | null | undefined): {
  label: string;
  color: "emerald" | "amber" | "rose" | null;
  age: number;
} | null {
  if (!year || year < 1900 || year > CURRENT_YEAR) return null;
  const age = CURRENT_YEAR - year;
  if (age === 0) return null;
  if (age <= 8) return { label: `${age} yrs · Good`, color: "emerald", age };
  if (age <= 15) return { label: `${age} yrs · Monitor`, color: "amber", age };
  return { label: `${age} yrs · Replace soon`, color: "rose", age };
}

/** One status vocabulary for every system card: Good / Monitor / Replace soon / Not set. */
function SystemStatusChip({ year, unsetLabel = "Not set" }: { year: number | null | undefined; unsetLabel?: string }) {
  const feedback = getInstallYearFeedback(year);
  const tone: "emerald" | "amber" | "rose" | "none" = feedback?.color ?? "none";
  const label = feedback
    ? `${tone === "emerald" ? "Good" : tone === "amber" ? "Monitor" : "Replace soon"} · ${feedback.age} yr`
    : unsetLabel;
  const surface = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300",
    none: "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  }[tone];
  const dot = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    none: "bg-slate-300 dark:bg-slate-600",
  }[tone];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5", surface)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function formatUsdCompact(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatMonthYear(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function getSaveBarCopy(completionPercent: number): string {
  if (completionPercent === 100) {
    return "Profile complete · Your maintenance plan is fully personalized.";
  }
  if (completionPercent >= 90) {
    return `Profile ${completionPercent}% complete · Almost there — one more step.`;
  }
  if (completionPercent >= 70) {
    return `Profile ${completionPercent}% complete · Better data = better recommendations.`;
  }
  return `Profile ${completionPercent}% complete · Keep going to unlock your full plan.`;
}

function dollarsToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Schema for an InventoryItem-backed major appliance.
const applianceSchema = z.object({
  id: z.string().optional(), 
  type: z.string().min(1, "Type required"),
  installYear: z.coerce.number().int().min(1900, "Min 1900").max(CURRENT_YEAR, `Max ${CURRENT_YEAR}`),
});

// --- 1. Form Schema Definition ---
const propertySchema = z.object({
  name: z.string().optional().nullable(),
  isPrimary: z.boolean(),
  address: z.string().min(1, { message: "Street Address is required." }),
  city: z.string().min(1, { message: "City is required." }),
  state: z.string().min(2, { message: "State must be 2 characters." }),
  zipCode: z.string().min(5, { message: "Zip Code is required." }),
  timezone: z.string().refine(isValidIanaTimezone, { message: 'Select a valid property timezone.' }).nullable(),
  
  dwellingType: z.enum(DWELLING_TYPE_OPTIONS),
  ownershipForm: z.enum(OWNERSHIP_FORM_OPTIONS),
  propertyUse: z.enum(PROPERTY_USE_OPTIONS),
  occupancyStatus: z.enum(OCCUPANCY_STATUS_OPTIONS),
  responsibilities: z.record(z.enum(RESPONSIBILITY_SCOPES), z.enum(RESPONSIBLE_PARTY_OPTIONS)),
  
  propertySize: z.coerce.number().int().positive().optional().nullable(),
  yearBuilt: z.coerce.number().int().min(1700).optional().nullable(),
  
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().min(0).optional().nullable(),

  heatingType: z.union([z.nativeEnum(HeatingTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Heating Type is required." }),
  coolingType: z.union([z.nativeEnum(CoolingTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Cooling Type is required." }),
  waterHeaterType: z.union([z.nativeEnum(WaterHeaterTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Water Heater Type is required." }),
  roofType: z.union([z.nativeEnum(RoofTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Roof Type is required." }),
  foundationType: z.union([z.nativeEnum(FoundationTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .optional().nullable(),
  basementConfiguration: z.enum(["NONE", "UNFINISHED", "FINISHED", "UNKNOWN"]).optional(),
  sidingType: z.string().max(100).optional().nullable(),
  electricalPanelAge: z.coerce.number().int().min(0).optional().nullable(),

  hvacInstallYear: z.coerce.number().int().min(1900).optional().nullable(),
  waterHeaterInstallYear: z.coerce.number().int().min(1900).optional().nullable(),
  roofReplacementYear: z.coerce.number().int().min(1900).optional().nullable(),
  
  hasDrainageIssues: z.boolean().nullable().optional(),
  hasSmokeDetectors: z.boolean().nullable().optional(),
  hasCoDetectors: z.boolean().nullable().optional(),
  hasSecuritySystem: z.boolean().nullable().optional(),
  hasFireExtinguisher: z.boolean().nullable().optional(),
  hasIrrigation: z.boolean().nullable().optional(),
  utilityProvider: z.string().optional().nullable(),
  gasProvider: z.string().optional().nullable(),
  inHistoricDistrict: z.boolean().nullable().optional(),
  historicRegistryStatus: z.string().optional().nullable(),
  inHurricaneZone: z.boolean().nullable().optional(),
  inFloodZone: z.boolean().nullable().optional(),
  inWildfireZone: z.boolean().nullable().optional(),
  isCoastal: z.boolean().nullable().optional(),
  hasPrivateOutdoorSpace: z.boolean().nullable().optional(),
  outdoorSpaceTypes: z.array(z.enum(OUTDOOR_SPACE_TYPE_OPTIONS)),
  hasLawn: z.boolean().nullable().optional(),
  hasTreesOrShrubs: z.boolean().nullable().optional(),
  hasDriveway: z.boolean().nullable().optional(),
  hasFence: z.boolean().nullable().optional(),
  hasPoolOrSpa: z.boolean().nullable().optional(),
  hasOutdoorFaucets: z.boolean().nullable().optional(),
  lotSizeSqFt: z.coerce.number().positive().optional().nullable(),
  purchasePriceDollars: z.number().nonnegative().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  lastAppraisedValueDollars: z.number().nonnegative().optional().nullable(),
  lastAppraisalDate: z.string().optional().nullable(),

  // NEW FIELD: Structured appliance data
  appliances: z.array(applianceSchema).optional(), 
});

type PropertyFormValues = z.infer<typeof propertySchema>;

// Convert the canonical appliance projection to structured form data.
const mapDbToForm = (property: any): PropertyFormValues => {
    let structuredAppliances: z.infer<typeof applianceSchema>[] = [];
    
    if (property.majorAppliances && Array.isArray(property.majorAppliances) && property.majorAppliances.length > 0) {
        structuredAppliances = property.majorAppliances.map((asset: any) => ({
            // CRITICAL: Map the DB ID to the form ID for persistence (Update/Delete tracking)
            id: asset.id, 
            type: asset.assetType, // DB field name
            installYear: asset.installationYear, // DB field name
        }));
    } 
    // Fallback to the legacy JSON field until the property form stops accepting it.
    else if (property.applianceAges) {
        let applianceAges = property.applianceAges;
        
        // Defensive parsing
        if (typeof applianceAges === 'string' && applianceAges.trim()) {
            try {
                applianceAges = JSON.parse(applianceAges);
            } catch (e) {
                applianceAges = null; 
            }
        }
        
        if (applianceAges && typeof applianceAges === 'object' && !Array.isArray(applianceAges)) {
            structuredAppliances = Object.entries(applianceAges).map(([type, year], index) => ({
                id: `old-${index}-${type}`, // Generate a temporary client ID for old data
                type: type,
                installYear: year as number,
            }));
        }
    }
    // --- FIX END ---


    return {
        name: property.name || null, 
        isPrimary: property.isPrimary ?? false, 
        address: property.address,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        timezone: property.timezone ?? null,
        
        dwellingType: property.dwellingType || "UNKNOWN",
        ownershipForm: property.ownershipForm || "UNKNOWN",
        propertyUse: property.propertyUse || "UNKNOWN",
        occupancyStatus: property.occupancyStatus || "UNKNOWN",
        responsibilities: mapResponsibilitiesToForm(property.responsibilities),
        propertySize: property.propertySize,
        yearBuilt: property.yearBuilt,
        
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        heatingType: property.heatingType || ("" as any),
        coolingType: property.coolingType || ("" as any),
        waterHeaterType: property.waterHeaterType || ("" as any),
        roofType: property.roofType || ("" as any),
        foundationType: property.foundationType || ("" as any),
        basementConfiguration: property.basementConfiguration ?? "UNKNOWN",
        sidingType: property.sidingType ?? null,
        electricalPanelAge: property.electricalPanelAge ?? null,

        hvacInstallYear: property.hvacInstallYear,
        waterHeaterInstallYear: property.waterHeaterInstallYear,
        roofReplacementYear: property.roofReplacementYear,
        
        hasDrainageIssues: property.hasDrainageIssues ?? null,
        hasSmokeDetectors: property.hasSmokeDetectors ?? null,
        hasCoDetectors: property.hasCoDetectors ?? null,
        hasSecuritySystem: property.hasSecuritySystem ?? null,
        hasFireExtinguisher: property.hasFireExtinguisher ?? null,
        hasIrrigation: property.hasIrrigation ?? null,
        utilityProvider: property.utilityProvider ?? null,
        gasProvider: property.gasProvider ?? null,
        inHistoricDistrict: property.inHistoricDistrict ?? null,
        historicRegistryStatus: property.historicRegistryStatus ?? null,
        inHurricaneZone: property.inHurricaneZone ?? null,
        inFloodZone: property.inFloodZone ?? null,
        inWildfireZone: property.inWildfireZone ?? null,
        isCoastal: property.isCoastal ?? null,
        hasPrivateOutdoorSpace: property.exteriorProfile?.hasPrivateOutdoorSpace ?? null,
        outdoorSpaceTypes: normalizeOutdoorSpaceTypes(
          property.exteriorProfile?.hasPrivateOutdoorSpace,
          property.exteriorProfile?.outdoorSpaceTypes as OutdoorSpaceType[] | undefined,
        ),
        hasLawn: property.exteriorProfile?.hasLawn ?? null,
        hasTreesOrShrubs: property.exteriorProfile?.hasTreesOrShrubs ?? null,
        hasDriveway: property.exteriorProfile?.hasDriveway ?? null,
        hasFence: property.exteriorProfile?.hasFence ?? null,
        hasPoolOrSpa: property.exteriorProfile?.hasPoolOrSpa ?? null,
        hasOutdoorFaucets: property.exteriorProfile?.hasOutdoorFaucets ?? null,
        lotSizeSqFt: property.exteriorProfile?.lotSizeSqFt ?? null,
        purchasePriceDollars:
          typeof property.purchasePriceCents === "number"
            ? property.purchasePriceCents / 100
            : null,
        purchaseDate: property.purchaseDate ? String(property.purchaseDate).slice(0, 10) : null,
        lastAppraisedValueDollars:
          typeof property.lastAppraisedValue === "number"
            ? property.lastAppraisedValue / 100
            : null,
        lastAppraisalDate: property.lastAppraisalDate
          ? String(property.lastAppraisalDate).slice(0, 10)
          : null,

        // NEW FIELD: Load structured array
        appliances: structuredAppliances,
    };
};

// --- Appliance List Component ---
const ApplianceBentoGrid = () => {
  const {
    control,
    formState: { errors },
    watch,
  } = useFormContext<PropertyFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "appliances",
  });

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="hidden md:grid md:grid-cols-[35%_15%_38%_12%] md:gap-4 md:px-3 md:text-xs md:font-semibold md:md:tracking-normal md:text-gray-500 md:dark:text-slate-400">
          <span>Appliance</span>
          <span>Year</span>
          <span>Status</span>
          <span className="text-center">Remove</span>
        </div>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 gap-3 rounded-md border border-black/5 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/30 md:grid-cols-[35%_15%_38%_12%] md:items-center md:gap-4"
            >
              <FormField
                control={control}
                name={`appliances.${index}.type`}
                render={({ field: selectField }) => (
                  <FormItem className="w-full">
                    <FormLabel className="text-xs font-medium text-muted-foreground md:sr-only">Appliance</FormLabel>
                    <Select onValueChange={selectField.onChange} value={selectField.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40">
                          <SelectValue placeholder="Select appliance type">
                            {selectField.value ? formatApplianceLabel(selectField.value) : "Select appliance type"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MAJOR_APPLIANCE_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type}>
                            {formatApplianceLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage>{(errors.appliances?.[index] as any)?.type?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={`appliances.${index}.installYear`}
                render={({ field: yearField }) => (
                  <FormItem className="w-full">
                    <FormLabel className="text-xs font-medium text-muted-foreground md:sr-only">Install year</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          yearField.value
                            ? "YYYY"
                            : Number.isFinite(Number(watch("yearBuilt"))) && Number(watch("yearBuilt")) >= 1900
                              ? String(Number(watch("yearBuilt")))
                              : "YYYY"
                        }
                        title={
                          !yearField.value && Number.isFinite(Number(watch("yearBuilt"))) && Number(watch("yearBuilt")) >= 1900
                            ? "Suggest based on home age"
                            : undefined
                        }
                        type="number"
                        maxLength={4}
                        {...yearField}
                        value={yearField.value ?? ""}
                        onChange={(e) => yearField.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                        className={cn("h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40", fieldSizeClass("xs"))}
                      />
                    </FormControl>
                    <FormMessage>{(errors.appliances?.[index] as any)?.installYear?.message}</FormMessage>
                  </FormItem>
                  )}
                />

              <div className="space-y-1 md:space-y-0">
                <p className="text-xs font-medium text-muted-foreground md:hidden">Status</p>
                <div className="flex min-h-10 items-center">
                  {(() => {
                    const yearVal = watch(`appliances.${index}.installYear`);
                    const feedback = getInstallYearFeedback(Number(yearVal));
                    if (!feedback) return <span className="text-xs text-muted-foreground">-</span>;
                    return (
                      <span
                        className={cn(
                          "inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] font-medium leading-none",
                          feedback.color === "emerald" && "border-emerald-200 bg-emerald-100/70 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-300",
                          feedback.color === "amber" && "border-amber-200 bg-amber-100/70 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-300",
                          feedback.color === "rose" && "border-rose-200 bg-rose-100/70 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/30 dark:text-rose-300",
                          feedback.age > 20 && "animate-pulse",
                        )}
                      >
                        {feedback.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-center">
                <p className="text-xs font-medium text-muted-foreground md:hidden">Remove</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  aria-label="Remove appliance"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ type: "", installYear: CURRENT_YEAR })}
        className="btn-add-appliance mt-2 w-full border border-dashed border-teal-300/80 bg-transparent px-2.5 py-2.5 text-[13px] font-medium text-teal-700 hover:bg-teal-50/80 hover:text-teal-900 dark:border-teal-700/60 dark:text-teal-300 dark:hover:text-teal-200"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add appliance
      </Button>
    </div>
  );
};


export default function EditPropertyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const isPropertyRecordAdd = searchParams.get('recordAction') === 'add';
  
  const hasResetForm = React.useRef(false);
  const propertyPhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [propertyPhotoFile, setPropertyPhotoFile] = React.useState<File | null>(null);
  const [propertyPhotoPreviewUrl, setPropertyPhotoPreviewUrl] = React.useState<string | null>(null);
  const [removeCoverPhoto, setRemoveCoverPhoto] = React.useState(false);

  const contextualReturnTo = React.useMemo(() => {
    const from = searchParams.get("from");
    if (from === "status-board") {
      return `/dashboard/properties/${propertyId}/status-board`;
    }

    const raw = searchParams.get("returnTo");
    if (!raw || !raw.startsWith("/dashboard/properties/")) {
      return null;
    }
    if (
      searchParams.get("fromOnboarding") === "1"
      || searchParams.get("fromHomeScore") === "1"
      || searchParams.get("fromSaleCase") === "1"
    ) {
      return raw;
    }
    return null;
  }, [searchParams, propertyId]);

  // 2. Fetch Existing Property Data
  const { data: property, isLoading: isLoadingProperty } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      if (!propertyId) {
        throw new Error("Property ID is required.");
      }
      const response = await api.getProperty(propertyId);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to fetch property.");
    },
    enabled: !!propertyId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
  const existingCoverPhotoUrl = !removeCoverPhoto ? property?.coverPhoto?.fileUrl || null : null;
  const activeCoverPhotoUrl = propertyPhotoPreviewUrl || existingCoverPhotoUrl;

  React.useEffect(() => {
    return () => {
      if (propertyPhotoPreviewUrl) URL.revokeObjectURL(propertyPhotoPreviewUrl);
    };
  }, [propertyPhotoPreviewUrl]);

  React.useEffect(() => {
    setPropertyPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPropertyPhotoFile(null);
    setRemoveCoverPhoto(false);
    if (propertyPhotoInputRef.current) {
      propertyPhotoInputRef.current.value = "";
    }
  }, [propertyId]);

  const clearSelectedPropertyPhoto = React.useCallback(() => {
    if (propertyPhotoPreviewUrl) {
      URL.revokeObjectURL(propertyPhotoPreviewUrl);
    }
    setPropertyPhotoPreviewUrl(null);
    setPropertyPhotoFile(null);
    if (propertyPhotoInputRef.current) {
      propertyPhotoInputRef.current.value = "";
    }
  }, [propertyPhotoPreviewUrl]);

  const handlePropertyPhotoChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROPERTY_PHOTO_TYPES.includes(file.type)) {
      toast({
        title: "Invalid photo type",
        description: "Upload JPG, PNG, WEBP, or HEIC.",
        variant: "destructive",
      });
      if (propertyPhotoInputRef.current) propertyPhotoInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_PROPERTY_PHOTO_SIZE_MB * 1024 * 1024) {
      toast({
        title: "Photo too large",
        description: `Photo must be under ${MAX_PROPERTY_PHOTO_SIZE_MB}MB.`,
        variant: "destructive",
      });
      if (propertyPhotoInputRef.current) propertyPhotoInputRef.current.value = "";
      return;
    }

    clearSelectedPropertyPhoto();
    setPropertyPhotoFile(file);
    setPropertyPhotoPreviewUrl(URL.createObjectURL(file));
    setRemoveCoverPhoto(false);
  }, [clearSelectedPropertyPhoto]);

  const handleRemoveCoverPhoto = React.useCallback(() => {
    const hadExistingPhoto = Boolean(property?.coverPhoto?.id);
    clearSelectedPropertyPhoto();
    setRemoveCoverPhoto(hadExistingPhoto);
  }, [clearSelectedPropertyPhoto, property?.coverPhoto?.id]);

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as any,
    defaultValues: {
      name: "", isPrimary: false, address: "", city: "", state: "", zipCode: "", timezone: null,
      dwellingType: "UNKNOWN", ownershipForm: "UNKNOWN", propertyUse: "UNKNOWN",
      occupancyStatus: "UNKNOWN", responsibilities: defaultResponsibilityParties('UNKNOWN'),
      propertySize: null, yearBuilt: null, bedrooms: null, bathrooms: null,
      heatingType: "" as any, coolingType: "" as any, waterHeaterType: "" as any, 
      roofType: "" as any, hvacInstallYear: null, waterHeaterInstallYear: null,
      roofReplacementYear: null, foundationType: "" as any, hasDrainageIssues: null, hasSmokeDetectors: null,
      basementConfiguration: "UNKNOWN", sidingType: null, electricalPanelAge: null,
      hasCoDetectors: null, hasSecuritySystem: null, hasFireExtinguisher: null,
      hasIrrigation: null,
      utilityProvider: null, gasProvider: null,
      inHistoricDistrict: null, historicRegistryStatus: null,
      inHurricaneZone: null, inFloodZone: null, inWildfireZone: null, isCoastal: null,
      hasPrivateOutdoorSpace: null, outdoorSpaceTypes: [], hasLawn: null, hasTreesOrShrubs: null, hasDriveway: null,
      hasFence: null, hasPoolOrSpa: null, hasOutdoorFaucets: null, lotSizeSqFt: null,
      purchasePriceDollars: null,
      purchaseDate: null,
      lastAppraisedValueDollars: null,
      lastAppraisalDate: null,
      appliances: [], // Set default to empty array
    },
    mode: "onBlur",
  });

  // FIX RACE CONDITION: Reset form when property data loads
  React.useEffect(() => {
    if (property && !isLoadingProperty && !hasResetForm.current) {
      const formData = mapDbToForm(property);
      hasResetForm.current = true;
      
      setTimeout(() => {
        form.reset(formData, { 
          keepErrors: false,
          keepDirty: false,
          keepIsSubmitted: false,
          keepTouched: false,
          keepIsValid: false,
          keepSubmitCount: false,
        });
      }, 100); 
    }
  }, [property, isLoadingProperty, form]);
  
  React.useEffect(() => {
    hasResetForm.current = false;
  }, [propertyId]);

  // 3. Setup Mutation
  const updateMutation = useMutation({
    mutationFn: async (data: PropertyFormValues) => {
      if (!propertyId) {
        throw new Error("Property ID is required.");
      }

      let coverPhotoDocumentId: string | null | undefined = undefined;

      if (propertyPhotoFile) {
        const uploadResponse = await api.uploadDocument(propertyPhotoFile, {
          type: "PHOTO",
          name: propertyPhotoFile.name || "Property Photo",
          propertyId,
        });

        if (!uploadResponse.success || !uploadResponse.data?.id) {
          throw new Error(uploadResponse.message || "Failed to upload property photo.");
        }
        coverPhotoDocumentId = uploadResponse.data.id;
      } else if (removeCoverPhoto) {
        coverPhotoDocumentId = null;
      }
      
      const payload = {
        name: data.name ?? undefined,
        address: data.address,
        city: data.city,
        state: data.state.toUpperCase(), 
        zipCode: data.zipCode,
        timezone: data.timezone,
        isPrimary: data.isPrimary,
        
        dwellingType: data.dwellingType,
        ownershipForm: data.ownershipForm,
        propertyUse: data.propertyUse,
        occupancyStatus: data.occupancyStatus,
        propertySize: data.propertySize ?? undefined,
        yearBuilt: data.yearBuilt ?? undefined,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        heatingType: data.heatingType ?? undefined,
        coolingType: data.coolingType ?? undefined,
        waterHeaterType: data.waterHeaterType ?? undefined,
        roofType: data.roofType ?? undefined,
        hvacInstallYear: data.hvacInstallYear ?? undefined,
        waterHeaterInstallYear: data.waterHeaterInstallYear ?? undefined,
        roofReplacementYear: data.roofReplacementYear ?? undefined,
        foundationType: data.foundationType ?? undefined,
        basementConfiguration: data.basementConfiguration ?? undefined,
        sidingType: data.sidingType ?? undefined,
        electricalPanelAge: data.electricalPanelAge ?? undefined,

        hasSmokeDetectors: data.hasSmokeDetectors ?? undefined,
        hasCoDetectors: data.hasCoDetectors ?? undefined,
        hasDrainageIssues: data.hasDrainageIssues ?? undefined,
        hasSecuritySystem: data.hasSecuritySystem ?? undefined,
        hasFireExtinguisher: data.hasFireExtinguisher ?? undefined,
        hasIrrigation: data.hasIrrigation ?? undefined,
        utilityProvider: data.utilityProvider ?? undefined,
        gasProvider: data.gasProvider ?? undefined,
        inHistoricDistrict: data.inHistoricDistrict ?? undefined,
        historicRegistryStatus: data.historicRegistryStatus ?? undefined,
        inHurricaneZone: data.inHurricaneZone ?? undefined,
        inFloodZone: data.inFloodZone ?? undefined,
        inWildfireZone: data.inWildfireZone ?? undefined,
        isCoastal: data.isCoastal ?? undefined,
        exteriorProfile: {
          hasPrivateOutdoorSpace: data.hasPrivateOutdoorSpace,
          outdoorSpaceTypes: normalizeOutdoorSpaceTypes(data.hasPrivateOutdoorSpace, data.outdoorSpaceTypes),
          lotSizeSqFt: data.lotSizeSqFt ?? null,
          hasLawn: data.hasLawn,
          hasTreesOrShrubs: data.hasTreesOrShrubs,
          hasDriveway: data.hasDriveway,
          hasFence: data.hasFence,
          hasPoolOrSpa: data.hasPoolOrSpa,
          hasOutdoorFaucets: data.hasOutdoorFaucets,
          hasIrrigation: data.hasIrrigation,
          hasDrainageIssues: data.hasDrainageIssues,
        },
        responsibilities: mapResponsibilitiesToPayload(data.responsibilities),
        purchasePriceCents: dollarsToCents(data.purchasePriceDollars),
        purchaseDate: data.purchaseDate ?? null,
        lastAppraisedValue: dollarsToCents(data.lastAppraisedValueDollars),
        lastAppraisalDate: data.lastAppraisalDate ?? null,
        
        majorAppliances: data.appliances?.map(app => ({
            // CRITICAL FIX: Ensure the database ID is passed for existing records
            id: app.id, 
            type: app.type, 
            installYear: app.installYear,
        })) || [],
        ...(coverPhotoDocumentId !== undefined ? { coverPhotoDocumentId } : {}),
      };

      // Send the payload with the correct key and structure
      return api.updateProperty(propertyId, payload);
    },
    onSuccess: (response) => {
      if (response.success) {
        if (isPropertyRecordAdd) {
          track('property_record_item_added', {
            propertyId,
            itemType: 'PROPERTY_FACT',
            source: 'PROPERTY_RECORD',
          });
        }
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        // The property overview (profile + "Completeness by category") reads from
        // the bootstrap query, which is keyed separately.
        queryClient.invalidateQueries({ queryKey: ["property-bootstrap", propertyId] });
        toast({
          title: "Saved.",
        });
        router.push(contextualReturnTo ?? `/dashboard/properties/${propertyId}`);
      } else {
        toast({
          title: "Couldn’t save. Try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: "Couldn’t save. Try again.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  const onSubmit: SubmitHandler<PropertyFormValues> = (data) => {
    const errors = form.formState.errors;
    if (Object.keys(errors).length > 0) {
      const errorFields = Object.keys(errors).map(key => {
        const fieldName = key.replace(/([A-Z])/g, ' $1').trim();
        return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      });
      
      toast({
        title: "Validation Error",
        description: `Please fill in the required fields: ${errorFields.join(', ')}`,
        variant: "destructive",
      });
      return;
    }
    
    updateMutation.mutate(data);
  };

  const hasErrors = Object.keys(form.formState.errors).length > 0;
  const [
    watchName,
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchDwellingType,
    watchOwnershipForm,
    watchPropertyUse,
    watchOccupancyStatus,
    watchResponsibilities,
    watchPropertySize,
    watchYearBuilt,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchHvacInstallYear,
    watchWaterHeaterInstallYear,
    watchRoofReplacementYear,
    watchFoundationType,
    watchBedrooms,
    watchBathrooms,
    watchHasSmokeDetectors,
    watchHasCoDetectors,
    watchHasDrainageIssues,
    watchHasSecuritySystem,
    watchHasFireExtinguisher,
    watchHasIrrigation,
    watchAppliances,
  ] = form.watch([
    "name",
    "address",
    "city",
    "state",
    "zipCode",
    "dwellingType",
    "ownershipForm",
    "propertyUse",
    "occupancyStatus",
    "responsibilities",
    "propertySize",
    "yearBuilt",
    "heatingType",
    "coolingType",
    "waterHeaterType",
    "roofType",
    "hvacInstallYear",
    "waterHeaterInstallYear",
    "roofReplacementYear",
    "foundationType",
    "bedrooms",
    "bathrooms",
    "hasSmokeDetectors",
    "hasCoDetectors",
    "hasDrainageIssues",
    "hasSecuritySystem",
    "hasFireExtinguisher",
    "hasIrrigation",
    "appliances",
  ]);
  const trackedSystemsCount = [
    Boolean(watchHeatingType && watchCoolingType && watchHvacInstallYear),
    Boolean(watchWaterHeaterType && watchWaterHeaterInstallYear),
    Boolean(watchRoofType && watchRoofReplacementYear),
  ].filter(Boolean).length;
  const agingSystemsCount = [watchHvacInstallYear, watchWaterHeaterInstallYear, watchRoofReplacementYear]
    .map((year) => getInstallYearFeedback(year)?.color)
    .filter((color) => color === "amber" || color === "rose").length;
  const [activeSectionId, setActiveSectionId] = React.useState<PropertySectionId | null>("basics");
  const [lockedStartFieldKey, setLockedStartFieldKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let frameId: number | null = null;

    const updateActiveSection = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        const candidates = PROPERTY_SECTION_ORDER.map((sectionId) => {
          const element = document.getElementById(sectionId);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          if (rect.bottom < 120) return null;
          return {
            sectionId,
            distance: Math.abs(rect.top - 160),
          };
        }).filter(Boolean) as { sectionId: PropertySectionId; distance: number }[];

        if (!candidates.length) return;
        candidates.sort((a, b) => a.distance - b.distance);
        setActiveSectionId(candidates[0].sectionId);
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  const priorityState = React.useMemo(() => {
    return getPropertyEditPriorityState(
      {
        name: watchName,
        address: watchAddress,
        city: watchCity,
        state: watchState,
        zipCode: watchZipCode,
        dwellingType: watchDwellingType,
        ownershipForm: watchOwnershipForm,
        propertyUse: watchPropertyUse,
        occupancyStatus: watchOccupancyStatus,
        responsibilities: watchResponsibilities,
        propertySize: watchPropertySize,
        yearBuilt: watchYearBuilt,
        heatingType: watchHeatingType,
        coolingType: watchCoolingType,
        waterHeaterType: watchWaterHeaterType,
        roofType: watchRoofType,
        hvacInstallYear: watchHvacInstallYear,
        waterHeaterInstallYear: watchWaterHeaterInstallYear,
        roofReplacementYear: watchRoofReplacementYear,
        foundationType: watchFoundationType,
        bedrooms: watchBedrooms,
        bathrooms: watchBathrooms,
        hasSmokeDetectors: watchHasSmokeDetectors,
        hasCoDetectors: watchHasCoDetectors,
        hasDrainageIssues: watchHasDrainageIssues,
        hasSecuritySystem: watchHasSecuritySystem,
        hasFireExtinguisher: watchHasFireExtinguisher,
        hasIrrigation: watchHasIrrigation,
        appliances: watchAppliances,
      },
      activeSectionId,
    );
  }, [
    watchName,
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchDwellingType,
    watchOwnershipForm,
    watchPropertyUse,
    watchOccupancyStatus,
    watchResponsibilities,
    watchPropertySize,
    watchYearBuilt,
    watchHeatingType,
    watchCoolingType,
    watchFoundationType,
    watchWaterHeaterType,
    watchRoofType,
    watchHvacInstallYear,
    watchWaterHeaterInstallYear,
    watchRoofReplacementYear,
    watchBedrooms,
    watchBathrooms,
    watchHasSmokeDetectors,
    watchHasCoDetectors,
    watchHasDrainageIssues,
    watchHasSecuritySystem,
    watchHasFireExtinguisher,
    watchHasIrrigation,
    watchAppliances,
    activeSectionId,
  ]);

  React.useEffect(() => {
    const currentMissing = new Set(priorityState.missingFields.map((field) => field.key));
    if (!priorityState.nextBestStep) {
      if (lockedStartFieldKey) setLockedStartFieldKey(null);
      return;
    }
    if (!lockedStartFieldKey) {
      setLockedStartFieldKey(priorityState.nextBestStep.key);
      return;
    }
    if (!currentMissing.has(lockedStartFieldKey)) {
      setLockedStartFieldKey(priorityState.nextBestStep.key);
    }
  }, [priorityState.nextBestStep, priorityState.missingFields, lockedStartFieldKey]);

  const startField = React.useMemo(() => {
    if (!lockedStartFieldKey) return priorityState.nextBestStep;
    return (
      priorityState.missingFields.find((field) => field.key === lockedStartFieldKey) ??
      priorityState.nextBestStep
    );
  }, [lockedStartFieldKey, priorityState.missingFields, priorityState.nextBestStep]);

  const recommendedFieldKeys = React.useMemo(() => {
    return new Set(
      priorityState.missingFields
        .filter((field) => field.key !== startField?.key)
        .slice(0, 3)
        .map((field) => field.key),
    );
  }, [priorityState.missingFields, startField?.key]);

  const confidenceScore = priorityState.completionPct;
  const nextBestStepText = startField ? `Add ${startField.label}` : null;
  const saveBarCopy = getSaveBarCopy(confidenceScore);
  const startSectionId = startField?.sectionId ?? null;

  const timezoneValue = form.watch("timezone");
  const timezoneLabel =
    PROPERTY_TIMEZONE_OPTIONS.find((option) => option.value === timezoneValue)?.label ??
    (timezoneValue ? timezoneValue.replaceAll("_", " ") : null);
  const purchasePriceLabel = formatUsdCompact(form.watch("purchasePriceDollars"));
  const purchaseWhenLabel = formatMonthYear(form.watch("purchaseDate"));
  const appraisalLabel = formatUsdCompact(form.watch("lastAppraisedValueDollars"));
  const valueSummary = [
    purchasePriceLabel ? `Bought ${purchasePriceLabel}${purchaseWhenLabel ? ` · ${purchaseWhenLabel}` : ""}` : null,
    appraisalLabel ? `Appraised ${appraisalLabel}` : null,
  ].filter(Boolean).join("   ·   ");
  const [correctionAnchor, setCorrectionAnchor] = React.useState('');
  const responsibilityPreset = React.useMemo(
    () => getResponsibilityPreset(watchResponsibilities),
    [watchResponsibilities],
  );
  const [responsibilityDetailsExpanded, setResponsibilityDetailsExpanded] = React.useState(false);
  const applianceCount = Array.isArray(watchAppliances) ? watchAppliances.length : 0;
  const [appliancesExpanded, setAppliancesExpanded] = React.useState(false);
  const [highlightHomeValue, setHighlightHomeValue] = React.useState(false);
  const [highlightPropertyUse, setHighlightPropertyUse] = React.useState(false);
  const [valueGroupOpen, setValueGroupOpen] = React.useState(false);
  const [timezoneFieldOpen, setTimezoneFieldOpen] = React.useState(false);

  React.useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (!anchor) return;
    setCorrectionAnchor(anchor);
    const timeout = window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    if (responsibilityPreset === 'CUSTOM' || correctionAnchor === 'responsibility') {
      setResponsibilityDetailsExpanded(true);
    }
  }, [responsibilityPreset, correctionAnchor]);

  React.useEffect(() => {
    if (startSectionId === "appliances") {
      setAppliancesExpanded(true);
    }
  }, [startSectionId]);

  React.useEffect(() => {
    if (searchParams.get("focus") !== "home-value") return;
    const target = document.getElementById("home-value-section");
    if (!target) return;

    setValueGroupOpen(true);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightHomeValue(true);
    const timeout = window.setTimeout(() => setHighlightHomeValue(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  const valueFieldErrors = form.formState.errors;
  React.useEffect(() => {
    if (
      valueFieldErrors.purchasePriceDollars ||
      valueFieldErrors.purchaseDate ||
      valueFieldErrors.lastAppraisedValueDollars ||
      valueFieldErrors.lastAppraisalDate
    ) {
      setValueGroupOpen(true);
    }
  }, [
    valueFieldErrors.purchasePriceDollars,
    valueFieldErrors.purchaseDate,
    valueFieldErrors.lastAppraisedValueDollars,
    valueFieldErrors.lastAppraisalDate,
  ]);

  React.useEffect(() => {
    if (searchParams.get("focus") !== "property-use") return;
    const timeout = window.setTimeout(() => {
      const target = document.getElementById("field-propertyUse");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightPropertyUse(true);
    }, 100);
    const clear = window.setTimeout(() => setHighlightPropertyUse(false), 2300);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(clear);
    };
  }, [searchParams]);

  React.useEffect(() => {
    if (searchParams.get("focus") !== "appliances") return;
    setAppliancesExpanded(true);
    const timeout = window.setTimeout(() => {
      const target = document.getElementById("appliances");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  const mobileSectionLinks: Array<{ id: PropertySectionId; label: string }> = [
    { id: "basics", label: "Basics" },
    { id: "systems", label: "Systems" },
    { id: "safety", label: "Safety" },
    { id: "occupancy", label: "Occupancy" },
    { id: "appliances", label: "Appliances" },
  ];

  const isRecommended = (fieldKey: string) => recommendedFieldKeys.has(fieldKey);
  const CHECKBOX_META = {
    hasSmokeDetectors: {
      label: "Smoke Detectors",
      offHint: "Helps protect your household — may also lower your insurance rate.",
      onHint: "Great — this improves your safety profile.",
      impact: "positive" as const,
    },
    hasCoDetectors: {
      label: "CO Detectors",
      offHint: "Carbon monoxide is invisible. Detectors save lives.",
      onHint: "Important protection — noted in your profile.",
      impact: "positive" as const,
    },
    hasDrainageIssues: {
      label: "Drainage Issues",
      offHint: "Tell us if this needs attention. We can find drainage specialists nearby.",
      onHint: "We'll flag this in your maintenance plan.",
      impact: "negative" as const,
    },
    hasSecuritySystem: {
      label: "Security System",
      offHint: "Adds an important layer of protection for your home.",
      onHint: "Noted — helps with your overall risk profile.",
      impact: "positive" as const,
    },
    hasFireExtinguisher: {
      label: "Fire Extinguisher",
      offHint: "A simple step that can make a real difference in an emergency.",
      onHint: "Good to have — included in your safety checklist.",
      impact: "positive" as const,
    },
    hasIrrigation: {
      label: "Irrigation System",
      offHint: "Helps us include lawn and garden services in your plan.",
      onHint: "We'll include outdoor maintenance in your schedule.",
      impact: "neutral" as const,
    },
    inHistoricDistrict: {
      label: "Historic District",
      offHint: "Some tax exemptions and grants only apply to registered historic properties.",
      onHint: "Noted — we'll check for historic-district-specific benefits.",
      impact: "neutral" as const,
    },
    inHurricaneZone: {
      label: "Hurricane Zone",
      offHint: "Helps us check for storm-resilience rebates and coverage guidance.",
      onHint: "Noted — we'll check for hurricane-zone-specific benefits.",
      impact: "neutral" as const,
    },
    inFloodZone: {
      label: "Flood Zone",
      offHint: "Helps us check for flood-related rebates and coverage guidance.",
      onHint: "Noted — we'll check for flood-zone-specific benefits.",
      impact: "neutral" as const,
    },
    inWildfireZone: {
      label: "Wildfire Zone",
      offHint: "Helps us check for wildfire-resilience rebates and coverage guidance.",
      onHint: "Noted — we'll check for wildfire-zone-specific benefits.",
      impact: "neutral" as const,
    },
    isCoastal: {
      label: "Coastal Property",
      offHint: "Helps us tailor salt-air maintenance, coastal exposure, and coverage guidance.",
      onHint: "Noted — we'll factor in coastal exposure and salt-air upkeep.",
      impact: "neutral" as const,
    },
  } as const;

  type CheckboxField = keyof typeof CHECKBOX_META;

  const CHECKBOX_IMPACT_STYLES = {
    positive: {
      checked: "border-teal-400 bg-teal-50 dark:border-teal-500/50 dark:bg-teal-900/20",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-teal-500",
      hint: "text-gray-500 dark:text-slate-400",
    },
    negative: {
      checked: "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-900/20",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-amber-500",
      hint: "text-gray-500 dark:text-slate-400",
    },
    neutral: {
      checked: "border-teal-300 bg-teal-50/80 dark:border-teal-500/40 dark:bg-teal-900/15",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-teal-500",
      hint: "text-gray-500 dark:text-slate-400",
    },
  } as const;

  const SAFETY_CHECKBOX_FIELDS: CheckboxField[] = [
    "hasSmokeDetectors", "hasCoDetectors", "hasDrainageIssues",
    "hasSecuritySystem", "hasFireExtinguisher", "hasIrrigation",
  ];
  const LOCATION_CONTEXT_CHECKBOX_FIELDS: CheckboxField[] = [
    "inHistoricDistrict", "inHurricaneZone", "inFloodZone", "inWildfireZone", "isCoastal",
  ];

  const renderCheckboxCard = (fieldName: CheckboxField) => {
    const meta = CHECKBOX_META[fieldName];
    const styles = CHECKBOX_IMPACT_STYLES[meta.impact];
    return (
      <FormField
        key={fieldName}
        control={form.control}
        name={fieldName}
        render={({ field }) => {
          const value = field.value as boolean | null | undefined;
          const isYes = value === true;
          const isNo = value === false;
          const isDrainage = fieldName === "hasDrainageIssues";
          const cardStyle = isYes
            ? styles.checked
            : isNo
              ? "border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-slate-900/20"
              : styles.unchecked;
          const dotClass = cn(
            "safety-card-dot mt-[3px] h-2 w-2 shrink-0 rounded-full",
            isYes
              ? cn(styles.dot, "ring-2 ring-offset-0", isDrainage ? "ring-amber-100 dark:ring-amber-900/40" : "ring-teal-100 dark:ring-teal-900/50")
              : isNo
                ? "bg-slate-400 dark:bg-slate-500"
                : "bg-gray-300 dark:bg-slate-600",
          );
          const noHint = isDrainage
            ? "No drainage issues — noted."
            : fieldName === "hasIrrigation"
              ? "No irrigation system — noted."
              : meta.offHint;
          const hint = isYes ? meta.onHint : isNo ? noHint : meta.offHint;
          return (
            <FormItem>
              <FormControl>
                <div className={cn(
                  "safety-card flex items-start justify-between gap-2.5 rounded-md border-[1.5px] px-3 py-2.5 transition-colors",
                  cardStyle,
                )}>
                  <div className="safety-card-content min-w-0 flex flex-1 items-start gap-2.5">
                    <span className={dotClass} />
                    <div>
                      <p className="safety-card-title m-0 mb-0.5 text-[13px] font-semibold leading-tight text-gray-800 dark:text-slate-200">{meta.label}</p>
                      <p className={cn("safety-card-subtitle m-0 text-[11px] leading-[1.3]", styles.hint)}>{hint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => field.onChange(true)}
                      className={cn(
                        "h-6 px-2.5 rounded text-[11px] font-semibold transition-colors",
                        isYes
                          ? isDrainage ? "bg-amber-500 text-white" : "bg-teal-500 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
                      )}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange(false)}
                      className={cn(
                        "h-6 px-2.5 rounded text-[11px] font-semibold transition-colors",
                        isNo
                          ? "bg-slate-600 text-white dark:bg-slate-500"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
                      )}
                    >
                      No
                    </button>
                  </div>
                </div>
              </FormControl>
            </FormItem>
          );
        }}
      />
    );
  };

  if (isLoadingProperty) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        <MobilePageIntro
          title="Property Not Found"
          subtitle="The property you are looking for does not exist or you do not have permission to view it."
        />
        <Button variant="outline" onClick={() => router.push("/dashboard/properties")}>
          Back to Properties
        </Button>
      </div>
    );
  }

  return (
    <div className="property-edit-page mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-3 md:hidden">
          <MobilePageIntro
            title="Edit Property"
            subtitle="Update home details for smarter recommendations and reminders."
          />
        </div>
        <div className="mb-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/40 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <HomeIcon className="h-5 w-5 text-primary shrink-0" />
                <h1 className="truncate text-xl font-bold text-gray-900 dark:text-slate-100">
                  {property?.name || property?.address || "Property"}
                </h1>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                A few updates help us give better reminders and tips.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(contextualReturnTo ?? `/dashboard/properties/${propertyId}`)}
                disabled={updateMutation.isPending}
                className="h-9 border-black/10 text-gray-700 hover:bg-black/[0.02] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.03]"
              >
                <X className="h-4 w-4 mr-1.5" />
                {searchParams.get("from") === "status-board" ? "Back" : "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={form.handleSubmit(onSubmit)}
                disabled={updateMutation.isPending}
                type="submit"
                className="h-9 shadow-sm"
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${confidenceScore}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-xs text-gray-600 dark:text-slate-400">
                {priorityState.completionCount} of {priorityState.completionTotal} done
              </span>
            </div>
            <span className="whitespace-nowrap rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300">
              Details completeness {confidenceScore}%
            </span>
          </div>
          {confidenceScore === 100 ? (
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold text-white">✓</span>
              <span>Your property profile is complete!</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
              Next:{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                onClick={() => {
                  const refId = startField?.fieldRefId;
                  const sectionId = startField?.sectionId;
                  const target = refId
                    ? document.getElementById(refId)
                    : sectionId
                      ? document.querySelector(`.${sectionId}-section-card`)
                      : null;
                  target?.scrollIntoView({ behavior: "smooth", block: "center" });
                  if (target instanceof HTMLElement) target.focus?.();
                }}
              >
                {nextBestStepText ?? "Review your details"}
              </button>{" "}
              <span className="text-gray-500 dark:text-slate-400">(takes ~10 seconds)</span>
            </p>
          )}
        </div>

        <div className="mb-4 space-y-3 md:hidden">
          <ReadOnlySummaryBlock
            title="Edit Snapshot"
            columns={2}
            items={[
              {
                label: "Completion",
                value: `${confidenceScore}%`,
                emphasize: true,
              },
              {
                label: "Done",
                value: `${priorityState.completionCount} / ${priorityState.completionTotal}`,
              },
              {
                label: "Next field",
                value: nextBestStepText ?? "Review all sections",
              },
              {
                label: "Status",
                value: confidenceScore === 100 ? "Complete" : "In progress",
              },
            ]}
          />

          <MobileFilterStack
            primaryFilters={
              <div className="flex flex-wrap gap-2">
                {mobileSectionLinks.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={cn(
                      "inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium",
                      activeSectionId === section.id
                        ? "border-teal-300 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-700"
                    )}
                  >
                    {section.label}
                  </a>
                ))}
              </div>
            }
            secondaryLabel="Recommended next fields"
            secondaryFilters={
              <div className="space-y-2">
                {priorityState.missingFields.slice(0, 4).map((field) => (
                  <div key={field.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-medium text-slate-700">{field.label}</p>
                    {field.key === startField?.key ? (
                      <StatusChip tone="needsAction">Start here</StatusChip>
                    ) : (
                      <StatusChip tone="elevated">Recommended</StatusChip>
                    )}
                  </div>
                ))}
              </div>
            }
          />
        </div>

        <OnboardingReturnBanner />
      
        {hasErrors && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-4">
           <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
             <AlertCircle className="h-4 w-4" />
             Please fix the following errors before saving:
           </div>
           <ul className="list-disc list-inside mt-2 text-sm text-red-700">
             {Object.entries(form.formState.errors).map(([key, error]) => (
               <li key={key}>
                 {key.replace(/([A-Z])/g, ' $1').trim().charAt(0).toUpperCase() + key.replace(/([A-Z])/g, ' $1').trim().slice(1)}: {(error as any).message || "Invalid value."}
               </li>
             ))}
           </ul>
          </div>
        )}
      
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-24 md:space-y-6 md:pb-8">
            <PropertyEditSection
              id="basics"
              title="Basics"
              helperText="Keeps your home organized and tips matched to your area."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={true}
              forceExpandOnMobile={startSectionId === "basics" || correctionAnchor === 'address'}
              headerChip={startSectionId === "basics" ? <FieldNudgeChip variant="start" /> : undefined}
              className="basics-section-card"
              headerClassName="p-5 pb-3 sm:p-5 sm:pb-3"
              contentClassName="p-5 pt-0 sm:p-5 sm:pt-0"
            >
              <div className="space-y-6">
                {/* Home & location */}
                <div id="address" className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Home nickname</FormLabel>
                          <FormControl><Input id="field-name" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="Main Home" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Street address</FormLabel>
                          <FormControl><Input id="field-address" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="123 Main St" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_84px_120px]">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">City</FormLabel>
                          <FormControl><Input id="field-city" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="Princeton" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">State</FormLabel>
                          <FormControl><Input id="field-state" className="h-9 text-center text-sm tracking-normal tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="NJ" {...field} maxLength={2} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zipCode"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">ZIP</FormLabel>
                          <FormControl><Input id="field-zipCode" className="h-9 text-sm tracking-normal tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="08540" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-slate-900/40">
                    <button
                      type="button"
                      onClick={() => setTimezoneFieldOpen((open) => !open)}
                      aria-expanded={timezoneFieldOpen}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0 truncate text-xs text-gray-600 dark:text-slate-300">
                        <span className="font-medium text-gray-900 dark:text-slate-100">Time zone</span>
                        <span className="text-gray-500 dark:text-slate-400"> · {timezoneLabel ?? "Eastern Time (default)"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {timezoneFieldOpen ? "Done" : "Change"}
                        <ChevronDown className={cn("h-4 w-4 transition-transform", timezoneFieldOpen && "rotate-180")} />
                      </span>
                    </button>
                    {timezoneFieldOpen ? (
                      <FormField
                        control={form.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem className="mt-2.5">
                            <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger id="field-timezone" className="h-9 bg-white text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40 dark:bg-slate-950/50">
                                  <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {field.value && !PROPERTY_TIMEZONE_OPTIONS.some((option) => option.value === field.value) ? (
                                  <SelectItem value={field.value}>{field.value.replaceAll('_', ' ')}</SelectItem>
                                ) : null}
                                {PROPERTY_TIMEZONE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-slate-400">
                              Normally set from your address. Change it only if reminders and digests should
                              follow a different zone.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="h-px bg-black/5 dark:bg-white/10" />

                {/* Value & equity */}
                <div
                  id="home-value-section"
                  className={cn(
                    "rounded-lg border border-slate-200/70 bg-slate-50 transition-shadow dark:border-white/10 dark:bg-slate-900/40",
                    highlightHomeValue && "border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-700/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setValueGroupOpen((open) => !open)}
                    aria-expanded={valueGroupOpen}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100">Value &amp; equity</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-slate-400">
                        {valueSummary || "Add purchase and appraisal figures for equity insights."}
                      </span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", valueGroupOpen && "rotate-180")} />
                  </button>
                  {valueGroupOpen ? (
                    <div className="grid grid-cols-1 gap-3 border-t border-slate-200/70 px-3.5 pb-3.5 pt-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10">
                      <FormField
                        control={form.control}
                        name="purchasePriceDollars"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Purchase price (USD)</FormLabel>
                            <FormControl>
                              <Input
                                id="field-purchasePriceDollars"
                                className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                                placeholder="e.g., 600000"
                                inputMode="decimal"
                                type="number"
                                min="0"
                                step="0.01"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="purchaseDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Purchase date</FormLabel>
                            <FormControl>
                              <Input
                                id="field-purchaseDate"
                                className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                                type="date"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastAppraisedValueDollars"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Latest appraisal (USD)</FormLabel>
                            <FormControl>
                              <Input
                                id="field-lastAppraisedValueDollars"
                                className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                                placeholder="e.g., 725000"
                                inputMode="decimal"
                                type="number"
                                min="0"
                                step="0.01"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastAppraisalDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Appraisal date</FormLabel>
                            <FormControl>
                              <Input
                                id="field-lastAppraisalDate"
                                className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                                type="date"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="h-px bg-black/5 dark:bg-white/10" />

                {/* Photo & display */}
                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">Photo &amp; display</p>

                  <FormField
                    control={form.control}
                    name="isPrimary"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2.5 space-y-0">
                        <FormControl>
                          <Checkbox id="field-isPrimary" checked={field.value ?? false} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                          <FormLabel htmlFor="field-isPrimary" className="m-0 text-[13px] font-medium text-gray-900 dark:text-slate-100">Set as main home</FormLabel>
                          <CardDescription className="m-0 text-[11px] text-gray-500 dark:text-slate-400">You can change this anytime.</CardDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2 rounded-lg border border-slate-200/70 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-900/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Cover photo</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">Optional — shown on your property cards.</p>
                    </div>
                    {propertyPhotoFile ? (
                      <StatusChip tone="good">New photo selected</StatusChip>
                    ) : removeCoverPhoto ? (
                      <StatusChip tone="elevated">Will remove</StatusChip>
                    ) : existingCoverPhotoUrl ? (
                      <StatusChip tone="info">Current photo</StatusChip>
                    ) : (
                      <StatusChip tone="info">Optional</StatusChip>
                    )}
                  </div>

                  {activeCoverPhotoUrl ? (
                    <div className="overflow-hidden rounded-md border border-black/10 bg-white dark:border-white/10 dark:bg-slate-900">
                      <img
                        src={activeCoverPhotoUrl}
                        alt="Property photo preview"
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : null}

                  <input
                    ref={propertyPhotoInputRef}
                    type="file"
                    accept={ALLOWED_PROPERTY_PHOTO_TYPES.join(",")}
                    className="hidden"
                    onChange={handlePropertyPhotoChange}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => propertyPhotoInputRef.current?.click()}
                      className="h-9"
                    >
                      {propertyPhotoFile || existingCoverPhotoUrl ? "Change Photo" : "Upload Photo"}
                    </Button>

                    {propertyPhotoFile ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          clearSelectedPropertyPhoto();
                          setRemoveCoverPhoto(false);
                        }}
                        className="h-9"
                      >
                        Discard New Photo
                      </Button>
                    ) : null}

                    {!propertyPhotoFile && existingCoverPhotoUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeCoverPhoto ? () => setRemoveCoverPhoto(false) : handleRemoveCoverPhoto}
                        className="h-9"
                      >
                        {removeCoverPhoto ? "Undo Remove" : "Remove Photo"}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    JPG, PNG, WEBP, or HEIC (max {MAX_PROPERTY_PHOTO_SIZE_MB}MB).
                  </p>
                  </div>
                </div>
              </div>
            </PropertyEditSection>

            <PropertyEditSection
              id="systems"
              title="Systems & structure"
              helperText="Your building's key facts, and the systems you service over time."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "systems" || ['property-type', 'structure', 'systems'].includes(correctionAnchor)}
              headerChip={(
                <span className="flex items-center gap-2">
                  <span className="h-1 w-14 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(trackedSystemsCount / 3) * 100}%` }} />
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {agingSystemsCount > 0
                      ? `${agingSystemsCount} aging soon`
                      : trackedSystemsCount === 3
                        ? "All tracked"
                        : `${trackedSystemsCount}/3 tracked`}
                  </span>
                </span>
              )}
            >
              <div className="space-y-6">
                {/* About the building */}
                <div id="structure" className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">About the building</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      control={form.control}
                      name="dwellingType"
                      render={({ field }) => (
                        <FormItem id="property-type" className="w-full">
                          <div className="mb-1 flex items-center gap-2">
                            <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Home type</FormLabel>
                            {isRecommended("dwellingType") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger id="field-dwellingType" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DWELLING_TYPE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>{DWELLING_TYPE_LABELS[type]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="propertySize"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <div className="mb-1 flex items-center gap-2">
                            <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Approx. size</FormLabel>
                            {isRecommended("propertySize") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <FormControl>
                            <div className="relative">
                              <Input id="field-propertySize" className="h-9 pr-11 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 2500" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 dark:text-slate-500">sq ft</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="yearBuilt"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <div className="mb-1 flex items-center gap-2">
                            <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Year built</FormLabel>
                            {isRecommended("yearBuilt") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <FormControl>
                            <Input id="field-yearBuilt" className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 1995" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="foundationType"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <div className="mb-1 flex items-center gap-2">
                            <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Foundation</FormLabel>
                            {isRecommended("foundationType") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-foundationType" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(FoundationTypes).map((type) => (
                                <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!field.value ? (
                            <p className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-slate-400">
                              Improves drainage, drought, and moisture insights.
                            </p>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="basementConfiguration"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Basement</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? "UNKNOWN"}>
                            <FormControl>
                              <SelectTrigger id="field-basementConfiguration" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="NONE">No basement</SelectItem>
                              <SelectItem value="UNFINISHED">Unfinished basement</SelectItem>
                              <SelectItem value="FINISHED">Finished basement</SelectItem>
                              <SelectItem value="UNKNOWN">Not sure</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sidingType"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Siding / exterior</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-sidingType" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SIDING_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="electricalPanelAge"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Electrical panel age</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input id="field-electricalPanelAge" className="h-9 pr-12 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 15" type="number" min="0" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 dark:text-slate-500">years</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="h-px bg-black/5 dark:bg-white/10" />

                {/* Systems */}
                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">Systems</p>
                  <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-900/40">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">HVAC</p>
                        <SystemStatusChip year={watchHvacInstallYear} />
                      </div>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="heatingType"
                          render={({ field }) => (
                            <FormItem className="w-full min-w-0">
                              <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Heating</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger id="field-heatingType" title={field.value ? formatEnumLabel(field.value) : undefined} className="h-9 min-w-0 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40 [&>span]:truncate"><SelectValue placeholder="Select type" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.values(HeatingTypes).map((type) => (
                                    <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="coolingType"
                          render={({ field }) => (
                            <FormItem className="w-full min-w-0">
                              <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Cooling</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger id="field-coolingType" title={field.value ? formatEnumLabel(field.value) : undefined} className="h-9 min-w-0 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40 [&>span]:truncate"><SelectValue placeholder="Select type" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.values(CoolingTypes).map((type) => (
                                    <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="hvacInstallYear"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <div className="mb-1 flex items-center gap-2">
                                <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Installed</FormLabel>
                                {isRecommended("hvacInstallYear") ? <FieldNudgeChip variant="recommended" /> : null}
                              </div>
                              <FormControl>
                                <Input id="field-hvacInstallYear" className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2018" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-900/40">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Water heater</p>
                        <SystemStatusChip year={watchWaterHeaterInstallYear} />
                      </div>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="waterHeaterType"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Type</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger id="field-waterHeaterType" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.values(WaterHeaterTypes).map((type) => (
                                    <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="waterHeaterInstallYear"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <div className="mb-1 flex items-center gap-2">
                                <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Installed</FormLabel>
                                {isRecommended("waterHeaterInstallYear") ? <FieldNudgeChip variant="recommended" /> : null}
                              </div>
                              <FormControl>
                                <Input id="field-waterHeaterInstallYear" className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2020" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-900/40">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Roof</p>
                        <SystemStatusChip year={watchRoofReplacementYear} />
                      </div>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="roofType"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Material</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger id="field-roofType" className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.values(RoofTypes).map((type) => (
                                    <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="roofReplacementYear"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <div className="mb-1 flex items-center gap-2">
                                <FormLabel className="text-xs font-medium text-gray-600 dark:text-slate-300">Installed</FormLabel>
                                {isRecommended("roofReplacementYear") ? <FieldNudgeChip variant="recommended" /> : null}
                              </div>
                              <FormControl>
                                <Input id="field-roofReplacementYear" className="h-9 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2010" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PropertyEditSection>

            <PropertyEditSection
              id="safety"
              title="Safety"
              helperText="Quick checks that help protect your home."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "safety" || correctionAnchor === 'safety' || correctionAnchor === 'location-context'}
              headerChip={startSectionId === "safety" ? <FieldNudgeChip variant="start" /> : undefined}
              className="safety-section-card"
              headerClassName="p-4 pb-2.5 sm:px-5 sm:pb-2.5 sm:pt-4"
              contentClassName="p-4 pt-0 sm:px-5 sm:pb-4 sm:pt-0"
            >
              <div className="safety-cards-grid mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {SAFETY_CHECKBOX_FIELDS.map(renderCheckboxCard)}
              </div>
              <div id="location-context" className="scroll-mt-24 mt-4 rounded-lg border border-black/10 p-3 dark:border-white/10">
                <p className="m-0 mb-2 text-[13px] font-semibold text-gray-800 dark:text-slate-200">Location &amp; risk context</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {LOCATION_CONTEXT_CHECKBOX_FIELDS.map(renderCheckboxCard)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="utilityProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Electric utility provider (optional)</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                          placeholder="e.g. PSEG"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gasProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Gas utility provider (optional)</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                          placeholder="e.g. National Grid"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("inHistoricDistrict") ? (
                  <FormField
                    control={form.control}
                    name="historicRegistryStatus"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">
                          Historic registry status (optional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="h-9 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                            placeholder="e.g. National Register of Historic Places"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                These details help the Hidden Asset Finder check for utility, historic-district, and hazard-zone
                specific rebates and credits. All are optional and self-reported.
              </p>
            </PropertyEditSection>

            <PropertyEditSection
              id="occupancy"
              title="Home setup"
              helperText="A few quick details help us recommend only the care that applies to you."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "occupancy" || ['occupancy', 'exterior', 'responsibility'].includes(correctionAnchor)}
              headerChip={startSectionId === "occupancy" ? <FieldNudgeChip variant="start" /> : undefined}
              className="occupancy-section-card overflow-hidden"
            >
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                <p><span className="font-medium">No paperwork needed.</span> Choose what you know now—you can change any answer later.</p>
              </div>

              <div className="space-y-5">
                <section className="rounded-2xl border border-black/10 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-900/30 sm:p-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(240px,1.25fr)_minmax(140px,0.75fr)_minmax(140px,0.75fr)] md:items-end">
                    <div className="flex items-center gap-3 md:self-center">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">1</span>
                      <div>
                        <h3 className="font-semibold text-foreground">About the home</h3>
                        <p className="text-xs text-muted-foreground">Just the basics.</p>
                      </div>
                    </div>
                    <FormField
                      control={form.control}
                      name="bedrooms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bedrooms</FormLabel>
                          <FormControl><Input id="field-bedrooms" className="h-11 bg-white text-center text-base font-semibold dark:bg-slate-950/50" placeholder="e.g., 3" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bathrooms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bathrooms</FormLabel>
                          <FormControl><Input id="field-bathrooms" className="h-11 bg-white text-center text-base font-semibold dark:bg-slate-950/50" placeholder="e.g., 2.5" type="number" step="0.5" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">2</span>
                    <div>
                      <h3 className="font-semibold text-foreground">How the home fits your life</h3>
                      <p className="text-xs text-muted-foreground">This keeps your plan relevant to the people living here.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="ownershipForm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How is this home owned?</FormLabel>
                          <p className="min-h-8 text-xs leading-4 text-muted-foreground">Helps identify association or landlord involvement.</p>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger id="field-ownershipForm" className="h-11 bg-white dark:bg-slate-950/50"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>{OWNERSHIP_FORM_OPTIONS.map((option) => <SelectItem key={option} value={option}>{OWNERSHIP_FORM_LABELS[option]}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="propertyUse"
                      render={({ field }) => (
                        <FormItem
                          className={cn(
                            "rounded-md transition-shadow",
                            highlightPropertyUse && "ring-2 ring-emerald-200",
                          )}
                        >
                          <FormLabel>How do you use this home?</FormLabel>
                          <p className="min-h-8 text-xs leading-4 text-muted-foreground">For example, your main home or a rental.</p>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger id="field-propertyUse" className="h-11 bg-white dark:bg-slate-950/50"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>{PROPERTY_USE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{PROPERTY_USE_LABELS[option]}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="occupancyStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Who lives here now?</FormLabel>
                          <p className="min-h-8 text-xs leading-4 text-muted-foreground">Choose the closest match today.</p>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger id="field-occupancyStatus" className="h-11 bg-white dark:bg-slate-950/50"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>{OCCUPANCY_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{OCCUPANCY_STATUS_LABELS[option]}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-4 dark:border-violet-800/50 dark:from-violet-950/30 dark:to-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                        <PawPrint className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">Optional household context</p>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                          Household size is kept separate from property age. Children or older-adult safety needs and pets also belong in this private, consent-controlled profile—not in the structural Home Record.
                        </p>
                      </div>
                    </div>
                    <Button asChild type="button" variant="outline" className="shrink-0 bg-white dark:bg-slate-950/60">
                      <Link href={`/dashboard/personalization?propertyId=${encodeURIComponent(propertyId)}`}>
                        Manage household details
                      </Link>
                    </Button>
                  </div>
                </section>

                <section id="responsibility" className="rounded-2xl border border-black/10 p-4 dark:border-white/10 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">3</span>
                    <div>
                      <h3 className="font-semibold text-foreground">Who takes care of what?</h3>
                      <p className="text-xs text-muted-foreground">Pick the closest match. You can customize exceptions if needed.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {RESPONSIBILITY_PRESETS.map((preset) => {
                      const selected = responsibilityPreset === preset.value;
                      const PresetIcon = preset.icon;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            form.setValue('responsibilities', defaultResponsibilityParties(preset.value), { shouldDirty: true, shouldTouch: true });
                            setResponsibilityDetailsExpanded(false);
                          }}
                          className={cn(
                            "group flex min-h-[88px] items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                            selected
                              ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/30"
                              : "border-black/10 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-white/10 dark:bg-slate-950/40 dark:hover:border-emerald-700",
                          )}
                        >
                          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                            <PresetIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 font-medium text-foreground">
                              {preset.label}
                              {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                            </span>
                            <span className="mt-1 block text-xs leading-4 text-muted-foreground">{preset.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-black/10 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {responsibilityPreset === 'UNKNOWN' ? 'Choose a general match or review each area.' : 'Only customize the areas that work differently.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {RESPONSIBLE_PARTY_OPTIONS.map((party) => {
                          const count = RESPONSIBILITY_SCOPES.filter((scope) => watchResponsibilities?.[scope] === party).length;
                          if (count === 0) return null;
                          return (
                            <span key={party} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-slate-950/60">
                              {RESPONSIBLE_PARTY_LABELS[party]} · {count}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 bg-white dark:bg-slate-950/60" onClick={() => setResponsibilityDetailsExpanded((expanded) => !expanded)} aria-expanded={responsibilityDetailsExpanded}>
                      <Wrench className="mr-2 h-4 w-4" />
                      {responsibilityDetailsExpanded ? 'Hide details' : 'Review exceptions'}
                      <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", responsibilityDetailsExpanded && "rotate-180")} />
                    </Button>
                  </div>
                  {responsibilityDetailsExpanded && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-slate-100 dark:border-white/10 dark:bg-slate-800">
                      <div className="border-b border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950/70">
                        <p className="text-sm font-semibold text-foreground">Responsibility details</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Use “Shared” when you coordinate the work with another party.</p>
                      </div>
                      <div className="grid gap-px lg:grid-cols-3">
                        {RESPONSIBILITY_GROUPS.map((group) => (
                          <section key={group.title} className="bg-white p-4 dark:bg-slate-950/55">
                            <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                            <p className="mb-4 mt-1 min-h-8 text-xs leading-4 text-muted-foreground">{group.description}</p>
                            <div className="space-y-2">
                              {group.scopes.map((scope) => (
                                <FormField
                                  key={scope}
                                  control={form.control}
                                  name={`responsibilities.${scope}` as const}
                                  render={({ field }) => (
                                    <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-slate-50/80 px-3 py-2 dark:border-white/5 dark:bg-slate-900/70">
                                      <FormLabel className="min-w-0 flex-1 text-xs font-medium leading-4">{RESPONSIBILITY_SCOPE_LABELS[scope]}</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger id={`field-responsibility-${scope}`} className="h-9 w-[128px] shrink-0 bg-white text-xs dark:bg-slate-950/70">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {RESPONSIBLE_PARTY_OPTIONS.map((option) => (
                                            <SelectItem key={option} value={option}>{RESPONSIBLE_PARTY_LABELS[option]}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section id="exterior" className="rounded-2xl border border-black/10 p-4 dark:border-white/10 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">4</span>
                    <div>
                      <h3 className="font-semibold text-foreground">Outdoor features</h3>
                      <p className="text-xs text-muted-foreground">We’ll only suggest outdoor care that applies to your home.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {([
                      ['hasPrivateOutdoorSpace', 'Private outdoor space', 'Yard, patio, balcony, deck, or garden'],
                      ['hasLawn', 'Lawn', 'Any grass you help maintain'],
                      ['hasTreesOrShrubs', 'Trees or shrubs', 'On areas you use or maintain'],
                      ['hasDriveway', 'Driveway', 'Private or shared vehicle access'],
                      ['hasFence', 'Fence', 'Any fencing you help maintain'],
                      ['hasPoolOrSpa', 'Pool or spa', 'In-ground or above-ground'],
                      ['hasOutdoorFaucets', 'Outdoor faucets', 'Hose bibs or spigots'],
                    ] as const).map(([name, fieldLabel, description]) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
                            <div className="flex items-start gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Leaf className="h-4 w-4" /></span>
                              <div className="min-w-0 flex-1">
                                <FormLabel className="font-medium">{fieldLabel}</FormLabel>
                                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={fieldLabel}>
                              {([
                                { label: 'Yes', value: true },
                                { label: 'No', value: false },
                                { label: 'Not sure', value: null },
                              ] as const).map((choice) => {
                                const selected = field.value === choice.value;
                                return (
                                  <button
                                    key={choice.label}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => field.onChange(choice.value)}
                                    className={cn(
                                      "rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                                      selected
                                        ? "border-emerald-500 bg-emerald-600 text-white"
                                        : "border-black/10 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300",
                                    )}
                                  >
                                    {choice.label}
                                  </button>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormField
                    control={form.control}
                    name="lotSizeSqFt"
                    render={({ field }) => (
                      <FormItem className="mt-3 sm:max-w-xs">
                        <FormLabel className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">Lot size</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input id="field-lotSizeSqFt" className="h-9 pr-11 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 6000" type="number" min="0" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 dark:text-slate-500">sq ft</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {form.watch('hasPrivateOutdoorSpace') === true && (
                  <FormField
                    control={form.control}
                    name="outdoorSpaceTypes"
                    render={({ field }) => (
                      <FormItem className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/20 sm:p-5">
                        <FormLabel>What kind of outdoor space do you have?</FormLabel>
                        <p className="text-xs text-muted-foreground">Select all that apply.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {OUTDOOR_SPACE_TYPE_OPTIONS.map((type) => {
                            const checked = field.value?.includes(type) ?? false;
                            return (
                              <button
                                key={type}
                                type="button"
                                aria-pressed={checked}
                                onClick={() => field.onChange(
                                  checked
                                    ? (field.value ?? []).filter((value) => value !== type)
                                    : Array.from(new Set([...(field.value ?? []), type])),
                                )}
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                                  checked
                                    ? "border-emerald-500 bg-emerald-600 text-white"
                                    : "border-black/10 bg-white text-foreground hover:border-emerald-300 dark:border-white/10 dark:bg-slate-950/50",
                                )}
                              >
                                {checked && <Check className="mr-1.5 h-3.5 w-3.5" />}
                                {formatEnumLabel(type)}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </PropertyEditSection>

            <PropertyEditSection
              id="appliances"
              title="Appliances"
              helperText="Optional — add if you know it."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "appliances"}
              headerChip={startSectionId === "appliances" ? <FieldNudgeChip variant="start" /> : <FieldNudgeChip variant="optional" />}
            >
              <div className="space-y-3">
                <div className="add-appliance-wrapper mt-2 rounded-md border border-black/10 bg-gray-50/40 p-3 dark:border-white/10 dark:bg-slate-900/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {applianceCount > 0 ? (
                        <>
                          <p className="text-sm font-medium text-foreground">{applianceCount} appliances added</p>
                          <p className="text-xs text-muted-foreground">Expand to edit</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">Optional — add if you know it.</p>
                          <p className="text-xs text-muted-foreground">Helps with maintenance reminders.</p>
                        </>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setAppliancesExpanded((prev) => !prev)}>
                      {appliancesExpanded ? "Show less" : "Show more"}
                      <ChevronDown className={cn("ml-1.5 h-4 w-4 transition-transform", appliancesExpanded && "rotate-180")} />
                    </Button>
                  </div>
                </div>
                {appliancesExpanded ? <ApplianceBentoGrid /> : null}
              </div>
            </PropertyEditSection>

            <div className="hidden md:flex items-center justify-between rounded-lg border border-black/10 bg-white/90 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-gray-700 dark:text-slate-300">{saveBarCopy}</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => navigateBackWithDashboardFallback(router)} disabled={updateMutation.isPending} className="h-10 border-black/10 text-gray-700 hover:bg-black/[0.02] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.03]">
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateMutation.isPending} className="h-10 min-w-[130px] shadow-sm">
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>

            <PropertyEditSaveBar
              isSaving={updateMutation.isPending}
              completionPct={confidenceScore}
              onSave={form.handleSubmit(onSubmit)}
              onCancel={() => navigateBackWithDashboardFallback(router)}
            />
          </form>
        </Form>
      </div>
  );
}
