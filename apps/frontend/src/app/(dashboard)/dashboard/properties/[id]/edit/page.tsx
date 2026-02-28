// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, X, Home as HomeIcon, AlertCircle, Trash2, Plus } from "lucide-react";

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
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
    value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getInstallYearFeedback(year: number | null | undefined): {
  label: string;
  color: "emerald" | "amber" | "rose" | null;
} | null {
  if (!year || year < 1900 || year > CURRENT_YEAR) return null;
  const age = CURRENT_YEAR - year;
  if (age === 0) return null;
  if (age <= 8) return { label: `${age} yrs · Good condition`, color: "emerald" };
  if (age <= 15) return { label: `${age} yrs · Monitor closely`, color: "amber" };
  return { label: `${age} yrs · Approaching replacement`, color: "rose" };
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

// --- Appliance Field Array Component ---
const ApplianceFieldArray = () => {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="relative flex flex-col gap-2 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Remove appliance"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            <FormField
              control={control}
              name={`appliances.${index}.type`}
              render={({ field: selectField }) => (
                <FormItem className="w-full">
                  <FormLabel className="text-xs">Appliance Type</FormLabel>
                  <Select onValueChange={selectField.onChange} value={selectField.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-sm">
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
                  <FormLabel className="text-xs">Install Year</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="YYYY"
                      type="number"
                      maxLength={4}
                      {...yearField}
                      value={yearField.value ?? ""}
                      onChange={(e) => yearField.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                      className="h-8 text-sm"
                    />
                  </FormControl>
                  <FormMessage>{(errors.appliances?.[index] as any)?.installYear?.message}</FormMessage>
                </FormItem>
              )}
            />

            {(() => {
              const yearVal = watch(`appliances.${index}.installYear`);
              const feedback = getInstallYearFeedback(Number(yearVal));
              if (!feedback) return null;
              return (
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full w-fit",
                    feedback.color === "emerald" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    feedback.color === "amber" && "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    feedback.color === "rose" && "bg-rose-50 text-rose-700 font-semibold dark:bg-rose-900/30 dark:text-rose-400",
                  )}
                >
                  {feedback.label}
                </span>
              );
            })()}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ type: "", installYear: CURRENT_YEAR })}
        className="w-full mt-2 border-dashed text-muted-foreground hover:text-foreground"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Appliance
      </Button>

      <p className="text-xs text-gray-500 mt-2">Structured appliance data replaces the old JSON format.</p>
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
          title: "Property Updated",
          description: "Your property details have been updated successfully.",
        });
        router.push(contextualReturnTo ?? `/dashboard/properties/${propertyId}`);
      } else {
        toast({
          title: "Update Failed",
          description: response.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
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
  const CHECKBOX_META = {
    hasSmokeDetectors: { label: "Has Smoke Detectors", hint: "Crucial for SAFETY risk score.", impact: "positive" as const },
    hasCoDetectors: { label: "Has CO Detectors", hint: "Crucial for SAFETY risk score.", impact: "positive" as const },
    hasDrainageIssues: { label: "Has Drainage Issues", hint: "Increases STRUCTURE risk penalty.", impact: "negative" as const },
    hasSecuritySystem: { label: "Has Security System", hint: "Extra safety factor.", impact: "positive" as const },
    hasFireExtinguisher: { label: "Has Fire Extinguisher", hint: "Safety checklist item.", impact: "positive" as const },
    hasIrrigation: { label: "Has Irrigation System", hint: "For exterior maintenance.", impact: "neutral" as const },
  } as const;

  type CheckboxField = keyof typeof CHECKBOX_META;

  const CHECKBOX_IMPACT_STYLES = {
    positive: {
      checked: "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/50 dark:bg-emerald-950/20",
      unchecked: "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/30",
      dot: "bg-emerald-400",
      hint: "text-emerald-600 dark:text-emerald-400",
    },
    negative: {
      checked: "border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/20",
      unchecked: "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/30",
      dot: "bg-amber-400",
      hint: "text-amber-600 dark:text-amber-400",
    },
    neutral: {
      checked: "border-blue-200 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/20",
      unchecked: "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/30",
      dot: "bg-blue-400",
      hint: "text-blue-600 dark:text-blue-400",
    },
  } as const;

  return (
    <DashboardShell>
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-gray-100 dark:border-slate-800 py-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <HomeIcon className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 truncate">
              Edit Property: {property?.name || property?.address || "Property"}
            </h1>
          </div>
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
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <OnboardingReturnBanner />
      
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
            <Card className="border-l-4 border-l-teal-400/70 dark:border-l-teal-600/50">
                <CardHeader>
                    <CardTitle>Basic Details</CardTitle>
                    <CardDescription>General information about the property.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Property Nickname</FormLabel>
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
                                        <FormLabel>Set as Primary Property</FormLabel>
                                        <CardDescription>Only one property can be set as primary.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-400/70 dark:border-l-blue-600/50">
                <CardHeader>
                    <CardTitle>Risk & System Details</CardTitle>
                    <CardDescription>These details are crucial for calculating your property&apos;s risk score and maintenance schedules.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name="propertyType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Property Type *</FormLabel>
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
                                <FormItem className="max-w-[160px]">
                                    <FormLabel>Square Footage (sqft)</FormLabel>
                                    <FormControl><Input placeholder="e.g., 2500" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="yearBuilt"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Year Built</FormLabel>
                                    <FormControl><Input placeholder="e.g., 1995" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            HVAC System
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="heatingType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>Heating Type *</FormLabel>
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
                                        <FormLabel>HVAC Install Year</FormLabel>
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
                                            <span className={cn(
                                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                              colorMap[fb.color!],
                                            )}>
                                              {fb.label}
                                            </span>
                                          );
                                        })()}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Cooling
                        </p>
                        <div className="max-w-sm">
                            <FormField
                                control={form.control}
                                name="coolingType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cooling Type *</FormLabel>
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
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Water Heater
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="waterHeaterType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>Water Heater Type *</FormLabel>
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
                                        <FormLabel>Water Heater Install Year</FormLabel>
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
                                            <span className={cn(
                                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                              colorMap[fb.color!],
                                            )}>
                                              {fb.label}
                                            </span>
                                          );
                                        })()}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Roof
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                            <FormField
                                control={form.control}
                                name="roofType"
                                render={({ field }) => (
                                    <FormItem className="flex-1 min-w-0 max-w-xs">
                                        <FormLabel>Roof Type *</FormLabel>
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
                                        <FormLabel>Roof Replacement Year</FormLabel>
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
                                            <span className={cn(
                                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mt-1",
                                              colorMap[fb.color!],
                                            )}>
                                              {fb.label}
                                            </span>
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
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Property & Occupancy
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                        <FormLabel>Occupants Count</FormLabel>
                                        <FormControl><Input placeholder="e.g., 4" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="ownershipType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Ownership Type</FormLabel>
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

                    <div className="pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">
                        Safety & Property Features
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all",
                                          isChecked ? styles.checked : styles.unchecked,
                                          "hover:border-gray-300 dark:hover:border-slate-600",
                                        )}
                                      >
                                        {isChecked && (
                                          <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", styles.dot)} />
                                        )}
                                        {!isChecked && (
                                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-200 dark:bg-slate-600" />
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
                                          <p className={cn("mt-0.5 text-xs", isChecked ? styles.hint : "text-gray-400 dark:text-slate-500")}>
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
                    </div>

                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-400/70 dark:border-l-purple-600/50">
                <CardHeader>
                    <CardTitle>Major Appliance Details</CardTitle>
                    <CardDescription>Add and maintain major appliance records for better maintenance planning.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplianceFieldArray />
                </CardContent>
            </Card>

            <div className="sticky bottom-0 z-20 -mx-6 px-6 py-3 bg-background/95 backdrop-blur-sm border-t border-border shadow-[0_-1px_6px_rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground hidden sm:block select-none">
                {updateMutation.isPending
                  ? "Saving your changes…"
                  : "Changes are saved to this property only"}
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.back()}
                  disabled={updateMutation.isPending}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateMutation.isPending}
                  className="min-w-[120px]"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving…
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
    </DashboardShell>
  );
}
