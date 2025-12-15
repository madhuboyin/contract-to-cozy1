// apps/frontend/src/components/ClimateRiskPredictor.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  Cloud, 
  AlertTriangle, 
  TrendingUp, 
  Shield,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lightbulb
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

interface ClimateRisk {
  category: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  score: number;
  description: string;
  trends: string;
  mitigationSteps: string[];
}

interface ClimateReport {
  propertyId: string;
  propertyAddress: string;
  location: {
    city: string;
    state: string;
    zipCode: string;
  };
  overallRiskScore: number;
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  risks: ClimateRisk[];
  recommendations: string[];
  insuranceImpact: string;
  propertyValueImpact: string;
  generatedAt: string;
}

interface ClimateRiskPredictorProps {
  propertyId: string;
}

export default function ClimateRiskPredictor({ propertyId }: ClimateRiskPredictorProps) {
  const [report, setReport] = useState<ClimateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [propertyId]);

  const loadReport = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.getClimateRisk(propertyId);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to load climate risk report');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load climate risk report');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'SEVERE': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MODERATE': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getRiskIcon = (level: string) => {
    if (level === 'SEVERE' || level === 'HIGH') {
      return <AlertTriangle className="w-5 h-5" />;
    }
    return <Shield className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Analyzing climate risks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-800">{error}</p>
          <Button onClick={loadReport} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className={`border-2 ${getRiskColor(report.overallRiskLevel)}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Overall Climate Risk</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {report.location.city}, {report.location.state}
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{report.overallRiskScore}</div>
              <div className="text-sm font-semibold mt-1">{report.overallRiskLevel}</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Risk Categories */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">Climate Risk Categories</h3>
        <div className="space-y-4">
          {report.risks.map((risk, index) => {
            const isExpanded = expandedRisk === risk.category;

            return (
              <Card key={index} className={`border-2 ${getRiskColor(risk.riskLevel)}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-full ${getRiskColor(risk.riskLevel)}`}>
                        {getRiskIcon(risk.riskLevel)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-lg">{risk.category}</h4>
                        <p className="text-sm text-gray-700">{risk.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{risk.score}</div>
                        <div className={`text-xs font-semibold px-2 py-1 rounded ${getRiskColor(risk.riskLevel)}`}>
                          {risk.riskLevel}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedRisk(isExpanded ? null : risk.category)}
                      className="ml-4"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </Button>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                    <div
                      className={`h-3 rounded-full transition-all ${getScoreColor(risk.score)}`}
                      style={{ width: `${risk.score}%` }}
                    />
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {/* Trends */}
                      <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 text-gray-600 mt-1" />
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Trends:</p>
                          <p className="text-sm text-gray-700">{risk.trends}</p>
                        </div>
                      </div>

                      {/* Mitigation Steps */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Mitigation Steps:</p>
                        <ul className="space-y-1">
                          {risk.mitigationSteps.map((step, i) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-green-600 mt-1">✓</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Impact Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Insurance Impact */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5 text-blue-600" />
              Insurance Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-900">{report.insuranceImpact}</p>
          </CardContent>
        </Card>

        {/* Property Value Impact */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
              Property Value Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-900">{report.propertyValueImpact}</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {report.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <span className="text-gray-800">{rec}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <p className="text-xs text-gray-600 text-center">
            Climate risk analysis based on location, historical data, and projected trends. 
            Generated on {new Date(report.generatedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}