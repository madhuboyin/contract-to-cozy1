// apps/frontend/src/components/HomeModificationAdvisor.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  Home, 
  TrendingUp, 
  DollarSign, 
  Clock,
  CheckCircle,
  Loader2,
  Lightbulb,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';

interface ModificationRecommendation {
  title: string;
  category: 'ACCESSIBILITY' | 'AGING_IN_PLACE' | 'FAMILY' | 'RESALE' | 'ENERGY' | 'SAFETY';
  priority: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedCost: number;
  roi: number;
  timeline: string;
  description: string;
  benefits: string[];
  contractorType: string;
  permitRequired: boolean;
}

interface ModificationReport {
  propertyId: string;
  propertyAddress: string;
  userNeeds: string[];
  propertyAge: number;
  recommendations: ModificationRecommendation[];
  totalEstimatedCost: number;
  averageROI: number;
  quickWins: ModificationRecommendation[];
  longTermProjects: ModificationRecommendation[];
  generatedAt: string;
}

interface HomeModificationAdvisorProps {
  propertyId: string;
}

const NEED_OPTIONS = [
  { id: 'accessibility', label: 'Accessibility improvements (wheelchair, mobility)' },
  { id: 'aging', label: 'Aging in place modifications' },
  { id: 'family', label: 'Growing family / additional space' },
  { id: 'resale', label: 'Increase resale value' },
  { id: 'energy', label: 'Energy efficiency / lower bills' },
  { id: 'safety', label: 'Safety and security upgrades' },
  { id: 'modern', label: 'Modernize outdated features' },
  { id: 'outdoor', label: 'Outdoor living spaces' },
];

export default function HomeModificationAdvisor({ propertyId }: HomeModificationAdvisorProps) {
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [report, setReport] = useState<ModificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleNeed = (needId: string) => {
    setSelectedNeeds(prev => 
      prev.includes(needId) 
        ? prev.filter(n => n !== needId)
        : [...prev, needId]
    );
  };

  const generateReport = async () => {
    if (selectedNeeds.length === 0) {
      setError('Please select at least one need');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const needsText = selectedNeeds.map(id => 
        NEED_OPTIONS.find(opt => opt.id === id)?.label || id
      );

      const response = await api.getHomeModifications(propertyId, needsText);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to generate recommendations');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'IMMEDIATE': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      'ACCESSIBILITY': '♿',
      'AGING_IN_PLACE': '👴',
      'FAMILY': '👨‍👩‍👧‍👦',
      'RESALE': '💰',
      'ENERGY': '⚡',
      'SAFETY': '🛡️',
    };
    return icons[category] || '🏠';
  };

  if (!report) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>What are your home improvement goals?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {NEED_OPTIONS.map(option => (
                <div key={option.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={option.id}
                    checked={selectedNeeds.includes(option.id)}
                    onCheckedChange={() => toggleNeed(option.id)}
                  />
                  <Label 
                    htmlFor={option.id} 
                    className="text-sm font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                {error}
              </div>
            )}

            <Button 
              onClick={generateReport} 
              disabled={loading || selectedNeeds.length === 0}
              className="mt-6 w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Recommendations...
                </>
              ) : (
                <>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Get AI Recommendations
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Total Projects</p>
                <p className="text-2xl font-bold text-blue-900">{report.recommendations.length}</p>
              </div>
              <Home className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Est. Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${report.totalEstimatedCost.toLocaleString()}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Avg. ROI</p>
                <p className="text-2xl font-bold text-green-900">{report.averageROI}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Wins */}
      {report.quickWins.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Quick Wins (High ROI, Low Cost)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.quickWins.map((rec, index) => (
              <Card key={index} className="border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-bold text-green-900">{rec.title}</h4>
                      <p className="text-sm text-green-700 mt-1">{rec.description}</p>
                    </div>
                    <span className="text-2xl">{getCategoryIcon(rec.category)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <p className="text-green-600">Cost</p>
                      <p className="font-bold text-green-900">${rec.estimatedCost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-green-600">ROI</p>
                      <p className="font-bold text-green-900">{rec.roi}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* All Recommendations */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">All Recommendations</h3>
        <div className="space-y-4">
          {report.recommendations.map((rec, index) => (
            <Card key={index} className={`border-2 ${getPriorityColor(rec.priority)}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getCategoryIcon(rec.category)}</span>
                      <div>
                        <h4 className="font-bold text-lg text-gray-900">{rec.title}</h4>
                        <p className="text-sm text-gray-600">{rec.description}</p>
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(rec.priority)}`}>
                    {rec.priority}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600">Estimated Cost</p>
                    <p className="font-bold text-gray-900">${rec.estimatedCost.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">ROI</p>
                    <p className="font-bold text-gray-900">{rec.roi}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Timeline</p>
                    <p className="font-bold text-gray-900">{rec.timeline}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Contractor</p>
                    <p className="font-bold text-gray-900">{rec.contractorType}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Benefits:</p>
                  <div className="flex flex-wrap gap-2">
                    {rec.benefits.map((benefit, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>

                {rec.permitRequired && (
                  <div className="flex items-center gap-2 text-sm text-orange-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>Building permit required</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Long-term Projects */}
      {report.longTermProjects.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-lg">
              Long-Term Projects ({report.longTermProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-800">
              These larger projects require more planning and investment but offer significant value.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Generated on {new Date(report.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" onClick={() => setReport(null)}>
              Start Over
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}