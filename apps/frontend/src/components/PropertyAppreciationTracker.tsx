'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar,
  BarChart3,
  Loader2,
  Lightbulb,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';

interface AppreciationDataPoint {
  date: string;
  value: number;
  source: 'USER_INPUT' | 'AI_ESTIMATE' | 'MARKET_TREND';
}

interface AppreciationReport {
  propertyId: string;
  propertyAddress: string;
  purchasePrice: number;
  purchaseDate: string;
  currentEstimatedValue: number;
  totalAppreciation: number;
  totalAppreciationPercent: number;
  annualAppreciationRate: number;
  historicalData: AppreciationDataPoint[];
  projectedValues: AppreciationDataPoint[];
  marketComparison: {
    propertyPerformance: number;
    regionalAverage: number;
    nationalAverage: number;
  };
  insights: string[];
  generatedAt: string;
}

interface PropertyAppreciationTrackerProps {
  propertyId: string;
}

export default function PropertyAppreciationTracker({ propertyId }: PropertyAppreciationTrackerProps) {
  const [report, setReport] = useState<AppreciationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInputForm, setShowInputForm] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');

  useEffect(() => {
    setReport(null);
    setError('');
    setShowInputForm(false);
    setPurchasePrice('');
    setPurchaseDate('');
  }, [propertyId]);

  const loadReport = async (customPrice?: number, customDate?: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.getPropertyAppreciation(
        propertyId,
        customPrice,
        customDate
      );
      
      if (response.success && response.data) {
        setReport(response.data as AppreciationReport);
        setShowInputForm(false);
      } else {
        setError(response.message || 'Failed to load appreciation data');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load appreciation data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid purchase price');
      return;
    }
    loadReport(price, purchaseDate || undefined);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPerformanceColor = (rate: number) => {
    if (rate > 6) return 'text-green-600';
    if (rate > 4) return 'text-blue-600';
    if (rate > 2) return 'text-yellow-600';
    return 'text-orange-600';
  };

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        <span className="ml-3 text-gray-600">Analyzing property appreciation...</span>
      </div>
    );
  }

  if (error && !report) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-800">{error}</p>
          <Button onClick={() => setShowInputForm(true)} variant="outline" className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report && !showInputForm) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Track Your Property Value</h3>
          <p className="text-gray-600 mb-4">
            Enter your purchase information to see AI-powered appreciation analysis
          </p>
          <Button onClick={() => setShowInputForm(true)}>
            Get Started
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (showInputForm && !report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Property Purchase Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="purchasePrice">Purchase Price *</Label>
              <Input
                id="purchasePrice"
                type="number"
                placeholder="300000"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="purchaseDate">Purchase Date (Optional)</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to use 1 year ago
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Analyze Appreciation
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowInputForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Current Value</p>
                <p className="text-2xl font-bold text-green-900">
                  {formatCurrency(report.currentEstimatedValue)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Gain</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(report.totalAppreciation)}
                </p>
                <p className="text-xs text-gray-500">
                  +{report.totalAppreciationPercent.toFixed(2)}%
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Annual Rate</p>
                <p className={`text-2xl font-bold ${getPerformanceColor(report.annualAppreciationRate)}`}>
                  {report.annualAppreciationRate.toFixed(2)}%
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Purchase Price</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(report.purchasePrice)}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(report.purchaseDate).toLocaleDateString()}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Market Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Your Property</span>
                <span className={`text-sm font-bold ${getPerformanceColor(report.marketComparison.propertyPerformance)}`}>
                  {report.marketComparison.propertyPerformance.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full"
                  style={{ width: `${Math.min(100, (report.marketComparison.propertyPerformance / 10) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Regional Average</span>
                <span className="text-sm font-bold text-gray-700">
                  {report.marketComparison.regionalAverage.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full"
                  style={{ width: `${Math.min(100, (report.marketComparison.regionalAverage / 10) * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">National Average</span>
                <span className="text-sm font-bold text-gray-700">
                  {report.marketComparison.nationalAverage.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gray-600 h-3 rounded-full"
                  style={{ width: `${Math.min(100, (report.marketComparison.nationalAverage / 10) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Chart (Simple Version) */}
      <Card>
        <CardHeader>
          <CardTitle>Value History & Projections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm font-medium mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-600 rounded"></div>
                <span>Historical (Market Trend)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-600 rounded"></div>
                <span>Projected (AI Estimate)</span>
              </div>
            </div>

            {/* Simple bar chart visualization */}
            <div className="space-y-2">
              {[...report.historicalData.slice(-6), ...report.projectedValues.slice(0, 3)].map((point, index) => {
                const isProjection = point.source === 'AI_ESTIMATE';
                const maxValue = Math.max(...report.historicalData.map(d => d.value), ...report.projectedValues.map(d => d.value));
                const widthPercent = (point.value / maxValue) * 100;

                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-24">
                      {new Date(point.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                      <div
                        className={`h-6 rounded-full flex items-center justify-end pr-2 text-xs font-bold text-white ${
                          isProjection ? 'bg-green-600' : 'bg-blue-600'
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      >
                        {formatCurrency(point.value)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            AI Market Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {report.insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <span className="text-gray-800">{insight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <Card className="bg-gray-50">
        <CardContent className="p-4 flex justify-between items-center">
          <p className="text-xs text-gray-600">
            Generated on {new Date(report.generatedAt).toLocaleString()}
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowInputForm(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Update Values
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}