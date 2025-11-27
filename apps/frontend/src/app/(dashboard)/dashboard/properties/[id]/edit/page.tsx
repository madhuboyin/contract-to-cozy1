// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, X, Home as HomeIcon } from "lucide-react";

import {
  PropertyType,
  PropertyTypes,
  OwnershipType,
  OwnershipTypes,
  HeatingType,
  HeatingTypes,
  CoolingType,
  CoolingTypes,
  WaterHeaterType,
  WaterHeaterTypes,
  RoofType,
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


// --- 1. Form Schema Definition (Updated for required fields) ---
const propertySchema = z.object({
  name: z.string().optional().nullable(),
  isPrimary: z.boolean(),
  address: z.string().min(1, { message: "Street Address is required." }),
  city: z.string().min(1, { message: "City is required." }),
  state: z.string().min(2, { message: "State is required." }),
  zipCode: z.string().min(5, { message: "Zip Code is required." }),
  
  // FIX: Only check for val !== null (since "" is converted to null by the component logic)
  propertyType: z.nativeEnum(PropertyTypes).nullable().refine(val => val !== null, { message: "Property Type is required." }),
  
  propertySize: z.coerce.number().int().positive().optional().nullable(),
  yearBuilt: z.coerce.number().int().min(1700).optional().nullable(),
  
  // Advanced Risk Fields
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().min(0).optional().nullable(),
  ownershipType: z.nativeEnum(OwnershipTypes).optional().nullable(),
  occupantsCount: z.coerce.number().int().min(0).optional().nullable(),

  // FIX: Only check for val !== null
  heatingType: z.nativeEnum(HeatingTypes).nullable().refine(val => val !== null, { message: "Heating Type is required." }),
  coolingType: z.nativeEnum(CoolingTypes).nullable().refine(val => val !== null, { message: "Cooling Type is required." }),
  waterHeaterType: z.nativeEnum(WaterHeaterTypes).nullable().refine(val => val !== null, { message: "Water Heater Type is required." }),
  roofType: z.nativeEnum(RoofTypes).nullable().refine(val => val !== null, { message: "Roof Type is required." }),
  
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
  isPrimary: property.isPrimary || false,
  address: property.address,
  city: property.city,
  state: property.state,
  zipCode: property.zipCode,
  
  // Note: These fields are required for saving, but DB can return null initially
  propertyType: property.propertyType || null, 
  propertySize: property.propertySize,
  yearBuilt: property.yearBuilt,
  
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  ownershipType: property.ownershipType || null,
  occupantsCount: property.occupantsCount,
  heatingType: property.heatingType || null,
  coolingType: property.coolingType || null,
  waterHeaterType: property.waterHeaterType || null,
  roofType: property.roofType || null,
  
  hvacInstallYear: property.hvacInstallYear,
  waterHeaterInstallYear: property.waterHeaterInstallYear,
  roofReplacementYear: property.roofReplacementYear,
  
  // Coalesce all nullable boolean fields to false for form compatibility
  hasDrainageIssues: property.hasDrainageIssues ?? false,
  hasSmokeDetectors: property.hasSmokeDetectors ?? false,
  hasCoDetectors: property.hasCoDetectors ?? false,
  hasSecuritySystem: property.hasSecuritySystem ?? false,
  hasFireExtinguisher: property.hasFireExtinguisher ?? false,
  hasIrrigation: property.hasIrrigation ?? false,

  // Convert object to string for the Textarea input
  applianceAges: property.applianceAges ? JSON.stringify(property.applianceAges) : null,
});


export default function EditPropertyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

  // 2. Fetch Existing Property Data
  const { data: property, isLoading: isLoadingProperty } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to fetch property.");
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as any,
    // Hydrate form with fetched values
    values: property ? mapDbToForm(property) : undefined,
    mode: "onBlur",
  });

  // 3. Setup Mutation
  const updateMutation = useMutation({
    mutationFn: (data: PropertyFormValues) => {
      // Explicitly map form values (which can be null) to API payload (which should be undefined 
      // for optional unset fields) using nullish coalescing (?? undefined).
      const payload = {
        name: data.name ?? undefined,
        address: data.address,
        city: data.city,
        state: data.state.toUpperCase(), 
        zipCode: data.zipCode,
        isPrimary: data.isPrimary,
        
        // --- Optional/Nullable fields mapping null -> undefined ---
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
        
        hasDrainageIssues: data.hasDrainageIssues,
        hasSmokeDetectors: data.hasSmokeDetectors,
        hasCoDetectors: data.hasCoDetectors,
        hasSecuritySystem: data.hasSecuritySystem,
        hasFireExtinguisher: data.hasFireExtinguisher,
        hasIrrigation: data.hasIrrigation,

        // JSON Field Handling: Ensure JSON.parse only runs if the string is not empty/null
        applianceAges: data.applianceAges 
            ? JSON.parse(data.applianceAges) 
            : undefined,
      };

      return api.updateProperty(propertyId, payload);
    },
    onSuccess: (response) => {
      if (response.success) {
        toast({
          title: "Property Updated",
          description: "Property details have been successfully saved and risk scores are recalculating.",
        });
        
        // Invalidate queries to update the UI
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        queryClient.invalidateQueries({ queryKey: ['properties'] }); 
        queryClient.invalidateQueries({ queryKey: ['riskReportSummary', propertyId] });
        queryClient.invalidateQueries({ queryKey: ['riskReportSummary'] });

        router.push(`/dashboard/properties/${propertyId}`);
      } else {
        // This section handles API errors and displays a message.
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
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>State (e.g., CA)</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
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
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isPrimary"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-md shadow-sm self-end">
                                    <FormControl>
                                        <Checkbox 
                                            checked={field.value}
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
                                    <FormLabel>Property Type</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
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
                                    <FormLabel>Heating Type</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
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
                                    <FormLabel>Cooling Type</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
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
                                    <FormLabel>Roof Type</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
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
                                    <FormLabel>Water Heater Type</FormLabel>
                                    <Select onValueChange={(value) => field.onChange(value === "" ? null : value)} value={field.value || ""}>
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
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Safety & Usage</CardTitle>
                    <CardDescription>Additional factors affecting risk and required maintenance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name="ownershipType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ownership Status</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
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
                                    <FormLabel>Number of Occupants</FormLabel>
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                                        // Coalesce null/undefined to empty string for Textarea value
                                        value={field.value ?? ""} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                </CardContent>
            </Card>

            <Button type="submit" className="w-full md:w-auto" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Save className="h-4 w-4 mr-2" /> Save Changes and Recalculate Risk
            </Button>
        </form>
      </Form>
    </DashboardShell>
  );
}