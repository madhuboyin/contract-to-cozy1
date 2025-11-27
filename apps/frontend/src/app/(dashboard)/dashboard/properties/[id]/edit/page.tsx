// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, X, Home as HomeIcon, AlertCircle } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";


// --- 1. Form Schema Definition (Required fields check for non-empty values) ---
const propertySchema = z.object({
  name: z.string().optional().nullable(),
  isPrimary: z.boolean(),
  address: z.string().min(1, { message: "Street Address is required." }),
  city: z.string().min(1, { message: "City is required." }),
  state: z.string().min(2, { message: "State is required." }),
  zipCode: z.string().min(5, { message: "Zip Code is required." }),
  
  // FIX: Treat empty string as null, then validate
  propertyType: z.union([z.nativeEnum(PropertyTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .refine(val => val !== null, { message: "Property Type is required." }),
  
  propertySize: z.coerce.number().int().positive().optional().nullable(),
  yearBuilt: z.coerce.number().int().min(1700).optional().nullable(),
  
  // Advanced Risk Fields
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().min(0).optional().nullable(),
  ownershipType: z.union([z.nativeEnum(OwnershipTypes), z.literal("")])
    .transform(val => val === "" ? null : val)
    .optional().nullable(),
  occupantsCount: z.coerce.number().int().min(0).optional().nullable(),

  // FIX: Required dropdown fields - treat empty string as null, then validate
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

  applianceAges: z.string().optional().nullable(), 
});

type PropertyFormValues = z.infer<typeof propertySchema>;

// Helper to convert DB data (which uses null) to form data 
const mapDbToForm = (property: any): PropertyFormValues => ({
  name: property.name || null, 
  isPrimary: property.isPrimary ?? false, 
  address: property.address,
  city: property.city,
  state: property.state,
  zipCode: property.zipCode,
  
  // FIX ISSUE 1 (FINAL): For Select components, use empty string instead of null
  // This keeps them controlled at all times and prevents React warnings
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

  applianceAges: property.applianceAges ? JSON.stringify(property.applianceAges) : null,
});


export default function EditPropertyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  // Track if we've reset the form to prevent multiple resets
  const hasResetForm = React.useRef(false);

  // 2. Fetch Existing Property Data
  // FIX: Always refetch on mount to ensure we have complete, fresh data
  const { data: property, isLoading: isLoadingProperty } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to fetch property.");
    },
    enabled: !!propertyId,
    staleTime: 0,  // Always consider data stale
    refetchOnMount: true,  // Always refetch when component mounts
    refetchOnWindowFocus: false,  // Don't refetch on window focus
  });

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as any,
    defaultValues: {
      // Set safe defaults to prevent uncontrolled components
      name: "",
      isPrimary: false,
      address: "",
      city: "",
      state: "",
      zipCode: "",
      propertyType: "" as any,
      propertySize: null,
      yearBuilt: null,
      bedrooms: null,
      bathrooms: null,
      ownershipType: "" as any,
      occupantsCount: null,
      heatingType: "" as any,
      coolingType: "" as any,
      waterHeaterType: "" as any,
      roofType: "" as any,
      hvacInstallYear: null,
      waterHeaterInstallYear: null,
      roofReplacementYear: null,
      hasDrainageIssues: false,
      hasSmokeDetectors: false,
      hasCoDetectors: false,
      hasSecuritySystem: false,
      hasFireExtinguisher: false,
      hasIrrigation: false,
      applianceAges: null,
    },
    mode: "onBlur",
  });

  // FIX RACE CONDITION: Reset form when property data loads
  // Use ref to ensure we only reset once when data first arrives
  React.useEffect(() => {
    if (property && !isLoadingProperty && !hasResetForm.current) {
      const formData = mapDbToForm(property);
      console.log("🔄 Resetting form with property data:", formData);
      console.log("📊 Property type value:", formData.propertyType);
      console.log("🔥 Heating type value:", formData.heatingType);
      
      // Mark that we've reset the form
      hasResetForm.current = true;
      
      // Use setTimeout to ensure DOM and React are ready
      setTimeout(() => {
        form.reset(formData, { 
          keepErrors: false,
          keepDirty: false,
          keepIsSubmitted: false,
          keepTouched: false,
          keepIsValid: false,
          keepSubmitCount: false,
        });
        console.log("✅ Form reset complete");
      }, 100);  // Slightly longer timeout to ensure everything is ready
    }
  }, [property, isLoadingProperty]);
  
  // Reset the ref when navigating to a different property
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
        
        applianceAges: data.applianceAges ? JSON.parse(data.applianceAges) : undefined,
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

  // FIX ISSUE 2: Add validation feedback before submission
  const onSubmit: SubmitHandler<PropertyFormValues> = (data) => {
    // Check if form has errors
    const errors = form.formState.errors;
    if (Object.keys(errors).length > 0) {
      // Display user-friendly error message
      const errorFields = Object.keys(errors).map(key => {
        const fieldName = key.replace(/([A-Z])/g, ' $1').trim();
        return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      });
      
      toast({
        title: "Validation Error",
        description: `Please fill in the following required fields: ${errorFields.join(', ')}`,
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

  // FIX ISSUE 2: Show validation errors at the top
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
            disabled={updateMutation.isPending || hasErrors}
            type="submit"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Save className="h-4 w-4 mr-2" /> Save Changes
          </Button>
        </div>
      </PageHeader>
      
       {/* FIX ISSUE 2: Display validation error summary */}
       {hasErrors && (
         <div className="mb-4 p-4 border border-red-300 bg-red-50 rounded-md">
           <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
             <AlertCircle className="h-4 w-4" />
             Please fix the following errors before saving:
           </div>
           <ul className="list-disc list-inside mt-2 text-sm text-red-700">
             {Object.entries(form.formState.errors).map(([key, error]) => (
               <li key={key}>
                 {key.replace(/([A-Z])/g, ' $1').trim().charAt(0).toUpperCase() + key.replace(/([A-Z])/g, ' $1').trim().slice(1)}: {error.message}
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
                                    {/* FIX ISSUE 1: Use null instead of "" for value, and handle undefined */}
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
                                    {/* FIX ISSUE 1: Use null instead of "" for value, and handle undefined */}
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
                                    {/* FIX ISSUE 1: Use null instead of "" for value, and handle undefined */}
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
                                    {/* FIX ISSUE 1: Use null instead of "" for value, and handle undefined */}
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
                                    {/* FIX ISSUE 1: Use null instead of "" for value, and handle undefined */}
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

                    <FormField
                        control={form.control}
                        name="applianceAges"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Major Appliance Ages (JSON format)</FormLabel>
                                <FormControl>
                                    <Textarea 
                                        placeholder={`e.g., {"dishwasher": 2019, "refrigerator": 2022}`} 
                                        {...field}
                                        value={field.value ?? ""} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

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