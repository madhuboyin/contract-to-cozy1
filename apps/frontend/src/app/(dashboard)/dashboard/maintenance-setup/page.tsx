// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import {
  MaintenanceTaskTemplate,
  MaintenanceTaskConfig, // --- ADDED ---
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
import { Checkbox } from '@/components/ui/checkbox';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { Loader2, AlertCircle, Sparkles , Pencil} from 'lucide-react';
import { cn } from '@/lib/utils';
// --- ADDED ---
import { MaintenanceConfigModal } from './MaintenanceConfigModal';

// Helper function
function formatFrequency(frequency: string | null): string {
  if (!frequency) return 'One-time';
  return frequency
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function MaintenanceSetupPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<MaintenanceTaskTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [selectedTasks, setSelectedTasks] = useState<Record<string, MaintenanceTaskConfig>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch all available maintenance templates on load
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await api.getMaintenanceTemplates();
        if (response.success) {
          setTemplates(response.data.templates);
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

  // 2. Handler to toggle a checkbox
  const handleToggle = (templateId: string) => {
    setSelectedIds((prev) => ({
      ...prev,
      [templateId]: !prev[templateId],
    }));
  };

  // --- NEW HANDLERS (FOR PHASE 2) ---
  const handleOpenModal = (template: MaintenanceTaskTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  const handleSaveTaskConfig = (config: MaintenanceTaskConfig) => {
    setSelectedTasks(prev => ({
      ...prev,
      [config.templateId]: config,
    }));
    handleCloseModal();
  };

  const handleRemoveTask = (templateId: string) => {
    setSelectedTasks(prev => {
      const newState = { ...prev };
      delete newState[templateId];
      return newState;
    });
    handleCloseModal();
  };
  // --- END NEW HANDLERS ---

  // 3. Handler to save selections and redirect
  const handleSave = async () => {
    setSaving(true);
    const idsToSave = Object.keys(selectedIds).filter((id) => selectedIds[id]);

    // If user selected anything, save it.
    if (idsToSave.length > 0) {
      try {
        const response = await api.createMaintenanceItems({
          templateIds: idsToSave,
        });
        if (!response.success) {
          throw new Error(
            response.error?.message || 'Failed to save tasks.'
          );
        }
      } catch (err: any) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }
    // Redirect to dashboard on success or if nothing was selected
    router.push('/dashboard');
  };

  // 4. Handler to skip and redirect
  const handleSkip = () => {
    router.push('/dashboard');
  };

  // 5. Render Loading State
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  // 6. Render Error State
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
    <div className="container mx-auto max-w-3xl py-12">
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
                  'flex items-start space-x-4 p-5 cursor-pointer rounded-lg hover:bg-gray-50',
                  selectedIds[template.id] && 'bg-blue-50'
                )}
                onClick={() => handleToggle(template.id)}
              >
                <Checkbox
                  id={template.id}
                  checked={selectedIds[template.id] || false}
                  onCheckedChange={() => handleToggle(template.id)}
                  className="mt-1"
                />
                <div className="grid gap-0.5 flex-1 min-w-0">
                  <label
                    htmlFor={template.id}
                    className="font-medium cursor-pointer flex items-center"
                  >
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

                {/* --- NEW BUTTONS (FOR PHASE 2) --- */}
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
    </div>
  );
}