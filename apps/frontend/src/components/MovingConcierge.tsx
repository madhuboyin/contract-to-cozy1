'use client';

import { useState, useEffect } from 'react';
import { 
  Truck, 
  CheckCircle2,
  Circle,
  DollarSign,
  Calendar,
  Zap,
  Home,
  Package,
  Loader2,
  AlertCircle,
  Lightbulb,
  Phone,
  Globe,
  Save,
  Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';

interface MovingTask {
  id: string;
  title: string;
  description: string;
  category: string;
  dueDate: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedTime: string;
  completed: boolean;
  tips: string[];
}

interface MovingPlan {
  propertyId: string;
  closingDate: string;
  daysUntilMove: number;
  timeline: {
    weeks8Before: MovingTask[];
    weeks6Before: MovingTask[];
    weeks4Before: MovingTask[];
    weeks2Before: MovingTask[];
    week1Before: MovingTask[];
    movingDay: MovingTask[];
    week1After: MovingTask[];
  };
  utilitySetup: any[];
  costEstimates: {
    total: number;
    breakdown: any[];
  };
  packingSchedule: any[];
  changeOfAddressChecklist: any[];
  aiRecommendations: string[];
  generatedAt: string;
}

interface MovingConciergeProps {
  propertyId: string;
  propertyAddress: string;
  squareFootage?: number;
}

export default function MovingConcierge({ propertyId, propertyAddress, squareFootage }: MovingConciergeProps) {
  const [plan, setPlan] = useState<MovingPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Form fields
  const [closingDate, setClosingDate] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [homeSize, setHomeSize] = useState(squareFootage?.toString() || '');
  const [numberOfRooms, setNumberOfRooms] = useState('');
  const [familySize, setFamilySize] = useState('');
  const [hasPets, setHasPets] = useState(false);
  const [hasValuableItems, setHasValuableItems] = useState(false);
  const [movingDistance, setMovingDistance] = useState<string>('LOCAL');
  const [specialRequirements, setSpecialRequirements] = useState('');

  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  // Load saved plan on mount
  useEffect(() => {
    const loadSavedPlan = async () => {
      try {
        const response = await api.getMovingPlan(propertyId);
        if (response.success && response.data) {
          setPlan(response.data);
          // Restore completed tasks from saved plan
          if (response.data.completedTasks && Array.isArray(response.data.completedTasks)) {
            setCompletedTasks(new Set(response.data.completedTasks));
          }
        }
      } catch (err) {
        console.log('No saved plan found or error loading:', err);
      } finally {
        setInitialLoading(false);
      }
    };

    loadSavedPlan();
  }, [propertyId]);

  // Auto-save completed tasks (debounced)
  useEffect(() => {
    if (!plan || saveStatus === 'saving') return;

    const timeoutId = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await api.updateCompletedTasks(propertyId, Array.from(completedTasks));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to save task completion:', err);
        setSaveStatus('idle');
      }
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeoutId);
  }, [completedTasks, propertyId, plan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.generateMovingPlan({
        propertyId,
        closingDate,
        currentAddress,
        newAddress: propertyAddress,
        homeSize: parseInt(homeSize),
        numberOfRooms: parseInt(numberOfRooms),
        familySize: parseInt(familySize),
        hasPets,
        hasValuableItems,
        movingDistance,
        specialRequirements,
      });

      if (response.success && response.data) {
        const newPlan = response.data as MovingPlan;
        setPlan(newPlan);
        
        // Auto-save to database
        try {
          setSaveStatus('saving');
          await api.saveMovingPlan(propertyId, newPlan);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (saveErr) {
          console.error('Failed to auto-save plan:', saveErr);
          setSaveStatus('idle');
        }
      } else {
        setError(response.message || 'Failed to generate moving plan');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate moving plan');
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = (taskId: string) => {
    const newCompleted = new Set(completedTasks);
    if (newCompleted.has(taskId)) {
      newCompleted.delete(taskId);
    } else {
      newCompleted.add(taskId);
    }
    setCompletedTasks(newCompleted);
  };

  const handleManualSave = async () => {
    if (!plan) return;
    
    try {
      setSaveStatus('saving');
      await api.saveMovingPlan(propertyId, plan);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save plan:', err);
      setError('Failed to save plan');
      setSaveStatus('idle');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'text-red-600 bg-red-50 border-red-200';
      case 'HIGH': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, any> = {
      'UTILITIES': Zap,
      'MOVING': Truck,
      'PACKING': Package,
      'ADMIN': Home,
      'CLEANING': Circle,
      'SETUP': Home,
      'KIDS_PETS': Circle,
    };
    const Icon = icons[category] || Circle;
    return <Icon className="w-4 h-4" />;
  };

  const renderTimelineSection = (title: string, tasks: MovingTask[], dueDate: string) => {
    const completedCount = tasks.filter(t => completedTasks.has(t.id)).length;
    const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

    return (
      <Card key={title}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{title}</CardTitle>
            <div className="text-right">
              <p className="text-sm text-gray-600">Due: {new Date(dueDate).toLocaleDateString()}</p>
              <p className="text-xs text-gray-500">{completedCount}/{tasks.length} completed</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg border-2 transition-all ${
                  completedTasks.has(task.id) ? 'bg-gray-50 opacity-60' : 'bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="mt-1 flex-shrink-0"
                  >
                    {completedTasks.has(task.id) ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                      <Circle className="w-6 h-6 text-gray-400" />
                    )}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className={`font-semibold ${completedTasks.has(task.id) ? 'line-through' : ''}`}>
                          {task.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-gray-500">{task.estimatedTime}</span>
                      </div>
                    </div>

                    {task.tips.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 rounded">
                        <p className="text-xs font-semibold text-blue-900 mb-1">💡 Tips:</p>
                        <ul className="text-xs text-blue-800 space-y-0.5">
                          {task.tips.map((tip, i) => (
                            <li key={i}>• {tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      {getCategoryIcon(task.category)}
                      <span className="text-xs text-gray-500">{task.category}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Show loading state while checking for saved plan
  if (initialLoading) {
    return (
      <Card>
        <CardContent className="p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mb-4" />
          <p className="text-gray-600">Loading your moving plan...</p>
        </CardContent>
      </Card>
    );
  }

  if (plan) {
    const totalTasks = Object.values(plan.timeline).flat().length;
    const completedCount = completedTasks.size;
    const overallProgress = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

    return (
      <div className="space-y-6">
        {/* Header with Save Status */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-green-900 mb-2">Your Moving Plan</h3>
                <p className="text-green-700">{propertyAddress}</p>
                <p className="text-sm text-green-600 mt-1">
                  Closing in {plan.daysUntilMove} days • {new Date(plan.closingDate).toLocaleDateString()}
                </p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-green-900">{Math.round(overallProgress)}%</div>
                <div className="text-sm text-green-700">Complete</div>
                <div className="text-xs text-green-600 mt-1">
                  {completedCount}/{totalTasks} tasks
                </div>
              </div>
            </div>
            
            <div className="w-full bg-green-200 rounded-full h-3 mt-4">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>

            {/* Save Status Indicator */}
            <div className="mt-3 flex items-center justify-end gap-2">
              {saveStatus === 'saving' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              )}
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  <span>Saved</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Recommendations */}
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-purple-600" />
              AI Personalized Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {plan.aiRecommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className="text-gray-800">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Cost Estimates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Estimated Moving Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {plan.costEstimates.breakdown.map((cost, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-semibold">{cost.category}</p>
                    <p className="text-xs text-gray-600">{cost.notes}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Range: ${cost.range.min.toLocaleString()} - ${cost.range.max.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-lg font-bold">${cost.estimatedCost.toLocaleString()}</p>
                </div>
              ))}
              
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded border-2 border-blue-200">
                <p className="font-bold text-lg">Total Estimated Cost</p>
                <p className="text-2xl font-bold text-blue-900">
                  ${plan.costEstimates.total.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Utility Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Utility Setup Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {plan.utilitySetup.map((utility, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{utility.service}</h4>
                      <p className="text-sm text-gray-600 mt-1">Setup: {utility.setupDays}</p>
                      {utility.estimatedCost && (
                        <p className="text-sm text-gray-600">Est. Cost: {utility.estimatedCost}</p>
                      )}
                    </div>
                  </div>
                  
                  <ul className="mt-3 space-y-1">
                    {utility.notes.map((note: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Packing Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Packing Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {plan.packingSchedule.map((week, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded">
                  <h4 className="font-semibold mb-2">{week.week}</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Rooms: {week.rooms.join(', ')}
                  </p>
                  <ul className="space-y-1">
                    {week.tips.map((tip: string, i: number) => (
                      <li key={i} className="text-xs text-gray-600">• {tip}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Moving Timeline
          </h3>

          {plan.timeline.weeks8Before?.length > 0 && renderTimelineSection(
            '8 Weeks Before Move',
            plan.timeline.weeks8Before,
            plan.timeline.weeks8Before[0]?.dueDate
          )}

          {plan.timeline.weeks6Before?.length > 0 && renderTimelineSection(
            '6 Weeks Before Move',
            plan.timeline.weeks6Before,
            plan.timeline.weeks6Before[0]?.dueDate
          )}

          {plan.timeline.weeks4Before?.length > 0 && renderTimelineSection(
            '4 Weeks Before Move',
            plan.timeline.weeks4Before,
            plan.timeline.weeks4Before[0]?.dueDate
          )}

          {plan.timeline.weeks2Before?.length > 0 && renderTimelineSection(
            '2 Weeks Before Move',
            plan.timeline.weeks2Before,
            plan.timeline.weeks2Before[0]?.dueDate
          )}

          {plan.timeline.week1Before?.length > 0 && renderTimelineSection(
            '1 Week Before Move',
            plan.timeline.week1Before,
            plan.timeline.week1Before[0]?.dueDate
          )}

          {plan.timeline.movingDay?.length > 0 && renderTimelineSection(
            'Moving Day',
            plan.timeline.movingDay,
            plan.closingDate
          )}

          {plan.timeline.week1After?.length > 0 && renderTimelineSection(
            '1 Week After Move',
            plan.timeline.week1After,
            plan.timeline.week1After[0]?.dueDate
          )}
        </div>

        {/* Change of Address Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Change of Address Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plan.changeOfAddressChecklist.map((category, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded">
                  <h4 className="font-semibold mb-2">{category.category}</h4>
                  <ul className="space-y-1">
                    {category.items.map((item: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700">
                        <Checkbox className="mr-2" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer with Actions */}
        <Card className="bg-gray-50">
          <CardContent className="p-4 flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Plan generated on {new Date(plan.generatedAt).toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleManualSave}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-2"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Plan
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setPlan(null)}>
                Create New Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Input form
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Your Personalized Moving Plan</CardTitle>
        <p className="text-sm text-gray-600">
          Tell us about your move and we'll create a comprehensive AI-powered plan
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="closingDate">Closing Date *</Label>
              <Input
                id="closingDate"
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="currentAddress">Current Address</Label>
              <Input
                id="currentAddress"
                placeholder="123 Main St, City, ST"
                value={currentAddress}
                onChange={(e) => setCurrentAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Property Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="homeSize">Home Size (sq ft) *</Label>
              <Input
                id="homeSize"
                type="number"
                placeholder="2000"
                value={homeSize}
                onChange={(e) => setHomeSize(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="rooms">Number of Rooms *</Label>
              <Input
                id="rooms"
                type="number"
                placeholder="4"
                value={numberOfRooms}
                onChange={(e) => setNumberOfRooms(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="familySize">Family Size *</Label>
              <Input
                id="familySize"
                type="number"
                placeholder="3"
                value={familySize}
                onChange={(e) => setFamilySize(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Moving Details */}
          <div>
            <Label htmlFor="distance">Moving Distance *</Label>
            <Select value={movingDistance} onValueChange={setMovingDistance}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOCAL">Local (within 50 miles)</SelectItem>
                <SelectItem value="LONG_DISTANCE">Long Distance (50-500 miles)</SelectItem>
                <SelectItem value="CROSS_COUNTRY">Cross Country (500+ miles)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="pets"
                checked={hasPets}
                onCheckedChange={(checked) => setHasPets(checked as boolean)}
              />
              <Label htmlFor="pets" className="font-normal cursor-pointer">
                I have pets
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="valuables"
                checked={hasValuableItems}
                onCheckedChange={(checked) => setHasValuableItems(checked as boolean)}
              />
              <Label htmlFor="valuables" className="font-normal cursor-pointer">
                I have valuable/fragile items (piano, art, antiques)
              </Label>
            </div>
          </div>

          {/* Special Requirements */}
          <div>
            <Label htmlFor="special">Special Requirements or Concerns</Label>
            <Textarea
              id="special"
              placeholder="e.g., Need storage, moving with elderly parents, tight timeline..."
              rows={3}
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Your Moving Plan...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4 mr-2" />
                Generate AI Moving Plan
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}