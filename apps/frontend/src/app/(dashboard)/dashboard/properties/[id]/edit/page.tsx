// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Loader2, Save, X, Home as HomeIcon, AlertCircle, Trash2, Plus, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import OnboardingReturnBanner from "@/components/onboarding/OnboardingReturnBanner";
import { cn } from "@/lib/utils";
import { humanizeLabel } from "@/lib/utils/string";


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
  variant: "good" | "warning" | "critical";
  actionHint?: string;
  actionUrl?: string;
} | null {
  if (!year || year < 1900 || year > CURRENT_YEAR) return null;
  const age = CURRENT_YEAR - year;
  if (age === 0) return null;
  if (age <= 8) {
    return { label: `${age} yrs · Good condition`, color: "emerald", age, variant: "good" };
  }
  if (age <= 15) {
    return {
      label: `${age} yrs · Monitor closely`,
      color: "amber",
      age,
      variant: "warning",
      actionHint: "Consider scheduling an inspection soon.",
      actionUrl: "/services/inspection",
    };
  }
  return {
    label: `${age} yrs · Approaching replacement`,
    color: "rose",
    age,
    variant: "critical",
    actionHint: "Find a local specialist before this becomes urgent →",
    actionUrl: "/services/[category]",
  };
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

const applianceBentoContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const applianceBentoItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" as const },
  },
};

