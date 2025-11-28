// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
// FIX: Import useQueryClient
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

export default function MaintenanceSetupPage() {
  const router = useRouter();
  // FIX: Initialize useQueryClient
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
  
  // 3. Set default property ID (Primary or first) on load
  React.useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      const defaultProp = properties.find(p => p.isPrimary) || properties[0];
      setSelectedPropertyId(defaultProp.id);
    }
  }, [properties, selectedPropertyId]);

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
    
    // FIX: Invalidate the query for the maintenance list page
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
                  <p className="text-lg font-medium">No Properties Found</p>
                  <p className="text-sm text-gray-500 mb-4">Maintenance tasks must be linked to a home.</p>
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
        <PageHeaderHeading>Maintenance Setup</PageHeaderHeading>
        <PageHeaderDescription>
          Select from predefined templates or create custom tasks to build your home maintenance plan.
        </PageHeaderDescription>
      </PageHeader>

      <div className="space-y-8">
        
        {/* Templates List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Wrench className="w-6 h-6 text-indigo-600" /> Predefined Maintenance Templates
            </CardTitle>
            <CardDescription>
              Select recommended recurring tasks based on common property systems.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {templates.map(template => (
              <div key={template.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-gray-500/5 transition-colors">
                <div>
                  <h3 className="font-semibold">{template.title}</h3>
                  <p className="text-sm text-gray-500">Frequency: {template.defaultFrequency.toLowerCase()} | Category: {template.serviceCategory || 'General'}</p>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => handleTemplateSelect(template)}
                  disabled={!selectedPropertyId} // Disable if no property is selected
                >
                  Select <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ))}
            {!selectedPropertyId && (
                <p className="text-sm font-medium text-red-500 flex items-center gap-1">
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
            // PASS FIX: Pass the list of properties and the selection state
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            onPropertyChange={setSelectedPropertyId}
          />
        )}
      </div>
      
    </DashboardShell>
  );
}