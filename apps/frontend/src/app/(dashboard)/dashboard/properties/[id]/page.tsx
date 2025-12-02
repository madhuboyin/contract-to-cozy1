// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx
// UPDATED: Priority 1 Critical Fixes - Typography, Spacing, Card Structure

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property } from "@/types";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Edit, Zap, Shield, FileText, ArrowLeft, Home, Calendar, Ruler } from "lucide-react"; 
import { toast } from "@/components/ui/use-toast";

// UPDATED: PropertyOverview with Card structure and Phase 2 typography
const PropertyOverview = ({ property }: { property: Property }) => (
  <div className="space-y-3">
    {/* Basic Information Card */}
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-heading text-xl">Basic Information</CardTitle>
        <CardDescription className="font-body text-sm">
          Core property details and location
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {/* Address Section */}
        <div className="space-y-2">
          <h4 className="font-heading text-sm font-medium text-gray-700 flex items-center gap-2">
            <Home className="h-4 w-4 text-blue-600" />
            Address
          </h4>
          <div className="font-body text-base text-gray-900 ml-6">
            <p>{property.address}</p>
            <p className="text-sm text-gray-600">
              {property.city}, {property.state} {property.zipCode}
            </p>
          </div>
        </div>

        {/* Property Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
          {/* Year Built */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Year Built
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.yearBuilt || 'N/A'}
            </p>
          </div>

          {/* Property Size */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Property Size
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : 'N/A'}
            </p>
          </div>

          {/* Property Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Home className="h-3 w-3" />
              Property Type
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.propertyType ? property.propertyType.replace(/_/g, ' ') : 'N/A'}
            </p>
          </div>
        </div>

        {/* Bedrooms & Bathrooms (if available) */}
        {(property.bedrooms || property.bathrooms) && (
          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
            {property.bedrooms && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Bedrooms</p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.bedrooms}
                </p>
              </div>
            )}
            {property.bathrooms && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Bathrooms</p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.bathrooms}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Systems Information Card */}
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-heading text-xl">Home Systems</CardTitle>
        <CardDescription className="font-body text-sm">
          Critical system information for maintenance planning
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Heating Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Heating Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.heatingType ? property.heatingType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Cooling Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Cooling Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.coolingType ? property.coolingType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Water Heater Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Water Heater Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.waterHeaterType ? property.waterHeaterType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Roof Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Roof Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.roofType ? property.roofType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>
        </div>

        {/* System Ages (if available) */}
        {(property.hvacInstallYear || property.waterHeaterInstallYear || property.roofReplacementYear) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
            {property.hvacInstallYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">HVAC Install Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.hvacInstallYear}
                </p>
              </div>
            )}
            {property.waterHeaterInstallYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Water Heater Install Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.waterHeaterInstallYear}
                </p>
              </div>
            )}
            {property.roofReplacementYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Roof Replacement Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.roofReplacementYear}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Major Appliances Card */}
    {property.homeAssets && property.homeAssets.length > 0 && (
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="font-heading text-xl">Major Appliances</CardTitle>
          <CardDescription className="font-body text-sm">
            Installed appliances and their ages
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {property.homeAssets.map((asset: any, index: number) => (
              <div key={index} className="space-y-1 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="font-body text-xs text-gray-500 uppercase tracking-wide">
                  {asset.assetType.replace(/_/g, ' ')}
                </p>
                <p className="font-heading text-base font-medium text-gray-900">
                  Installed: {asset.installationYear}
                </p>
                <p className="text-sm text-gray-600">
                  Age: {new Date().getFullYear() - asset.installationYear} years
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Action Button */}
    <div className="flex justify-start">
      <Link href={`/dashboard/properties/${property.id}/edit`} passHref>
        <Button variant="default">
          <Edit className="mr-2 h-4 w-4" />
          Edit Property Details
        </Button>
      </Link>
    </div>
  </div>
);

// UPDATED: MaintenancePlanTab with Phase 2 typography and compact spacing
const MaintenancePlanTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <Zap className="h-5 w-5 text-red-600" />
        Property Maintenance Plan
      </CardTitle>
      <CardDescription className="font-body text-sm">
        View and manage all scheduled maintenance tasks for this property
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        This tab will display the full, scheduled, and required maintenance tasks for this property.
      </p>
      <Link href={`/dashboard/maintenance?propertyId=${propertyId}`} passHref>
        <Button variant="default">
          <Zap className="mr-2 h-4 w-4" />
          Manage Maintenance Tasks
        </Button>
      </Link>
    </CardContent>
  </Card>
);

// UPDATED: RiskProtectionTab with Phase 2 typography and compact spacing
const RiskProtectionTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        Property Risk & Protection Overview
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Access comprehensive risk assessment and financial exposure analysis
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Access the comprehensive risk report to view calculated risk scores, financial exposure,
        and a detailed breakdown of your home's systems and structure health.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/risk-assessment`} passHref>
        <Button variant="default">
          <Shield className="mr-2 h-4 w-4" />
          View Risk & Protection Report
        </Button>
      </Link>
    </CardContent>
  </Card>
);

// UPDATED: DocumentsTab with Phase 2 typography and compact spacing
const DocumentsTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        Property Documents
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Manage all documents associated with this property
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Documents associated with this property will be listed here, including warranties, 
        insurance policies, inspection reports, and more.
      </p>
      <Link href={`/dashboard/documents?propertyId=${propertyId}`} passHref>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          Manage Documents
        </Button>
      </Link>
    </CardContent>
  </Card>
);


