// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx
// UPDATED: Phase 2 Typography & Styling Corrections Applied
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from '@/components/page-header';
import { MaintenanceTaskTemplate, Property } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Wrench, ChevronRight, Home, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { MaintenanceConfigModal } from './MaintenanceConfigModal';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function MaintenanceSetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MaintenanceTaskTemplate | null>(null);

  // --- Property and Selection State ---
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);
  
  // 1. Fetch Properties (Needed for selection in modal)
  const { data: propertiesData, isLoading: isLoadingProperties } = useQuery({
    queryKey: ['userProperties'],
    queryFn: () => api.getProperties(),
  });
  
  // 2. Fetch Templates
  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['maintenanceTemplates'],
    queryFn: () => api.getMaintenanceTemplates(),
  });
  
  const properties = propertiesData?.success ? propertiesData.data.properties : [];
  const searchParams = useSearchParams();
  const urlPropertyId = searchParams.get('propertyId');
  
  // 3. Set default property ID (Primary or first) on load
  React.useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      // 🔧 FIX: Check URL parameter first, then fallback to primary/first
      if (urlPropertyId && properties.some(p => p.id === urlPropertyId)) {
        // Use property from URL if valid
        setSelectedPropertyId(urlPropertyId);
      } else {
        // Otherwise use primary or first property
        const defaultProp = properties.find(p => p.isPrimary) || properties[0];
        setSelectedPropertyId(defaultProp.id);
      }
    }
  }, [properties, selectedPropertyId, urlPropertyId]); // 🔧 Add urlPropertyId dependency

  // --- End Property and Selection State ---
  
  const templates = templatesData?.success ? templatesData.data.templates : [];
  const isLoading = isLoadingProperties || isLoadingTemplates;

  const handleTemplateSelect = (template: MaintenanceTaskTemplate) => {
    setSelectedTemplate(template);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTemplate(null);
  };
  
  const handleSuccess = (count: number) => {
    toast({
      title: "Success",
      description: `${count} maintenance task(s) added successfully!`,
      variant: "default",
    });
    
    queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); 
    
    handleCloseModal();
    router.push('/dashboard/maintenance');
  };

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex justify-center items-center h-64">
             <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </DashboardShell>
    );
  }
  
  // Scenario: No properties exist. User must create one first.
  if (properties.length === 0) {
      return (
          <DashboardShell>
              <PageHeader>
                  <PageHeaderHeading>Maintenance Setup</PageHeaderHeading>
                  <PageHeaderDescription>
                      You must add a property before setting up maintenance tasks.
                  </PageHeaderDescription>
              </PageHeader>
              <Card className="mt-8 p-6 text-center">
                  <Home className="w-10 h-10 mx-auto text-gray-400 mb-4" />
                  <p className="font-heading text-lg font-medium">No Properties Found</p>
                  <p className="font-body text-sm text-gray-500 mb-4">Maintenance tasks must be linked to a home.</p>
                  <Link href="/dashboard/properties/new" passHref>
                      <Button>Add Your First Property</Button>
                  </Link>
              </Card>
          </DashboardShell>
      );
  }


  return (
    <DashboardShell>
      <PageHeader>
        {/* FIX: Updated icon color from text-yellow-500 to text-blue-600 */}
        <PageHeaderHeading className="flex items-center gap-2">
          <Zap className="w-8 h-8 text-blue-600" /> Maintenance Setup
        </PageHeaderHeading>
        <PageHeaderDescription>
          Select from predefined templates or create custom tasks to build your home maintenance plan.
        </PageHeaderDescription>
      </PageHeader>

      <div className="space-y-8">
        
        {/* Templates List */}
        <Card>
          <CardHeader>
            {/* FIX: Updated from text-2xl to font-heading text-xl, icon from w-6 h-6 to w-5 h-5, color from text-indigo-600 to text-blue-600 */}
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-600" /> Predefined Maintenance Templates
            </CardTitle>
            <CardDescription className="font-body text-sm">
              Select recommended recurring tasks based on common property systems.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {templates.map(template => (
              <div key={template.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-gray-50 transition-colors">
                <div>
                  {/* FIX: Added font-heading class */}
                  <h3 className="font-heading font-semibold text-gray-900">{template.title}</h3>
                  {/* FIX: Added font-body class */}
                  <p className="font-body text-sm text-gray-500">
                    Frequency: {template.defaultFrequency.toLowerCase()} | Category: {template.serviceCategory || 'General'}
                  </p>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => handleTemplateSelect(template)}
                  disabled={!selectedPropertyId}
                >
                  Select <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ))}
            {/* FIX: Added font-body class */}
            {!selectedPropertyId && (
                <p className="font-body text-sm font-medium text-red-500 flex items-center gap-1">
                    <Home className="w-4 h-4"/> Please wait for properties to load or add a property.
                </p>
            )}
          </CardContent>
        </Card>
        
        {/* Maintenance Config Modal - Only show if necessary data is available */}
        {selectedTemplate && (
          <MaintenanceConfigModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            template={selectedTemplate}
            onSuccess={handleSuccess}
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            onPropertyChange={setSelectedPropertyId}
          />
        )}
      </div>
      
    </DashboardShell>
  );
}