// apps/frontend/src/components/PropertyAppreciationTracker.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  ActionPriorityRow,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
  propertyPurchasePriceCents?: number | null;
  propertyPurchaseDate?: string | null;
}

const normalizeInputDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

export default function PropertyAppreciationTracker({
  propertyId,
  propertyPurchasePriceCents = null,
  propertyPurchaseDate = null,
}: PropertyAppreciationTrackerProps) {
  const [report, setReport] = useState<AppreciationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInputForm, setShowInputForm] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const autoLoadedKeyRef = useRef<string | null>(null);
  const storedPurchasePrice =
    typeof propertyPurchasePriceCents === 'number' && propertyPurchasePriceCents > 0
      ? propertyPurchasePriceCents / 100
      : undefined;
  const storedPurchaseDate = normalizeInputDate(propertyPurchaseDate);

  useEffect(() => {
    setReport(null);
    setError('');
    setShowInputForm(false);
    setPurchasePrice(storedPurchasePrice ? String(storedPurchasePrice) : '');
    setPurchaseDate(storedPurchaseDate);
    autoLoadedKeyRef.current = null;
  }, [propertyId, storedPurchasePrice, storedPurchaseDate]);

  const loadReport = useCallback(async (customPrice?: number, customDate?: string) => {
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
  }, [propertyId]);

  useEffect(() => {
    if (!storedPurchasePrice) return;
    const autoLoadKey = `${propertyId}:${storedPurchasePrice}:${storedPurchaseDate}`;
    if (autoLoadedKeyRef.current === autoLoadKey) return;
    autoLoadedKeyRef.current = autoLoadKey;
    void loadReport(storedPurchasePrice, storedPurchaseDate || undefined);
  }, [propertyId, storedPurchasePrice, storedPurchaseDate, loadReport]);

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
      <ScenarioInputCard
        title="Analyzing appreciation"
        subtitle="Calculating historical and projected value movement."
        badge={<StatusChip tone="info">In progress</StatusChip>}
      >
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-green-600" />
          <span>Compiling market trend and purchase-price signals.</span>
        </div>
      </ScenarioInputCard>
    );
  }

  if (error && !report) {
    return (
      <ScenarioInputCard
        title="Unable to load appreciation data"
        subtitle={error}
        badge={<StatusChip tone="danger">Error</StatusChip>}
        actions={
          <ActionPriorityRow
            primaryAction={
              <Button
                onClick={() => {
                  if (storedPurchasePrice) {
                    void loadReport(storedPurchasePrice, storedPurchaseDate || undefined);
                    return;
                  }
                  setShowInputForm(true);
                }}
              >
                Try Again
              </Button>
            }
          />
        }
      >
        <p className="text-sm text-red-700">Update inputs and rerun the analysis.</p>
      </ScenarioInputCard>
    );
  }

  if (!report && !showInputForm && storedPurchasePrice) {
    return (
      <ScenarioInputCard
        title="Preparing appreciation analysis"
        subtitle="Using your saved purchase details."
        badge={<StatusChip tone="info">Loading</StatusChip>}
      >
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-green-600" />
          <span>Building your value trend from stored baseline data.</span>
        </div>
      </ScenarioInputCard>
    );
  }

  if (!report && !showInputForm) {
    return (
      <ScenarioInputCard
        title="Track Your Property Value"
        subtitle="Add purchase info to generate AI-powered appreciation analysis."
        badge={<StatusChip tone="info">Setup</StatusChip>}
        actions={<ActionPriorityRow primaryAction={<Button onClick={() => setShowInputForm(true)}>Get Started</Button>} />}
      >
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          <span>Use custom purchase data for a tighter estimate.</span>
        </div>
      </ScenarioInputCard>
    );
  }

  if (showInputForm && !report) {
    return (
      <ScenarioInputCard
        title="Property Purchase Information"
        subtitle="Provide purchase details to initialize value tracking."
        badge={<StatusChip tone="info">Scenario input</StatusChip>}
      >
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

          <ActionPriorityRow
            primaryAction={
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Analyze Appreciation
              </Button>
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setShowInputForm(false)}>
                Cancel
              </Button>
            }
          />
        </form>
      </ScenarioInputCard>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      <ResultHeroCard
        title="Current Estimated Value"
        value={formatCurrency(report.currentEstimatedValue)}
        status={<StatusChip tone={report.annualAppreciationRate >= 4 ? 'good' : report.annualAppreciationRate >= 2 ? 'info' : 'elevated'}>{report.annualAppreciationRate.toFixed(2)}% annual</StatusChip>}
        summary="Historical appreciation and projected value trajectory for this property."
      />

      <ReadOnlySummaryBlock
        title="Value Snapshot"
        columns={2}
        items={[
          { label: 'Total appreciation', value: formatCurrency(report.totalAppreciation), emphasize: true },
          { label: 'Appreciation %', value: `${report.totalAppreciationPercent.toFixed(2)}%` },
          { label: 'Purchase price', value: formatCurrency(report.purchasePrice) },
          { label: 'Purchase date', value: new Date(report.purchaseDate).toLocaleDateString() },
        ]}
      />

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
