// apps/frontend/src/components/ApplianceOracle.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  DollarSign, 
  Calendar,
  Zap,
  Shield,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api/client';

interface ApplianceRecommendation {
  brand: string;
  model: string;
  features: string[];
  estimatedCost: number;
  energyRating: string;
  warranty: string;
  reasoning: string;
}

interface AppliancePrediction {
  applianceName: string;
  category: string;
  currentAge: number;
  expectedLife: number;
  remainingLife: number;
  failureRisk: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedFailureDate: string;
  replacementCost: number;
  recommendations: ApplianceRecommendation[];
  maintenanceImpact: string;
}

interface OracleReport {
  propertyId: string;
  propertyAddress: string;
  totalAppliances: number;
  criticalCount: number;
  highRiskCount: number;
  estimatedTotalCost: number;
  predictions: AppliancePrediction[];
  generatedAt: string;
}

interface ApplianceOracleProps {
  propertyId: string;
}

export default function ApplianceOracle({ propertyId }: ApplianceOracleProps) {
  const [report, setReport] = useState<OracleReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAppliance, setExpandedAppliance] = useState<string | null>(null);

  useEffect(() => {
    loadOracleReport();
  }, [propertyId]);

  const loadOracleReport = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.getApplianceOracle(propertyId);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to load predictions');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    if (urgency === 'CRITICAL' || urgency === 'HIGH') {
      return <AlertTriangle className="w-4 h-4" />;
    }
    return <Zap className="w-4 h-4" />;
  };

  const getRiskColor = (risk: number) => {
    if (risk >= 75) return 'bg-red-500';
    if (risk >= 50) return 'bg-orange-500';
    if (risk >= 25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600">AI analyzing your appliances...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-800">{error}</p>
          <Button onClick={loadOracleReport} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report || report.predictions.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Appliance Data</h3>
          <p className="text-gray-600">
            Add appliance information to your property to get AI-powered replacement predictions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Appliances</p>
                <p className="text-2xl font-bold text-gray-900">{report.totalAppliances}</p>
              </div>
              <Zap className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700">Critical Risk</p>
                <p className="text-2xl font-bold text-red-900">{report.criticalCount}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700">High Risk</p>
                <p className="text-2xl font-bold text-orange-900">{report.highRiskCount}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Est. Cost</p>
                <p className="text-2xl font-bold text-green-900">
                  ${report.estimatedTotalCost.toLocaleString()}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appliance Predictions */}
      <div className="space-y-4">
        {report.predictions.map((prediction, index) => {
          const isExpanded = expandedAppliance === prediction.applianceName;

          return (
            <Card key={index} className={`border-2 ${getUrgencyColor(prediction.urgency)}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-xl">{prediction.applianceName}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getUrgencyColor(prediction.urgency)}`}>
                        {getUrgencyIcon(prediction.urgency)}
                        {prediction.urgency}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Current Age</p>
                        <p className="font-semibold text-gray-900">{prediction.currentAge} years</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Expected Life</p>
                        <p className="font-semibold text-gray-900">{prediction.expectedLife} years</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Remaining Life</p>
                        <p className="font-semibold text-gray-900">{prediction.remainingLife} years</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Est. Failure</p>
                        <p className="font-semibold text-gray-900">
                          {new Date(prediction.estimatedFailureDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Failure Risk Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Failure Risk</span>
                        <span className="text-sm font-bold text-gray-900">{prediction.failureRisk}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${getRiskColor(prediction.failureRisk)}`}
                          style={{ width: `${prediction.failureRisk}%` }}
                        />
                      </div>
                    </div>

                    {/* Maintenance Impact */}
                    <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Action: </span>
                        {prediction.maintenanceImpact}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedAppliance(isExpanded ? null : prediction.applianceName)}
                    className="ml-4"
                  >
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </Button>
                </div>
              </CardHeader>

              {/* Expanded: AI Recommendations */}
              {isExpanded && prediction.recommendations.length > 0 && (
                <CardContent className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900">AI Replacement Recommendations</h4>
                  </div>

                  <div className="grid gap-4">
                    {prediction.recommendations.map((rec, recIndex) => (
                      <div key={recIndex} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h5 className="font-bold text-gray-900">{rec.brand} {rec.model}</h5>
                            <p className="text-sm text-gray-600 mt-1">{rec.reasoning}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-700">
                              ${rec.estimatedCost.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-green-600" />
                            <span className="text-gray-700">{rec.energyRating}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-600" />
                            <span className="text-gray-700">{rec.warranty}</span>
                          </div>
                        </div>

                        <div className="mt-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Key Features:</p>
                          <div className="flex flex-wrap gap-2">
                            {rec.features.map((feature, fIndex) => (
                              <span
                                key={fIndex}
                                className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      💡 <span className="font-semibold">Pro Tip:</span> Consider scheduling a professional inspection before replacement to confirm the diagnosis.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Footer Note */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <p className="text-xs text-gray-600 text-center">
            Predictions based on industry average lifespans and current appliance age. 
            Actual failure dates may vary based on usage, maintenance, and environmental factors.
            Generated on {new Date(report.generatedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}