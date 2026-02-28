// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, X, Home as HomeIcon, AlertCircle, Trash2, Plus, ChevronDown } from "lucide-react";

import {
  PropertyTypes,
  OwnershipTypes,
  HeatingTypes,
  CoolingTypes,
  WaterHeaterTypes,
  RoofTypes,
} from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
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
import PropertyEditHeaderNudge from "@/components/property/PropertyEditHeaderNudge";
import PropertyEditSection from "@/components/property/PropertyEditSection";
import PropertyEditSaveBar from "@/components/property/PropertyEditSaveBar";
import FieldNudgeChip from "@/components/ui/FieldNudgeChip";
import { fieldSizeClass } from "@/components/ui/fieldSizing";
import {
  getPropertyEditPriorityState,
  PROPERTY_SECTION_ORDER,
  type PropertySectionId,
} from "@/components/property/propertyEditPriority";


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
  if (age <= 8) return { label: `${age} yrs · Good condition`, color: "emerald", age };
  if (age <= 15) return { label: `${age} yrs · Monitor closely`, color: "amber", age };
  return { label: `${age} yrs · Approaching replacement`, color: "rose", age };
}

// Schema for a single HomeAsset record being sent from the frontend
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
  
  propertyType: z.union([z.nativeEnum(PropertyTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Property Type is required." }),
  
  propertySize: z.coerce.number().int().positive().optional().nullable(),
  yearBuilt: z.coerce.number().int().min(1700).optional().nullable(),
  
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().min(0).optional().nullable(),
  ownershipType: z.union([z.nativeEnum(OwnershipTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .optional().nullable(),
  occupantsCount: z.coerce.number().int().min(0).optional().nullable(),

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
  
  hvacInstallYear: z.coerce.number().int().min(1900).optional().nullable(),
  waterHeaterInstallYear: z.coerce.number().int().min(1900).optional().nullable(),
  roofReplacementYear: z.coerce.number().int().min(1900).optional().nullable(),
  
  hasDrainageIssues: z.boolean().optional(),
  hasSmokeDetectors: z.boolean().optional(),
  hasCoDetectors: z.boolean().optional(),
  hasSecuritySystem: z.boolean().optional(),
  hasFireExtinguisher: z.boolean().optional(),
  hasIrrigation: z.boolean().optional(),

  // NEW FIELD: Structured appliance data
  appliances: z.array(applianceSchema).optional(), 
});

type PropertyFormValues = z.infer<typeof propertySchema>;

// Helper to convert DB data (JSON string/object OR the new HomeAsset array) to structured form data 
const mapDbToForm = (property: any): PropertyFormValues => {
    let structuredAppliances: z.infer<typeof applianceSchema>[] = [];
    
    // --- FIX START: Prioritize new HomeAsset relation and fall back defensively ---
    
    // 1. Prioritize NEW HomeAsset[] relation if it exists and is populated
    if (property.homeAssets && Array.isArray(property.homeAssets) && property.homeAssets.length > 0) {
        structuredAppliances = property.homeAssets.map((asset: any, index: number) => ({
            // CRITICAL: Map the DB ID to the form ID for persistence (Update/Delete tracking)
            id: asset.id, 
            type: asset.assetType, // DB field name
            installYear: asset.installationYear, // DB field name
        }));
    } 
    // 2. Fallback to parsing OLD JSON field if the new relation is empty (for migration/old data)
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
        
        propertyType: property.propertyType || ("" as any), 
        propertySize: property.propertySize,
        yearBuilt: property.yearBuilt,
        
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        ownershipType: property.ownershipType || ("" as any),
        occupantsCount: property.occupantsCount,
        heatingType: property.heatingType || ("" as any),
        coolingType: property.coolingType || ("" as any),
        waterHeaterType: property.waterHeaterType || ("" as any),
        roofType: property.roofType || ("" as any),
        
        hvacInstallYear: property.hvacInstallYear,
        waterHeaterInstallYear: property.waterHeaterInstallYear,
        roofReplacementYear: property.roofReplacementYear,
        
        hasDrainageIssues: property.hasDrainageIssues ?? false,
        hasSmokeDetectors: property.hasSmokeDetectors ?? false,
        hasCoDetectors: property.hasCoDetectors ?? false,
        hasSecuritySystem: property.hasSecuritySystem ?? false,
        hasFireExtinguisher: property.hasFireExtinguisher ?? false,
        hasIrrigation: property.hasIrrigation ?? false,

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
      <div className="hidden md:grid grid-cols-12 gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        <span className="col-span-6">Appliance</span>
        <span className="col-span-2">Year</span>
        <span className="col-span-3">Status</span>
        <span className="col-span-1 text-right">Remove</span>
      </div>
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-1 items-start gap-3 rounded-md border border-black/5 bg-white p-4 shadow-sm md:grid-cols-12 dark:border-white/10 dark:bg-slate-900/30"
          >
            <FormField
              control={control}
              name={`appliances.${index}.type`}
              render={({ field: selectField }) => (
                <FormItem className="md:col-span-6 w-full">
                  <FormLabel className="text-xs">Appliance</FormLabel>
                  <Select onValueChange={selectField.onChange} value={selectField.value}>
                    <FormControl>
                      <SelectTrigger className={cn("h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40", fieldSizeClass("md"))}>
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
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-xs">Install year</FormLabel>
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
                      className={cn("h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40", fieldSizeClass("xs"))}
                    />
                  </FormControl>
                  {!yearField.value && Number.isFinite(Number(watch("yearBuilt"))) && Number(watch("yearBuilt")) >= 1900 ? (
                    <p
                      className="mt-0.5 text-[11px] text-muted-foreground"
                      title={`Suggest based on home age: ${Number(watch("yearBuilt"))}`}
                    >
                      Suggest based on home age
                    </p>
                  ) : null}
                  <FormMessage>{(errors.appliances?.[index] as any)?.installYear?.message}</FormMessage>
                </FormItem>
                )}
              />

            <div className="md:col-span-3 flex items-center min-h-10 pt-1 md:pt-0">
              {(() => {
                const yearVal = watch(`appliances.${index}.installYear`);
                const feedback = getInstallYearFeedback(Number(yearVal));
                if (!feedback) return <span className="text-xs text-muted-foreground">-</span>;
                return (
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
                      feedback.color === "emerald" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                      feedback.color === "amber" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
                      feedback.color === "rose" && "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
                      feedback.age > 20 && "animate-pulse",
                    )}
                  >
                    {feedback.label}
                  </span>
                );
              })()}
            </div>

            <div className="md:col-span-1 flex md:justify-end">
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ type: "", installYear: CURRENT_YEAR })}
        className="w-full mt-2 border-dashed border-teal-300/80 text-teal-700 hover:text-teal-900 hover:bg-teal-50/80 dark:border-teal-700/60 dark:text-teal-300 dark:hover:text-teal-200"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Appliance
      </Button>
    </div>
  );
};


