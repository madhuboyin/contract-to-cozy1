'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar, PieChart, Lightbulb, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import {
  ActionPriorityRow,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

interface MonthlyForecast {
  month: string;
  routine: number;
  preventive: number;
  unexpected: number;
  total: number;
  tasks: string[];
}

interface CategoryBreakdown {
  category: string;
  annualCost: number;
  percentage: number;
  items: string[];
}

interface BudgetRecommendation {
  title: string;
  why?: string;
  costOfDelay?: string;
}

interface NormalizedRecommendation {
  title: string;
  why: string;
  costOfDelay: string;
}

interface BudgetForecast {
  propertyId: string;
  propertyAddress: string;
  propertyAge: number;
  totalAnnualCost: number;
  monthlyAverage: number;
  confidenceLevel: number;
  monthlyForecasts: MonthlyForecast[];
  categoryBreakdowns: CategoryBreakdown[];
  recommendations: Array<string | BudgetRecommendation>;
  generatedAt: string;
}

interface BudgetForecasterProps {
  propertyId: string;
}

function formatDelayEstimate(monthlyAverage: number) {
  const low = Math.max(200, Math.round(monthlyAverage * 0.3));
  const high = Math.max(low + 100, Math.round(monthlyAverage * 0.8));
  return `$${low.toLocaleString()}–$${high.toLocaleString()}`;
}

function inferRecommendationDetails(
  recommendationTitle: string,
  monthlyAverage: number,
  propertyAge: number
): Pick<NormalizedRecommendation, 'why' | 'costOfDelay'> {
  const normalized = recommendationTitle.toLowerCase();
  const delayRange = formatDelayEstimate(monthlyAverage);

  if (/(hvac|furnace|heat|ac|cooling)/.test(normalized)) {
    return {
      why: 'HVAC systems are a top budget driver, and preventive work reduces the chance of expensive seasonal failures.',
      costOfDelay: `Delaying can turn routine service into an emergency call, often adding ${delayRange} within the next year.`,
    };
  }

  if (/(roof|gutter|leak|water|plumb)/.test(normalized)) {
    return {
      why: 'Water-related issues compound quickly and can damage multiple systems if left unresolved.',
      costOfDelay: `Waiting can escalate from a single repair to broader remediation, often increasing spend by ${delayRange}.`,
    };
  }

  if (/(electrical|panel|wiring|circuit)/.test(normalized)) {
    return {
      why: 'Electrical reliability protects both safety and appliance lifespan, especially as homes age.',
      costOfDelay: `Postponing can increase failure risk and urgent troubleshooting costs by ${delayRange}.`,
    };
  }

  return {
    why: `This recommendation targets a meaningful maintenance cost driver for a ${propertyAge}-year-old home.`,
    costOfDelay: `Deferring this work can increase next-year maintenance spend by an estimated ${delayRange}.`,
  };
}

function normalizeRecommendation(
  recommendation: string | BudgetRecommendation,
  monthlyAverage: number,
  propertyAge: number
): NormalizedRecommendation {
  if (typeof recommendation === 'string') {
    const inferred = inferRecommendationDetails(recommendation, monthlyAverage, propertyAge);
    return {
      title: recommendation,
      ...inferred,
    };
  }

  const title = recommendation.title;
  const inferred = inferRecommendationDetails(title, monthlyAverage, propertyAge);
  return {
    title,
    why: recommendation.why || inferred.why,
    costOfDelay: recommendation.costOfDelay || inferred.costOfDelay,
  };
}

