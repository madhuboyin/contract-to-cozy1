// apps/backend/src/services/movingConcierge.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface MovingPlanInput {
  closingDate: string;
  currentAddress: string;
  newAddress: string;
  homeSize: number; // square footage
  numberOfRooms: number;
  familySize: number;
  hasPets: boolean;
  hasValuableItems: boolean;
  movingDistance: 'LOCAL' | 'LONG_DISTANCE' | 'CROSS_COUNTRY';
  specialRequirements?: string;
}

interface MovingTask {
  id: string;
  title: string;
  description: string;
  category: 'UTILITIES' | 'MOVING' | 'PACKING' | 'ADMIN' | 'CLEANING' | 'SETUP' | 'KIDS_PETS';
  dueDate: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedTime: string; // "30 min", "2 hours", etc.
  completed: boolean;
  tips: string[];
}

interface UtilitySetup {
  service: string;
  provider?: string;
  setupDays: string; // "7-14 days before move"
  phoneNumber?: string;
  website?: string;
  estimatedCost?: string;
  notes: string[];
}

interface MovingCostEstimate {
  category: string;
  estimatedCost: number;
  range: { min: number; max: number };
  notes: string;
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
  
  utilitySetup: UtilitySetup[];
  
  costEstimates: {
    total: number;
    breakdown: MovingCostEstimate[];
  };
  
  packingSchedule: {
    week: string;
    rooms: string[];
    tips: string[];
  }[];
  
  changeOfAddressChecklist: {
    category: string;
    items: string[];
  }[];
  
  aiRecommendations: string[];
  
  generatedAt: Date;
}

// Common utilities to set up
const UTILITY_SERVICES = [
  {
    service: 'Electricity',
    setupDays: '7-14 days before move',
    notes: ['Schedule turn-on for move-in day', 'Transfer or establish new account', 'Ask about new customer promotions']
  },
  {
    service: 'Gas',
    setupDays: '7-14 days before move',
    notes: ['May require in-person inspection', 'Schedule same day as electricity if possible']
  },
  {
    service: 'Water/Sewer',
    setupDays: '7-14 days before move',
    notes: ['Contact local water authority', 'Set up autopay to avoid shutoff']
  },
  {
    service: 'Internet/Cable',
    setupDays: '14-21 days before move',
    notes: ['Installation may take 1-2 weeks', 'Compare providers in new area', 'Check for bundling discounts']
  },
  {
    service: 'Trash/Recycling',
    setupDays: '3-5 days before move',
    notes: ['Contact local waste management', 'Get pickup schedule', 'Order bins if needed']
  },
  {
    service: 'Security System',
    setupDays: '7-14 days before move',
    notes: ['Transfer or set up new service', 'Schedule installation']
  },
];

// Change of address categories
const CHANGE_OF_ADDRESS_CATEGORIES = [
  {
    category: 'Government & Official',
    items: [
      'USPS mail forwarding',
      'Driver\'s license',
      'Voter registration',
      'Vehicle registration',
      'Passport (if address on file)',
    ]
  },
  {
    category: 'Financial',
    items: [
      'Banks and credit unions',
      'Credit card companies',
      'Investment accounts',
      'Insurance (home, auto, life, health)',
      'IRS and state tax authorities',
    ]
  },
  {
    category: 'Healthcare',
    items: [
      'Primary care physician',
      'Specialists and dentist',
      'Pharmacy',
      'Health insurance',
      'Pet veterinarian',
    ]
  },
  {
    category: 'Subscriptions & Services',
    items: [
      'Streaming services',
      'Magazine/newspaper subscriptions',
      'Gym membership',
      'Professional memberships',
      'Amazon and online shopping accounts',
    ]
  },
];

