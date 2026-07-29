// apps/frontend/src/components/HomeModificationAdvisor.tsx
'use client';

import { useState } from 'react';
import { 
  Clock,
  Loader2,
  Lightbulb,
  AlertCircle,
  Bookmark,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import {
  ActionPriorityRow,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

interface ModificationRecommendation {
  id: string;
  status: 'GENERATED' | 'SAVED' | 'REJECTED' | 'SELECTED';
  title: string;
  category: 'ACCESSIBILITY' | 'AGING_IN_PLACE' | 'FAMILY' | 'RESALE' | 'ENERGY' | 'SAFETY';
  costMinCents: number;
  costMaxCents: number;
  currency: 'USD';
  timeline: string;
  description: string;
  benefits: string[];
  whyThisFits: string;
  professionalToConsult: string;
  permitGuidance: 'VERIFY_WITH_LOCAL_AUTHORITY';
  evidenceSource: 'AI_ESTIMATE' | 'BASELINE_HEURISTIC';
  confidence?: 'LOW' | 'MEDIUM';
  assumptions: string[];
  validationEvidence: {
    costModel: 'STATE_MULTIPLIER_BASELINE_V1';
    stateCostMultiplier: number;
    costRangeWasAdjusted: boolean;
    notes: string[];
  };
}

interface ModificationReport {
  id: string;
  propertyId: string;
  propertyAddress: string;
  goals: string[];
  options: ModificationRecommendation[];
  missingFacts: Array<{ factKey: string; benefit: string; correctionAction: string }>;
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
  { id: 'resilience', label: 'Improve resilience to weather or outages' },
  { id: 'maintenance', label: 'Reduce ongoing maintenance burden' },
];

export default function HomeModificationAdvisor({ propertyId }: HomeModificationAdvisorProps) {
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [report, setReport] = useState<ModificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionActionId, setOptionActionId] = useState<string | null>(null);
  const [comparedOptionIds, setComparedOptionIds] = useState<string[]>([]);
  const [createdCase, setCreatedCase] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [spaceText, setSpaceText] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [targetTiming, setTargetTiming] = useState('');
  const [responsibilityContext, setResponsibilityContext] = useState('UNKNOWN');

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

      const response = await api.createRenovationExploration(propertyId, {
        goals: needsText,
        responsibilityContext,
        spacesAffected: spaceText.split(',').map(value => value.trim()).filter(Boolean),
        budgetMaxCents: budgetMax ? Math.round(Number(budgetMax) * 100) : undefined,
        targetTiming: targetTiming || undefined,
        accessibilityPreferences: selectedNeeds.includes('accessibility') ? ['ACCESSIBILITY'] : [],
        resiliencePreferences: selectedNeeds.includes('resilience') ? ['RESILIENCE'] : [],
        efficiencyPreferences: selectedNeeds.includes('energy') ? ['ENERGY_EFFICIENCY'] : [],
        maintenancePreferences: selectedNeeds.includes('maintenance') ? ['LOW_MAINTENANCE'] : [],
      });
      
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

  const updateOption = async (optionId: string, status: 'SAVED' | 'REJECTED') => {
    if (!report) return;
    setOptionActionId(optionId);
    setError('');
    try {
      const response = await api.updateRenovationOption(propertyId, report.id, optionId, { status });
      if (!response.success) throw new Error(response.message || 'Failed to update option');
      setReport(current => current ? {
        ...current,
        options: current.options.map(option => option.id === optionId ? { ...option, status } : option),
      } : current);
    } catch (err: any) {
      setError(err.message || 'Failed to update option');
    } finally {
      setOptionActionId(null);
    }
  };

  const createPlan = async (optionId: string) => {
    if (!report) return;
    setOptionActionId(optionId);
    setError('');
    try {
      const response = await api.createRenovationCaseFromOption(propertyId, report.id, optionId);
      if (!response.success || !response.data) throw new Error(response.message || 'Failed to create renovation plan');
      setCreatedCase({ id: response.data.id, name: response.data.name });
      setReport(current => current ? {
        ...current,
        options: current.options.map(option => option.id === optionId ? { ...option, status: 'SELECTED' } : option),
      } : current);
    } catch (err: any) {
      setError(err.message || 'Failed to create renovation plan');
    } finally {
      setOptionActionId(null);
    }
  };

  const toggleCompare = (optionId: string) => {
    setComparedOptionIds(current => current.includes(optionId)
      ? current.filter(id => id !== optionId)
      : current.length < 3 ? [...current, optionId] : current);
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
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="upgrade-spaces">Affected spaces</Label>
              <Input id="upgrade-spaces" value={spaceText} onChange={event => setSpaceText(event.target.value)} placeholder="Kitchen, primary bath" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upgrade-budget">Maximum budget</Label>
              <Input id="upgrade-budget" type="number" min="0" value={budgetMax} onChange={event => setBudgetMax(event.target.value)} placeholder="25000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upgrade-timing">Target timing</Label>
              <Input id="upgrade-timing" value={targetTiming} onChange={event => setTargetTiming(event.target.value)} placeholder="Within 12 months" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upgrade-responsibility">Responsibility</Label>
              <select
                id="upgrade-responsibility"
                value={responsibilityContext}
                onChange={event => setResponsibilityContext(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="UNKNOWN">Not confirmed</option>
                <option value="HOMEOWNER">Homeowner</option>
                <option value="ASSOCIATION">Association</option>
                <option value="SHARED">Shared</option>
                <option value="LANDLORD">Landlord</option>
              </select>
            </div>
          </div>
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
        value={`${report.options.length} options`}
        status={<StatusChip tone="info">Educational options</StatusChip>}
        summary="Independent ideas matched to your goals and known property context. Select an option before treating it as a renovation plan."
      />

      <ReadOnlySummaryBlock
        title="Exploration Snapshot"
        columns={2}
        items={[
          { label: 'Goals considered', value: report.goals.length },
          { label: 'Options to compare', value: report.options.length },
          { label: 'Saved options', value: report.options.filter(option => option.status === 'SAVED').length },
          { label: 'Generated', value: new Date(report.generatedAt).toLocaleDateString() },
        ]}
      />

      {report.missingFacts.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-2 p-4 text-sm text-amber-900">
            <p className="font-semibold">Add property details for better matches</p>
            {report.missingFacts.map(fact => (
              <div key={fact.factKey}>
                <p>{fact.benefit}</p>
                <a className="text-xs font-medium underline" href={fact.correctionAction}>Update {fact.factKey}</a>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {createdCase ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Renovation plan created</p><p>{createdCase.name} now has a durable case and versioned starting scope.</p></div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h3 className="mb-3 text-xl font-bold text-gray-900">Options to Compare</h3>
        {comparedOptionIds.length > 1 ? (
          <Card className="mb-4 border-indigo-200 bg-indigo-50">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-indigo-900">Side-by-side comparison</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.options.filter(option => comparedOptionIds.includes(option.id)).map(option => (
                  <div key={option.id} className="rounded-lg bg-white p-3 text-sm">
                    <p className="font-semibold text-slate-900">{option.title}</p>
                    <p className="mt-1 text-slate-600">
                      ${(option.costMinCents / 100).toLocaleString()}–${(option.costMaxCents / 100).toLocaleString()}
                    </p>
                    <p className="text-slate-600">{option.timeline}</p>
                    <p className="mt-2 text-xs text-slate-500">{option.whyThisFits}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        <div className="space-y-4">
          {report.options.map((rec) => (
            <Card key={rec.id} className={`border ${rec.status === 'REJECTED' ? 'opacity-60' : 'border-slate-200'}`}>
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
                            {rec.evidenceSource === 'AI_ESTIMATE' ? 'AI estimate' : 'Baseline heuristic'}
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
                      ${(rec.costMinCents / 100).toLocaleString()}–${(rec.costMaxCents / 100).toLocaleString()}
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

                {rec.assumptions.length > 0 || rec.validationEvidence.notes.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-xs font-semibold text-slate-700">Assumptions and evidence limits</p>
                    <ul className="mt-1 space-y-0.5">
                      {[...rec.assumptions, ...rec.validationEvidence.notes].map((note, noteIndex) => (
                        <li key={noteIndex} className="text-xs text-slate-600">
                          • {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={comparedOptionIds.includes(rec.id) ? 'secondary' : 'outline'}
                    disabled={!comparedOptionIds.includes(rec.id) && comparedOptionIds.length >= 3}
                    onClick={() => toggleCompare(rec.id)}
                  >
                    {comparedOptionIds.includes(rec.id) ? 'Comparing' : 'Compare'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={optionActionId === rec.id || rec.status === 'SELECTED'}
                    onClick={() => updateOption(rec.id, 'SAVED')}
                  >
                    <Bookmark className="mr-1.5 h-4 w-4" /> {rec.status === 'SAVED' ? 'Saved' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={optionActionId === rec.id || rec.status === 'SELECTED'}
                    onClick={() => updateOption(rec.id, 'REJECTED')}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                  <Button
                    type="button"
                    disabled={optionActionId === rec.id || rec.status === 'REJECTED' || rec.status === 'SELECTED'}
                    onClick={() => createPlan(rec.id)}
                  >
                    {optionActionId === rec.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                    {rec.status === 'SELECTED' ? 'Plan created' : 'Create renovation plan'}
                  </Button>
                </div>
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
