// apps/backend/src/sellerPrep/engines/roiRules.engine.ts
export function generateRoiChecklist(input: {
    propertyType?: string;
    yearBuilt?: number;
    state: string;
  }) {
    const items = [
      {
        code: 'INTERIOR_PAINT',
        title: 'Interior Paint Refresh',
        priority: 'HIGH',
        roiRange: '70–110%',
        costBucket: '$$',
        reason: 'Neutral colors increase buyer appeal and listing photos',
      },
      {
        code: 'MINOR_FIXES',
        title: 'Minor Repairs & Touch-ups',
        priority: 'HIGH',
        roiRange: '80–120%',
        costBucket: '$',
        reason: 'Eliminates red flags during buyer walkthroughs',
      },
      {
        code: 'CURB_APPEAL',
        title: 'Improve Curb Appeal',
        priority: 'MEDIUM',
        roiRange: '60–90%',
        costBucket: '$$',
        reason: 'First impressions strongly influence perceived value',
      },
      {
        code: 'ROOF_REPLACEMENT',
        title: 'Roof Replacement (If Needed)',
        priority: 'LOW',
        roiRange: '40–70%',
        costBucket: '$$$',
        reason: 'Prevents buyer objections and inspection issues',
      },
    ];
  
    return items;
  }
  