export default function BudgetForecaster({ propertyId }: BudgetForecasterProps) {
  const [forecast, setForecast] = useState<BudgetForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [view, setView] = useState<'monthly' | 'category'>('monthly');

  useEffect(() => {
    loadForecast();
  }, [propertyId]);

  const loadForecast = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.getBudgetForecast(propertyId);
      
      if (response.success && response.data) {
        setForecast(response.data);
      } else {
        setError(response.message || 'Failed to load forecast');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScenarioInputCard
        title="Generating budget forecast"
        subtitle="Building a 12-month projection from your property profile."
        badge={<StatusChip tone="info">In progress</StatusChip>}
      >
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Crunching monthly and category-level costs.</span>
        </div>
      </ScenarioInputCard>
    );
  }

  if (error) {
    return (
      <ScenarioInputCard
        title="Unable to load forecast"
        subtitle={error}
        badge={<StatusChip tone="danger">Error</StatusChip>}
        actions={
          <ActionPriorityRow
            primaryAction={
              <Button onClick={loadForecast}>
                Retry
              </Button>
            }
          />
        }
      >
        <p className="text-sm text-red-700">Try again to refresh the projection data.</p>
      </ScenarioInputCard>
    );
  }

  if (!forecast) {
    return null;
  }

  const maxMonthly = forecast.monthlyForecasts.length > 0
    ? Math.max(...forecast.monthlyForecasts.map(m => m.total))
    : 1;
  const normalizedRecommendations = forecast.recommendations.map((recommendation) =>
    normalizeRecommendation(recommendation, forecast.monthlyAverage, forecast.propertyAge)
  );

  return (
    <div className="space-y-6">
      <ResultHeroCard
        title="Annual Maintenance Budget"
        value={`$${forecast.totalAnnualCost.toLocaleString()}`}
        status={<StatusChip tone="info">{forecast.confidenceLevel}% confidence</StatusChip>}
        summary="Projected routine, preventive, and unexpected maintenance spend over the next 12 months."
      />

      <ReadOnlySummaryBlock
        title="Forecast Snapshot"
        columns={2}
        items={[
          { label: 'Monthly average', value: `$${forecast.monthlyAverage.toLocaleString()}`, emphasize: true },
          { label: 'Property age', value: `${forecast.propertyAge} years` },
          { label: 'Address', value: forecast.propertyAddress || 'Property', hint: 'Forecast scope' },
          { label: 'Generated', value: forecast.generatedAt ? new Date(forecast.generatedAt).toLocaleDateString() : 'Unknown' },
        ]}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Annual Budget</p>
                <p className="text-2xl font-bold text-blue-900">
                  ${forecast.totalAnnualCost.toLocaleString()}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Average</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${forecast.monthlyAverage.toLocaleString()}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Property Age</p>
                <p className="text-2xl font-bold text-gray-900">
                  {forecast.propertyAge} years
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Confidence</p>
                <p className="text-2xl font-bold text-green-900">{forecast.confidenceLevel}%</p>
              </div>
              <PieChart className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setView('monthly')}
          className={`px-4 py-2 font-medium transition-colors ${
            view === 'monthly'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Monthly Breakdown
        </button>
        <button
          onClick={() => setView('category')}
          className={`px-4 py-2 font-medium transition-colors ${
            view === 'category'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Category Breakdown
        </button>
      </div>

      {/* Monthly View */}
      {view === 'monthly' && (
        <div className="space-y-3">
          {forecast.monthlyForecasts.map((month) => {
            const isExpanded = expandedMonth === month.month;
            const barWidth = (month.total / maxMonthly) * 100;

            return (
              <Card key={month.month} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-semibold text-gray-900 w-24">{month.month}</span>
                      <div className="flex-1">
                        <div className="w-full bg-gray-200 rounded-full h-8 relative overflow-hidden">
                          <div
                            className="h-8 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-end pr-3 transition-all"
                            style={{ width: `${barWidth}%` }}
                          >
                            <span className="text-white text-sm font-bold">
                              ${month.total.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedMonth(isExpanded ? null : month.month)}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Routine</p>
                          <p className="font-semibold text-gray-900">${month.routine}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Preventive</p>
                          <p className="font-semibold text-gray-900">${month.preventive}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Unexpected</p>
                          <p className="font-semibold text-gray-900">${month.unexpected}</p>
                        </div>
                      </div>
                      
                      {month.tasks.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Seasonal Tasks:</p>
                          <div className="flex flex-wrap gap-2">
                            {month.tasks.map((task) => (
                              <span
                                key={`${month.month}:${task}`}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                              >
                                {task}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Category View */}
      {view === 'category' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forecast.categoryBreakdowns.map((category) => (
            <Card key={category.category}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>{category.category}</span>
                  <span className="text-blue-600">{category.percentage}%</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3">
                  <p className="text-3xl font-bold text-gray-900">
                    ${category.annualCost.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">per year</p>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className="h-2 bg-blue-600 rounded-full"
                    style={{ width: `${category.percentage}%` }}
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Typical Items:</p>
                  <ul className="space-y-1">
                    {category.items.map((item) => (
                      <li key={`${category.category}:${item}`} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-blue-600 mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AI Recommendations */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            AI Budget Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {normalizedRecommendations.map((recommendation, index) => (
              <li
                key={`${recommendation.title}:${index}`}
                className="rounded-xl border border-purple-200/80 bg-white/85 p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="space-y-2.5">
                    <p className="mb-0 font-medium text-gray-900">{recommendation.title}</p>
                    <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-teal-800">Why this matters</p>
                      <p className="mb-0 text-sm text-teal-900">{recommendation.why}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Cost of delay</p>
                      <p className="mb-0 text-sm text-amber-900">{recommendation.costOfDelay}</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <p className="text-xs text-gray-600 text-center">
            Forecast based on property type, age, and location. Actual costs may vary. 
            Generated on {forecast.generatedAt ? new Date(forecast.generatedAt).toLocaleString() : 'Unknown'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