export default function EditPropertyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const hasResetForm = React.useRef(false);

  const contextualReturnTo = React.useMemo(() => {
    const from = searchParams.get("from");
    if (from === "status-board") {
      return `/dashboard/properties/${propertyId}/status-board`;
    }

    const raw = searchParams.get("returnTo");
    if (!raw || !raw.startsWith("/dashboard/properties/")) {
      return null;
    }
    if (searchParams.get("fromOnboarding") === "1" || searchParams.get("fromHomeScore") === "1") {
      return raw;
    }
    return null;
  }, [searchParams, propertyId]);

  // 2. Fetch Existing Property Data
  const { data: property, isLoading: isLoadingProperty } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to fetch property.");
    },
    enabled: !!propertyId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as any,
    defaultValues: {
      name: "", isPrimary: false, address: "", city: "", state: "", zipCode: "",
      propertyType: "" as any, propertySize: null, yearBuilt: null, bedrooms: null,
      bathrooms: null, ownershipType: "" as any, occupantsCount: null,
      heatingType: "" as any, coolingType: "" as any, waterHeaterType: "" as any, 
      roofType: "" as any, hvacInstallYear: null, waterHeaterInstallYear: null,
      roofReplacementYear: null, hasDrainageIssues: false, hasSmokeDetectors: false,
      hasCoDetectors: false, hasSecuritySystem: false, hasFireExtinguisher: false,
      hasIrrigation: false,
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
    mutationFn: (data: PropertyFormValues) => {
      
      const payload = {
        name: data.name ?? undefined,
        address: data.address,
        city: data.city,
        state: data.state.toUpperCase(), 
        zipCode: data.zipCode,
        isPrimary: data.isPrimary,
        
        propertyType: data.propertyType ?? undefined,
        propertySize: data.propertySize ?? undefined,
        yearBuilt: data.yearBuilt ?? undefined,
        bedrooms: data.bedrooms ?? undefined,
        bathrooms: data.bathrooms ?? undefined,
        ownershipType: data.ownershipType ?? undefined,
        occupantsCount: data.occupantsCount ?? undefined,
        heatingType: data.heatingType ?? undefined,
        coolingType: data.coolingType ?? undefined,
        waterHeaterType: data.waterHeaterType ?? undefined,
        roofType: data.roofType ?? undefined,
        hvacInstallYear: data.hvacInstallYear ?? undefined,
        waterHeaterInstallYear: data.waterHeaterInstallYear ?? undefined,
        roofReplacementYear: data.roofReplacementYear ?? undefined,
        
        hasSmokeDetectors: data.hasSmokeDetectors ?? false,
        hasCoDetectors: data.hasCoDetectors ?? false,
        hasDrainageIssues: data.hasDrainageIssues ?? false,
        hasSecuritySystem: data.hasSecuritySystem ?? false,
        hasFireExtinguisher: data.hasFireExtinguisher ?? false,
        hasIrrigation: data.hasIrrigation ?? false,
        
        // FIX: Send the structured array under the correct backend key: homeAssets
        homeAssets: data.appliances?.map(app => ({
            // CRITICAL FIX: Ensure the database ID is passed for existing records
            id: app.id, 
            type: app.type, 
            installYear: app.installYear,
        })) || [], 
      };

      // Send the payload with the correct key and structure
      return api.updateProperty(propertyId, payload);
    },
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
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

  if (isLoadingProperty) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  if (!property) {
    return (
      <DashboardShell>
        <PageHeader>
          <PageHeaderHeading>Property Not Found</PageHeaderHeading>
          <Card className="mt-4"><CardContent className="py-6">The property you are looking for does not exist or you do not have permission to view it.</CardContent></Card>
        </PageHeader>
      </DashboardShell>
    );
  }

  const hasErrors = Object.keys(form.formState.errors).length > 0;
  const [
    watchName,
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchPropertyType,
    watchPropertySize,
    watchYearBuilt,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchHvacInstallYear,
    watchWaterHeaterInstallYear,
    watchRoofReplacementYear,
    watchBedrooms,
    watchBathrooms,
    watchOccupantsCount,
    watchOwnershipType,
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
    "propertyType",
    "propertySize",
    "yearBuilt",
    "heatingType",
    "coolingType",
    "waterHeaterType",
    "roofType",
    "hvacInstallYear",
    "waterHeaterInstallYear",
    "roofReplacementYear",
    "bedrooms",
    "bathrooms",
    "occupantsCount",
    "ownershipType",
    "hasSmokeDetectors",
    "hasCoDetectors",
    "hasDrainageIssues",
    "hasSecuritySystem",
    "hasFireExtinguisher",
    "hasIrrigation",
    "appliances",
  ]);
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
        propertyType: watchPropertyType,
        propertySize: watchPropertySize,
        yearBuilt: watchYearBuilt,
        heatingType: watchHeatingType,
        coolingType: watchCoolingType,
        waterHeaterType: watchWaterHeaterType,
        roofType: watchRoofType,
        hvacInstallYear: watchHvacInstallYear,
        waterHeaterInstallYear: watchWaterHeaterInstallYear,
        roofReplacementYear: watchRoofReplacementYear,
        bedrooms: watchBedrooms,
        bathrooms: watchBathrooms,
        occupantsCount: watchOccupantsCount,
        ownershipType: watchOwnershipType,
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
    watchPropertyType,
    watchPropertySize,
    watchYearBuilt,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchHvacInstallYear,
    watchWaterHeaterInstallYear,
    watchRoofReplacementYear,
    watchBedrooms,
    watchBathrooms,
    watchOccupantsCount,
    watchOwnershipType,
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
  const startSectionId = startField?.sectionId ?? null;
  const applianceCount = Array.isArray(watchAppliances) ? watchAppliances.length : 0;
  const [appliancesExpanded, setAppliancesExpanded] = React.useState(false);

  React.useEffect(() => {
    if (startSectionId === "appliances") {
      setAppliancesExpanded(true);
    }
  }, [startSectionId]);

  const isRecommended = (fieldKey: string) => recommendedFieldKeys.has(fieldKey);
  const CHECKBOX_META = {
    hasSmokeDetectors: { label: "Smoke Detectors", hint: "Quick checks that help protect your home.", impact: "positive" as const },
    hasCoDetectors: { label: "CO Detectors", hint: "Quick checks that help protect your home.", impact: "positive" as const },
    hasDrainageIssues: { label: "Drainage Issues", hint: "Tell us if this needs attention.", impact: "negative" as const },
    hasSecuritySystem: { label: "Security System", hint: "Quick checks that help protect your home.", impact: "positive" as const },
    hasFireExtinguisher: { label: "Fire Extinguisher", hint: "Quick checks that help protect your home.", impact: "positive" as const },
    hasIrrigation: { label: "Irrigation System", hint: "Optional outdoor detail.", impact: "neutral" as const },
  } as const;

  type CheckboxField = keyof typeof CHECKBOX_META;

  const CHECKBOX_IMPACT_STYLES = {
    positive: {
      checked: "border-emerald-500/20 bg-emerald-500/10 dark:border-emerald-400/20 dark:bg-emerald-400/10",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-emerald-400",
      hint: "text-gray-500 dark:text-slate-400",
    },
    negative: {
      checked: "border-amber-500/20 bg-amber-500/10 dark:border-amber-400/20 dark:bg-amber-400/10",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-amber-400",
      hint: "text-gray-500 dark:text-slate-400",
    },
    neutral: {
      checked: "border-slate-500/20 bg-slate-500/10 dark:border-slate-400/20 dark:bg-slate-400/10",
      unchecked: "border-black/5 bg-white dark:border-white/10 dark:bg-slate-900/30",
      dot: "bg-blue-400",
      hint: "text-gray-500 dark:text-slate-400",
    },
  } as const;

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white/95 px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
          <div className="flex items-center gap-2 min-w-0">
            <HomeIcon className="h-5 w-5 text-primary shrink-0" />
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-slate-100">
              {property?.name || property?.address || "Property"}
            </h1>
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

        <OnboardingReturnBanner />
        <div className="mb-4">
        <PropertyEditHeaderNudge
          completionCount={priorityState.completionCount}
          completionTotal={priorityState.completionTotal}
          completionPct={priorityState.completionPct}
          nextBestStepText={nextBestStepText}
          className="py-3"
        />
        </div>
      
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24 md:pb-8">
            <PropertyEditSection
              id="basics"
              title="Basics"
              helperText="Keeps your home organized and tips matched to your area."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={true}
              forceExpandOnMobile={startSectionId === "basics"}
              headerChip={startSectionId === "basics" ? <FieldNudgeChip variant="start" /> : undefined}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-6">
                      <FormLabel>Home nickname</FormLabel>
                      <FormControl><Input id="field-name" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="Main Home" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-6">
                      <FormLabel>Street address</FormLabel>
                      <FormControl><Input id="field-address" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="123 Main St" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-7">
                      <FormLabel>City</FormLabel>
                      <FormControl><Input id="field-city" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="Princeton" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="lg:col-span-5 flex flex-col gap-3 sm:flex-row sm:items-end lg:justify-end">
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem className={fieldSizeClass("xs")}>
                        <FormLabel>State</FormLabel>
                        <FormControl><Input id="field-state" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="NJ" {...field} maxLength={2} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem className={fieldSizeClass("sm")}>
                        <FormLabel>Zip</FormLabel>
                        <FormControl><Input id="field-zipCode" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="08540" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="isPrimary"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-12 flex items-center justify-between rounded-md border border-black/5 bg-gray-50/40 px-3 py-2 dark:border-white/10 dark:bg-slate-900/30">
                      <div>
                        <FormLabel>Set as main home</FormLabel>
                        <CardDescription className="text-[11px] text-gray-500 dark:text-slate-400">You can change this anytime.</CardDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </PropertyEditSection>

            <PropertyEditSection
              id="systems"
              title="Critical systems"
              helperText="Helps plan maintenance and avoid surprises."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "systems"}
              headerChip={startSectionId === "systems" ? <FieldNudgeChip variant="start" /> : undefined}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="propertyType"
                    render={({ field }) => (
                      <FormItem className={fieldSizeClass("md")}>
                        <div className="flex items-center gap-2">
                          <FormLabel>Property type</FormLabel>
                          {isRecommended("propertyType") ? <FieldNudgeChip variant="recommended" /> : null}
                        </div>
                        <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger id="field-propertyType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(PropertyTypes).map((type) => (
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
                    name="propertySize"
                    render={({ field }) => (
                      <FormItem className={fieldSizeClass("sm")}>
                        <div className="flex items-center gap-2">
                          <FormLabel>Approx size (sq ft)</FormLabel>
                          {isRecommended("propertySize") ? <FieldNudgeChip variant="recommended" /> : null}
                        </div>
                        <FormControl>
                          <Input id="field-propertySize" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 2500" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearBuilt"
                    render={({ field }) => (
                      <FormItem className={fieldSizeClass("xs")}>
                        <div className="flex items-center gap-2">
                          <FormLabel>Year built</FormLabel>
                          {isRecommended("yearBuilt") ? <FieldNudgeChip variant="recommended" /> : null}
                        </div>
                        <FormControl>
                          <Input id="field-yearBuilt" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="e.g., 1995" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-black/5 pt-4 md:grid-cols-2 xl:grid-cols-3 dark:border-white/10">
                  <div className="space-y-3 rounded-md border border-black/5 bg-gray-50/50 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/30">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">HVAC</p>
                    <FormField
                      control={form.control}
                      name="heatingType"
                      render={({ field }) => (
                        <FormItem className={fieldSizeClass("md")}>
                          <FormLabel>Heating type</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-heatingType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        <FormItem className={fieldSizeClass("md")}>
                          <FormLabel>Cooling type</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-coolingType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        <FormItem className={fieldSizeClass("xs")}>
                          <div className="flex items-center gap-2">
                            <FormLabel>Install year</FormLabel>
                            {isRecommended("hvacInstallYear") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <FormControl>
                            <Input id="field-hvacInstallYear" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2018" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                          </FormControl>
                          {(() => {
                            const fb = getInstallYearFeedback(field.value);
                            if (!fb) return null;
                            const colorMap = {
                              emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                              amber: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
                              rose: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
                            };
                            return <span className={cn("mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none", colorMap[fb.color!])}>{fb.label}</span>;
                          })()}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-3 rounded-md border border-black/5 bg-gray-50/50 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/30">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Water heater</p>
                    <FormField
                      control={form.control}
                      name="waterHeaterType"
                      render={({ field }) => (
                        <FormItem className={fieldSizeClass("md")}>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-waterHeaterType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        <FormItem className={fieldSizeClass("xs")}>
                          <div className="flex items-center gap-2">
                            <FormLabel>Install year</FormLabel>
                            {isRecommended("waterHeaterInstallYear") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <FormControl>
                            <Input id="field-waterHeaterInstallYear" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2020" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                          </FormControl>
                          {(() => {
                            const fb = getInstallYearFeedback(field.value);
                            if (!fb) return null;
                            const colorMap = {
                              emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                              amber: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
                              rose: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
                            };
                            return <span className={cn("mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none", colorMap[fb.color!])}>{fb.label}</span>;
                          })()}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-3 rounded-md border border-black/5 bg-gray-50/50 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/30">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Roof</p>
                    <FormField
                      control={form.control}
                      name="roofType"
                      render={({ field }) => (
                        <FormItem className={fieldSizeClass("md")}>
                          <FormLabel>Roof type</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger id="field-roofType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        <FormItem className={fieldSizeClass("xs")}>
                          <div className="flex items-center gap-2">
                            <FormLabel>Replacement year</FormLabel>
                            {isRecommended("roofReplacementYear") ? <FieldNudgeChip variant="recommended" /> : null}
                          </div>
                          <FormControl>
                            <Input id="field-roofReplacementYear" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2010" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                          </FormControl>
                          {(() => {
                            const fb = getInstallYearFeedback(field.value);
                            if (!fb) return null;
                            const colorMap = {
                              emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
                              amber: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
                              rose: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
                            };
                            return <span className={cn("mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none", colorMap[fb.color!])}>{fb.label}</span>;
                          })()}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
              forceExpandOnMobile={startSectionId === "safety"}
              headerChip={startSectionId === "safety" ? <FieldNudgeChip variant="start" /> : undefined}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(Object.keys(CHECKBOX_META) as CheckboxField[]).map((fieldName) => {
                  const meta = CHECKBOX_META[fieldName];
                  const styles = CHECKBOX_IMPACT_STYLES[meta.impact];
                  return (
                    <FormField
                      key={fieldName}
                      control={form.control}
                      name={fieldName}
                      render={({ field }) => {
                        const isChecked = Boolean(field.value);
                        return (
                          <FormItem>
                            <FormControl>
                              <label
                                htmlFor={`checkbox-${fieldName}`}
                                className={cn(
                                  "flex items-center justify-between gap-3 rounded-md border p-3.5 transition-colors hover:border-black/10 dark:hover:border-white/20",
                                  isChecked ? styles.checked : styles.unchecked,
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{meta.label}</p>
                                  <p className="text-xs text-gray-500 dark:text-slate-400">{meta.hint}</p>
                                </div>
                                <Checkbox id={`checkbox-${fieldName}`} checked={isChecked} onCheckedChange={field.onChange} className="h-4 w-4 border-black/20 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 dark:border-white/20" />
                              </label>
                            </FormControl>
                          </FormItem>
                        );
                      }}
                    />
                  );
                })}
              </div>
            </PropertyEditSection>

            <PropertyEditSection
              id="occupancy"
              title="Occupancy"
              helperText="Helps personalize your home plan."
              defaultExpandedDesktop={true}
              defaultExpandedMobile={false}
              forceExpandOnMobile={startSectionId === "occupancy"}
              headerChip={startSectionId === "occupancy" ? <FieldNudgeChip variant="start" /> : undefined}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bedrooms"
                  render={({ field }) => (
                    <FormItem className={fieldSizeClass("sm")}>
                      <FormLabel>Bedrooms</FormLabel>
                      <FormControl><Input id="field-bedrooms" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="3" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bathrooms"
                  render={({ field }) => (
                    <FormItem className={fieldSizeClass("sm")}>
                      <FormLabel>Bathrooms</FormLabel>
                      <FormControl><Input id="field-bathrooms" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="2.5" type="number" step="0.5" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="occupantsCount"
                  render={({ field }) => (
                    <FormItem className={fieldSizeClass("sm")}>
                      <FormLabel>People in home</FormLabel>
                      <FormControl><Input id="field-occupantsCount" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40" placeholder="4" type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ownershipType"
                  render={({ field }) => (
                    <FormItem className={fieldSizeClass("md")}>
                      <FormLabel>How you use this property</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger id="field-ownershipType" className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(OwnershipTypes).map((type) => (
                            <SelectItem key={type} value={type}>{formatEnumLabel(type)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <div className="rounded-md border border-dashed border-black/10 bg-gray-50/40 p-3 dark:border-white/10 dark:bg-slate-900/30">
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
                      {appliancesExpanded ? "Collapse" : "Expand"}
                      <ChevronDown className={cn("ml-1.5 h-4 w-4 transition-transform", appliancesExpanded && "rotate-180")} />
                    </Button>
                  </div>
                </div>
                {appliancesExpanded ? <ApplianceBentoGrid /> : null}
              </div>
            </PropertyEditSection>

            <div className="hidden md:flex items-center justify-between rounded-lg border border-black/10 bg-white/90 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-gray-600 dark:text-slate-400">Takes a second. You can edit anytime.</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={updateMutation.isPending} className="h-10 border-black/10 text-gray-700 hover:bg-black/[0.02] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.03]">
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
              onSave={form.handleSubmit(onSubmit)}
              onCancel={() => router.back()}
            />
          </form>
        </Form>
      </div>
    </DashboardShell>
  );
}
