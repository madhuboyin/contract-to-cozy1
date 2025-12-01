// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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

// New Appliance Schema for array items
const applianceSchema = z.object({
  // Use a string ID for React key management (client-side only)
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

// Helper to convert DB data (JSON string/object) to structured form data 
const mapDbToForm = (property: any): PropertyFormValues => {
    // 1. Convert DB JSON (applianceAges: {TYPE: YEAR, ...}) to structured array
    let structuredAppliances: z.infer<typeof applianceSchema>[] = [];
    let applianceAges = property.applianceAges;
    
    // FIX START: Defensive parsing for JSON string retrieved from API/DB
    if (typeof applianceAges === 'string' && applianceAges.trim()) {
        try {
            applianceAges = JSON.parse(applianceAges);
        } catch (e) {
            console.error("Failed to parse applianceAges JSON string:", e);
            applianceAges = null; // Treat as invalid if parsing fails
        }
    }
    // FIX END

    if (applianceAges && typeof applianceAges === 'object') {
        // Ensure it's not an Array (though it shouldn't be based on schema)
        if (!Array.isArray(applianceAges)) {
            structuredAppliances = Object.entries(applianceAges).map(([type, year], index) => ({
                // Unique ID for internal React keying/tracking
                id: `app-${index}-${type}`, 
                type: type,
                installYear: year as number,
            }));
        }
    }

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
    // Must use useFormContext since the component is nested inside <Form>
    const { control, formState: { errors } } = useFormContext<PropertyFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "appliances",
    });

    return (
        <div className="border-t border-gray-200 pt-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-3">
                Major Appliance Details
            </h3>
            
            <div className="space-y-4">
                {fields.map((field, index) => (
                    <div key={field.id} className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-end bg-gray-50 p-3 rounded-md border border-gray-200">
                        
                        {/* Appliance Type Select */}
                        <FormField
                            control={control}
                            name={`appliances.${index}.type`}
                            render={({ field: selectField }) => (
                                <FormItem className="flex-1 w-full sm:w-auto">
                                    <FormLabel className="text-xs">Appliance Type</FormLabel>
                                    <Select 
                                        onValueChange={selectField.onChange} 
                                        value={selectField.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Select Appliance" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {MAJOR_APPLIANCE_OPTIONS.map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage>{(errors.appliances?.[index] as any)?.type?.message}</FormMessage>
                                </FormItem>
                            )}
                        />
                        
                        {/* Install Year Input */}
                        <FormField
                            control={control}
                            name={`appliances.${index}.installYear`}
                            render={({ field: yearField }) => (
                                <FormItem className="w-full sm:w-24">
                                    <FormLabel className="text-xs">Install Year</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="YYYY"
                                            type="number"
                                            maxLength={4}
                                            {...yearField}
                                            value={yearField.value ?? ''}
                                            onChange={e => yearField.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                                            className="h-9"
                                        />
                                    </FormControl>
                                    <FormMessage>{(errors.appliances?.[index] as any)?.installYear?.message}</FormMessage>
                                </FormItem>
                            )}
                        />

                        {/* Remove Button */}
                        <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => remove(index)}
                            className="h-9 w-9 self-end"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
            
            <Button
                type="button"
                variant="outline"
                onClick={() => append({ id: Date.now().toString(), type: '', installYear: null as any })}
                className="w-full px-4 py-2 border-dashed border-blue-400 text-blue-600 hover:bg-blue-50"
            >
                <Plus className="h-4 w-4 mr-2" /> Add Appliance
            </Button>
            
            <p className="text-xs text-gray-500 mt-2">
                Structured appliance data replaces the old JSON format.
            </p>
        </div>
    );
};


export default function EditPropertyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const hasResetForm = React.useRef(false);

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

  const updateMutation = useMutation({
    mutationFn: (data: PropertyFormValues) => {
      
      // FIXED: Convert structured array to backend's expected homeAssets format
      const homeAssetsPayload = data.appliances
        ?.filter(app => app.type && app.installYear)
        .map(app => ({
          type: app.type.toUpperCase(),
          installYear: app.installYear
        }));
      
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
        
        // FIXED: Send homeAssets array to backend
        homeAssets: homeAssetsPayload,
      };
      
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
        router.push(`/dashboard/properties/${propertyId}`);
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

  return (
    <DashboardShell>
      <PageHeader>
        <PageHeaderHeading className="flex items-center gap-2">
          <HomeIcon className="h-8 w-8 text-muted-foreground" /> Edit Property: {property.name || property.address}
        </PageHeaderHeading>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push(`/dashboard/properties/${propertyId}`)} disabled={updateMutation.isPending}>
            <X className="h-4 w-4 mr-2" /> Cancel
          </Button>
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={updateMutation.isPending}
            type="submit"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Save className="h-4 w-4 mr-2" /> Save Changes
          </Button>
        </div>
      </PageHeader>
      
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
            <Card>
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

            <Card>
                <CardHeader>
                    <CardTitle>Risk & System Details</CardTitle>
                    <CardDescription>These details are crucial for calculating your property's risk score and maintenance schedules.</CardDescription>
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
                                            {Object.values(PropertyTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
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
                    
                    <Separator className="my-4" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <FormField
                            control={form.control}
                            name="hvacInstallYear"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>HVAC Install Year</FormLabel>
                                    <FormControl><Input placeholder="e.g., 2018" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="waterHeaterInstallYear"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Water Heater Install Year</FormLabel>
                                    <FormControl><Input placeholder="e.g., 2020" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="roofReplacementYear"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Roof Replacement Year</FormLabel>
                                    <FormControl><Input placeholder="e.g., 2010" type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        {/* More Selects for Systems */}
                        <FormField
                            control={form.control}
                            name="heatingType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Heating Type *</FormLabel>
                                    <Select 
                                        onValueChange={(value) => field.onChange(value === "" ? null : value)} 
                                        value={field.value || ""}
                                    >
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(HeatingTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
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
                                            {Object.values(CoolingTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="roofType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Roof Type *</FormLabel>
                                    <Select 
                                        onValueChange={(value) => field.onChange(value === "" ? null : value)} 
                                        value={field.value || ""}
                                    >
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(RoofTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="waterHeaterType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Water Heater Type *</FormLabel>
                                    <Select 
                                        onValueChange={(value) => field.onChange(value === "" ? null : value)} 
                                        value={field.value || ""}
                                    >
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(WaterHeaterTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
                                    <FormControl><Input placeholder="e.g., 2.5" type="number" step="0.5" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
                                            {Object.values(OwnershipTypes).map(type => (
                                                <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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
                    
                    <Separator className="my-4" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name="hasSmokeDetectors"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has Smoke Detectors</FormLabel>
                                        <CardDescription>Crucial for the SAFETY risk score.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="hasCoDetectors"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has CO Detectors</FormLabel>
                                        <CardDescription>Crucial for the SAFETY risk score.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="hasDrainageIssues"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has Drainage Issues</FormLabel>
                                        <CardDescription>Can increase STRUCTURE risk penalty.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="hasSecuritySystem"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has Security System</FormLabel>
                                        <CardDescription>Extra safety factor.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="hasFireExtinguisher"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has Fire Extinguisher</FormLabel>
                                        <CardDescription>Safety checklist item.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="hasIrrigation"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md shadow-sm">
                                    <FormControl>
                                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Has Irrigation System</FormLabel>
                                        <CardDescription>For exterior maintenance.</CardDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    
                    <Separator className="my-4" />

                    {/* NEW: Structured Appliance Input */}
                    <ApplianceFieldArray />

                </CardContent>
            </Card>

            <Button type="submit" className="w-full md:w-auto" disabled={updateMutation.isPending || hasErrors}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Save className="h-4 w-4 mr-2" /> Save Changes and Recalculate Risk
            </Button>
        </form>
      </Form>
    </DashboardShell>
  );
}