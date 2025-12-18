// apps/backend/src/sellerPrep/engines/valueCalculator.engine.ts

interface ChecklistItem {
    code: string;
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    roiRange: string;
    costBucket: string;
    status: string;
  }
  
  interface CostEstimate {
    min: number;
    max: number;
    average: number;
  }
  
  /**
   * Convert cost bucket to estimated dollar range
   */
  export function getCostEstimate(costBucket: string): CostEstimate {
    switch (costBucket) {
      case '$':
        return { min: 500, max: 2000, average: 1250 };
      case '$$':
        return { min: 2000, max: 5000, average: 3500 };
      case '$$$':
        return { min: 5000, max: 15000, average: 10000 };
      default:
        return { min: 1000, max: 3000, average: 2000 };
    }
  }
  
  /**
   * Parse ROI range string (e.g., "70-110%") to get min/max percentages
   */
  function parseRoiRange(roiRange: string): { min: number; max: number } {
    const match = roiRange.match(/(\d+)-(\d+)%/);
    if (!match) {
      return { min: 0.5, max: 0.8 }; // Default 50-80%
    }
    return {
      min: parseInt(match[1]) / 100,
      max: parseInt(match[2]) / 100,
    };
  }
  
  /**
   * Calculate estimated value increase for a single item
   */
  export function calculateItemValueIncrease(item: ChecklistItem): {
    minIncrease: number;
    maxIncrease: number;
  } {
    const cost = getCostEstimate(item.costBucket);
    const roi = parseRoiRange(item.roiRange);
  
    return {
      minIncrease: Math.round(cost.average * roi.min),
      maxIncrease: Math.round(cost.average * roi.max),
    };
  }
  
  /**
   * Calculate budget and value data for all items
   */
  export function calculateBudgetAndValue(
    items: ChecklistItem[],
    userBudget?: string // From preferences: "0-5k", "5-15k", etc.
  ) {
    // Parse user budget
    let totalBudget = 15000; // Default $15K
    if (userBudget) {
      if (userBudget === '0-5k') totalBudget = 5000;
      else if (userBudget === '5-15k') totalBudget = 15000;
      else if (userBudget === '15-30k') totalBudget = 30000;
      else if (userBudget === '30k+') totalBudget = 50000;
    }
  
    // Calculate spent (completed items)
    const completedItems = items.filter((i) => i.status === 'DONE');
    const spentAmount = completedItems.reduce((sum, item) => {
      const cost = getCostEstimate(item.costBucket);
      return sum + cost.average;
    }, 0);
  
    // Calculate completed value increase
    let completedMinValue = 0;
    let completedMaxValue = 0;
    const completedImprovements = completedItems.map((item) => {
      const cost = getCostEstimate(item.costBucket);
      const valueIncrease = calculateItemValueIncrease(item);
      completedMinValue += valueIncrease.minIncrease;
      completedMaxValue += valueIncrease.maxIncrease;
  
      return {
        title: item.title,
        roiRange: item.roiRange,
        estimatedCost: cost.average,
      };
    });
  
    // Calculate remaining items
    const remainingItems = items.filter((i) => i.status === 'PLANNED');
    let potentialMinValue = 0;
    let potentialMaxValue = 0;
    const remainingImprovements = remainingItems.map((item) => {
      const cost = getCostEstimate(item.costBucket);
      const valueIncrease = calculateItemValueIncrease(item);
      potentialMinValue += valueIncrease.minIncrease;
      potentialMaxValue += valueIncrease.maxIncrease;
  
      return {
        title: item.title,
        roiRange: item.roiRange,
        estimatedCost: cost.average,
        priority: item.priority,
      };
    });
  
    // Calculate remaining tasks for budget projection
    const remainingTasks = remainingItems.map((item) => {
      const cost = getCostEstimate(item.costBucket);
      return {
        title: item.title,
        estimatedCost: cost.average,
      };
    });
  
    return {
      budget: {
        totalBudget,
        spentAmount: Math.round(spentAmount),
        remainingTasks,
      },
      value: {
        completedImprovements,
        remainingImprovements,
        completedValueIncrease: {
          minValue: completedMinValue,
          maxValue: completedMaxValue,
        },
        potentialValueIncrease: {
          minValue: potentialMinValue,
          maxValue: potentialMaxValue,
        },
      },
    };
  }