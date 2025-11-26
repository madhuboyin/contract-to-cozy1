import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Zap, Shield, Home, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
// CRITICAL FIX: Import ScoredProperty and HealthScoreResult from the official types file
import { ScoredProperty, HealthScoreResult } from '@/types'; 


interface PropertyHealthScoreCardProps {
  property: ScoredProperty;
}

// Helper to determine the rating text and color based on the score
const getScoreRating = (score: number) => {
  if (score >= 85) return { text: 'Excellent', color: 'text-green-600 bg-green-100' };
  if (score >= 65) return { text: 'Good', color: 'text-yellow-600 bg-yellow-100' };
  if (score >= 45) return { text: 'Fair', color: 'text-orange-600 bg-orange-100' };
  return { text: 'Poor', color: 'text-red-600 bg-red-100' };
};

// Helper for conditional classes (Progress bar colors)
const getProgressColor = (score: number) => {
  if (score >= 85) return 'bg-green-500';
  if (score >= 65) return 'bg-yellow-500';
  return 'bg-red-500';
};

export const PropertyHealthScoreCard: React.FC<PropertyHealthScoreCardProps> = ({ property }) => {
  const router = useRouter();
  const { healthScore } = property;
  const rating = getScoreRating(healthScore.totalScore);
  const progressPercent = Math.min(100, (healthScore.totalScore / 100) * 100);
  
  // Find a specific key insight for the card description
  const keyInsight = healthScore.insights.find(i => 
    i.status === 'Needs Review' || i.status === 'Missing Data' || i.status === 'Needs Inspection'
  );

  const handleCtaClick = () => {
    // Navigate to the edit page for the specific property to complete the advanced profile
    router.push(`/dashboard/properties/${property.id}/edit`);
  };

  return (
    <Card className="shadow-lg border border-gray-100 h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-heading text-xl flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <span>Property Health Score</span>
        </CardTitle>
        <CardDescription className="font-body text-sm text-muted-foreground">
            {property.name || 'Primary Residence'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-grow space-y-4">
        
        {/* Score Display */}
        <div className="flex items-baseline space-x-2">
          <p className="font-heading text-5xl font-extrabold text-gray-900">{healthScore.totalScore}</p>
          <p className="font-heading text-xl font-semibold text-gray-500">/100</p>
          <span className={`font-body text-sm font-medium px-2 py-0.5 rounded-full ${rating.color}`}>
            {rating.text}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <div>
              <span className="font-body text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                Current Score
              </span>
            </div>
            <div className="text-right">
              <span className="font-body text-xs font-semibold inline-block text-blue-600">
                {progressPercent.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
            <div 
              style={{ width: `${progressPercent}%` }} 
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${getProgressColor(healthScore.totalScore)}`}
            ></div>
          </div>
        </div>

        {/* Key Insights (Base Score) */}
        <div className="pt-2 border-t border-gray-100">
          <h3 className="font-heading text-sm font-semibold text-gray-700 mb-2">Key Factors</h3>
          <ul className="font-body text-sm space-y-1 text-gray-600">
            {healthScore.insights
              .filter(i => ['Age Factor', 'Structure Factor', 'Systems Factor'].includes(i.factor))
              .slice(0, 3) // Show top 3 factors
              .map((insight, index) => (
                <li key={index} className="flex items-center justify-between">
                  <span>{insight.factor.replace(' Factor', '')}:</span>
                  <span className={`font-medium ${insight.status.includes('Needs') || insight.status.includes('Missing') ? 'text-orange-500' : 'text-gray-800'}`}>
                    {insight.status}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </CardContent>
      
      {/* Footer CTA */}
      {healthScore.ctaNeeded && (
        <CardFooter className="bg-gray-50 border-t p-4 rounded-b-lg flex flex-col space-y-2">
          <p className="font-body text-sm font-semibold text-gray-800">
            Improve to {healthScore.maxPotentialScore}/100 — Complete Profile
          </p>
          <button 
            onClick={handleCtaClick}
            className="w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 transition"
          >
            Add Missing Details ({healthScore.maxPotentialScore - healthScore.totalScore} pts)
            <ChevronRight className="w-4 h-4 ml-2" />
          </button>
        </CardFooter>
      )}
    </Card>
  );
};