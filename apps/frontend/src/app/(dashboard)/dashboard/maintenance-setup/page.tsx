// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx
// UPDATED: Phase 2 Typography & Styling Corrections Applied
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { DashboardShell } from '@/components/DashboardShell';
import { MaintenanceTaskTemplate, Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Zap, ChevronRight, Home, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { MaintenanceConfigModal } from './MaintenanceConfigModal';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <div className="flex justify-center items-center h-64">
               <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        </MobilePageContainer>
      </DashboardShell>
    );
  }
  
  // Scenario: No properties exist. User must create one first.
  if (properties.length === 0) {
      return (
          <DashboardShell>
              <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
                <MobilePageIntro
                  eyebrow="Maintenance"
                  title="Maintenance Setup"
                  subtitle="You must add a property before setting up maintenance tasks."
                  action={
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
                      <Zap className="h-5 w-5" />
                    </div>
                  }
                />
                <EmptyStateCard
                  title="No Properties Found"
                  description="Maintenance tasks must be linked to a home."
                  action={
                    <Link href="/dashboard/properties/new">
                      <Button>Add Your First Property</Button>
                    </Link>
                  }
                />
              </MobilePageContainer>
          </DashboardShell>
      );
  }


  return (
    <DashboardShell>
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
        <MobilePageIntro
          eyebrow="Maintenance"
          title="Maintenance Setup"
          subtitle="Select templates to build your recurring home maintenance plan."
          action={
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
              <Zap className="h-5 w-5" />
            </div>
          }
        />

        <MobileSection>
          <MobileSectionHeader
            title="Predefined Templates"
            subtitle="Recommended recurring tasks by home system."
          />

          <MobileCard className="space-y-3 border-slate-200/80 bg-white">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">{template.title}</h3>
                  <p className="text-xs text-gray-500">
                    {template.defaultFrequency.toLowerCase()} • {template.serviceCategory || 'General'}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleTemplateSelect(template)}
                  disabled={!selectedPropertyId}
                >
                  Select <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ))}
            {!selectedPropertyId && (
              <p className="text-sm font-medium text-red-500 flex items-center gap-1">
                <Home className="w-4 h-4" /> Please wait for properties to load or add a property.
              </p>
            )}
          </MobileCard>
        </MobileSection>

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
      </MobilePageContainer>
    </DashboardShell>
  );
}
