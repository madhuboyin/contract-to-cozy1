// apps/backend/src/services/visualInspector.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface DetectedIssue {
  title: string;
  category: 'STRUCTURAL' | 'SAFETY' | 'MAINTENANCE' | 'AESTHETIC' | 'HVAC' | 'PLUMBING' | 'ELECTRICAL';
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
  overallCondition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  conditionScore: number; // 0-100
  detectedIssues: DetectedIssue[];
  positiveFeatures: string[];
  generalObservations: string[];
}

interface InspectionReport {
  propertyId: string;
  propertyAddress: string;
  inspectionDate: Date;
  
  overallScore: number; // 0-100
  overallCondition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  
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
  
  generatedAt: Date;
}

const ROOM_TYPES = [
  'Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Dining Room',
  'Basement', 'Attic', 'Garage', 'Exterior', 'Roof', 'Foundation',
  'Laundry Room', 'Office', 'Hallway', 'Other'
];

export class VisualInspectorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[VISUAL-INSPECTOR] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async analyzePropertyImages(
    propertyId: string,
    userId: string,
    images: { file: Express.Multer.File; roomType: string }[]
  ): Promise<InspectionReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    if (!this.ai) {
      throw new Error('AI service not configured');
    }

    console.log(`[VISUAL-INSPECTOR] Analyzing ${images.length} images for property ${propertyId}`);

    // Analyze each image
    const imageAnalyses: ImageAnalysis[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const { file, roomType } = images[i];
      
      try {
        const analysis = await this.analyzeImage(file, roomType, i);
        imageAnalyses.push(analysis);
      } catch (error) {
        console.error(`[VISUAL-INSPECTOR] Error analyzing image ${i}:`, error);
        // Continue with other images
      }
    }

    // Calculate overall metrics
    const allIssues = imageAnalyses.flatMap(a => a.detectedIssues);
    
    const criticalIssues = allIssues.filter(i => i.severity === 'CRITICAL');
    const highPriorityIssues = allIssues.filter(i => i.severity === 'HIGH');
    const estimatedRepairCost = allIssues.reduce((sum, i) => sum + i.estimatedCost, 0);

    // Calculate overall score
    const avgScore = imageAnalyses.length > 0
      ? Math.round(imageAnalyses.reduce((sum, a) => sum + a.conditionScore, 0) / imageAnalyses.length)
      : 50;

    const overallCondition = this.getConditionFromScore(avgScore);

    // Group issues by category
    const issuesByCategory = this.groupIssuesByCategory(allIssues);

    // Prioritize actions
    const prioritizedActions = this.prioritizeActions(allIssues);

    return {
      propertyId,
      propertyAddress: property.address,
      inspectionDate: new Date(),
      overallScore: avgScore,
      overallCondition,
      imageAnalyses,
      summary: {
        totalIssues: allIssues.length,
        criticalIssues: criticalIssues.length,
        highPriorityIssues: highPriorityIssues.length,
        estimatedRepairCost: Math.round(estimatedRepairCost),
      },
      issuesByCategory,
      prioritizedActions: prioritizedActions.slice(0, 10),
      generatedAt: new Date(),
    };
  }

  private async analyzeImage(
    file: Express.Multer.File,
    roomType: string,
    imageIndex: number
  ): Promise<ImageAnalysis> {
    const prompt = `You are a professional home inspector analyzing this ${roomType} image.

Provide a detailed inspection analysis in JSON format:

{
  "overallCondition": "EXCELLENT|GOOD|FAIR|POOR|CRITICAL",
  "conditionScore": 85,
  "detectedIssues": [
    {
      "title": "Water damage on ceiling",
      "category": "STRUCTURAL|SAFETY|MAINTENANCE|AESTHETIC|HVAC|PLUMBING|ELECTRICAL",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "description": "Visible brown staining indicates active leak",
      "location": "Northwest corner ceiling",
      "estimatedCost": 1200,
      "urgency": "IMMEDIATE|SOON|PLAN|OPTIONAL",
      "recommendations": ["Call plumber immediately", "Check roof for leaks"],
      "preventativeMeasures": ["Regular roof inspections", "Maintain gutters"]
    }
  ],
  "positiveFeatures": ["Well-maintained flooring", "Modern fixtures"],
  "generalObservations": ["Room appears clean", "Good natural lighting"]
}

Look for:
- Structural issues (cracks, water damage, foundation issues)
- Safety hazards (exposed wiring, trip hazards, mold, fire hazards)
- Maintenance needs (peeling paint, worn surfaces, outdated systems)
- Plumbing issues (leaks, corrosion, poor drainage)
- Electrical concerns (exposed wires, outdated outlets)
- HVAC problems (vent blockage, visible damage)
- Aesthetic improvements (outdated fixtures, poor lighting)

Be thorough but realistic. Not every room will have critical issues.
If the room looks fine, say so with minimal issues.
Provide cost estimates in USD.

Return ONLY valid JSON (no markdown, no explanation).`;

    const imageData = {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      }
    };

    const response = await this.ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{ 
        role: "user", 
        parts: [
          { text: prompt },
          imageData
        ] 
      }],
      config: { maxOutputTokens: 2000, temperature: 0.3 }
    });

    if (!response.text) {
      throw new Error('AI service returned an empty response');
    }

    const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(text);

    return {
      imageId: `img_${imageIndex}`,
      roomType,
      overallCondition: analysis.overallCondition,
      conditionScore: analysis.conditionScore,
      detectedIssues: analysis.detectedIssues || [],
      positiveFeatures: analysis.positiveFeatures || [],
      generalObservations: analysis.generalObservations || [],
    };
  }

  private getConditionFromScore(score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL' {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'FAIR';
    if (score >= 40) return 'POOR';
    return 'CRITICAL';
  }

  private groupIssuesByCategory(issues: DetectedIssue[]): { category: string; count: number; totalCost: number }[] {
    const categoryMap = new Map<string, { count: number; totalCost: number }>();

    issues.forEach(issue => {
      const existing = categoryMap.get(issue.category) || { count: 0, totalCost: 0 };
      categoryMap.set(issue.category, {
        count: existing.count + 1,
        totalCost: existing.totalCost + issue.estimatedCost,
      });
    });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  private prioritizeActions(issues: DetectedIssue[]): DetectedIssue[] {
    // Sort by severity, then urgency, then cost
    const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    const urgencyOrder = { 'IMMEDIATE': 4, 'SOON': 3, 'PLAN': 2, 'OPTIONAL': 1 };

    return [...issues].sort((a, b) => {
      // First by severity
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;

      // Then by urgency
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;

      // Then by cost (higher cost = higher priority for big issues)
      return b.estimatedCost - a.estimatedCost;
    });
  }
}

export const visualInspectorService = new VisualInspectorService();