'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query'; 
import { api } from '@/lib/api/client';
import { DashboardShell } from '@/components/DashboardShell';
import { MaintenanceTaskTemplate, ServiceCategory } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { resolveMaintenanceTemplateIcon } from '@/lib/icons';
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Home,
  Loader2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { MaintenanceConfigModal } from './MaintenanceConfigModal';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';

type VisualTone = 'insurance' | 'payments' | 'cleaning' | 'systems' | 'outdoor' | 'safety' | 'documents' | 'neutral';

const TONE_STYLES: Record<
  VisualTone,
  { iconChipClass: string; categoryBadgeClass: string }
> = {
  insurance: {
    iconChipClass: 'border-blue-200 bg-blue-50 text-blue-700',
    categoryBadgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  payments: {
    iconChipClass: 'border-purple-200 bg-purple-50 text-purple-700',
    categoryBadgeClass: 'border-purple-200 bg-purple-50 text-purple-700',
  },
  cleaning: {
    iconChipClass: 'border-teal-200 bg-teal-50 text-teal-700',
    categoryBadgeClass: 'border-teal-200 bg-teal-50 text-teal-700',
  },
  systems: {
    iconChipClass: 'border-orange-200 bg-orange-50 text-orange-700',
    categoryBadgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  outdoor: {
    iconChipClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    categoryBadgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  safety: {
    iconChipClass: 'border-rose-200 bg-rose-50 text-rose-700',
    categoryBadgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  documents: {
    iconChipClass: 'border-slate-300 bg-slate-100 text-slate-700',
    categoryBadgeClass: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  neutral: {
    iconChipClass: 'border-slate-200 bg-slate-50 text-slate-600',
    categoryBadgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

const TITLE_TONE_MAP: Record<string, VisualTone> = {
  'water heater flush': 'systems',
  'septic tank pumping': 'systems',
  'smoke detector testing': 'safety',
  'gutter cleaning': 'cleaning',
  'dryer vent cleaning': 'cleaning',
  'carpet deep cleaning': 'cleaning',
  'lawn fertilization': 'outdoor',
  'tree trimming': 'outdoor',
  'hoa dues payment': 'payments',
  'home insurance renewal': 'insurance',
  'property tax payment': 'payments',
  'home warranty renewal': 'insurance',
  'hoa fee payment': 'payments',
  'property document review': 'documents',
  'appliance warranty check': 'systems',
  'umbrella insurance review': 'insurance',
  'hvac filter replacement': 'systems',
  'hvac system maintenance': 'systems',
  'chimney cleaning': 'cleaning',
  'pest control treatment': 'safety',
};

const CATEGORY_TONE_MAP: Partial<Record<ServiceCategory, VisualTone>> = {
  INSURANCE: 'insurance',
  WARRANTY: 'insurance',
  FINANCE: 'payments',
  ADMIN: 'documents',
  HVAC: 'systems',
  PLUMBING: 'systems',
  ELECTRICAL: 'systems',
  HANDYMAN: 'systems',
  CLEANING: 'cleaning',
  LANDSCAPING: 'outdoor',
  PEST_CONTROL: 'safety',
  INSPECTION: 'documents',
  LOCKSMITH: 'safety',
  ATTORNEY: 'documents',
  MOVING: 'neutral',
};

function normalizeTemplateTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getTemplateVisual(template: MaintenanceTaskTemplate): {
  icon: LucideIcon;
  iconChipClass: string;
  categoryBadgeClass: string;
} {
  const normalizedTitle = normalizeTemplateTitle(template.title);
  const toneFromTitle = TITLE_TONE_MAP[normalizedTitle];
  const toneFromCategory = template.serviceCategory
    ? CATEGORY_TONE_MAP[template.serviceCategory]
    : undefined;
  const tone = toneFromTitle || toneFromCategory || 'neutral';

  return {
    icon: resolveMaintenanceTemplateIcon({
      title: template.title,
      serviceCategory: template.serviceCategory,
    }),
    ...TONE_STYLES[tone],
  };
}

function DesktopTemplateRow({
  template,
  disabled,
  onSelect,
}: {
  template: MaintenanceTaskTemplate;
  disabled: boolean;
  onSelect: (template: MaintenanceTaskTemplate) => void;
}) {
  const visual = getTemplateVisual(template);
  const categoryLabel = template.serviceCategory ? formatEnumLabel(template.serviceCategory) : 'General';
  const frequencyLabel = formatEnumLabel(template.defaultFrequency);
  const Icon = visual.icon;

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50/70">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${visual.iconChipClass}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold text-slate-900">{template.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${visual.categoryBadgeClass}`}
          >
            {categoryLabel}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
          >
            {frequencyLabel}
          </Badge>
        </div>
      </div>
      <Button
        size="sm"
        className="h-8 shrink-0 rounded-md px-3 text-xs font-semibold"
        onClick={() => onSelect(template)}
        disabled={disabled}
        aria-label={`Select ${template.title} template`}
      >
        Select
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function MaintenanceSetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedPropertyId: dashboardSelectedPropertyId, setSelectedPropertyId: setDashboardSelectedPropertyId } =
    usePropertyContext();
  
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
  
  const properties = useMemo(
    () => (propertiesData?.success ? propertiesData.data.properties : []),
    [propertiesData]
  );
  const searchParams = useSearchParams();
  const urlPropertyId = searchParams.get('propertyId');
  const candidatePropertyId = urlPropertyId || dashboardSelectedPropertyId;
  
  // 3. Set default property ID (Primary or first) on load
  React.useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      if (candidatePropertyId && properties.some((property) => property.id === candidatePropertyId)) {
        setSelectedPropertyId(candidatePropertyId);
        setDashboardSelectedPropertyId(candidatePropertyId);
      } else {
        const defaultProp = properties.find((property) => property.isPrimary) || properties[0];
        setSelectedPropertyId(defaultProp.id);
        setDashboardSelectedPropertyId(defaultProp.id);
      }
    }
  }, [candidatePropertyId, properties, selectedPropertyId, setDashboardSelectedPropertyId]);

  // --- End Property and Selection State ---
  
  const templates = useMemo(
    () => (templatesData?.success ? templatesData.data.templates : []),
    [templatesData]
  );
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
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-6 lg:pb-10">
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
              <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-6 lg:pb-10">
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
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-6 lg:pb-10">
        <div className="lg:hidden">
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
                    Select <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!selectedPropertyId && (
                <p className="flex items-center gap-1 text-sm font-medium text-red-500">
                  <Home className="h-4 w-4" /> Please wait for properties to load or add a property.
                </p>
              )}
            </MobileCard>
          </MobileSection>
        </div>

        <section className="hidden space-y-6 lg:block">
          <header className="space-y-2 px-1 pt-1">
            <p className="text-xs font-semibold tracking-normal text-slate-500">Maintenance</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Maintenance Setup</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Select templates to build your recurring home maintenance plan.
            </p>
          </header>

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-5">
              <h2 className="text-base font-semibold text-slate-900">Template Library</h2>
              <p className="mt-1 text-sm text-slate-600">Recommended recurring tasks by home system.</p>
            </div>

            <div className="px-4 py-4">
              <div className="space-y-2">
                {templates.map((template) => (
                  <DesktopTemplateRow
                    key={template.id}
                    template={template}
                    disabled={!selectedPropertyId}
                    onSelect={handleTemplateSelect}
                  />
                ))}
              </div>

              {!selectedPropertyId && (
                <p className="mt-3 flex items-center gap-1 text-sm font-medium text-red-500">
                  <Home className="h-4 w-4" />
                  Please wait for properties to load or add a property.
                </p>
              )}
            </div>
          </div>
        </section>

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
