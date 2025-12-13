// apps/frontend/src/components/EnergyAuditor.tsx
'use client';

import { useState } from 'react';
import { 
  Zap, 
  TrendingDown, 
  DollarSign,
  Leaf,
  Lightbulb,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api/client';

interface EnergyRecommendation {
  title: string;
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedSavings: {
    kWhPerYear: number;
    dollarsPerYear: number;
    percentReduction: number;
  };
  implementationCost: number;
  paybackMonths: number;
  difficulty: 'EASY' | 'MODERATE' | 'PROFESSIONAL';
  description: string;
  steps: string[];
}

interface EnergyAuditReport {
  propertyId: string;
  propertyAddress: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  annualUsage: {
    totalKWh: number;
    totalCost: number;
    kWhPerSqFt: number;
  };
  comparison: {
    vsStateAverage: number;
    vsEnergyStar: number;
    vsEfficientHome: number;
  };
  breakdown: {
    category: string;
    estimatedKWh: number;
    estimatedCost: number;
    percentage: number;
  }[];
  recommendations: EnergyRecommendation[];
  carbonFootprint: {
    annualCO2Pounds: number;
    equivalentTrees: number;
    equivalentCarMiles: number;
  };
  potentialSavings: {
    annualKWhSavings: number;
    annualCostSavings: number;
    percentageReduction: number;
  };
  generatedAt: string;
}

interface EnergyAuditorProps {
  propertyId: string;
  squareFootage?: number;
}

export default function EnergyAuditor({ propertyId, squareFootage: propSquareFootage }: EnergyAuditorProps) {
  const [report, setReport] = useState<EnergyAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [averageMonthlyKWh, setAverageMonthlyKWh] = useState('');
  const [averageMonthlyBill, setAverageMonthlyBill] = useState('');
  const [squareFootage, setSquareFootage] = useState(propSquareFootage?.toString() || '');
  const [occupants, setOccupants] = useState('');
  const [summerPeakKWh, setSummerPeakKWh] = useState('');
  const [winterPeakKWh, setWinterPeakKWh] = useState('');
  
  // Appliances
  const [hasElectricHeat, setHasElectricHeat] = useState(false);
  const [hasElectricWaterHeater, setHasElectricWaterHeater] = useState(false);
  const [hasCentralAC, setHasCentralAC] = useState(false);
  const [hasPool, setHasPool] = useState(false);
  const [hasSolarPanels, setHasSolarPanels] = useState(false);

  // Bill uploads
  const [billFiles, setBillFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 3);
      setBillFiles(files);
    }
  };

  const removeBillFile = (index: number) => {
    setBillFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('propertyId', propertyId);
      formData.append('averageMonthlyKWh', averageMonthlyKWh);
      formData.append('averageMonthlyBill', averageMonthlyBill);
      formData.append('squareFootage', squareFootage);
      formData.append('occupants', occupants);
      
      if (summerPeakKWh) formData.append('summerPeakKWh', summerPeakKWh);
      if (winterPeakKWh) formData.append('winterPeakKWh', winterPeakKWh);
      
      formData.append('hasElectricHeat', hasElectricHeat.toString());
      formData.append('hasElectricWaterHeater', hasElectricWaterHeater.toString());
      formData.append('hasCentralAC', hasCentralAC.toString());
      formData.append('hasPool', hasPool.toString());
      formData.append('hasSolarPanels', hasSolarPanels.toString());

      billFiles.forEach(file => {
        formData.append('bills', file);
      });

      const response = await api.getEnergyAudit(formData);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to generate energy audit');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate energy audit');
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-100 text-green-800 border-green-300';
      case 'B': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'D': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'F': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY': return '✓';
      case 'MODERATE': return '⚡';
      case 'PROFESSIONAL': return '🔧';
      default: return '';
    }
  };

  if (report) {
    return (
      <div className="space-y-6">
        {/* Header Score Card */}
        <Card className={`border-2 ${getGradeColor(report.grade)}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">Energy Efficiency Score</h3>
                <p className="text-gray-600">{report.propertyAddress}</p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold">{report.grade}</div>
                <div className="text-2xl text-gray-600">{report.score}/100</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Annual Usage</p>
                  <p className="text-2xl font-bold">{report.annualUsage.totalKWh.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">kWh/year</p>
                </div>
                <Zap className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Annual Cost</p>
                  <p className="text-2xl font-bold">${report.annualUsage.totalCost.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">per year</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700">Potential Savings</p>
                  <p className="text-2xl font-bold text-green-900">${report.potentialSavings.annualCostSavings.toLocaleString()}</p>
                  <p className="text-xs text-green-600">{report.potentialSavings.percentageReduction}% reduction</p>
                </div>
                <TrendingDown className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Carbon Footprint</p>
                  <p className="text-2xl font-bold">{(report.carbonFootprint.annualCO2Pounds / 1000).toFixed(1)}k</p>
                  <p className="text-xs text-gray-500">lbs CO₂/year</p>
                </div>
                <Leaf className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>How You Compare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">vs. State Average</span>
                  <span className={`text-sm font-bold ${report.comparison.vsStateAverage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {report.comparison.vsStateAverage > 0 ? '+' : ''}{report.comparison.vsStateAverage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${report.comparison.vsStateAverage > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(report.comparison.vsStateAverage))}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">vs. Energy Star Target</span>
                  <span className={`text-sm font-bold ${report.comparison.vsEnergyStar > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {report.comparison.vsEnergyStar > 0 ? '+' : ''}{report.comparison.vsEnergyStar}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${report.comparison.vsEnergyStar > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(report.comparison.vsEnergyStar))}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Energy Usage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.breakdown.map((item, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{item.category}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold">{item.estimatedKWh.toLocaleString()} kWh</span>
                      <span className="text-xs text-gray-500 ml-2">(${item.estimatedCost})</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Personalized Recommendations</h3>
          <div className="space-y-4">
            {report.recommendations.map((rec, index) => (
              <Card key={index} className="border-l-4 border-l-blue-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{getDifficultyIcon(rec.difficulty)}</span>
                        <div>
                          <h4 className="font-bold text-lg">{rec.title}</h4>
                          <p className="text-sm text-gray-600">{rec.description}</p>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(rec.priority)}`}>
                      {rec.priority}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-green-50 p-3 rounded">
                      <p className="text-xs text-green-700">Annual Savings</p>
                      <p className="font-bold text-green-900">${rec.estimatedSavings.dollarsPerYear}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="text-xs text-blue-700">Energy Saved</p>
                      <p className="font-bold text-blue-900">{rec.estimatedSavings.kWhPerYear} kWh</p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded">
                      <p className="text-xs text-orange-700">Cost</p>
                      <p className="font-bold text-orange-900">${rec.implementationCost}</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded">
                      <p className="text-xs text-purple-700">Payback</p>
                      <p className="font-bold text-purple-900">{rec.paybackMonths} mo</p>
                    </div>
                  </div>

                  {rec.steps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Implementation Steps:</p>
                      <ul className="space-y-1">
                        {rec.steps.map((step, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Carbon Impact */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-green-600" />
              Environmental Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-green-900">{report.carbonFootprint.annualCO2Pounds.toLocaleString()}</p>
                <p className="text-sm text-green-700">lbs CO₂ per year</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-900">{report.carbonFootprint.equivalentTrees}</p>
                <p className="text-sm text-green-700">trees needed to offset</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-900">{report.carbonFootprint.equivalentCarMiles.toLocaleString()}</p>
                <p className="text-sm text-green-700">equivalent car miles</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="bg-gray-50">
          <CardContent className="p-4 flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Generated on {new Date(report.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" onClick={() => setReport(null)}>
              Start New Audit
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Energy Usage Information</CardTitle>
        <p className="text-sm text-gray-600">
          Provide your energy usage details. Optionally upload 2-3 sample bills for better accuracy.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Usage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="monthlyKWh">Average Monthly Usage (kWh) *</Label>
              <Input
                id="monthlyKWh"
                type="number"
                placeholder="850"
                value={averageMonthlyKWh}
                onChange={(e) => setAverageMonthlyKWh(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Find this on any utility bill</p>
            </div>

            <div>
              <Label htmlFor="monthlyBill">Average Monthly Bill ($) *</Label>
              <Input
                id="monthlyBill"
                type="number"
                step="0.01"
                placeholder="120"
                value={averageMonthlyBill}
                onChange={(e) => setAverageMonthlyBill(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Property Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="squareFootage">Home Size (sq ft) *</Label>
              <Input
                id="squareFootage"
                type="number"
                placeholder="2000"
                value={squareFootage}
                onChange={(e) => setSquareFootage(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="occupants">Number of Occupants *</Label>
              <Input
                id="occupants"
                type="number"
                placeholder="3"
                value={occupants}
                onChange={(e) => setOccupants(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Seasonal Data (Optional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="summerPeak">Summer Peak kWh (Optional)</Label>
              <Input
                id="summerPeak"
                type="number"
                placeholder="1200"
                value={summerPeakKWh}
                onChange={(e) => setSummerPeakKWh(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Highest summer month</p>
            </div>

            <div>
              <Label htmlFor="winterPeak">Winter Peak kWh (Optional)</Label>
              <Input
                id="winterPeak"
                type="number"
                placeholder="900"
                value={winterPeakKWh}
                onChange={(e) => setWinterPeakKWh(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Highest winter month</p>
            </div>
          </div>

          {/* Appliances */}
          <div>
            <Label className="mb-3 block">Appliances & Systems</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="electricHeat"
                  checked={hasElectricHeat}
                  onCheckedChange={(checked) => setHasElectricHeat(checked as boolean)}
                />
                <Label htmlFor="electricHeat" className="font-normal cursor-pointer">
                  Electric Heat
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="electricWaterHeater"
                  checked={hasElectricWaterHeater}
                  onCheckedChange={(checked) => setHasElectricWaterHeater(checked as boolean)}
                />
                <Label htmlFor="electricWaterHeater" className="font-normal cursor-pointer">
                  Electric Water Heater
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="centralAC"
                  checked={hasCentralAC}
                  onCheckedChange={(checked) => setHasCentralAC(checked as boolean)}
                />
                <Label htmlFor="centralAC" className="font-normal cursor-pointer">
                  Central Air Conditioning
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pool"
                  checked={hasPool}
                  onCheckedChange={(checked) => setHasPool(checked as boolean)}
                />
                <Label htmlFor="pool" className="font-normal cursor-pointer">
                  Swimming Pool
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="solar"
                  checked={hasSolarPanels}
                  onCheckedChange={(checked) => setHasSolarPanels(checked as boolean)}
                />
                <Label htmlFor="solar" className="font-normal cursor-pointer">
                  Solar Panels
                </Label>
              </div>
            </div>
          </div>

          {/* Bill Upload (Optional) */}
          <div>
            <Label>Upload Sample Bills (Optional)</Label>
            <p className="text-xs text-gray-500 mb-2">
              Upload 2-3 utility bills (PDF or image) for better seasonal analysis. We'll only extract key numbers.
            </p>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="flex items-center justify-center">
                <label htmlFor="bills" className="cursor-pointer flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">Click to upload bills</span>
                  <span className="text-xs text-gray-500 mt-1">Max 3 files, PDF or images</span>
                  <input
                    id="bills"
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {billFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {billFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeBillFile(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Energy Audit...
              </>
            ) : (
              <>
                <Lightbulb className="w-4 h-4 mr-2" />
                Generate Energy Audit
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}