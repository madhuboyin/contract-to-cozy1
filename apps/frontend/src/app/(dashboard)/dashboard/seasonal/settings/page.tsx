// apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Save, MapPin, Bell, CheckCircle } from 'lucide-react';
import { useClimateInfo, useUpdateClimateSettings } from '@/lib/hooks/useSeasonalChecklists';
import { ClimateRegion, NotificationTiming } from '@/types/seasonal.types';
import { getClimateRegionName, getClimateRegionIcon } from '@/lib/utils/seasonHelpers';

export default function SeasonalSettingsPage() {
  // TODO: Get propertyId from context or route params
  const propertyId = 'default-property-id';

  const { data: climateData, isLoading } = useClimateInfo(propertyId);
  const updateSettingsMutation = useUpdateClimateSettings();

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

          {isAutoDetected && (
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
                  onChange={(e) =>
                    setFormData({ ...formData, climateRegion: e.target.value as ClimateRegion })
                  }
                  className="text-green-600 focus:ring-green-500"
                />
                <span className="text-2xl">{getClimateRegionIcon(region)}</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{getClimateRegionName(region)}</p>
                  <p className="text-sm text-gray-600">
                    {region === 'VERY_COLD' && 'Alaska, Northern states, high elevations (Zones 1-4)'}
                    {region === 'COLD' && 'Upper Midwest, Northeast (Zones 5-6)'}
                    {region === 'MODERATE' && 'Mid-Atlantic, Pacific Northwest (Zones 7-8)'}
                    {region === 'WARM' && 'Southern states, California coast (Zones 9-10)'}
                    {region === 'TROPICAL' && 'Florida, Hawaii, Puerto Rico (Zones 11-13)'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Notification Preferences</h2>
          </div>

          <div className="space-y-4">
            {/* Notification Timing */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When to send reminders
              </label>
              <select
                value={formData.notificationTiming}
                onChange={(e) =>
                  setFormData({ ...formData, notificationTiming: e.target.value as NotificationTiming })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="EARLY">Early (3 weeks before season)</option>
                <option value="STANDARD">Standard (2 weeks before season)</option>
                <option value="LATE">Late (1 week before season)</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                We'll send you an email reminder before each season starts
              </p>
            </div>

            {/* Enable Notifications */}
            <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.notificationEnabled}
                onChange={(e) =>
                  setFormData({ ...formData, notificationEnabled: e.target.checked })
                }
                className="rounded text-green-600 focus:ring-green-500 h-5 w-5"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Email notifications</p>
                <p className="text-sm text-gray-600">
                  Receive email reminders for upcoming seasonal maintenance
                </p>
              </div>
            </label>

            {/* Auto-Generate Checklists */}
            <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoGenerateChecklists}
                onChange={(e) =>
                  setFormData({ ...formData, autoGenerateChecklists: e.target.checked })
                }
                className="rounded text-green-600 focus:ring-green-500 h-5 w-5"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Auto-generate seasonal checklists</p>
                <p className="text-sm text-gray-600">
                  Automatically create checklists for each upcoming season
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          {saved && (
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Settings saved successfully</span>
            </div>
          )}
          <div className="flex-1"></div>
          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="inline-flex items-center px-6 py-3 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-5 h-5 mr-2" />
            {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Info Section */}
      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">About Seasonal Maintenance</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            Our seasonal maintenance recommendations are tailored to your specific climate zone and property features.
          </p>
          <p>
            Tasks are categorized as Critical (prevent damage), Recommended (extend life), or Optional (nice to have).
          </p>
          <p>
            You can always customize which tasks to include or exclude from your seasonal checklists.
          </p>
        </div>
      </div>
    </div>
  );
}