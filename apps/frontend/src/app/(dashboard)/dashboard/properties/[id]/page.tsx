// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property } from "@/types";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Edit, Zap, Shield, FileText } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// Placeholder components for the new tabs
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

// Component for the Risk & Protection Tab (Updated to production text)
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
      <PageHeader>
        <PageHeaderHeading>{property.name || "My Property"}</PageHeaderHeading>
        <PageHeaderDescription>
          {property.address}, {property.city}
        </PageHeaderDescription>
      </PageHeader>

      <div className="space-y-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
                <Edit className="h-4 w-4" /> Overview & Details
            </TabsTrigger>
            {/* NEW TAB ADDED FOR PHASE 2.4 */}
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
          
          {/* NEW TAB CONTENT FOR PHASE 2.4 */}
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