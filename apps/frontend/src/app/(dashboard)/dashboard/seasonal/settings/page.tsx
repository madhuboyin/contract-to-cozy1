// apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, MapPin, Bell, CheckCircle } from 'lucide-react';
import { useClimateInfo, useUpdateClimateSettings } from '@/lib/hooks/useSeasonalChecklists';
import { ClimateRegion, NotificationTiming } from '@/types/seasonal.types';
import { getClimateRegionName, getClimateRegionIcon } from '@/lib/utils/seasonHelpers';
import { usePropertyContext } from '@/lib/property/PropertyContext';

export default function SeasonalSettingsPage() {
  // FIX: Get propertyId from URL params first (for page reload), then fall back to context
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;

  const { data: climateData, isLoading } = useClimateInfo(propertyId!);
  const updateSettingsMutation = useUpdateClimateSettings();
  console.log('=== SEASONAL SETTINGS PAGE DEBUG ===');
  console.log('URL propertyId:', searchParams.get('propertyId'));
  console.log('Context propertyId:', selectedPropertyId);
  console.log('Final propertyId:', propertyId);
  console.log('Climate data:', climateData);
  console.log('Is loading:', isLoading);
  console.log('=========================');

  const [formData, setFormData] = useState({
    climateRegion: 'MODERATE' as ClimateRegion,
    notificationTiming: 'STANDARD' as NotificationTiming,
    notificationEnabled: true,
    autoGenerateChecklists: true,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (climateData?.data) {
      // Load existing settings
      setFormData({
        climateRegion: climateData.data.climateRegion,
        notificationTiming: 'STANDARD', // Would come from climate settings API
        notificationEnabled: true,
        autoGenerateChecklists: true,
      });
    }
  }, [climateData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!propertyId) {
      console.error('No property selected');
      return;
    }

    try {
      await updateSettingsMutation.mutateAsync({
        propertyId,
        data: formData,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // FIX: Handle no property selected
  if (!propertyId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 font-medium">Please select a property to view settings</p>
          <p className="text-yellow-600 text-sm mt-2">Go to the main dashboard and select a property</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const climateRegions: ClimateRegion[] = ['VERY_COLD', 'COLD', 'MODERATE', 'WARM', 'TROPICAL'];
  const isAutoDetected = climateData?.data?.climateRegionSource === 'AUTO_DETECTED';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Seasonal Maintenance Settings</h1>
        <p className="text-gray-600">
          Customize how you receive seasonal maintenance recommendations
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Climate Zone Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <MapPin className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Climate Zone</h2>
          </div>

          {isAutoDetected && climateData?.data && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Auto-detected:</strong> {getClimateRegionName(climateData.data.climateRegion)} 
                {' '}based on your property location. You can override this below.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {climateRegions.map((region) => (
              <label
                key={region}
                className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  formData.climateRegion === region
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="climateRegion"
                  value={region}
                  checked={formData.climateRegion === region}
                  onChange={(e) => setFormData({ ...formData, climateRegion: e.target.value as ClimateRegion })}
                  className="w-4 h-4 text-green-600"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{getClimateRegionIcon(region)}</span>
                    <span className="font-medium text-gray-900">{getClimateRegionName(region)}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Notification Settings</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Enable Notifications</h3>
                <p className="text-sm text-gray-500">Receive alerts for seasonal maintenance tasks</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.notificationEnabled}
                  onChange={(e) => setFormData({ ...formData, notificationEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Auto-generate Checklists</h3>
                <p className="text-sm text-gray-500">Automatically create seasonal checklists</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoGenerateChecklists}
                  onChange={(e) => setFormData({ ...formData, autoGenerateChecklists: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between">
          <div>
            {saved && (
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Settings saved successfully!</span>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}