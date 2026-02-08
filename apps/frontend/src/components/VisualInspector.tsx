// apps/frontend/src/components/VisualInspector.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  Camera, 
  AlertTriangle, 
  CheckCircle,
  DollarSign,
  Upload,
  X,
  Loader2,
  Home,
  Wrench,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';

interface DetectedIssue {
  title: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  location: string;
  estimatedCost: number;
  urgency: 'IMMEDIATE' | 'SOON' | 'PLAN' | 'OPTIONAL';
  recommendations: string[];
  preventativeMeasures?: string[];
}

interface ImageAnalysis {
  imageId: string;
  roomType: string;
  overallCondition: string;
  conditionScore: number;
  detectedIssues: DetectedIssue[];
  positiveFeatures: string[];
  generalObservations: string[];
}

interface InspectionReport {
  propertyId: string;
  propertyAddress: string;
  inspectionDate: string;
  overallScore: number;
  overallCondition: string;
  imageAnalyses: ImageAnalysis[];
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highPriorityIssues: number;
    estimatedRepairCost: number;
  };
  issuesByCategory: {
    category: string;
    count: number;
    totalCost: number;
  }[];
  prioritizedActions: DetectedIssue[];
  generatedAt: string;
}

interface VisualInspectorProps {
  propertyId: string;
}

const ROOM_TYPES = [
  'Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Dining Room',
  'Basement', 'Attic', 'Garage', 'Exterior', 'Roof',
  'Laundry Room', 'Office', 'Hallway', 'Other'
];

