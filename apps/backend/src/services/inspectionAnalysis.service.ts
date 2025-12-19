// apps/backend/src/services/inspectionAnalysis.service.ts

import { GoogleGenAI } from "@google/genai";
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
//const pdfParse = require('pdf-parse');
//import * as pdfParseModule from 'pdf-parse';
//const pdfParse = (pdfParseModule as any).default || pdfParseModule;

interface InspectionIssue {
  title: string;
  description: string;
  location: string;
  category: 'STRUCTURAL' | 'SAFETY' | 'MAINTENANCE' | 'COSMETIC' | 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'ROOFING' | 'FOUNDATION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'COSMETIC';
  urgency: 'IMMEDIATE' | 'SOON' | 'PLAN' | 'OPTIONAL';
  isCritical: boolean;
  estimatedCost: number;
  costRange: { min: number; max: number };
  inspectorNotes?: string;
  inspectorRecommendation?: string;
  repairRecommendations: string[];
  preventativeMeasures: string[];
  estimatedRepairTime?: string;
  needsImmediateAction: boolean;
  scheduledMaintenanceDate?: Date;
  maintenanceFrequency?: string;
}

interface AnalysisResult {
  overallScore: number;
  overallCondition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  issues: InspectionIssue[];
  totalRepairCost: number;
  criticalRepairCost: number;
  recommendedRepairCost: number;
  negotiationScript: string;
  suggestedCredit: number;
  negotiationPoints: string[];
  marketContext: string;
}

