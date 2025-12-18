// apps/frontend/src/components/InspectionReportAnalyzer.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileText, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  DollarSign,
  Calendar,
  TrendingDown,
  Mail,
  Home,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/api/client';

interface InspectionIssue {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'COSMETIC';
  urgency: string;
  isCritical: boolean;
  estimatedCost: number;
  costRange: { min: number; max: number };
  repairRecommendations: string[];
  preventativeMeasures: string[];
  estimatedRepairTime?: string;
  needsImmediateAction: boolean;
  scheduledMaintenanceDate?: string | Date;
  maintenanceFrequency?: string;
}

interface InspectionReport {
  id: string;
  propertyId: string;
  pdfFileName: string;
  overallScore: number;
  overallCondition: string;
  totalIssuesFound: number;
  criticalIssues: number;
  highPriorityIssues: number;
  totalRepairCost: number;
  criticalRepairCost: number;
  recommendedRepairCost: number;
  negotiationScript: string;
  suggestedCredit: number;
  negotiationPoints: any[];
  marketContext: string;
  analysisCompleted: boolean;
  issues: InspectionIssue[];
  property: any;
  createdAt: string;
}

interface Props {
  propertyId: string;
}

export default function InspectionReportAnalyzer({ propertyId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'negotiation' | 'calendar'>('overview');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }
      if (selectedFile.size > 25 * 1024 * 1024) {
        setError('File size must be less than 25MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('propertyId', propertyId);

    try {
      const response = await api.uploadInspectionReport(formData);
      
      if (response.success && response.data?.reportId) {
        // Fetch the full report
        const reportResponse = await api.getInspectionReport(response.data.reportId);
        if (reportResponse.success && reportResponse.data) {
          setReport(reportResponse.data);
          setFile(null);
        }
      } else {
        setError(response.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload and analyze report');
    } finally {
      setUploading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-700 bg-red-50 border-red-200';
      case 'HIGH': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'COSMETIC': return 'text-gray-700 bg-gray-50 border-gray-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'EXCELLENT': return 'text-green-700 bg-green-50';
      case 'GOOD': return 'text-blue-700 bg-blue-50';
      case 'FAIR': return 'text-yellow-700 bg-yellow-50';
      case 'POOR': return 'text-orange-700 bg-orange-50';
      case 'CRITICAL': return 'text-red-700 bg-red-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  const copyNegotiationScript = () => {
    if (report?.negotiationScript) {
      navigator.clipboard.writeText(report.negotiationScript);
    }
  };

  // Upload View
  if (!report) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              Upload Inspection Report
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Upload your home inspection PDF and get AI-powered analysis with severity scoring,
              cost estimates, and negotiation guidance.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
              <div className="flex flex-col items-center justify-center">
                <FileText className="w-12 h-12 text-gray-400 mb-4" />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="text-center">
                    <span className="text-lg font-semibold text-gray-700">
                      Click to upload inspection report
                    </span>
                    <p className="text-sm text-gray-500 mt-1">PDF format, max 25MB</p>
                  </div>
                  <input
                    id="pdf-upload"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => document.getElementById('pdf-upload')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Select PDF
                </Button>
              </div>
            </div>

            {/* Selected File */}
            {file && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-600">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Analyze Report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">What You'll Get:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>✓ AI extraction of all inspection issues</li>
                <li>✓ Severity scoring (Critical vs Cosmetic)</li>
                <li>✓ Detailed repair cost estimates</li>
                <li>✓ Professional negotiation script</li>
                <li>✓ Future maintenance calendar</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Report View
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className={getConditionColor(report.overallCondition)}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Inspection Analysis Complete</h2>
              <p className="text-sm opacity-80">{report.property.address}</p>
              <p className="text-xs opacity-70 mt-1">
                Analyzed on {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{report.overallScore}</div>
              <div className="text-sm font-semibold">{report.overallCondition}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'issues'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Issues ({report.totalIssuesFound})
        </button>
        <button
          onClick={() => setActiveTab('negotiation')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'negotiation'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Negotiation
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'calendar'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Maintenance
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Issues</p>
                  <p className="text-3xl font-bold mt-1">{report.totalIssuesFound}</p>
                </div>
                <AlertTriangle className="w-10 h-10 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Critical Issues</p>
                  <p className="text-3xl font-bold mt-1 text-red-600">
                    {report.criticalIssues}
                  </p>
                </div>
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Repair Cost</p>
                  <p className="text-3xl font-bold mt-1">
                    ${report.totalRepairCost.toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-10 h-10 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Critical Repairs</span>
                  <span className="font-bold text-red-600">
                    ${report.criticalRepairCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Recommended Repairs</span>
                  <span className="font-bold text-orange-600">
                    ${report.recommendedRepairCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="font-semibold text-gray-900">Suggested Negotiation Credit</span>
                  <span className="font-bold text-indigo-600 text-xl">
                    ${report.suggestedCredit.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {report.issues.map((issue) => (
            <Card key={issue.id} className={`border-l-4 ${getSeverityColor(issue.severity)}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg">{issue.title}</h3>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getSeverityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      {issue.needsImmediateAction && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">
                          IMMEDIATE ACTION
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{issue.location} • {issue.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">${issue.estimatedCost.toLocaleString()}</p>
                    <p className="text-xs text-gray-600">
                      ${issue.costRange.min.toLocaleString()} - ${issue.costRange.max.toLocaleString()}
                    </p>
                  </div>
                </div>

                <p className="text-gray-700 mb-3">{issue.description}</p>

                {issue.repairRecommendations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Repair Recommendations:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {issue.repairRecommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {issue.preventativeMeasures.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Preventative Measures:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {issue.preventativeMeasures.map((measure, i) => (
                        <li key={i}>{measure}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {issue.estimatedRepairTime && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Estimated repair time: {issue.estimatedRepairTime}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Negotiation Tab */}
      {activeTab === 'negotiation' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600" />
                Professional Negotiation Script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                  {report.negotiationScript}
                </pre>
              </div>
              <Button onClick={copyNegotiationScript} variant="outline">
                Copy to Clipboard
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Negotiation Points</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.negotiationPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{point}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {report.marketContext && (
            <Card>
              <CardHeader>
                <CardTitle>Market Context</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{report.marketContext}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Maintenance Calendar Tab */}
      {activeTab === 'calendar' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Future Maintenance Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.issues
                .filter(issue => issue.needsImmediateAction || issue.maintenanceFrequency)
                .map((issue) => (
                  <div key={issue.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Wrench className="w-5 h-5 text-gray-600 mt-1" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{issue.title}</h4>
                      <p className="text-sm text-gray-600">{issue.location}</p>
                      {issue.maintenanceFrequency && (
                        <p className="text-sm text-gray-600 mt-1">
                          Schedule: {issue.maintenanceFrequency}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${getSeverityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Report: {report.pdfFileName}
            </p>
            <Button
              variant="outline"
              onClick={() => setReport(null)}
            >
              Upload New Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}