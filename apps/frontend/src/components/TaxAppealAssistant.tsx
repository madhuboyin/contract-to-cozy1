// apps/frontend/src/components/TaxAppealAssistant.tsx
'use client';

import { useState } from 'react';
import { 
  FileText, 
  DollarSign, 
  TrendingDown,
  Upload,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Minus,
  Home,
  Calculator,
  FileCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';

interface TaxBillData {
  parcelId?: string;
  assessedValue: number;
  landValue?: number;
  improvementValue?: number;
  taxRate: number;
  assessmentYear: number;
  propertyAddress?: string;
  propertyType?: string;
  squareFootage?: number;
  lotSize?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface ComparableSale {
  address: string;
  salePrice: number;
  saleDate: string;
  squareFootage?: number;
  source: 'USER_PROVIDED';
}

interface AppealReport {
  propertyId: string;
  propertyAddress: string;
  taxBillData: TaxBillData;
  appealOpportunity: {
    appealProbability: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    confidenceScore: number;
    findings: {
      assessedValue: number;
      estimatedMarketValue: number;
      overassessment: number;
      overassessmentPercent: number;
    };
    estimatedSavings: {
      annualTaxSavings: number;
      totalSavingsOver3Years: number;
    };
    appealReasons: string[];
    comparableEvidence: ComparableSale[];
    appealLetter: string;
    recommendations: string[];
    timeline: {
      filingDeadline?: string;
      generalGuidance: string;
    };
  };
  generatedAt: string;
}

interface TaxAppealAssistantProps {
  propertyId: string;
}

type Step = 'upload' | 'review' | 'market' | 'comparables' | 'notes' | 'report';

export default function TaxAppealAssistant({ propertyId }: TaxAppealAssistantProps) {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Upload
  const [taxBillFile, setTaxBillFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Step 2: Review extracted data
  const [billData, setBillData] = useState<TaxBillData | null>(null);

  // Step 3: Market estimate
  const [userMarketEstimate, setUserMarketEstimate] = useState('');

  // Step 4: Comparables
  const [comparables, setComparables] = useState<ComparableSale[]>([]);

  // Step 5: Notes
  const [propertyConditionNotes, setPropertyConditionNotes] = useState('');

  // Final report
  const [report, setReport] = useState<AppealReport | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setTaxBillFile(file);
      setError('');

      // Auto-extract
      setExtracting(true);
      try {
        const formData = new FormData();
        formData.append('taxBill', file);

        const response = await api.extractTaxBill(formData);
        
        if (response.success && response.data) {
          setBillData(response.data as TaxBillData);
          setCurrentStep('review');
        } else {
          setError(response.message || 'Failed to extract tax bill data');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to extract tax bill data');
      } finally {
        setExtracting(false);
      }
    }
  };

  const addComparable = () => {
    setComparables([
      ...comparables,
      { address: '', salePrice: 0, saleDate: '', source: 'USER_PROVIDED' }
    ]);
  };

  const removeComparable = (index: number) => {
    setComparables(comparables.filter((_, i) => i !== index));
  };

  const updateComparable = (index: number, field: string, value: any) => {
    const updated = [...comparables];
    updated[index] = { ...updated[index], [field]: value };
    setComparables(updated);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.analyzeTaxAppeal({
        propertyId,
        taxBillData: billData!,
        userMarketEstimate: userMarketEstimate ? parseFloat(userMarketEstimate) : undefined,
        comparableSales: comparables.filter(c => c.address && c.salePrice > 0),
        propertyConditionNotes,
      });

      if (response.success && response.data) {
        setReport(response.data as AppealReport);
        setCurrentStep('report');
      } else {
        setError(response.message || 'Failed to analyze appeal opportunity');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze appeal opportunity');
    } finally {
      setLoading(false);
    }
  };

  const getProbabilityColor = (prob: string) => {
    switch (prob) {
      case 'HIGH': return 'bg-green-100 text-green-800 border-green-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'NONE': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Report View
  if (report) {
    const { appealOpportunity } = report;

    return (
      <div className="space-y-6">
        {/* Summary Card */}
        <Card className={`border-2 ${getProbabilityColor(appealOpportunity.appealProbability)}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">Appeal Analysis Complete</h3>
                <p className="text-gray-600">{report.propertyAddress}</p>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold mb-1">{appealOpportunity.appealProbability}</div>
                <div className="text-sm text-gray-600">Appeal Probability</div>
                <div className="text-xs text-gray-500 mt-1">
                  Confidence: {appealOpportunity.confidenceScore}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Findings */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Assessed Value</p>
              <p className="text-2xl font-bold">
                ${appealOpportunity.findings.assessedValue.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Market Value</p>
              <p className="text-2xl font-bold">
                ${appealOpportunity.findings.estimatedMarketValue.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-sm text-red-700">Overassessment</p>
              <p className="text-2xl font-bold text-red-900">
                ${appealOpportunity.findings.overassessment.toLocaleString()}
              </p>
              <p className="text-xs text-red-600">
                {appealOpportunity.findings.overassessmentPercent.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <p className="text-sm text-green-700">Annual Savings</p>
              <p className="text-2xl font-bold text-green-900">
                ${appealOpportunity.estimatedSavings.annualTaxSavings.toLocaleString()}
              </p>
              <p className="text-xs text-green-600">
                ${appealOpportunity.estimatedSavings.totalSavingsOver3Years.toLocaleString()} over 3 years
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Appeal Reasons */}
        {appealOpportunity.appealReasons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Why You Should Appeal</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {appealOpportunity.appealReasons.map((reason, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-800">{reason}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Comparable Evidence */}
        {appealOpportunity.comparableEvidence.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Comparable Sales Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {appealOpportunity.comparableEvidence.map((comp, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-semibold">{comp.address}</p>
                      <p className="text-sm text-gray-600">Sold: {comp.saleDate}</p>
                    </div>
                    <p className="text-lg font-bold">${comp.salePrice.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Appeal Letter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Your Appeal Letter (Ready to Submit)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap font-mono text-sm">
              {appealOpportunity.appealLetter}
            </div>
            <Button className="mt-4" onClick={() => navigator.clipboard.writeText(appealOpportunity.appealLetter)}>
              Copy Letter to Clipboard
            </Button>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Next Steps & Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {appealOpportunity.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className="text-gray-800">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Timeline */}
        {appealOpportunity.timeline.filingDeadline && (
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle>Important Deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-blue-700 font-semibold">Filing Deadline:</p>
                  <p className="text-lg font-bold text-blue-900">{appealOpportunity.timeline.filingDeadline}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-700 font-semibold">Process:</p>
                  <p className="text-gray-800">{appealOpportunity.timeline.generalGuidance}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Card className="bg-gray-50">
          <CardContent className="p-4 flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Generated on {new Date(report.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" onClick={() => {
              setReport(null);
              setCurrentStep('upload');
              setTaxBillFile(null);
              setBillData(null);
              setUserMarketEstimate('');
              setComparables([]);
              setPropertyConditionNotes('');
            }}>
              New Analysis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multi-step wizard
  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {(['upload', 'review', 'market', 'comparables', 'notes'] as Step[]).map((step, index) => {
              const stepNames = {
                upload: '1. Upload Bill',
                review: '2. Review Data',
                market: '3. Market Value',
                comparables: '4. Comparables',
                notes: '5. Property Notes',
              };
              
              const isActive = currentStep === step;
              const isComplete = ['upload', 'review', 'market', 'comparables', 'notes'].indexOf(currentStep) > index;

              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center gap-2 ${isActive ? 'text-blue-600 font-bold' : isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                    {isComplete ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">{index + 1}</div>}
                    <span className="text-sm hidden md:inline">{stepNames[step as keyof typeof stepNames]}</span>
                  </div>
                  {index < 4 && <div className="w-8 md:w-16 h-0.5 bg-gray-300 mx-2" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload */}
      {currentStep === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Your Property Tax Bill</CardTitle>
            <p className="text-sm text-gray-600">
              Upload your latest property tax bill (PDF or image). AI will extract all relevant data.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
              <div className="flex flex-col items-center justify-center">
                <FileText className="w-12 h-12 text-gray-400 mb-4" />
                <label htmlFor="taxBill" className="cursor-pointer">
                  <div className="text-center">
                    <span className="text-lg font-semibold text-gray-700">Click to upload tax bill</span>
                    <p className="text-sm text-gray-500 mt-1">PDF or image file</p>
                  </div>
                  <input
                    id="taxBill"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={extracting}
                  />
                </label>
                {taxBillFile && (
                  <div className="mt-4 text-center">
                    <p className="text-sm font-semibold text-green-600">{taxBillFile.name}</p>
                  </div>
                )}
                {extracting && (
                  <div className="mt-4 flex items-center gap-2 text-blue-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Extracting data from tax bill...</span>
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
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review extracted data */}
      {currentStep === 'review' && billData && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Confirm Tax Bill Data</CardTitle>
            <p className="text-sm text-gray-600">
              AI extracted this data. Please review and correct if needed.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Assessed Value *</Label>
                <Input
                  type="number"
                  value={billData.assessedValue}
                  onChange={(e) => setBillData({ ...billData, assessedValue: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label>Tax Rate (%) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={billData.taxRate}
                  onChange={(e) => setBillData({ ...billData, taxRate: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label>Assessment Year *</Label>
                <Input
                  type="number"
                  value={billData.assessmentYear}
                  onChange={(e) => setBillData({ ...billData, assessmentYear: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Parcel ID</Label>
                <Input
                  value={billData.parcelId || ''}
                  onChange={(e) => setBillData({ ...billData, parcelId: e.target.value })}
                />
              </div>
              <div>
                <Label>Square Footage</Label>
                <Input
                  type="number"
                  value={billData.squareFootage || ''}
                  onChange={(e) => setBillData({ ...billData, squareFootage: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Property Type</Label>
                <Input
                  value={billData.propertyType || ''}
                  onChange={(e) => setBillData({ ...billData, propertyType: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setCurrentStep('market')}>
                Continue to Market Value
              </Button>
              <Button variant="outline" onClick={() => setCurrentStep('upload')}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Market estimate (optional) */}
      {currentStep === 'market' && (
        <Card>
          <CardHeader>
            <CardTitle>Market Value Estimate (Optional)</CardTitle>
            <p className="text-sm text-gray-600">
              What do you think your property is worth? Check Zillow, Redfin, or recent sales in your area.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Your Estimated Market Value</Label>
              <Input
                type="number"
                placeholder="e.g., 380000"
                value={userMarketEstimate}
                onChange={(e) => setUserMarketEstimate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Tip: Look up recent sales on Zillow or Redfin for similar homes in your neighborhood
              </p>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                💡 <strong>Optional but helpful:</strong> Providing your market estimate improves appeal analysis accuracy.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setCurrentStep('comparables')}>
                Continue to Comparables
              </Button>
              <Button variant="outline" onClick={() => setCurrentStep('review')}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Comparables (optional) */}
      {currentStep === 'comparables' && (
        <Card>
          <CardHeader>
            <CardTitle>Comparable Sales (Optional)</CardTitle>
            <p className="text-sm text-gray-600">
              Add recent sales of similar homes in your area to strengthen your appeal.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {comparables.map((comp, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded border border-gray-200">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold">Comparable #{index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeComparable(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Address</Label>
                    <Input
                      placeholder="123 Main St"
                      value={comp.address}
                      onChange={(e) => updateComparable(index, 'address', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sale Price</Label>
                    <Input
                      type="number"
                      placeholder="375000"
                      value={comp.salePrice || ''}
                      onChange={(e) => updateComparable(index, 'salePrice', parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sale Date</Label>
                    <Input
                      type="date"
                      value={comp.saleDate}
                      onChange={(e) => updateComparable(index, 'saleDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addComparable}>
              <Plus className="w-4 h-4 mr-2" />
              Add Comparable Sale
            </Button>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                💡 <strong>Tip:</strong> At least 3 comparable sales from the last 6 months greatly strengthens your appeal.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setCurrentStep('notes')}>
                Continue to Property Notes
              </Button>
              <Button variant="outline" onClick={() => setCurrentStep('market')}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Property notes (optional) */}
      {currentStep === 'notes' && (
        <Card>
          <CardHeader>
            <CardTitle>Property Condition Notes (Optional)</CardTitle>
            <p className="text-sm text-gray-600">
              Mention any issues that might affect your property value.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Property Condition & Issues</Label>
              <Textarea
                placeholder="e.g., Roof needs replacement, outdated kitchen, foundation crack in basement, etc."
                rows={4}
                value={propertyConditionNotes}
                onChange={(e) => setPropertyConditionNotes(e.target.value)}
              />
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Note:</strong> Document issues with photos for your appeal submission.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAnalyze} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Appeal Opportunity...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4 mr-2" />
                    Generate Appeal Analysis
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setCurrentStep('comparables')}>
                Back
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}