export class MovingConciergeService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[MOVING-CONCIERGE] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateMovingPlan(
    propertyId: string,
    userId: string,
    input: MovingPlanInput
  ): Promise<MovingPlan> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      },
      include: {
        homeownerProfile: true
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Verify user is HOME_BUYER
    if (property.homeownerProfile.segment !== 'HOME_BUYER') {
      throw new Error('Moving Concierge is only available for home buyers');
    }

    const closingDate = new Date(input.closingDate);
    const today = new Date();
    const daysUntilMove = Math.ceil((closingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Generate AI-powered timeline
    const timeline = await this.generateTimeline(input, daysUntilMove);

    // Utility setup guide
    const utilitySetup = this.generateUtilitySetup(input);

    // Cost estimates
    const costEstimates = this.generateCostEstimates(input);

    // Packing schedule
    const packingSchedule = this.generatePackingSchedule(input, daysUntilMove);

    // AI recommendations
    const aiRecommendations = await this.getAIRecommendations(input, daysUntilMove);

    return {
      propertyId,
      closingDate: input.closingDate,
      daysUntilMove,
      timeline,
      utilitySetup,
      costEstimates,
      packingSchedule,
      changeOfAddressChecklist: CHANGE_OF_ADDRESS_CATEGORIES,
      aiRecommendations,
      generatedAt: new Date(),
    };
  }

  private async generateTimeline(
    input: MovingPlanInput,
    daysUntilMove: number
  ): Promise<MovingPlan['timeline']> {
    if (!this.ai) {
      return this.getBasicTimeline(input, daysUntilMove);
    }

    try {
      const availablePeriods = this.getAvailablePeriods(daysUntilMove);
      const timeConstraint = daysUntilMove < 28 ? 'URGENT - Less than 4 weeks!' : 'Standard timeline';
      
      const prompt = `Generate a COMPRESSED moving timeline adapted for limited time.

Moving Details:
- Days until closing: ${daysUntilMove}
- TIME CONSTRAINT: ${timeConstraint}
- Home size: ${input.homeSize} sqft, ${input.numberOfRooms} rooms
- Family size: ${input.familySize} people
- Pets: ${input.hasPets ? 'Yes' : 'No'}
- Moving distance: ${input.movingDistance}
- Special requirements: ${input.specialRequirements || 'None'}

${daysUntilMove < 28 ? `
CRITICAL INSTRUCTIONS - USER HAS LIMITED TIME:
- Compress early tasks (research movers, budgeting) into earliest available period
- Prioritize CRITICAL tasks that must be done immediately
- Combine similar tasks to save time
- Focus on MUST-DO items only
- Mark urgent tasks with "⚠️ URGENT:" in description
` : ''}

Generate tasks ONLY for these periods: ${availablePeriods.join(', ')}

Return ONLY valid JSON with this exact structure:
{
  ${availablePeriods.filter(p => !['movingDay', 'week1After'].includes(p)).map(period => `
  "${period}": [
    {
      "title": "Task title",
      "description": "${daysUntilMove < 28 ? '⚠️ URGENT: ' : ''}Task description",
      "category": "MOVING|PACKING|UTILITIES|ADMIN|CLEANING|SETUP|KIDS_PETS",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "estimatedTime": "time estimate",
      "tips": ["tip1", "tip2"]
    }
  ]`).join(',')}
  ,
  "movingDay": [
    {
      "title": "Moving day task",
      "description": "Description",
      "category": "MOVING",
      "priority": "CRITICAL",
      "estimatedTime": "time",
      "tips": ["tip"]
    }
  ],
  "week1After": [
    {
      "title": "After move task",
      "description": "Description",
      "category": "SETUP",
      "priority": "HIGH",
      "estimatedTime": "time",
      "tips": ["tip"]
    }
  ]
}

Categories: UTILITIES, MOVING, PACKING, ADMIN, CLEANING, SETUP, KIDS_PETS
Priorities: CRITICAL, HIGH, MEDIUM, LOW

Include 5-8 tasks per period. Focus on practical, actionable items.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2500, temperature: 0.6 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const aiTimeline = JSON.parse(text);

      // Add IDs, completed status, and due dates
      const processedTimeline: any = {};
      for (const [key, tasks] of Object.entries(aiTimeline)) {
        processedTimeline[key] = (tasks as any[]).map((task, index) => ({
          id: `${key}_${index}`,
          ...task,
          completed: false,
          dueDate: this.calculateDueDate(key, input.closingDate),
        }));
      }

      return processedTimeline;

    } catch (error) {
      console.error('[MOVING-CONCIERGE] Timeline generation error:', error);
      return this.getBasicTimeline(input, daysUntilMove);
    }
  }

  private getBasicTimeline(input: MovingPlanInput, daysUntilMove: number): MovingPlan['timeline'] {
    const closingDate = input.closingDate;
    
    // Get all standard tasks
    const allTasks = this.getAllStandardTasks(closingDate);
    
    // Determine which periods are actually available
    const availablePeriods = this.getAvailablePeriods(daysUntilMove);
    
    // Redistribute tasks based on available time
    return this.redistributeTasks(allTasks, availablePeriods, daysUntilMove, closingDate);
  }

  private getAvailablePeriods(daysUntilMove: number): string[] {
    const periods: string[] = [];
    
    if (daysUntilMove >= 56) periods.push('weeks8Before');
    if (daysUntilMove >= 42) periods.push('weeks6Before');
    if (daysUntilMove >= 28) periods.push('weeks4Before');
    if (daysUntilMove >= 14) periods.push('weeks2Before');
    if (daysUntilMove >= 7) periods.push('week1Before');
    
    // Always include these
    periods.push('movingDay', 'week1After');
    
    return periods;
  }

  private getAllStandardTasks(closingDate: string): Record<string, MovingTask[]> {
    return {
      weeks8Before: [
        {
          id: '8w_1',
          title: 'Research moving companies',
          description: 'Get quotes from 3-5 reputable moving companies',
          category: 'MOVING',
          dueDate: this.calculateDueDate('weeks8Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '2 hours',
          completed: false,
          tips: ['Check online reviews', 'Verify insurance and licensing', 'Compare prices'],
        },
        {
          id: '8w_2',
          title: 'Create moving budget',
          description: 'Estimate all moving-related costs',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('weeks8Before', closingDate),
          priority: 'HIGH',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Include unexpected costs buffer', 'Track all expenses'],
        },
        {
          id: '8w_3',
          title: 'Start researching new area',
          description: 'Learn about neighborhoods, schools, amenities',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('weeks8Before', closingDate),
          priority: 'MEDIUM',
          estimatedTime: '3 hours',
          completed: false,
          tips: ['Visit local community forums', 'Check crime statistics', 'Map out commutes'],
        },
      ],
      weeks6Before: [
        {
          id: '6w_1',
          title: 'Book moving company',
          description: 'Confirm date and sign contract with chosen mover',
          category: 'MOVING',
          dueDate: this.calculateDueDate('weeks6Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Read contract carefully', 'Confirm insurance coverage'],
        },
        {
          id: '6w_2',
          title: 'Start decluttering',
          description: 'Begin sorting items to donate, sell, or discard',
          category: 'PACKING',
          dueDate: this.calculateDueDate('weeks6Before', closingDate),
          priority: 'HIGH',
          estimatedTime: 'Ongoing',
          completed: false,
          tips: ['One room at a time', 'Sell valuable items online'],
        },
        {
          id: '6w_3',
          title: 'Notify landlord',
          description: 'Give proper notice if renting current home',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('weeks6Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '30 min',
          completed: false,
          tips: ['Check lease for notice period', 'Get move-out checklist'],
        },
      ],
      weeks4Before: [
        {
          id: '4w_1',
          title: 'Order packing supplies',
          description: 'Purchase boxes, tape, bubble wrap, markers',
          category: 'PACKING',
          dueDate: this.calculateDueDate('weeks4Before', closingDate),
          priority: 'HIGH',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Free boxes from liquor stores', 'Use towels for padding'],
        },
        {
          id: '4w_2',
          title: 'Schedule utility setups',
          description: 'Contact all utility providers for new home',
          category: 'UTILITIES',
          dueDate: this.calculateDueDate('weeks4Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '2 hours',
          completed: false,
          tips: ['Set turn-on dates for closing day', 'Compare provider rates'],
        },
        {
          id: '4w_3',
          title: 'Transfer medical records',
          description: 'Contact doctors, dentists, vets for record transfers',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('weeks4Before', closingDate),
          priority: 'MEDIUM',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Find new providers in advance', 'Get prescriptions refilled'],
        },
      ],
      weeks2Before: [
        {
          id: '2w_1',
          title: 'Submit change of address',
          description: 'File USPS mail forwarding and update all accounts',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('weeks2Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '2 hours',
          completed: false,
          tips: ['USPS.com for mail forwarding', 'Update bank, credit cards, insurance'],
        },
        {
          id: '2w_2',
          title: 'Pack non-essentials',
          description: 'Pack seasonal items, decorations, extra linens',
          category: 'PACKING',
          dueDate: this.calculateDueDate('weeks2Before', closingDate),
          priority: 'HIGH',
          estimatedTime: 'Ongoing',
          completed: false,
          tips: ['Label all boxes clearly', 'Create inventory list'],
        },
        {
          id: '2w_3',
          title: 'Arrange for kids/pets on moving day',
          description: 'Plan care for children and pets during move',
          category: 'KIDS_PETS',
          dueDate: this.calculateDueDate('weeks2Before', closingDate),
          priority: 'HIGH',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Ask friends/family to help', 'Book pet boarding if needed'],
        },
      ],
      week1Before: [
        {
          id: '1w_1',
          title: 'Confirm moving details',
          description: 'Call moving company to confirm date, time, address',
          category: 'MOVING',
          dueDate: this.calculateDueDate('week1Before', closingDate),
          priority: 'CRITICAL',
          estimatedTime: '30 min',
          completed: false,
          tips: ['Get driver contact info', 'Confirm payment method'],
        },
        {
          id: '1w_2',
          title: 'Pack essentials box',
          description: 'Prepare box with first-night necessities',
          category: 'PACKING',
          dueDate: this.calculateDueDate('week1Before', closingDate),
          priority: 'HIGH',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Toiletries, clothes, medications', 'Phone chargers, important docs'],
        },
        {
          id: '1w_3',
          title: 'Clean current home',
          description: 'Deep clean or arrange cleaning service',
          category: 'CLEANING',
          dueDate: this.calculateDueDate('week1Before', closingDate),
          priority: 'MEDIUM',
          estimatedTime: '4 hours',
          completed: false,
          tips: ['May be required by lease', 'Consider professional cleaners'],
        },
      ],
      movingDay: [
        {
          id: 'md_1',
          title: 'Final walkthrough of old home',
          description: 'Check all rooms, closets, garage, attic',
          category: 'MOVING',
          dueDate: closingDate,
          priority: 'CRITICAL',
          estimatedTime: '30 min',
          completed: false,
          tips: ['Check all cabinets and drawers', 'Turn off lights and thermostat'],
        },
        {
          id: 'md_2',
          title: 'Oversee movers',
          description: 'Be present during loading and unloading',
          category: 'MOVING',
          dueDate: closingDate,
          priority: 'CRITICAL',
          estimatedTime: 'All day',
          completed: false,
          tips: ['Check inventory list', 'Note any damages immediately'],
        },
        {
          id: 'md_3',
          title: 'Take meter readings',
          description: 'Record final utility readings at old home',
          category: 'UTILITIES',
          dueDate: closingDate,
          priority: 'MEDIUM',
          estimatedTime: '15 min',
          completed: false,
          tips: ['Take photos as proof', 'Submit to utility companies'],
        },
      ],
      week1After: [
        {
          id: '1a_1',
          title: 'Unpack essentials',
          description: 'Set up beds, kitchen basics, bathrooms',
          category: 'SETUP',
          dueDate: this.calculateDueDate('week1After', closingDate),
          priority: 'HIGH',
          estimatedTime: '2 days',
          completed: false,
          tips: ['Start with bedrooms and kitchen', 'One room at a time'],
        },
        {
          id: '1a_2',
          title: 'Update address with government',
          description: 'Driver license, vehicle registration, voter registration',
          category: 'ADMIN',
          dueDate: this.calculateDueDate('week1After', closingDate),
          priority: 'HIGH',
          estimatedTime: '2 hours',
          completed: false,
          tips: ['Check state-specific deadlines', 'Bring proof of residency'],
        },
        {
          id: '1a_3',
          title: 'Meet neighbors',
          description: 'Introduce yourself to neighbors',
          category: 'SETUP',
          dueDate: this.calculateDueDate('week1After', closingDate),
          priority: 'LOW',
          estimatedTime: '1 hour',
          completed: false,
          tips: ['Bring small gift or treats', 'Exchange contact info'],
        },
      ],
    };
  }

  private redistributeTasks(
    allTasks: Record<string, MovingTask[]>,
    availablePeriods: string[],
    daysUntilMove: number,
    closingDate: string
  ): MovingPlan['timeline'] {
    // Initialize with all periods as empty arrays to satisfy TypeScript
    const redistributed: MovingPlan['timeline'] = {
      weeks8Before: [],
      weeks6Before: [],
      weeks4Before: [],
      weeks2Before: [],
      week1Before: [],
      movingDay: [],
      week1After: [],
    };
    
    // Define period hierarchy (earlier to later)
    const periodHierarchy = ['weeks8Before', 'weeks6Before', 'weeks4Before', 'weeks2Before', 'week1Before', 'movingDay', 'week1After'];
    
    // Collect tasks from unavailable periods
    const missedTasks: MovingTask[] = [];
    
    for (const period of periodHierarchy) {
      if (!availablePeriods.includes(period) && allTasks[period]) {
        // This period is in the past - collect its tasks
        missedTasks.push(...allTasks[period]);
      }
    }
    
    // Separate missed tasks by priority
    const criticalMissed = missedTasks.filter(t => t.priority === 'CRITICAL');
    const highMissed = missedTasks.filter(t => t.priority === 'HIGH');
    const otherMissed = missedTasks.filter(t => ['MEDIUM', 'LOW'].includes(t.priority || 'LOW'));
    
    // Get first available period (excluding movingDay and week1After)
    const firstWorkingPeriod = availablePeriods.find(p => !['movingDay', 'week1After'].includes(p));
    
    // Build redistributed timeline
    for (const period of availablePeriods) {
      if (period === firstWorkingPeriod && missedTasks.length > 0) {
        // This is the earliest available period - add compressed tasks
        const compressedTasks: MovingTask[] = [];
        
        // Add CRITICAL missed tasks first with urgency markers
        criticalMissed.forEach((task, index) => {
          compressedTasks.push({
            ...task,
            id: `${period}_compressed_critical_${index}`,
            description: `⚠️ URGENT - Start immediately: ${task.description}`,
            dueDate: this.calculateDueDate(period, closingDate),
            priority: 'CRITICAL',
          });
        });
        
        // Add HIGH priority missed tasks
        highMissed.forEach((task, index) => {
          compressedTasks.push({
            ...task,
            id: `${period}_compressed_high_${index}`,
            description: `⚠️ URGENT: ${task.description}`,
            dueDate: this.calculateDueDate(period, closingDate),
            priority: 'HIGH',
          });
        });
        
        // Add only the most important MEDIUM/LOW tasks if time is very tight
        if (daysUntilMove >= 14) {
          // If we have at least 2 weeks, include some medium priority tasks
          otherMissed.slice(0, 3).forEach((task, index) => {
            compressedTasks.push({
              ...task,
              id: `${period}_compressed_other_${index}`,
              description: `Soon: ${task.description}`,
              dueDate: this.calculateDueDate(period, closingDate),
            });
          });
        }
        
        // Combine compressed tasks with original period tasks
        const originalTasks = allTasks[period] || [];
        redistributed[period as keyof MovingPlan['timeline']] = [...compressedTasks, ...originalTasks];
        
      } else if (allTasks[period]) {
        // Regular period - just use original tasks
        redistributed[period as keyof MovingPlan['timeline']] = [...allTasks[period]];
      }
      // If period not available, it stays as empty array (already initialized)
    }
    
    return redistributed;
  }

  private calculateDueDate(period: string, closingDate: string): string {
    const closing = new Date(closingDate);
    const daysMap: Record<string, number> = {
      'weeks8Before': -56,
      'weeks6Before': -42,
      'weeks4Before': -28,
      'weeks2Before': -14,
      'week1Before': -7,
      'movingDay': 0,
      'week1After': 7,
    };

    const days = daysMap[period] || 0;
    const dueDate = new Date(closing);
    dueDate.setDate(dueDate.getDate() + days);
    return dueDate.toISOString().split('T')[0];
  }

  private generateUtilitySetup(input: MovingPlanInput): UtilitySetup[] {
    return UTILITY_SERVICES.map(service => ({
      ...service,
      estimatedCost: this.estimateUtilityCost(service.service, input.homeSize),
    }));
  }

  private estimateUtilityCost(service: string, homeSize: number): string {
    const estimates: Record<string, string> = {
      'Electricity': homeSize > 2500 ? '$150-250/mo' : '$100-150/mo',
      'Gas': homeSize > 2500 ? '$80-120/mo' : '$50-80/mo',
      'Water/Sewer': '$50-80/mo',
      'Internet/Cable': '$60-150/mo',
      'Trash/Recycling': '$20-40/mo',
      'Security System': '$30-60/mo',
    };
    return estimates[service] || 'Varies';
  }

  private generateCostEstimates(input: MovingPlanInput): MovingPlan['costEstimates'] {
    const estimates: MovingCostEstimate[] = [];

    // Moving company cost
    let movingCost = 0;
    if (input.movingDistance === 'LOCAL') {
      movingCost = input.homeSize > 2000 ? 1500 : 1000;
    } else if (input.movingDistance === 'LONG_DISTANCE') {
      movingCost = input.homeSize > 2000 ? 4000 : 3000;
    } else {
      movingCost = input.homeSize > 2000 ? 6000 : 4500;
    }

    estimates.push({
      category: 'Moving Company',
      estimatedCost: movingCost,
      range: { min: movingCost * 0.8, max: movingCost * 1.2 },
      notes: 'Based on home size and distance. Get 3-5 quotes for accurate pricing.',
    });

    // Packing supplies
    const packingCost = input.numberOfRooms * 50;
    estimates.push({
      category: 'Packing Supplies',
      estimatedCost: packingCost,
      range: { min: packingCost * 0.7, max: packingCost * 1.5 },
      notes: 'Boxes, tape, bubble wrap, markers. Can reduce by sourcing free boxes.',
    });

    // Cleaning
    estimates.push({
      category: 'Professional Cleaning',
      estimatedCost: 350,
      range: { min: 200, max: 500 },
      notes: 'Deep clean of old home. May be required by landlord or for sale.',
    });

    // Storage (if needed)
    if (input.movingDistance !== 'LOCAL') {
      estimates.push({
        category: 'Temporary Storage',
        estimatedCost: 200,
        range: { min: 150, max: 300 },
        notes: 'Per month. May be needed if moving dates don\'t align.',
      });
    }

    // Travel/accommodation
    if (input.movingDistance === 'LONG_DISTANCE' || input.movingDistance === 'CROSS_COUNTRY') {
      const travelCost = input.familySize * 200;
      estimates.push({
        category: 'Travel & Lodging',
        estimatedCost: travelCost,
        range: { min: travelCost * 0.8, max: travelCost * 1.5 },
        notes: 'Hotels, meals during travel. Varies by distance and family size.',
      });
    }

    // Miscellaneous
    estimates.push({
      category: 'Miscellaneous',
      estimatedCost: 500,
      range: { min: 300, max: 800 },
      notes: 'Unexpected expenses, tips for movers, last-minute supplies.',
    });

    const total = estimates.reduce((sum, e) => sum + e.estimatedCost, 0);

    return { total: Math.round(total), breakdown: estimates };
  }

  private generatePackingSchedule(
    input: MovingPlanInput,
    daysUntilMove: number
  ): MovingPlan['packingSchedule'] {
    const schedule: MovingPlan['packingSchedule'] = [];

    if (daysUntilMove >= 28) {
      schedule.push({
        week: '4 weeks before',
        rooms: ['Garage', 'Attic', 'Storage areas'],
        tips: ['Pack seasonal items', 'Donate unused items', 'Label all boxes clearly'],
      });
    }

    if (daysUntilMove >= 21) {
      schedule.push({
        week: '3 weeks before',
        rooms: ['Guest bedrooms', 'Formal dining room', 'Office'],
        tips: ['Pack books and decorations', 'Back up computer files', 'Photograph furniture arrangement'],
      });
    }

    if (daysUntilMove >= 14) {
      schedule.push({
        week: '2 weeks before',
        rooms: ['Living room', 'Extra closets', 'Laundry room'],
        tips: ['Pack artwork and fragile items carefully', 'Use up frozen food', 'Defrost freezer'],
      });
    }

    schedule.push({
      week: '1 week before',
      rooms: ['Bedrooms (except essentials)', 'Bathroom extras', 'Kitchen non-essentials'],
      tips: ['Keep one set of dishes per person', 'Pack suitcase with 1 week of clothes', 'Confirm moving truck reservation'],
    });

    schedule.push({
      week: 'Moving day',
      rooms: ['Final items', 'Essentials box', 'Valuables'],
      tips: ['Pack essentials box last', 'Keep important documents with you', 'Do final walkthrough'],
    });

    return schedule;
  }

  private async getAIRecommendations(
    input: MovingPlanInput,
    daysUntilMove: number
  ): Promise<string[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(input, daysUntilMove);
    }

    try {
      const prompt = `Provide 6 personalized moving recommendations for a home buyer.

Details:
- Days until move: ${daysUntilMove}
- Moving distance: ${input.movingDistance}
- Home size: ${input.homeSize} sqft
- Family size: ${input.familySize}
- Pets: ${input.hasPets}
- Special requirements: ${input.specialRequirements || 'None'}

${daysUntilMove < 28 ? `
URGENT CONTEXT: User has less than 4 weeks to move! Prioritize time-critical recommendations.
` : ''}

Return ONLY a JSON array of specific, actionable recommendations:
["Recommendation 1", "Recommendation 2", ...]

Focus on: timing, cost-saving tips, stress reduction, family-specific advice.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 500, temperature: 0.7 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text).slice(0, 6);

    } catch (error) {
      console.error('[MOVING-CONCIERGE] Recommendations error:', error);
      return this.getBasicRecommendations(input, daysUntilMove);
    }
  }

  private getBasicRecommendations(input: MovingPlanInput, daysUntilMove: number): string[] {
    const recs: string[] = [];

    if (daysUntilMove < 14) {
      recs.push('⚠️ URGENT: You have less than 2 weeks! Focus on booking movers and utilities immediately.');
    } else if (daysUntilMove < 28) {
      recs.push('⚠️ Time is tight! Prioritize critical tasks like booking movers and scheduling utilities.');
    } else {
      recs.push('You have plenty of time. Use this period to research and compare moving companies thoroughly.');
    }

    if (input.movingDistance === 'CROSS_COUNTRY') {
      recs.push('For cross-country moves, consider shipping some items via freight to reduce moving truck costs.');
    }

    if (input.familySize > 3) {
      recs.push('With a larger family, assign packing responsibilities to each family member for their own rooms.');
    }

    if (input.hasPets) {
      recs.push('Arrange pet care for moving day. Keep pets in a quiet room or with a friend to reduce stress.');
    }

    recs.push('Take photos of electronic setups before unplugging to make reconnection easier in new home.');
    recs.push('Start using up frozen and pantry items 2-3 weeks before move to reduce food waste.');

    return recs.slice(0, 6);
  }
  async saveMovingPlan(
    propertyId: string,
    userId: string,
    planData: MovingPlan
  ): Promise<void> {
    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });
  
    if (!property) {
      throw new Error('Property not found');
    }
  
    // Save or update plan
    const existingPlan = await prisma.movingPlan.findFirst({
      where: { propertyId }
    });

    if (existingPlan) {
      await prisma.movingPlan.update({
        where: { id: existingPlan.id },
        data: {
          closingDate: new Date(planData.closingDate),
          planData: planData as any,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.movingPlan.create({
        data: {
          propertyId: propertyId,
          closingDate: new Date(planData.closingDate),
          planData: planData as any,
          completedTasks: [],
        },
      });
    }
  }
  
  async getMovingPlan(
    propertyId: string,
    userId: string
  ): Promise<MovingPlan | null> {
    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });
  
    if (!property) {
      throw new Error('Property not found');
    }
  
    const savedPlan = await prisma.movingPlan.findFirst({
      where: { propertyId }
    });
  
    if (!savedPlan) {
      return null;
    }
  
    return {
      ...(savedPlan.planData as any),
      completedTasks: savedPlan.completedTasks || [],
    };
  }
  
  async updateCompletedTasks(
    propertyId: string,
    userId: string,
    completedTaskIds: string[]
  ): Promise<void> {
    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });
  
    if (!property) {
      throw new Error('Property not found');
    }
  
    const existingPlan = await prisma.movingPlan.findFirst({
      where: { propertyId }
    });

    if (!existingPlan) {
      throw new Error('Moving plan not found');
    }

    await prisma.movingPlan.update({
      where: { id: existingPlan.id },
      data: {
        completedTasks: completedTaskIds,
        updatedAt: new Date(),
      },
    });
  }
  
  async deleteMovingPlan(
    propertyId: string,
    userId: string
  ): Promise<void> {
    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });
  
    if (!property) {
      throw new Error('Property not found');
    }
  
    // Find the moving plan first, then delete by id
    const existingPlan = await prisma.movingPlan.findFirst({
      where: { propertyId }
    });

    if (existingPlan) {
      await prisma.movingPlan.delete({
        where: { id: existingPlan.id }
      });
    }
  }

}



export const movingConciergeService = new MovingConciergeService();