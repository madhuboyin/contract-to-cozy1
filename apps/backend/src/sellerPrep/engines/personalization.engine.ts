// apps/backend/src/sellerPrep/engines/personalization.engine.ts

export interface UserPreferences {
    timeline: string;
    budget: string;
    propertyType: string;
    priority: string;
    condition: string;
  }
  
  export interface ChecklistItem {
    id?: string;
    code: string;
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
    roiRange: string;
    costBucket: string;
    reason?: string;
    status?: string;
    personalizedPriority?: number; // Calculated priority score
  }
  
  /**
   * Calculate a priority score for each item based on user preferences
   * Higher score = more important for this user
   */
  export function personalizeChecklist(
    items: ChecklistItem[],
    preferences: UserPreferences | null
  ): ChecklistItem[] {
    if (!preferences) {
      // No preferences, return items as-is
      return items;
    }
  
    const scoredItems = items.map((item) => {
      let score = 0;
  
      // Timeline urgency
      if (preferences.timeline === '1-3mo') {
        // Urgent sellers: prioritize quick wins and essential repairs
        if (item.costBucket === '$' || item.costBucket === '$$') score += 30;
        if (item.code === 'INTERIOR_PAINT' || item.code === 'MINOR_FIXES') score += 20;
      } else if (preferences.timeline === '3-6mo') {
        // Moderate timeline: balanced approach
        score += 10;
      } else if (preferences.timeline === '6-12mo' || preferences.timeline === '1yr+') {
        // Long timeline: can do bigger projects
        if (item.costBucket === '$$$') score += 20;
      }
  
      // Budget constraints
      if (preferences.budget === '0-5k') {
        // Low budget: prioritize cheap items
        if (item.costBucket === '$') score += 40;
        if (item.costBucket === '$$') score += 10;
        if (item.costBucket === '$$$') score -= 30;
      } else if (preferences.budget === '5-15k') {
        // Medium budget: balanced
        if (item.costBucket === '$$') score += 20;
      } else if (preferences.budget === '15-30k' || preferences.budget === '30k+') {
        // High budget: can afford anything
        if (item.costBucket === '$$$') score += 30;
        score += 10;
      }
  
      // Priority alignment
      if (preferences.priority === 'max-price') {
        // Maximize price: focus on high ROI items
        if (item.priority === 'HIGH') score += 30;
        if (item.roiRange.includes('110%') || item.roiRange.includes('120%')) score += 20;
      } else if (preferences.priority === 'fast-sale') {
        // Fast sale: curb appeal and cosmetic fixes
        if (item.code === 'CURB_APPEAL' || item.code === 'INTERIOR_PAINT') score += 40;
        if (item.costBucket === '$' || item.costBucket === '$$') score += 20;
      } else if (preferences.priority === 'minimal-effort') {
        // Minimal effort: only essential items
        if (item.costBucket === '$') score += 40;
        if (item.code === 'MINOR_FIXES') score += 30;
        if (item.costBucket === '$$$') score -= 40;
      }
  
      // Condition-based recommendations
      if (preferences.condition === 'excellent') {
        // Excellent condition: focus on staging and minor enhancements
        if (item.code === 'INTERIOR_PAINT') score += 20;
        if (item.code === 'CURB_APPEAL') score += 20;
        if (item.code === 'ROOF_REPLACEMENT') score -= 30;
      } else if (preferences.condition === 'good') {
        // Good condition: balanced improvements
        score += 10;
      } else if (preferences.condition === 'fair' || preferences.condition === 'needs-work') {
        // Needs work: prioritize repairs
        if (item.code === 'MINOR_FIXES') score += 40;
        if (item.code === 'ROOF_REPLACEMENT') score += 30;
      }
  
      return {
        ...item,
        personalizedPriority: score,
      };
    });
  
    // Sort by personalized priority (highest first)
    return scoredItems.sort((a, b) => {
      const scoreA = a.personalizedPriority || 0;
      const scoreB = b.personalizedPriority || 0;
      return scoreB - scoreA;
    });
  }
  
  /**
   * Generate a personalized summary message based on preferences
   */
  export function generatePersonalizedSummary(
    preferences: UserPreferences,
    completionPercent: number
  ): string {
    const timelineText = {
      '1-3mo': 'listing in 1-3 months',
      '3-6mo': 'listing in 3-6 months',
      '6-12mo': 'listing in 6-12 months',
      '1yr+': 'listing in over a year',
      'unsure': 'planning to sell',
    }[preferences.timeline] || 'preparing to sell';
  
    const budgetText = {
      '0-5k': 'with a budget under $5K',
      '5-15k': 'with a $5-15K budget',
      '15-30k': 'with a $15-30K budget',
      '30k+': 'with a $30K+ budget',
      'unsure': 'with flexible budget',
    }[preferences.budget] || '';
  
    const priorityText = {
      'max-price': 'focusing on maximizing sale price',
      'fast-sale': 'prioritizing a quick sale',
      'minimal-effort': 'minimizing effort and cost',
      'priority-unsure': 'exploring options',
    }[preferences.priority] || '';
  
    return `You're ${timelineText} ${budgetText}, ${priorityText}. Your home is ${completionPercent}% ready to list.`;
  }