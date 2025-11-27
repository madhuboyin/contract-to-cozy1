// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, X, Home as HomeIcon } from "lucide-react";

import {
  PropertyType,
  OwnershipType,
  HeatingType,
  CoolingType,
  WaterHeaterType,
  RoofType,
} from "@/types"; // Assumed types import
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


// --- 1. Form Schema Definition (Including Risk Fields) ---
const propertySchema = z.object({
  name: z.string().optional(),
  isPrimary: z.boolean(),
  address: z.string().min(1, { message: "Address is required." }),
  city: z.string().min(1, { message: "City is required." }),
  state: z.string().min(2, { message: "State is required." }),
  zipCode: z.string().min(5, { message: "Zip Code is required." }),
  
  // Risk-related fields
  propertyType: z.nativeEnum(PropertyType).optional(),
  propertySize: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().positive().nullable().optional()),
  yearBuilt: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(1700).nullable().optional()),
  
  // Advanced Risk Fields
  bedrooms: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(0).nullable().optional()),
  bathrooms: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().min(0).nullable().optional()),
  ownershipType: z.nativeEnum(OwnershipType).optional(),
  occupantsCount: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(0).nullable().optional()),
  heatingType: z.nativeEnum(HeatingType).optional(),
  coolingType: z.nativeEnum(CoolingType).optional(),
  waterHeaterType: z.nativeEnum(WaterHeaterType).optional(),
  roofType: z.nativeEnum(RoofType).optional(),
  
  hvacInstallYear: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(1900).nullable().optional()),
  waterHeaterInstallYear: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(1900).nullable().optional()),
  roofReplacementYear: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? Number(val) : val;
    return isNaN(num as number) ? null : num;
  }, z.number().int().min(1900).nullable().optional()),
  
  hasDrainageIssues: z.boolean().optional(),
  hasSmokeDetectors: z.boolean().optional(),
  hasCoDetectors: z.boolean().optional(),
  // Assuming applianceAges is handled as a text/JSON string for simplicity in a form
  applianceAges: z.string().optional().nullable(), 
});

type PropertyFormValues = z.infer<typeof propertySchema>;

// Helper to convert DB data to form data
const mapDbToForm = (property: any): PropertyFormValues => ({
  name: property.name || "",
  isPrimary: property.isPrimary || false,
  address: property.address,
  city: property.city,
  state: property.state,
  zipCode: property.zipCode,
  
  propertyType: property.propertyType || undefined,
  propertySize: property.propertySize,
  yearBuilt: property.yearBuilt,
  
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  ownershipType: property.ownershipType || undefined,
  occupantsCount: property.occupantsCount,
  heatingType: property.heatingType || undefined,
  coolingType: property.coolingType || undefined,
  waterHeaterType: property.waterHeaterType || undefined,
  roofType: property.roofType || undefined,
  
  hvacInstallYear: property.hvacInstallYear,
  waterHeaterInstallYear: property.waterHeaterInstallYear,
  roofReplacementYear: property.roofReplacementYear,
  
  hasDrainageIssues: property.hasDrainageIssues,
  hasSmokeDetectors: property.hasSmokeDetectors,
  hasCoDetectors: property.hasCoDetectors,
  applianceAges: JSON.stringify(property.applianceAges || {}),
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
    defaultValues: {
      isPrimary: false,
    },
    values: property ? mapDbToForm(property) : undefined,
    mode: "onBlur",
  });

  // 3. Setup Mutation
  const updateMutation = useMutation({
    mutationFn: (data: PropertyFormValues) => {
      // Convert numbers back from form strings/nullables, converting null to undefined for API
      const payload = {
        ...data,
        propertySize: data.propertySize ?? undefined,
        yearBuilt: data.yearBuilt ?? undefined,
        bedrooms: data.bedrooms ?? undefined,
        bathrooms: data.bathrooms ?? undefined,
        occupantsCount: data.occupantsCount ?? undefined,
        hvacInstallYear: data.hvacInstallYear ?? undefined,
        waterHeaterInstallYear: data.waterHeaterInstallYear ?? undefined,
        roofReplacementYear: data.roofReplacementYear ?? undefined,
        // Parse the JSON string for applianceAges, converting null to undefined
        applianceAges: data.applianceAges ? JSON.parse(data.applianceAges) : undefined,
      };
      
      return api.updateProperty(propertyId, payload);
    },
    onSuccess: (response) => {
      if (response.success) {
        toast({
          title: "Property Updated",
          description: "Property details have been successfully saved and risk scores are recalculating.",
        });
        
        // 4. CRITICAL FIX: Invalidate queries to update the UI
        // Invalidate property detail to reflect updates immediately
        queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
        
        // Invalidate the full properties list (for dashboard display updates)
        queryClient.invalidateQueries({ queryKey: ['properties'] }); 
        
        // Invalidate the risk report summary (to show 'QUEUED' status on the dashboard)
        queryClient.invalidateQueries({ queryKey: ['riskReportSummary', propertyId] });
        queryClient.invalidateQueries({ queryKey: ['riskReportSummary'] });

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

  const onSubmit = (data: PropertyFormValues) => {
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(PropertyType).map(type => (
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(HeatingType).map(type => (
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(CoolingType).map(type => (
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(RoofType).map(type => (
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.values(OwnershipType).map(type => (
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
                                        value={field.value ?? ''}
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