export default function VisualInspector({ propertyId }: VisualInspectorProps) {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [images, setImages] = useState<{ file: File; preview: string; roomType: string }[]>([]);

  // Revoke all object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).slice(0, 20 - images.length);
      
      const newImages = newFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        roomType: 'Other',
      }));

      setImages(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = prev.filter((_, i) => i !== index);
      URL.revokeObjectURL(prev[index].preview);
      return newImages;
    });
  };

  const updateRoomType = (index: number, roomType: string) => {
    setImages(prev => prev.map((img, i) => 
      i === index ? { ...img, roomType } : img
    ));
  };

  const handleAnalyze = async () => {
    if (images.length === 0) {
      setError('Please upload at least one image');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('propertyId', propertyId);
      
      images.forEach(img => {
        formData.append('images', img.file);
      });
      
      formData.append('roomTypes', JSON.stringify(images.map(img => img.roomType)));

      const response = await api.analyzePropertyImages(formData);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to analyze images');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze images');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'EXCELLENT': return 'bg-green-100 text-green-800 border-green-300';
      case 'GOOD': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'FAIR': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'POOR': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'IMMEDIATE': return '🚨';
      case 'SOON': return '⚠️';
      case 'PLAN': return '📅';
      case 'OPTIONAL': return '💡';
      default: return '';
    }
  };

  if (report) {
    return (
      <div className="space-y-6">
        {/* Overall Summary Card */}
        <Card className={`border-2 ${getConditionColor(report.overallCondition)}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">Property Condition Report</h3>
                <p className="text-gray-600">{report.propertyAddress}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Inspected on {new Date(report.inspectionDate).toLocaleDateString()}
                </p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold">{report.overallScore}</div>
                <div className="text-xl text-gray-600">{report.overallCondition}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Issues</p>
                  <p className="text-3xl font-bold">{report.summary.totalIssues}</p>
                </div>
                <Home className="w-8 h-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700">Critical Issues</p>
                  <p className="text-3xl font-bold text-red-900">{report.summary.criticalIssues}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-700">High Priority</p>
                  <p className="text-3xl font-bold text-orange-900">{report.summary.highPriorityIssues}</p>
                </div>
                <Wrench className="w-8 h-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Est. Repair Cost</p>
                  <p className="text-3xl font-bold">${report.summary.estimatedRepairCost.toLocaleString()}</p>
                </div>
                <DollarSign className="w-8 h-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Issues by Category */}
        {report.issuesByCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Issues by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.issuesByCategory.map((cat, index) => (
                  <div key={index}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{cat.category}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold">{cat.count} issues</span>
                        <span className="text-xs text-gray-500 ml-2">(${cat.totalCost.toLocaleString()})</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${Math.min(100, (cat.totalCost / report.summary.estimatedRepairCost) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prioritized Actions */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Priority Action Items</h3>
          <div className="space-y-4">
            {report.prioritizedActions.map((issue, index) => (
              <Card key={index} className={`border-l-4 ${getSeverityColor(issue.severity)}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{getUrgencyIcon(issue.urgency)}</span>
                        <div>
                          <h4 className="font-bold text-lg">{issue.title}</h4>
                          <p className="text-sm text-gray-600">{issue.description}</p>
                          <p className="text-xs text-gray-500 mt-1">Location: {issue.location}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getSeverityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      <span className="text-lg font-bold text-gray-900">
                        ${issue.estimatedCost.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Recommendations:</p>
                      <ul className="space-y-1">
                        {issue.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {issue.preventativeMeasures && issue.preventativeMeasures.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Prevention:</p>
                        <ul className="space-y-1">
                          {issue.preventativeMeasures.map((measure, i) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                              <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>{measure}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-semibold">
                      {issue.category}
                    </span>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                      {issue.urgency}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Room-by-Room Analysis */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Room-by-Room Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.imageAnalyses.map((analysis, index) => (
              <Card key={index} className={`border-2 ${getConditionColor(analysis.overallCondition)}`}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{analysis.roomType}</span>
                    <span className="text-2xl font-bold">{analysis.conditionScore}/100</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.detectedIssues.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          Issues Detected ({analysis.detectedIssues.length}):
                        </p>
                        <ul className="space-y-1">
                          {analysis.detectedIssues.map((issue, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                              <span>{issue.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.positiveFeatures.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-green-700 mb-2">Positive Features:</p>
                        <ul className="space-y-1">
                          {analysis.positiveFeatures.map((feature, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.generalObservations.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Observations:</p>
                        <ul className="space-y-1">
                          {analysis.generalObservations.map((obs, i) => (
                            <li key={i} className="text-xs text-gray-600">• {obs}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer */}
        <Card className="bg-gray-50">
          <CardContent className="p-4 flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Report generated on {new Date(report.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" onClick={() => setReport(null)}>
              New Inspection
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Property Images</CardTitle>
          <p className="text-sm text-gray-600">
            Upload photos of different rooms and areas. AI will analyze each image for issues.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
            <div className="flex flex-col items-center justify-center">
              <Camera className="w-12 h-12 text-gray-400 mb-4" />
              <label htmlFor="images" className="cursor-pointer">
                <div className="text-center">
                  <span className="text-lg font-semibold text-gray-700">Click to upload images</span>
                  <p className="text-sm text-gray-500 mt-1">Up to 20 images, JPEG/PNG</p>
                </div>
                <input
                  id="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              <Button variant="outline" className="mt-4" onClick={() => document.getElementById('images')?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Select Images
              </Button>
            </div>
          </div>

          {/* Image Previews */}
          {images.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Uploaded Images ({images.length}/20)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="mt-2">
                      <Select value={img.roomType} onValueChange={(value) => updateRoomType(index, value)}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map(room => (
                            <SelectItem key={room} value={room}>{room}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <Button 
            onClick={handleAnalyze} 
            disabled={loading || images.length === 0}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Images... This may take a minute
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                Analyze Property ({images.length} images)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Tips for Best Results:</h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>• Take clear, well-lit photos</li>
            <li>• Capture problem areas up close</li>
            <li>• Include photos of all major rooms</li>
            <li>• Document exterior, roof, foundation if accessible</li>
            <li>• Label each image with the correct room type</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}