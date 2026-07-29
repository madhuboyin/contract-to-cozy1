// apps/frontend/src/components/HomeModificationAdvisor.tsx
'use client';

import { useState } from 'react';
import { 
  Clock,
  Loader2,
  Lightbulb,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import {
  ActionPriorityRow,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

interface ModificationRecommendation {
  title: string;
  category: 'ACCESSIBILITY' | 'AGING_IN_PLACE' | 'FAMILY' | 'RESALE' | 'ENERGY' | 'SAFETY';
  costRange: { min: number; max: number; currency: 'USD' };
  timeline: string;
  description: string;
  benefits: string[];
  whyThisFits: string;
  professionalToConsult: string;
  permitGuidance: 'VERIFY_WITH_LOCAL_AUTHORITY';
  source: 'AI_ESTIMATE' | 'BASELINE_HEURISTIC';
  confidence?: 'LOW' | 'MEDIUM';
  assumptions: string[];
  validation: {
    costModel: 'STATE_MULTIPLIER_BASELINE_V1';
    stateCostMultiplier: number;
    costRangeWasAdjusted: boolean;
    notes: string[];
  };
}

interface ModificationReport {
  propertyId: string;
  propertyAddress: string;
  userNeeds: string[];
  propertyAge: number | null;
  applicability: {
    feature: { status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN'; reasonCodes: string[] };
    outdoor: { status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN'; reasonCodes: string[]; missingFactKeys: string[] };
  };
  recommendations: ModificationRecommendation[];
  meta?: {
    classification: 'EDUCATIONAL_ESTIMATE';
    regionalCostModel: 'STATE_MULTIPLIER_BASELINE_V1';
    financialPlanningSafe: false;
    selectionRequired: true;
    disclaimer: string;
  };
  generatedAt: string;
}

interface HomeModificationAdvisorProps {
  propertyId: string;
}

const NEED_OPTIONS = [
  { id: 'accessibility', label: 'Accessibility improvements (wheelchair, mobility)' },
  { id: 'aging', label: 'Aging in place modifications' },
  { id: 'family', label: 'Growing family / additional space' },
  { id: 'resale', label: 'Increase resale value' },
  { id: 'energy', label: 'Energy efficiency / lower bills' },
  { id: 'safety', label: 'Safety and security upgrades' },
  { id: 'modern', label: 'Modernize outdated features' },
  { id: 'outdoor', label: 'Outdoor living spaces' },
];

export default function HomeModificationAdvisor({ propertyId }: HomeModificationAdvisorProps) {
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [report, setReport] = useState<ModificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleNeed = (needId: string) => {
    setSelectedNeeds(prev => 
      prev.includes(needId) 
        ? prev.filter(n => n !== needId)
        : [...prev, needId]
    );
  };

  const generateReport = async () => {
    if (selectedNeeds.length === 0) {
      setError('Please select at least one need');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const needsText = selectedNeeds.map(id => 
        NEED_OPTIONS.find(opt => opt.id === id)?.label || id
      );

      const response = await api.getHomeModifications(propertyId, needsText);
      
      if (response.success && response.data) {
        setReport(response.data);
      } else {
        setError(response.message || 'Failed to generate recommendations');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      'ACCESSIBILITY': '♿',
      'AGING_IN_PLACE': '👴',
      'FAMILY': '👨‍👩‍👧‍👦',
      'RESALE': '💰',
      'ENERGY': '⚡',
      'SAFETY': '🛡️',
    };
    return icons[category] || '🏠';
  };

  if (!report) {
    return (
      <ScenarioInputCard
        title="Home Improvement Goals"
        subtitle="Choose goals to explore independent upgrade options."
        badge={<StatusChip tone="info">Scenario input</StatusChip>}
        actions={
          <ActionPriorityRow
            primaryAction={
              <Button
                onClick={generateReport}
                disabled={loading || selectedNeeds.length === 0}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Recommendations...
                  </>
                ) : (
                  <>
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Get AI Recommendations
                  </>
                )}
              </Button>
            }
          />
        }
      >
        <div className="space-y-3">
          {NEED_OPTIONS.map(option => (
            <div key={option.id} className="flex items-center space-x-3">
              <Checkbox
                id={option.id}
                checked={selectedNeeds.includes(option.id)}
                onCheckedChange={() => toggleNeed(option.id)}
              />
              <Label
                htmlFor={option.id}
                className="text-sm font-normal cursor-pointer"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </ScenarioInputCard>
    );
  }

  return (
    <div className="space-y-6">
      <ResultHeroCard
        title="Explore Upgrade Options"
        value={`${report.recommendations.length} options`}
        status={<StatusChip tone="info">Educational options</StatusChip>}
        summary="Independent ideas matched to your goals and known property context. Select an option before treating it as a renovation plan."
      />

      <ReadOnlySummaryBlock
        title="Exploration Snapshot"
        columns={2}
        items={[
          { label: 'Goals considered', value: report.userNeeds.length },
          { label: 'Property age', value: report.propertyAge === null ? 'Unknown' : `${report.propertyAge} years` },
          { label: 'Options to compare', value: report.recommendations.length },
          { label: 'Generated', value: new Date(report.generatedAt).toLocaleDateString() },
        ]}
      />

      {report.applicability.outdoor.status !== 'APPLICABLE' ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900">
            Outdoor projects were omitted because the selected property either has no owner-managed private outdoor space or still needs those property details completed.
          </CardContent>
        </Card>
      ) : null}

      {report.meta?.disclaimer ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-amber-900">Educational Estimate</p>
            <p className="mt-1 text-sm text-amber-800">{report.meta.disclaimer}</p>
            <p className="mt-2 text-xs text-amber-700">
              Cost model: {report.meta.regionalCostModel}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h3 className="mb-3 text-xl font-bold text-gray-900">Options to Compare</h3>
        <div className="space-y-4">
          {report.recommendations.map((rec, index) => (
            <Card key={index} className="border border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getCategoryIcon(rec.category)}</span>
                      <div>
                        <h4 className="font-bold text-lg text-gray-900">{rec.title}</h4>
                        <p className="text-sm text-gray-600">{rec.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {rec.source === 'AI_ESTIMATE' ? 'AI estimate' : 'Baseline heuristic'}
                          </span>
                          {rec.confidence ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              Confidence: {rec.confidence}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-800">Why this may fit</p>
                  <p className="mt-1 text-sm text-blue-900">{rec.whyThisFits}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-600">Broad cost range</p>
                    <p className="font-bold text-gray-900">
                      ${rec.costRange.min.toLocaleString()}–${rec.costRange.max.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Timeline estimate</p>
                    <p className="flex items-center gap-1 font-bold text-gray-900">
                      <Clock className="h-3.5 w-3.5" />
                      {rec.timeline}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Professional to consult</p>
                    <p className="font-bold text-gray-900">{rec.professionalToConsult}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Potential benefits to evaluate:</p>
                  <div className="flex flex-wrap gap-2">
                    {rec.benefits.map((benefit, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Permit applicability is unknown. Verify the defined scope with the local authority before work starts.</span>
                </div>

                {rec.assumptions.length > 0 || rec.validation.notes.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-xs font-semibold text-slate-700">Assumptions and evidence limits</p>
                    <ul className="mt-1 space-y-0.5">
                      {[...rec.assumptions, ...rec.validation.notes].map((note, noteIndex) => (
                        <li key={noteIndex} className="text-xs text-slate-600">
                          • {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Generated on {new Date(report.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" onClick={() => setReport(null)}>
              Change goals
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