export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  
  const defaultTab = initialTab && ['overview', 'maintenance', 'risk-protection', 'documents'].includes(initialTab) 
    ? initialTab 
    : 'overview';


  const { data: property, isLoading } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success) {
        return response.data;
      }
      toast({
        title: "Error",
        description: response.message || "Failed to fetch property details.",
        variant: "destructive",
      });
      return null;
    },
    enabled: !!propertyId,
  });

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </DashboardShell>
    );
  }

  if (!property) {
    return (
      <DashboardShell>
        <PageHeader>
          <PageHeaderHeading>Property Not Found</PageHeaderHeading>
          <PageHeaderDescription>
            The requested property could not be loaded or does not exist.
          </PageHeaderDescription>
        </PageHeader>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="gap-2">
      {/* UPDATED: Back Navigation - Reduced to mb-2 for tighter spacing */}
      <div className="mb-2">
        <Link 
          href="/dashboard/properties" 
          className="font-body text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Properties
        </Link>
      </div>
      
      {/* UPDATED: Minimal PageHeader spacing for tight layout */}
      <PageHeader className="pt-2 pb-2 gap-1">
        <PageHeaderHeading>{property.name || "My Property"}</PageHeaderHeading>
        <PageHeaderDescription>
          {property.address}, {property.city}
        </PageHeaderDescription>
      </PageHeader>

      {/* UPDATED: Removed space-y-4 wrapper - no container spacing needed */}
      <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Edit className="h-4 w-4" /> Overview & Details
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <Zap className="h-4 w-4" /> Maintenance Plan
            </TabsTrigger>
            <TabsTrigger value="risk-protection" className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Risk & Protection
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents
            </TabsTrigger>
          </TabsList>
          
          {/* UPDATED: Reduced tab content spacing from mt-6 to mt-4 */}
          <TabsContent value="overview" className="mt-4">
            <PropertyOverview property={property} />
          </TabsContent>
          
          <TabsContent value="maintenance" className="mt-4">
            <MaintenancePlanTab propertyId={property.id} />
          </TabsContent>

          <TabsContent value="risk-protection" className="mt-4">
            <RiskProtectionTab propertyId={property.id} />
          </TabsContent>
          
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab propertyId={property.id} />
          </TabsContent>
        </Tabs>
      </DashboardShell>
  );
}