export class InspectionAnalysisService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Analyze an inspection report PDF
   */
  async analyzeInspectionReport(
    propertyId: string,
    userId: string,
    pdfBuffer: Buffer,
    fileName: string,
    propertyData: any
  ): Promise<string> {
    console.log(`[INSPECTION] Starting analysis for property ${propertyId}`);

    // Extract text from PDF
    const pdfText = await this.extractTextFromPDF(pdfBuffer);
    
    if (!pdfText || pdfText.length < 100) {
      throw new Error('Failed to extract text from PDF or PDF is too short');
    }

    console.log(`[INSPECTION] Extracted ${pdfText.length} characters from PDF`);

    // Create inspection report record
    const report = await prisma.inspectionReport.create({
      data: {
        propertyId,
        userId,
        pdfFileName: fileName,
        analysisCompleted: false,
      },
    });

    console.log(`[INSPECTION] Created report ${report.id}`);

    try {
      // Analyze with AI
      const analysis = await this.analyzeWithAI(pdfText, propertyData);
      
      // Save issues to database
      const issuesData = analysis.issues.map(issue => ({
        reportId: report.id,
        title: issue.title,
        description: issue.description,
        location: issue.location,
        category: issue.category,
        severity: issue.severity,
        urgency: issue.urgency,
        isCritical: issue.isCritical,
        estimatedCost: issue.estimatedCost,
        costRange: issue.costRange,
        inspectorNotes: issue.inspectorNotes,
        inspectorRecommendation: issue.inspectorRecommendation,
        repairRecommendations: issue.repairRecommendations,
        preventativeMeasures: issue.preventativeMeasures,
        estimatedRepairTime: issue.estimatedRepairTime,
        needsImmediateAction: issue.needsImmediateAction,
        scheduledMaintenanceDate: issue.scheduledMaintenanceDate,
        maintenanceFrequency: issue.maintenanceFrequency,
      }));

      await prisma.inspectionIssue.createMany({
        data: issuesData,
      });

      console.log(`[INSPECTION] Created ${issuesData.length} issues`);

      // Count issues by severity
      const criticalCount = analysis.issues.filter(i => i.severity === 'CRITICAL').length;
      const highCount = analysis.issues.filter(i => i.severity === 'HIGH').length;
      const mediumCount = analysis.issues.filter(i => i.severity === 'MEDIUM').length;
      const lowCount = analysis.issues.filter(i => i.severity === 'LOW').length;
      const cosmeticCount = analysis.issues.filter(i => i.severity === 'COSMETIC').length;

      // Update report with analysis results
      await prisma.inspectionReport.update({
        where: { id: report.id },
        data: {
          overallScore: analysis.overallScore,
          overallCondition: analysis.overallCondition,
          totalIssuesFound: analysis.issues.length,
          criticalIssues: criticalCount,
          highPriorityIssues: highCount,
          mediumIssues: mediumCount,
          lowIssues: lowCount,
          cosmeticIssues: cosmeticCount,
          totalRepairCost: analysis.totalRepairCost,
          criticalRepairCost: analysis.criticalRepairCost,
          recommendedRepairCost: analysis.recommendedRepairCost,
          negotiationScript: analysis.negotiationScript,
          suggestedCredit: analysis.suggestedCredit,
          negotiationPoints: analysis.negotiationPoints,
          marketContext: analysis.marketContext,
          analysisCompleted: true,
        },
      });

      console.log(`[INSPECTION] Analysis completed successfully`);
      return report.id;

    } catch (error: any) {
      console.error('[INSPECTION] Analysis failed:', error);
      
      // Update report with error
      await prisma.inspectionReport.update({
        where: { id: report.id },
        data: {
          analysisCompleted: false,
          analysisError: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
      console.log('[DEBUG] Buffer size:', buffer.length);
      console.log('[DEBUG] First 10 bytes:', buffer.slice(0, 10).toString());
      
      // Verify it's a PDF
      if (!buffer.toString('utf8', 0, 4).includes('PDF')) {
        throw new Error('File does not appear to be a valid PDF');
      }
      
      // Use eval to avoid TypeScript compilation issues
      const pdfParse = eval('require')('pdf-parse');
      
      const options = {
        max: 0, // Parse all pages
      };
      
      const data = await pdfParse(buffer, options);
      
      console.log('[INSPECTION] Pages:', data.numpages);
      console.log('[INSPECTION] Text length:', data.text?.length || 0);
      
      if (!data.text || data.text.trim().length < 100) {
        throw new Error('Could not extract readable text from PDF');
      }
      
      console.log('[INSPECTION] Sample text:', data.text.substring(0, 300));
      
      return data.text;
    } catch (error: any) {
      console.error('[INSPECTION] PDF Error:', error.message);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Analyze inspection text with Gemini AI
   */
  private async analyzeWithAI(inspectionText: string, propertyData: any): Promise<AnalysisResult> {
    const prompt = `You are an expert home inspector and real estate advisor. Analyze this home inspection report and extract all issues.

PROPERTY INFO:
- Address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state}
- Type: ${propertyData.propertyType || 'Single Family'}
- Year Built: ${propertyData.yearBuilt || 'Unknown'}
- Size: ${propertyData.propertySize || 'Unknown'} sq ft

INSPECTION REPORT TEXT:
${inspectionText}

Extract EVERY issue mentioned in the report. For each issue:
1. Categorize as CRITICAL/HIGH/MEDIUM/LOW/COSMETIC
2. Match to inspector's severity if mentioned
3. Provide realistic repair cost estimates
4. Determine urgency (IMMEDIATE/SOON/PLAN/OPTIONAL)
5. Suggest preventative measures
6. Estimate repair timeline

Also provide:
- Overall property condition score (0-100)
- Professional negotiation script
- Suggested repair credit amount
- Key negotiation points

Return ONLY valid JSON in this exact format:
{
  "overallScore": 75,
  "overallCondition": "GOOD",
  "issues": [
    {
      "title": "Issue title",
      "description": "Detailed description",
      "location": "Specific location",
      "category": "STRUCTURAL",
      "severity": "HIGH",
      "urgency": "SOON",
      "isCritical": false,
      "estimatedCost": 5000,
      "costRange": { "min": 4000, "max": 6000 },
      "inspectorNotes": "From inspector report",
      "inspectorRecommendation": "Recommended action",
      "repairRecommendations": ["Recommendation 1", "Recommendation 2"],
      "preventativeMeasures": ["Preventative step 1"],
      "estimatedRepairTime": "1-2 weeks",
      "needsImmediateAction": false,
      "maintenanceFrequency": "annually"
    }
  ],
  "totalRepairCost": 15000,
  "criticalRepairCost": 5000,
  "recommendedRepairCost": 10000,
  "negotiationScript": "Professional email text...",
  "suggestedCredit": 10000,
  "negotiationPoints": ["Point 1", "Point 2"],
  "marketContext": "Market analysis..."
}

CRITICAL: Extract at least 95% of all issues. Match inspector severity. Cost estimates must be within 20% of market rates.`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{ 
        role: "user", 
        parts: [{ text: prompt }] 
      }],
      config: { 
        maxOutputTokens: 8000,
        temperature: 0.2
      }
    });

    if (!response.text) {
      throw new Error('AI returned empty response');
    }

    const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(text);

    return analysis;
  }

  /**
   * Get inspection report by ID
   */
  async getInspectionReport(reportId: string, userId: string) {
    const report = await prisma.inspectionReport.findFirst({
      where: {
        id: reportId,
        userId: userId,
      },
      include: {
        issues: {
          orderBy: [
            { isCritical: 'desc' },
            { severity: 'asc' },
            { estimatedCost: 'desc' },
          ],
        },
        property: true,
      },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    return report;
  }

  /**
   * Get all reports for a property
   */
  async getPropertyReports(propertyId: string, userId: string) {
    const reports = await prisma.inspectionReport.findMany({
      where: {
        propertyId,
        userId,
      },
      include: {
        issues: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reports;
  }

  /**
   * Generate maintenance calendar from issues
   */
  async generateMaintenanceCalendar(reportId: string, userId: string) {
    const report = await this.getInspectionReport(reportId, userId);
    
    const calendar = report.issues
      .filter((issue: typeof report.issues[0]) => issue.scheduledMaintenanceDate || issue.maintenanceFrequency)
      .map((issue: typeof report.issues[0]) => ({
        id: issue.id,
        title: issue.title,
        location: issue.location,
        severity: issue.severity,
        scheduledDate: issue.scheduledMaintenanceDate,
        frequency: issue.maintenanceFrequency,
        estimatedCost: issue.estimatedCost,
        needsImmediateAction: issue.needsImmediateAction,
      }))
      .sort((a: typeof calendar[0], b: typeof calendar[0]) => {
        if (a.needsImmediateAction && !b.needsImmediateAction) return -1;
        if (!a.needsImmediateAction && b.needsImmediateAction) return 1;
        if (a.scheduledDate && b.scheduledDate) {
          return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
        }
        return 0;
      });

    return calendar;
  }
}

export const inspectionAnalysisService = new InspectionAnalysisService();