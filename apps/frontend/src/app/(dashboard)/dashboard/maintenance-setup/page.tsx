// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import {
  MaintenanceTaskTemplate,
  MaintenanceTaskConfig,
  ServiceCategory, // Import ServiceCategory for type-checking the filter
} from '@/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { Loader2, AlertCircle, Sparkles, Pencil, Wrench } from 'lucide-react'; // Added Wrench icon for consistency
import { cn } from '@/lib/utils';
import { MaintenanceConfigModal } from './MaintenanceConfigModal'; 
// NEW IMPORT
import { useQueryClient } from '@tanstack/react-query';

// FIX 1: Define excluded renewal/financial categories
const RENEWAL_CATEGORIES: ServiceCategory[] = [
  'INSURANCE',
  'WARRANTY',
  'FINANCE',
  'ADMIN',
  'ATTORNEY',
];


// Helper function (no change)
function formatFrequency(frequency: string | null): string {
  if (!frequency) return 'One-time';
  return frequency
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function MaintenanceSetupPage() {
  const router = useRouter();
  // FIX 2: Initialize the queryClient
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState<MaintenanceTaskTemplate[]>([]);

  const [selectedTasks, setSelectedTasks] = useState<
    Record<string, MaintenanceTaskConfig>
  >({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<MaintenanceTaskTemplate | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX 2: Modified fetchTemplates to filter results
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await api.getMaintenanceTemplates();
        if (response.success) {
          
          // Apply the filter to remove renewal/financial templates
          const filteredTemplates = response.data.templates.filter(
            (t) => 
                // Keep templates with no service category (e.g., general admin tasks)
                t.serviceCategory === null || 
                // Exclude any known renewal/financial categories
                !RENEWAL_CATEGORIES.includes(t.serviceCategory)
          );
          
          setTemplates(filteredTemplates);
        } else {
          throw new Error(
            response.error?.message || 'Failed to load maintenance tasks.'
          );
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);


  // --- NEW HANDLERS (No Change) ---
  const handleOpenModal = (template: MaintenanceTaskTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  const handleSaveTaskConfig = (config: MaintenanceTaskConfig) => {
    setSelectedTasks((prev) => ({
      ...prev,
      [config.templateId]: config,
    }));
    handleCloseModal();
  };

  const handleRemoveTask = (templateId: string) => {
    setSelectedTasks((prev) => {
      const newState = { ...prev };
      delete newState[templateId];
      return newState;
    });
    handleCloseModal();
  };
  // --- END NEW HANDLERS ---

// --- MODIFIED: handleSave (Added Query Invalidation and Corrected Redirect) ---
const handleSave = async () => {
  setSaving(true);
  
  const tasksToSave = Object.values(selectedTasks);

  if (tasksToSave.length > 0) {
    try {
      const response = await api.createCustomMaintenanceItems({
        tasks: tasksToSave,
      });
      if (!response.success) {
        throw new Error(
          response.error?.message || 'Failed to save tasks.'
        );
      }
      
      // FIX 1: Invalidate the maintenance list query cache to force a refresh on the next page
      queryClient.invalidateQueries({ queryKey: ['full-home-checklist'] });

    } catch (err: any) {
      setError(err.message);
      setSaving(false);
      return;
    }
  }
  // FIX 2: Redirect to the correct Maintenance List page for Existing Owners
  router.push('/dashboard/maintenance'); 
};

  // handleSkip (no change)
  const handleSkip = () => {
    router.push('/dashboard');
  };

  // Loading state (no change)
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  // Error state (no change)
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl py-12">
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-red-900">
            Something went wrong
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Button onClick={handleSkip} variant="outline" className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // 7. Render Main Content
  return (
    // FIX 3: Updated container classes for dashboard page consistency
    <div className="space-y-6 pb-8 max-w-4xl mx-auto py-12">
      <Card>
        <CardHeader>
          <div className="w-14 h-14 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-3xl font-bold">
            Set Up Your Home Maintenance Plan
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Let's create a recurring schedule for your home. Select the tasks
            you'd like to track.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-200">
            {templates.map((template) => (
              <li
                key={template.id}
                className={cn(
                  'flex items-start space-x-4 p-5 rounded-lg',
                  selectedTasks[template.id] && 'bg-blue-50'
                )}
              >
                <div className="grid gap-0.5 flex-1 min-w-0">
                  <label className="font-medium flex items-center">
                    {template.serviceCategory && (
                      <ServiceCategoryIcon
                        icon={template.serviceCategory}
                        className="h-4 w-4 mr-2 text-muted-foreground"
                      />
                    )}
                    {template.title}
                  </label>
                  {template.description && (
                    <p className="text-sm text-muted-foreground">
                      {template.description}
                    </p>
                  )}
                  <p className="text-xs font-medium text-blue-600 mt-1">
                    Recommended: {formatFrequency(template.defaultFrequency)}
                  </p>
                </div>

                <div className="ml-auto flex-shrink-0">
                  {selectedTasks[template.id] ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenModal(template)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenModal(template)}
                    >
                      Select
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={saving}
          >
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save & Continue'}
          </Button>
        </CardFooter>
      </Card>

      {/* --- MODAL (No Change) --- */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        template={editingTemplate}
        existingConfig={
          editingTemplate ? selectedTasks[editingTemplate.id] : null
        }
        onSave={handleSaveTaskConfig}
        onRemove={handleRemoveTask}
      />
    </div>
  );
}