// --- Appliance Bento Grid Component ---
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
    <div className="space-y-4">
      <motion.div
        className="appliance-grid grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-2"
        variants={applianceBentoContainer}
        initial="hidden"
        animate="show"
      >
        {fields.map((field, index) => (
          <motion.div
            key={field.id}
            variants={applianceBentoItem}
            whileHover={{ scale: 1.02 }}
            className="appliance-card-compact relative flex flex-col gap-2 rounded-[10px] border border-white/70 bg-white/70 p-3 shadow-xl shadow-slate-900/5 backdrop-blur-md before:pointer-events-none before:absolute before:inset-0 before:rounded-[10px] before:ring-1 before:ring-inset before:ring-white/60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:before:ring-slate-500/20"
          >
            <div className="appliance-card-row-1 flex items-start gap-2">
              <FormField
                control={control}
                name={`appliances.${index}.type`}
                render={({ field: selectField }) => (
                  <FormItem className="appliance-type-select w-full space-y-1">
                    <FormLabel className="text-xs">Appliance</FormLabel>
                    <Select onValueChange={selectField.onChange} value={selectField.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select appliance">
                            {selectField.value ? formatApplianceLabel(selectField.value) : "Select appliance"}
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="appliance-delete-btn mt-5 h-8 w-8 shrink-0 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                aria-label="Remove appliance"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="appliance-card-row-2 flex items-end justify-between gap-3">
              <FormField
                control={control}
                name={`appliances.${index}.installYear`}
                render={({ field: yearField }) => (
                  <FormItem className="year-input-group w-full max-w-[10rem] space-y-1">
                    <FormLabel className="text-xs">Year installed</FormLabel>
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
                        className="h-8 text-sm"
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

              <div className="appliance-status-badge flex min-h-10 flex-1 flex-col items-start justify-end">
                {(() => {
                  const yearVal = watch(`appliances.${index}.installYear`);
                  const feedback = getInstallYearFeedback(Number(yearVal));
                  if (!feedback) return null;
                  return (
                    <>
                      <span
                        role="status"
                        aria-live="polite"
                        className={cn(
                          "status-badge visible inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full w-fit",
                          feedback.color === "emerald" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          feedback.color === "amber" && "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                          feedback.color === "rose" && "bg-rose-50 text-rose-700 font-semibold dark:bg-rose-900/30 dark:text-rose-400",
                          feedback.age > 20 && "animate-pulse",
                        )}
                      >
                        {feedback.label}
                      </span>
                      {feedback.variant !== "good" && feedback.actionHint && (
                        <a href={feedback.actionUrl} className="badge-action-hint">
                          {feedback.actionHint}
                        </a>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ type: "", installYear: CURRENT_YEAR })}
        className="w-full mt-2 border-dashed border-teal-300/80 bg-white/70 text-teal-700 hover:text-teal-900 hover:bg-teal-50/80 dark:border-teal-700/60 dark:bg-slate-900/40 dark:text-teal-300 dark:hover:text-teal-200"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Appliance
      </Button>

      <p className="text-xs text-gray-500 mt-2">
        Tracking your appliances helps us remind you when replacements are coming up.
      </p>
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
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

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
        setSaveState("saved");
        queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        toast({
          title: "Property Updated",
          description: "Your property details have been updated successfully.",
        });
        router.push(contextualReturnTo ?? `/dashboard/properties/${propertyId}`);
      } else {
        setSaveState("error");
        toast({
          title: "Update Failed",
          description: response.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setSaveState("error");
      console.error(error);
      toast({
        title: "Update Error",
        description: "Could not connect to the server or process the request.",
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
    
    setSaveState("saving");
    updateMutation.mutate(data);
  };

  React.useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [saveState]);

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
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchPropertyType,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchYearBuilt,
    watchBedrooms,
    watchBathrooms,
    watchOccupantsCount,
    watchOwnershipType,
    watchAppliances,
    watchSmoke,
    watchCo,
    watchDrainage,
    watchSecurity,
    watchFire,
    watchIrrigation,
  ] = form.watch([
    "address",
    "city",
    "state",
    "zipCode",
    "propertyType",
    "heatingType",
    "coolingType",
    "waterHeaterType",
    "roofType",
    "yearBuilt",
    "bedrooms",
    "bathrooms",
    "occupantsCount",
    "ownershipType",
    "appliances",
    "hasSmokeDetectors",
    "hasCoDetectors",
    "hasDrainageIssues",
    "hasSecuritySystem",
    "hasFireExtinguisher",
    "hasIrrigation",
  ]);
  const confidenceScore = React.useMemo(() => {
    const required = [watchAddress, watchCity, watchState, watchZipCode, watchPropertyType, watchHeatingType, watchCoolingType, watchWaterHeaterType, watchRoofType];
    const optional = [watchYearBuilt, watchBedrooms, watchBathrooms, watchOccupantsCount, watchOwnershipType];
    const requiredFilled = required.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;
    const optionalFilled = optional.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;
    const applianceCount = Array.isArray(watchAppliances) ? watchAppliances.length : 0;
    const safetyCount = [watchSmoke, watchCo, watchDrainage, watchSecurity, watchFire, watchIrrigation].filter(Boolean).length;
    const score = (requiredFilled / required.length) * 70 + (optionalFilled / optional.length) * 20 + Math.min(5, applianceCount * 1.5) + Math.min(5, safetyCount);
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchPropertyType,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchYearBuilt,
    watchBedrooms,
    watchBathrooms,
    watchOccupantsCount,
    watchOwnershipType,
    watchAppliances,
    watchSmoke,
    watchCo,
    watchDrainage,
    watchSecurity,
    watchFire,
    watchIrrigation,
  ]);
  const totalSections = 5;
  const completedSections = React.useMemo(() => {
    const propertyBasicsComplete = [watchAddress, watchCity, watchState, watchZipCode]
      .every((value) => value !== null && value !== undefined && String(value).trim() !== "");
    const homeSystemsComplete = [watchPropertyType, watchHeatingType, watchCoolingType, watchWaterHeaterType, watchRoofType]
      .every((value) => value !== null && value !== undefined && String(value).trim() !== "");
    const aboutHomeComplete = [watchBedrooms, watchBathrooms, watchOccupantsCount, watchOwnershipType]
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length >= 2;
    const appliancesComplete = Array.isArray(watchAppliances) && watchAppliances.some((app) => app?.type && app?.installYear);
    const safetyComplete = [watchSmoke, watchCo, watchDrainage, watchSecurity, watchFire, watchIrrigation].some(Boolean);
    return [propertyBasicsComplete, homeSystemsComplete, aboutHomeComplete, appliancesComplete, safetyComplete].filter(Boolean).length;
  }, [
    watchAddress,
    watchCity,
    watchState,
    watchZipCode,
    watchPropertyType,
    watchHeatingType,
    watchCoolingType,
    watchWaterHeaterType,
    watchRoofType,
    watchBedrooms,
    watchBathrooms,
    watchOccupantsCount,
    watchOwnershipType,
    watchAppliances,
    watchSmoke,
    watchCo,
    watchDrainage,
    watchSecurity,
    watchFire,
    watchIrrigation,
  ]);
  const CHECKBOX_META = {
    hasSmokeDetectors: { label: "Smoke Detectors", hint: "Helps protect your household and may lower your insurance rate." },
    hasCoDetectors: { label: "CO Detectors", hint: "Helps protect your household and may lower your insurance rate." },
    hasDrainageIssues: { label: "Drainage Issues", hint: "Let us help you find a drainage specialist before it worsens." },
    hasSecuritySystem: { label: "Security System", hint: "Adds an important layer of protection for your home." },
    hasFireExtinguisher: { label: "Fire Extinguisher", hint: "A simple step that can make a real difference in an emergency." },
    hasIrrigation: { label: "Irrigation System", hint: "Helps us include lawn and garden services in your maintenance plan." },
  } as const;

  type CheckboxField = keyof typeof CHECKBOX_META;

  return (
    <DashboardShell>
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-gray-100 dark:border-slate-800 py-3 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <HomeIcon className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 truncate">
                Edit Property: {property?.name || property?.address || "Property"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep your details accurate to get personalized maintenance reminders and better service matches.
            </p>
            <div className="completion-progress mt-3 mb-1">
              <div className="completion-header flex items-center justify-between text-[13px] text-muted-foreground mb-1.5">
                <span>Property profile</span>
                <span className="completion-count font-semibold text-teal-700 dark:text-teal-300">
                  {completedSections} of {totalSections} sections complete
                </span>
              </div>
              <div
                className="progress-track h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
                role="progressbar"
                aria-valuenow={confidenceScore}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="progress-fill h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${confidenceScore}%` }}
                />
              </div>
            </div>
          </div>
          <motion.div
            className="hidden xl:flex items-center gap-1.5 rounded-full border border-teal-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-teal-700 shadow-sm"
            title={`Your property profile is ${confidenceScore}% complete. More complete profiles get more accurate maintenance estimates and better service matches.`}
            animate={
              updateMutation.isPending
                ? { scale: [1, 1.04, 1], opacity: [0.75, 1, 0.75] }
                : { scale: 1, opacity: 1 }
            }
            transition={
              updateMutation.isPending
                ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {updateMutation.isPending ? "Confidence recalculating..." : `Confidence ${confidenceScore}%`}
          </motion.div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(contextualReturnTo ?? `/dashboard/properties/${propertyId}`)}
              disabled={updateMutation.isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              {searchParams.get("from") === "status-board" ? "Back" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateMutation.isPending}
              type="submit"
            >
              {saveState === "saving" && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {saveState === "saved" && <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              {saveState === "error" && <AlertTriangle className="h-4 w-4 mr-1.5" />}
              {saveState === "idle" && <Save className="h-4 w-4 mr-1.5" />}
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved!" : saveState === "error" ? "Try Again" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <OnboardingReturnBanner />
      <div
        role="note"
        className="motivation-banner mb-6 flex items-start gap-3 rounded-[10px] border border-teal-100 bg-teal-50 px-4 py-3.5 text-sm leading-relaxed text-gray-800 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-slate-200"
      >
        <span className="motivation-icon text-xl leading-none shrink-0">🏡</span>
        <p>
          <strong>Takes about 5 minutes.</strong>{" "}
          Keeping your property details up to date helps us predict maintenance before it becomes expensive and match you with the right providers when you need them.
        </p>
      </div>
      
       {hasErrors && (
         <div className="mb-4 p-4 border border-red-300 bg-red-50 rounded-md">
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card className="section-card section-card-delay-1 border-l-4 border-l-teal-400/70 bg-white/70 backdrop-blur-md shadow-xl shadow-slate-900/5 dark:border-l-teal-600/50 dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle>Your Property</CardTitle>
                    <CardDescription>Basic info about your home — helps us find local providers in your area.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Give this property a nickname</FormLabel>
                                    <FormControl><Input placeholder="Main Home" {...field} value={field.value || ''} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Street Address</FormLabel>
                                    <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>City</FormLabel>
                                    <FormControl><Input placeholder="Princeton" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>State</FormLabel>
                                    <FormControl><Input placeholder="NJ" {...field} maxLength={2} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="zipCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zip Code</FormLabel>
                                    <FormControl><Input placeholder="08540" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isPrimary"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox 
                                            checked={field.value ?? false}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Set as my main home</FormLabel>
                                        <CardDescription>Your main home gets prioritized in reminders and recommendations.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="section-card section-card-delay-2 border-l-4 border-l-blue-400/70 bg-white/70 backdrop-blur-md shadow-xl shadow-slate-900/5 dark:border-l-blue-600/50 dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle>Home Systems</CardTitle>
                    <CardDescription>Tell us about your home&apos;s key systems. We use this to build your maintenance timeline and flag anything that needs attention.</CardDescription>
                    <p className="text-[13px] italic text-teal-700 dark:text-teal-300 -mt-1">
                      Complete this section to unlock your personalized maintenance timeline.
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name="propertyType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>What type of property is this?</FormLabel>
                                    <Select
                                        onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                        value={field.value || ""}
                                    >
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                                <FormItem>
                                    <FormLabel>Approximate size (sq ft)</FormLabel>
                                    <FormControl><Input placeholder="e.g., 2500" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="yearBuilt"
                            render={({ field }) => (
                                <FormItem className="max-w-[160px]">
                                    <FormLabel>Year the home was built</FormLabel>
                                    <FormControl><Input placeholder="e.g., 1995" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                            Heating & Cooling
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="heatingType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>How is your home heated?</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                            value={field.value || ""}
                                        >
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                                name="hvacInstallYear"
                                render={({ field }) => (
                                    <FormItem className="w-full sm:w-36 flex-none">
                                        <FormLabel>When was it installed?</FormLabel>
                                        <FormControl><Input placeholder="e.g., 2018" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full" /></FormControl>
                                        {(() => {
                                          const fb = getInstallYearFeedback(field.value);
                                          if (!fb) return null;
                                          const colorMap = {
                                            emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50",
                                            amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50",
                                            rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50",
                                          };
                                          return (
                                            <>
                                              <span className={cn(
                                                "status-badge visible inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                                colorMap[fb.color!],
                                                fb.age > 20 && "animate-pulse",
                                              )} role="status" aria-live="polite">
                                                {fb.label}
                                              </span>
                                              {fb.variant !== "good" && fb.actionHint && (
                                                <a href={fb.actionUrl} className="badge-action-hint">
                                                  {fb.actionHint}
                                                </a>
                                              )}
                                            </>
                                          );
                                        })()}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="coolingType"
                                render={({ field }) => (
                                    <FormItem className="w-full sm:max-w-xs">
                                        <FormLabel>How is your home cooled?</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                            value={field.value || ""}
                                        >
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                            Hot Water
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="waterHeaterType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>What kind of water heater do you have?</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                            value={field.value || ""}
                                        >
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                                    <FormItem className="w-full sm:w-36 flex-none">
                                        <FormLabel>When was it installed?</FormLabel>
                                        <FormControl><Input placeholder="e.g., 2020" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full" /></FormControl>
                                        {(() => {
                                          const fb = getInstallYearFeedback(field.value);
                                          if (!fb) return null;
                                          const colorMap = {
                                            emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50",
                                            amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50",
                                            rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50",
                                          };
                                          return (
                                            <>
                                              <span className={cn(
                                                "status-badge visible inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                                colorMap[fb.color!],
                                                fb.age > 20 && "animate-pulse",
                                              )} role="status" aria-live="polite">
                                                {fb.label}
                                              </span>
                                              {fb.variant !== "good" && fb.actionHint && (
                                                <a href={fb.actionUrl} className="badge-action-hint">
                                                  {fb.actionHint}
                                                </a>
                                              )}
                                            </>
                                          );
                                        })()}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                            Roof
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="roofType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>What type of roof do you have?</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                            value={field.value || ""}
                                        >
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                                    <FormItem className="w-full sm:w-36 flex-none">
                                        <FormLabel>When was it last replaced?</FormLabel>
                                        <FormControl><Input placeholder="e.g., 2010" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full" /></FormControl>
                                        {(() => {
                                          const fb = getInstallYearFeedback(field.value);
                                          if (!fb) return null;
                                          const colorMap = {
                                            emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50",
                                            amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50",
                                            rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50",
                                          };
                                          return (
                                            <>
                                              <span className={cn(
                                                "status-badge visible inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                                colorMap[fb.color!],
                                                fb.age > 20 && "animate-pulse",
                                              )} role="status" aria-live="polite">
                                                {fb.label}
                                              </span>
                                              {fb.variant !== "good" && fb.actionHint && (
                                                <a href={fb.actionUrl} className="badge-action-hint">
                                                  {fb.actionHint}
                                                </a>
                                              )}
                                            </>
                                          );
                                        })()}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                            About Your Home
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="bedrooms"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Bedrooms</FormLabel>
                                        <FormControl><Input placeholder="e.g., 3" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
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
                                        <FormControl><Input placeholder="e.g., 2.5" type="number" step="0.5" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="occupantsCount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>How many people live here?</FormLabel>
                                        <FormControl><Input placeholder="e.g., 4" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="ownershipType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>How do you use this property?</FormLabel>
                                        <Select
                                            onValueChange={(value) => field.onChange(value === "" ? null : value)}
                                            value={field.value || ""}
                                        >
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                    </div>

                </CardContent>
            </Card>

            <Card className="section-card section-card-delay-3 border-l-4 border-l-teal-400/70 bg-white/70 backdrop-blur-md shadow-xl shadow-slate-900/5 dark:border-l-teal-600/50 dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle>Your Appliances</CardTitle>
                    <CardDescription>Add your major appliances so we can track their age and remind you when service or replacement is coming up.</CardDescription>
                    <p className="text-[13px] italic text-teal-700 dark:text-teal-300 -mt-1">
                      We&apos;ll track each appliance&apos;s age and let you know when service or replacement is approaching.
                    </p>
                </CardHeader>
                <CardContent>
                    <ApplianceBentoGrid />
                </CardContent>
            </Card>

            <Card className="section-card section-card-delay-4 border-l-4 border-l-teal-400/70 bg-white/70 backdrop-blur-md shadow-xl shadow-slate-900/5 dark:border-l-teal-600/50 dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle>Safety Features</CardTitle>
                    <CardDescription>Tell us which safety protections your home already has in place.</CardDescription>
                    <p className="text-[13px] italic text-teal-700 dark:text-teal-300 -mt-1">
                      Safety features you&apos;ve added can improve your home&apos;s overall risk profile.
                    </p>
                </CardHeader>
                <CardContent>
                  <div className="safety-features-grid grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(Object.keys(CHECKBOX_META) as CheckboxField[]).map((fieldName) => {
                      const meta = CHECKBOX_META[fieldName];

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
                                    role="checkbox"
                                    aria-checked={isChecked}
                                    className={cn(
                                      "safety-card flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all",
                                      isChecked
                                        ? "active border-[1.5px] border-teal-300 bg-teal-50 dark:border-teal-700/60 dark:bg-teal-950/30"
                                        : "inactive border-[1.5px] border-gray-200 bg-gray-50 opacity-75 dark:border-slate-700 dark:bg-slate-900/30",
                                      "hover:border-gray-300 dark:hover:border-slate-600"
                                    )}
                                  >
                                    {isChecked && (
                                      <span className="safety-card-dot mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-500 shadow-[0_0_0_3px_rgba(153,246,228,0.8)] dark:shadow-[0_0_0_3px_rgba(20,184,166,0.2)]" />
                                    )}
                                    {!isChecked && (
                                      <span className="safety-card-dot mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-300 dark:bg-slate-600" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id={`checkbox-${fieldName}`}
                                          checked={isChecked}
                                          onCheckedChange={field.onChange}
                                          className="sr-only"
                                        />
                                        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
                                          {meta.label}
                                        </span>
                                      </div>
                                      <p className={cn("mt-0.5 text-xs", isChecked ? "text-teal-700 dark:text-teal-300" : "text-gray-500 dark:text-slate-500")}>
                                        {meta.hint}
                                      </p>
                                    </div>
                                  </label>
                                </FormControl>
                              </FormItem>
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                </CardContent>
            </Card>

            <div className="sticky-save-bar sticky bottom-0 z-50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 sm:py-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex items-center justify-between gap-3 min-h-16">
              <div className="save-bar-status">
                <span className="profile-pill inline-block rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[13px] font-semibold text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/30 dark:text-teal-300">
                  Profile {confidenceScore}% complete
                </span>
                <span className="save-bar-sub mt-1 block text-xs text-muted-foreground">
                  Better data = more accurate maintenance estimates
                </span>
              </div>
              <div className="save-bar-actions ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.back()}
                  disabled={updateMutation.isPending}
                  className="h-12 min-h-[44px] min-w-[44px] px-4"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateMutation.isPending}
                  className={cn(
                    "save-btn h-12 min-h-[48px] min-w-[140px]",
                    saveState === "saved" && "saved",
                  )}
                >
                  {saveState === "saving" ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : saveState === "saved" ? (
                    <>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Saved!
                    </>
                  ) : saveState === "error" ? (
                    <>
                      <AlertTriangle className="mr-1.5 h-4 w-4" />
                      Try Again
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
        </form>
      </Form>
      <style jsx>{`
        .badge-action-hint {
          display: block;
          font-size: 12px;
          color: var(--color-teal-600, #0d9488);
          text-decoration: none;
          margin-top: 4px;
          font-weight: 500;
        }

        .badge-action-hint:hover {
          text-decoration: underline;
        }

        .status-badge {
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .status-badge.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .section-card {
          opacity: 0;
          transform: translateY(12px);
          animation: cardEntry 0.35s ease forwards;
        }

        .section-card-delay-1 {
          animation-delay: 0.05s;
        }

        .section-card-delay-2 {
          animation-delay: 0.12s;
        }

        .section-card-delay-3 {
          animation-delay: 0.19s;
        }

        .section-card-delay-4 {
          animation-delay: 0.26s;
        }

        @keyframes cardEntry {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .motivation-banner {
            padding: 12px 14px;
            font-size: 13px;
          }

          .sticky-save-bar {
            padding: 12px 16px;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .save-bar-status {
            text-align: center;
          }

          .save-bar-actions {
            display: flex;
            gap: 8px;
          }

          .save-btn {
            flex: 1;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
