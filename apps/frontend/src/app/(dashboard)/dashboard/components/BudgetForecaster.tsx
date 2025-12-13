'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar, PieChart, Lightbulb, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

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

interface BudgetForecast {
  propertyId: string;
  propertyAddress: string;
  propertyAge: number;
  totalAnnualCost: number;
  monthlyAverage: number;
  confidenceLevel: number;
  monthlyForecasts: MonthlyForecast[];
  categoryBreakdowns: CategoryBreakdown[];
  recommendations: string[];
  generatedAt: string;
}

interface BudgetForecasterProps {
  propertyId: string;
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
    } catch (err: any) {
      setError(err.message || 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Generating budget forecast...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-800">{error}</p>
          <Button onClick={loadForecast} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return null;
  }

  const maxMonthly = Math.max(...forecast.monthlyForecasts.map(m => m.total));

  return (
    <div className="space-y-6">
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
          {forecast.monthlyForecasts.map((month, index) => {
            const isExpanded = expandedMonth === month.month;
            const barWidth = (month.total / maxMonthly) * 100;

            return (
              <Card key={index} className="hover:shadow-md transition-shadow">
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
                            {month.tasks.map((task, i) => (
                              <span
                                key={i}
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
          {forecast.categoryBreakdowns.map((category, index) => (
            <Card key={index}>
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
                    {category.items.map((item, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
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
            {forecast.recommendations.map((rec, index) => (
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
            Forecast based on property type, age, and location. Actual costs may vary. 
            Generated on {new Date(forecast.generatedAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}