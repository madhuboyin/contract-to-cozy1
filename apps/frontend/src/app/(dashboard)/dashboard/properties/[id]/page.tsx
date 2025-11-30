// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
// UPDATED: Added useSearchParams to read the URL query parameter for default tab
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property } from "@/types";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Edit, Zap, Shield, FileText, ArrowLeft } from "lucide-react"; 
import { toast } from "@/components/ui/use-toast";

// Placeholder component for the Overview Tab
const PropertyOverview = ({ property }: { property: Property }) => (
  <div className="space-y-4">
    <p className="text-lg">Address: {property.address}, {property.city}, {property.state} {property.zipCode}</p>
    <p>Built: {property.yearBuilt || 'N/A'}</p>
    <p>Size: {property.propertySize || 'N/A'} sqft</p>
    {/* Add more property details here */}
    <div className="mt-6">
        <Link href={`/dashboard/properties/${property.id}/edit`} passHref>
            <Button variant="outline">
                Edit Details <Edit className="ml-2 h-4 w-4" />
            </Button>
        </Link>
    </div>
  </div>
);

// NEW COMPONENT: Component for the Maintenance Plan Tab
const MaintenancePlanTab = ({ propertyId }: { propertyId: string }) => (
    <div className="p-4 rounded-lg border bg-card/50">
        <h3 className="text-xl font-semibold flex items-center mb-2">
            Property Maintenance Plan <Zap className="h-5 w-5 ml-2 text-red-600" />
        </h3>
        <p className="text-gray-700 dark:text-gray-300">
            This tab will display the full, scheduled, and required maintenance tasks for this property.
        </p>
        <Link href={`/dashboard/maintenance?propertyId=${propertyId}`} passHref>
            <Button className="mt-4" variant="default">
                Manage Maintenance Tasks
            </Button>
        </Link>
    </div>
);

// Component for the Risk & Protection Tab
const RiskProtectionTab = ({ propertyId }: { propertyId: string }) => (
    <div className="p-4 rounded-lg border bg-card/50">
        <h3 className="text-xl font-semibold flex items-center mb-2">
            Property Risk & Protection Overview <Shield className="h-5 w-5 ml-2 text-primary" />
        </h3>
        <p className="text-gray-700 dark:text-gray-300">
            Access the comprehensive risk report to view calculated risk scores, financial exposure,
            and a detailed breakdown of your home's systems and structure health.
        </p>
        <Link href={`/dashboard/properties/${propertyId}/risk-assessment`} passHref>
            <Button className="mt-4" variant="default">
                View Risk & Protection Report
            </Button>
        </Link>
    </div>
);

// Placeholder for the documents tab
const DocumentsTab = ({ propertyId }: { propertyId: string }) => (
    <div className="p-4">
        <p className="text-lg">Documents associated with this property will be listed here.</p>
        <Link href={`/dashboard/documents?propertyId=${propertyId}`} passHref>
            <Button variant="outline" className="mt-4">
                Manage Documents
            </Button>
        </Link>
    </div>
);


export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  // NEW LOGIC: Get query params and determine default tab
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  
  // Validate and set default tab, prioritizing the URL param 'maintenance' if present
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
    <DashboardShell>
      {/* ADDED: Back Navigation Link */}
      <div className="mb-4">
        <Link 
            href="/dashboard/properties" 
            className="text-sm font-medium text-gray-500 hover:text-gray-700 inline-flex items-center"
        >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Properties
        </Link>
      </div>
      
      <PageHeader>
        <PageHeaderHeading>{property.name || "My Property"}</PageHeaderHeading>
        <PageHeaderDescription>
          {property.address}, {property.city}
        </PageHeaderDescription>
      </PageHeader>

      <div className="space-y-6">
        {/* UPDATED: Use the dynamic defaultTab */}
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
                <Edit className="h-4 w-4" /> Overview & Details
            </TabsTrigger>
            {/* NEW TAB ADDED: Maintenance Plan */}
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
                <Zap className="h-4 w-4" /> Maintenance Plan
            </TabsTrigger>
            {/* Existing tabs */}
            <TabsTrigger value="risk-protection" className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> Risk & Protection
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-4">
            <PropertyOverview property={property} />
          </TabsContent>
          
          {/* NEW TAB CONTENT: Maintenance Plan */}
          <TabsContent value="maintenance" className="mt-4">
            <MaintenancePlanTab propertyId={property.id} />
          </TabsContent>

          {/* Existing tabs content */}
          <TabsContent value="risk-protection" className="mt-4">
            <RiskProtectionTab propertyId={property.id} />
          </TabsContent>
          
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab propertyId={property.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}