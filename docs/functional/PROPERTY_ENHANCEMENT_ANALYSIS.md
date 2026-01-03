# 🏡 Property Onboarding Enhancement - Complete Analysis

## 📋 Executive Summary

**Project**: Enhanced Property Onboarding with Health Score System  
**Current State**: Basic 5-field property form (name, address, city, state, zipCode)  
**Target State**: 10 mandatory fields + 17+ optional fields with dynamic health scoring  
**Architecture**: Next.js 14 frontend + Node.js/Express backend + PostgreSQL + Prisma ORM

---

## 🔍 CURRENT IMPLEMENTATION REVIEW

### **Existing Database Schema (Property Model)**
```prisma
model Property {
  id                 String   @id @default(uuid())
  homeownerProfileId String
  
  // Current fields (5 total)
  name         String?  // Optional
  address      String   // Required
  city         String   // Required
  state        String   // Required
  zipCode      String   // Required
  isPrimary    Boolean  @default(true)
  
  // Relations
  homeownerProfile HomeownerProfile @relation(...)
  bookings         Booking[]
  warranties       Warranty[]
  insurancePolicies InsurancePolicy[]
  expenses         Expense[]
  documents        Document[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### **Existing HomeownerProfile Fields**
```prisma
model HomeownerProfile {
  // Already exists - can be used:
  segment              HomeownerSegment @default(EXISTING_OWNER)
  propertyType         String?  // Single Family, Condo, etc.
  propertySize         Int?     // Square footage
  yearBuilt            Int?
  bedrooms             Int?
  bathrooms            Float?
  
  // Relations
  properties  Property[]
}
```

**Key Finding**: Some required fields (yearBuilt, propertySize, bedrooms) already exist in `HomeownerProfile` but should be moved to `Property` model for multi-property support.

### **Current Frontend Components**
- **Location**: `apps/frontend/src/app/(dashboard)/dashboard/properties/`
- **Add Form**: Basic form with 5 fields (name, address, city, state, zipCode)
- **Edit Form**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx`
- **UI Library**: shadcn/ui components (Input, Select, Button, Card)
- **Validation**: Client-side validation only

### **Current Backend API**
- **Controller**: `apps/backend/src/controllers/property.controller.ts`
- **Routes**: `apps/backend/src/routes/property.routes.ts`
- **Validation**: Zod schemas for create/update
- **Endpoints**:
  - `GET /api/properties` - List properties
  - `POST /api/properties` - Create property
  - `GET /api/properties/:id` - Get single property
  - `PUT /api/properties/:id` - Update property
  - `DELETE /api/properties/:id` - Delete property

---

## 🎯 REQUIRED CHANGES BREAKDOWN

## 1️⃣ BACKEND CHANGES

### **A. Database Schema Migration (HIGH PRIORITY)**

**File**: `apps/backend/prisma/schema.prisma`

```prisma
model Property {
  id                 String   @id @default(uuid())
  homeownerProfileId String
  
  // ========== SECTION 1: Property Basics (6 fields) ==========
  name         String?  // EXISTING - Optional
  address      String   // EXISTING - Required
  propertyType PropertyType // NEW - Required enum
  ownershipType OwnershipType // NEW - Required enum
  yearBuilt    Int      // MOVED from HomeownerProfile - Required
  squareFootage Int     // MOVED from HomeownerProfile (rename from propertySize) - Required
  numberOfOccupants Int // NEW - Required
  
  // ========== SECTION 2: Key Systems Snapshot (4 fields) ==========
  heatingType   HeatingType   // NEW - Required enum
  coolingType   CoolingType   // NEW - Required enum
  waterHeaterType WaterHeaterType // NEW - Required enum
  roofType      RoofType      // NEW - Required enum
  
  // ========== OPTIONAL FIELDS: Systems & Structure ==========
  hvacInstallYear       Int? // NEW - Optional
  waterHeaterInstallYear Int? // NEW - Optional
  roofReplacementYear   Int? // NEW - Optional
  foundationType        String? // NEW - Optional
  sidingType            String? // NEW - Optional
  electricalPanelAge    Int? // NEW - Optional
  
  // ========== OPTIONAL FIELDS: Exterior & Utilities ==========
  lotSize               Int? // NEW - Optional (square feet)
  hasLawnIrrigation     Boolean? // NEW - Optional
  hasDrainageIssues     Boolean? // NEW - Optional
  
  // ========== OPTIONAL FIELDS: Safety ==========
  hasSmokeCODetectors   Boolean? // NEW - Optional
  hasSecuritySystem     Boolean? // NEW - Optional
  hasFireExtinguisher   Boolean? // NEW - Optional
  
  // ========== HEALTH SCORE FIELDS ==========
  healthScore           Int     @default(0) // NEW - Calculated score (0-100)
  healthScoreBreakdown  Json? // NEW - Detailed breakdown
  lastScoreCalculation  DateTime? // NEW - Timestamp
  
  // EXISTING FIELDS
  city        String   // KEEP - Used in address
  state       String   // KEEP - Used in address
  zipCode     String   // KEEP - Used in address
  isPrimary   Boolean  @default(true) // KEEP
  
  // Relations (EXISTING - No changes)
  homeownerProfile HomeownerProfile @relation(...)
  bookings         Booking[]
  warranties       Warranty[]
  insurancePolicies InsurancePolicy[]
  expenses         Expense[]
  documents        Document[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([homeownerProfileId])
  @@index([propertyType])
  @@index([healthScore])
  @@map("properties")
}

// ========== NEW ENUMS ==========

enum PropertyType {
  SINGLE_FAMILY
  TOWNHOME
  CONDO
  APARTMENT
  MULTI_UNIT
  INVESTMENT_PROPERTY
}

enum OwnershipType {
  OWNER_OCCUPIED
  RENTED_OUT
}

enum HeatingType {
  HVAC
  FURNACE
  HEAT_PUMP
  RADIATORS
  NONE_UNSURE
}

enum CoolingType {
  CENTRAL_AC
  WINDOW_AC
  NONE_UNSURE
}

enum WaterHeaterType {
  TANK
  TANKLESS
  HEAT_PUMP
  SOLAR
  UNKNOWN
}

enum RoofType {
  SHINGLE
  TILE
  FLAT
  METAL
  UNKNOWN
}
```

**Migration Strategy**:
1. Add new enums
2. Add new fields with nullable/default values
3. Migrate existing `HomeownerProfile` data (yearBuilt, propertySize) to Property
4. Make new fields required in Phase 2
5. Update indexes

### **B. Backend Service Layer Updates**

**File**: `apps/backend/src/services/property.service.ts` (CREATE OR UPDATE)

```typescript
import { PrismaClient, Property, PropertyType, OwnershipType } from '@prisma/client';

const prisma = new PrismaClient();

interface PropertyHealthScore {
  total: number; // 0-100
  breakdown: {
    ageFactor: number;       // 0-15 points
    structureFactor: number; // 0-10 points
    systemsFactor: number;   // 0-15 points
    usageWearFactor: number; // 0-10 points
    sizeFactor: number;      // 0-5 points
  };
  extraPoints: {
    hvacAge: number;         // 0-10 points
    waterHeaterAge: number;  // 0-5 points
    roofAge: number;         // 0-10 points
    safety: number;          // 0-5 points
    appliances: number;      // 0-5 points
    exterior: number;        // 0-5 points
    documents: number;       // 0-5 points
  };
  maxPossible: number; // Dynamic based on optional fields completed
}

export const calculateHealthScore = (property: Property): PropertyHealthScore => {
  // Base score calculation (55 points possible)
  const baseScore = {
    ageFactor: calculateAgeFactor(property.yearBuilt),           // 0-15
    structureFactor: calculateStructureFactor(property),         // 0-10
    systemsFactor: calculateSystemsFactor(property),             // 0-15
    usageWearFactor: calculateUsageWearFactor(property),        // 0-10
    sizeFactor: calculateSizeFactor(property.squareFootage),    // 0-5
  };

  // Extra score calculation (45 points possible)
  const extraPoints = {
    hvacAge: property.hvacInstallYear ? calculateHVACScore(property) : 0,           // 0-10
    waterHeaterAge: property.waterHeaterInstallYear ? 5 : 0,                        // 0-5
    roofAge: property.roofReplacementYear ? calculateRoofScore(property) : 0,       // 0-10
    safety: calculateSafetyScore(property),                                         // 0-5
    appliances: 0, // TODO: Add appliance tracking                                  // 0-5
    exterior: calculateExteriorScore(property),                                     // 0-5
    documents: 0, // TODO: Count uploaded documents                                 // 0-5
  };

  const total = Object.values(baseScore).reduce((sum, val) => sum + val, 0) +
                Object.values(extraPoints).reduce((sum, val) => sum + val, 0);

  return {
    total: Math.min(total, 100),
    breakdown: baseScore,
    extraPoints,
    maxPossible: 100,
  };
};

// Helper calculation functions
const calculateAgeFactor = (yearBuilt: number): number => {
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearBuilt;
  
  if (age <= 5) return 15;      // New construction
  if (age <= 15) return 12;     // Modern
  if (age <= 30) return 9;      // Middle-aged
  if (age <= 50) return 6;      // Older
  return 3;                     // Historic
};

const calculateStructureFactor = (property: Property): number => {
  let score = 5; // Base score
  
  // Roof type scoring
  const roofScores = {
    METAL: 5,
    TILE: 4,
    SHINGLE: 3,
    FLAT: 2,
    UNKNOWN: 1
  };
  score += roofScores[property.roofType] || 0;
  
  return Math.min(score, 10);
};

const calculateSystemsFactor = (property: Property): number => {
  let score = 0;
  
  // Heating system (0-5 points)
  const heatingScores = {
    HEAT_PUMP: 5,
    HVAC: 4,
    FURNACE: 3,
    RADIATORS: 2,
    NONE_UNSURE: 0
  };
  score += heatingScores[property.heatingType] || 0;
  
  // Cooling system (0-5 points)
  const coolingScores = {
    CENTRAL_AC: 5,
    WINDOW_AC: 3,
    NONE_UNSURE: 0
  };
  score += coolingScores[property.coolingType] || 0;
  
  // Water heater (0-5 points)
  const waterHeaterScores = {
    HEAT_PUMP: 5,
    TANKLESS: 4,
    SOLAR: 5,
    TANK: 3,
    UNKNOWN: 1
  };
  score += waterHeaterScores[property.waterHeaterType] || 0;
  
  return Math.min(score, 15);
};

const calculateUsageWearFactor = (property: Property): number => {
  const occupants = property.numberOfOccupants || 0;
  
  if (occupants === 0) return 10; // Vacant
  if (occupants <= 2) return 9;
  if (occupants <= 4) return 7;
  if (occupants <= 6) return 5;
  return 3;
};

const calculateSizeFactor = (sqft: number): number => {
  if (sqft < 1000) return 3;
  if (sqft <= 2000) return 5;
  if (sqft <= 3500) return 4;
  return 3;
};

const calculateHVACScore = (property: Property): number => {
  if (!property.hvacInstallYear) return 0;
  
  const currentYear = new Date().getFullYear();
  const age = currentYear - property.hvacInstallYear;
  
  if (age <= 5) return 10;
  if (age <= 10) return 7;
  if (age <= 15) return 4;
  return 2;
};

const calculateRoofScore = (property: Property): number => {
  if (!property.roofReplacementYear) return 0;
  
  const currentYear = new Date().getFullYear();
  const age = currentYear - property.roofReplacementYear;
  
  if (age <= 5) return 10;
  if (age <= 15) return 7;
  if (age <= 25) return 4;
  return 2;
};

const calculateSafetyScore = (property: Property): number => {
  let score = 0;
  if (property.hasSmokeCODetectors) score += 2;
  if (property.hasSecuritySystem) score += 2;
  if (property.hasFireExtinguisher) score += 1;
  return score;
};

const calculateExteriorScore = (property: Property): number => {
  let score = 0;
  if (property.lotSize) score += 2;
  if (property.hasLawnIrrigation !== null) score += 1;
  if (property.hasDrainageIssues === false) score += 2;
  return score;
};

// CRUD Operations
export const createProperty = async (userId: string, data: any): Promise<Property> => {
  // Get homeowner profile
  const profile = await prisma.homeownerProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    throw new Error('Homeowner profile not found');
  }

  // Create property with health score
  const property = await prisma.property.create({
    data: {
      ...data,
      homeownerProfileId: profile.id,
    }
  });

  // Calculate and update health score
  const healthScore = calculateHealthScore(property);
  
  return await prisma.property.update({
    where: { id: property.id },
    data: {
      healthScore: healthScore.total,
      healthScoreBreakdown: healthScore as any,
      lastScoreCalculation: new Date(),
    }
  });
};

export const updateProperty = async (
  propertyId: string,
  userId: string,
  data: any
): Promise<Property> => {
  // Verify ownership
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId }
    }
  });

  if (!property) {
    throw new Error('Property not found or unauthorized');
  }

  // Update property
  const updated = await prisma.property.update({
    where: { id: propertyId },
    data
  });

  // Recalculate health score
  const healthScore = calculateHealthScore(updated);
  
  return await prisma.property.update({
    where: { id: propertyId },
    data: {
      healthScore: healthScore.total,
      healthScoreBreakdown: healthScore as any,
      lastScoreCalculation: new Date(),
    }
  });
};
```

### **C. Backend Controller Updates**

**File**: `apps/backend/src/controllers/property.controller.ts` (UPDATE)

Add health score to responses:
```typescript
export const getProperty = async (req: AuthRequest, res: Response) => {
  try {
    const property = await propertyService.getPropertyById(id, userId);
    
    // Calculate real-time health score if stale (> 24 hours)
    const needsRecalculation = !property.lastScoreCalculation ||
      (Date.now() - property.lastScoreCalculation.getTime()) > 86400000;
    
    if (needsRecalculation) {
      const healthScore = calculateHealthScore(property);
      await prisma.property.update({
        where: { id: property.id },
        data: {
          healthScore: healthScore.total,
          healthScoreBreakdown: healthScore,
          lastScoreCalculation: new Date(),
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...property,
        healthScoreDetails: property.healthScoreBreakdown, // Include detailed breakdown
      },
    });
  } catch (error) {
    // Error handling
  }
};
```

### **D. Backend Validation Updates**

**File**: `apps/backend/src/routes/property.routes.ts` (UPDATE)

```typescript
import { z } from 'zod';

const createPropertySchema = z.object({
  // Section 1: Property Basics (6 mandatory)
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(5).max(255),
  propertyType: z.enum(['SINGLE_FAMILY', 'TOWNHOME', 'CONDO', 'APARTMENT', 'MULTI_UNIT', 'INVESTMENT_PROPERTY']),
  ownershipType: z.enum(['OWNER_OCCUPIED', 'RENTED_OUT']),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()),
  squareFootage: z.number().int().min(100).max(50000),
  numberOfOccupants: z.number().int().min(0).max(20),

  // Section 2: Key Systems (4 mandatory)
  heatingType: z.enum(['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'NONE_UNSURE']),
  coolingType: z.enum(['CENTRAL_AC', 'WINDOW_AC', 'NONE_UNSURE']),
  waterHeaterType: z.enum(['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN']),
  roofType: z.enum(['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN']),

  // Optional fields: Systems & Structure
  hvacInstallYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  waterHeaterInstallYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  roofReplacementYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  foundationType: z.string().max(100).optional(),
  sidingType: z.string().max(100).optional(),
  electricalPanelAge: z.number().int().min(0).max(150).optional(),

  // Optional fields: Exterior & Utilities
  lotSize: z.number().int().min(0).max(1000000).optional(),
  hasLawnIrrigation: z.boolean().optional(),
  hasDrainageIssues: z.boolean().optional(),

  // Optional fields: Safety
  hasSmokeCODetectors: z.boolean().optional(),
  hasSecuritySystem: z.boolean().optional(),
  hasFireExtinguisher: z.boolean().optional(),

  // Existing address fields
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}$/),
  isPrimary: z.boolean().optional().default(false),
}).refine(
  (data) => {
    // Cross-field validation: Install years can't be before year built
    if (data.hvacInstallYear && data.hvacInstallYear < data.yearBuilt) return false;
    if (data.waterHeaterInstallYear && data.waterHeaterInstallYear < data.yearBuilt) return false;
    if (data.roofReplacementYear && data.roofReplacementYear < data.yearBuilt) return false;
    return true;
  },
  { message: 'Installation years cannot be before property was built' }
);
```

---

## 2️⃣ FRONTEND CHANGES

### **A. TypeScript Type Definitions**

**File**: `apps/frontend/src/types/index.ts` (UPDATE)

```typescript
// Add new enums
export type PropertyType = 
  | 'SINGLE_FAMILY'
  | 'TOWNHOME'
  | 'CONDO'
  | 'APARTMENT'
  | 'MULTI_UNIT'
  | 'INVESTMENT_PROPERTY';

export type OwnershipType = 'OWNER_OCCUPIED' | 'RENTED_OUT';

export type HeatingType = 
  | 'HVAC'
  | 'FURNACE'
  | 'HEAT_PUMP'
  | 'RADIATORS'
  | 'NONE_UNSURE';

export type CoolingType = 
  | 'CENTRAL_AC'
  | 'WINDOW_AC'
  | 'NONE_UNSURE';

export type WaterHeaterType = 
  | 'TANK'
  | 'TANKLESS'
  | 'HEAT_PUMP'
  | 'SOLAR'
  | 'UNKNOWN';

export type RoofType = 
  | 'SHINGLE'
  | 'TILE'
  | 'FLAT'
  | 'METAL'
  | 'UNKNOWN';

// Update Property interface
export interface Property {
  id: string;
  homeownerProfileId: string;
  
  // Section 1: Property Basics
  name?: string;
  address: string;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  yearBuilt: number;
  squareFootage: number;
  numberOfOccupants: number;
  
  // Section 2: Key Systems
  heatingType: HeatingType;
  coolingType: CoolingType;
  waterHeaterType: WaterHeaterType;
  roofType: RoofType;
  
  // Optional: Systems & Structure
  hvacInstallYear?: number;
  waterHeaterInstallYear?: number;
  roofReplacementYear?: number;
  foundationType?: string;
  sidingType?: string;
  electricalPanelAge?: number;
  
  // Optional: Exterior & Utilities
  lotSize?: number;
  hasLawnIrrigation?: boolean;
  hasDrainageIssues?: boolean;
  
  // Optional: Safety
  hasSmokeCODetectors?: boolean;
  hasSecuritySystem?: boolean;
  hasFireExtinguisher?: boolean;
  
  // Health Score
  healthScore: number;
  healthScoreBreakdown?: PropertyHealthScore;
  lastScoreCalculation?: string;
  
  // Address fields
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
  
  createdAt: string;
  updatedAt: string;
}

export interface PropertyHealthScore {
  total: number;
  breakdown: {
    ageFactor: number;
    structureFactor: number;
    systemsFactor: number;
    usageWearFactor: number;
    sizeFactor: number;
  };
  extraPoints: {
    hvacAge: number;
    waterHeaterAge: number;
    roofAge: number;
    safety: number;
    appliances: number;
    exterior: number;
    documents: number;
  };
  maxPossible: number;
}
```

### **B. Property Onboarding Form Component**

**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/add/page.tsx` (CREATE NEW)

This will be a multi-step wizard:
- Step 1: Property Basics (6 mandatory fields)
- Step 2: Key Systems Snapshot (4 mandatory fields)
- Step 3: Success + Initial Score Display

**File**: `apps/frontend/src/components/forms/PropertyOnboardingForm.tsx` (CREATE NEW)

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api/client';

const PROPERTY_TYPES = [
  { value: 'SINGLE_FAMILY', label: 'Single Family' },
  { value: 'TOWNHOME', label: 'Townhome' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'MULTI_UNIT', label: 'Multi-Unit' },
  { value: 'INVESTMENT_PROPERTY', label: 'Investment Property' },
];

// ... similar arrays for other enums ...

export function PropertyOnboardingForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1 fields
    address: '',
    city: '',
    state: '',
    zipCode: '',
    propertyType: '',
    ownershipType: '',
    yearBuilt: new Date().getFullYear(),
    squareFootage: 0,
    numberOfOccupants: 1,
    
    // Step 2 fields
    heatingType: '',
    coolingType: '',
    waterHeaterType: '',
    roofType: '',
  });

  const progress = (currentStep / 2) * 100;

  const handleNext = () => {
    // Validation for current step
    if (currentStep === 1) {
      if (!formData.address || !formData.propertyType || !formData.yearBuilt) {
        alert('Please fill all required fields');
        return;
      }
    }
    setCurrentStep(currentStep + 1);
  };

  const handleSubmit = async () => {
    try {
      const response = await api.createProperty(formData);
      if (response.success) {
        router.push(`/dashboard/properties/${response.data.id}?onboarding=success`);
      }
    } catch (error) {
      console.error('Failed to create property:', error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Progress value={progress} className="mb-6" />
      
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Property Basics</CardTitle>
            <CardDescription>Tell us about your property</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Render all Step 1 fields */}
          </CardContent>
        </Card>
      )}
      
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Systems Snapshot</CardTitle>
            <CardDescription>Quick overview of major systems</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Render all Step 2 fields */}
          </CardContent>
        </Card>
      )}
      
      <div className="flex justify-between mt-6">
        {currentStep > 1 && (
          <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
            Back
          </Button>
        )}
        {currentStep < 2 ? (
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button onClick={handleSubmit}>Complete Onboarding</Button>
        )}
      </div>
    </div>
  );
}
```

### **C. Health Score Display Component**

**File**: `apps/frontend/src/components/features/PropertyHealthScore.tsx` (CREATE NEW)

```typescript
'use client';

import { Property } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Props {
  property: Property;
}

export function PropertyHealthScore({ property }: Props) {
  const { healthScore, healthScoreBreakdown } = property;
  const breakdown = healthScoreBreakdown;
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Fair';
    return 'Needs Attention';
  };

  const availablePoints = breakdown ? 
    55 - Object.values(breakdown.breakdown).reduce((sum, val) => sum + val, 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 Property Health Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-6">
          <div className={`text-6xl font-bold ${getScoreColor(healthScore)}`}>
            {healthScore}/100
          </div>
          <p className="text-lg text-gray-600">{getScoreLabel(healthScore)}</p>
        </div>
        
        <Progress value={healthScore} className="h-4 mb-6" />
        
        {breakdown && (
          <div className="space-y-3">
            <h4 className="font-semibold">Base Score Breakdown:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Property Age:</div>
              <div className="text-right">{breakdown.breakdown.ageFactor}/15</div>
              
              <div>Structure:</div>
              <div className="text-right">{breakdown.breakdown.structureFactor}/10</div>
              
              <div>Systems:</div>
              <div className="text-right">{breakdown.breakdown.systemsFactor}/15</div>
              
              <div>Usage/Wear:</div>
              <div className="text-right">{breakdown.breakdown.usageWearFactor}/10</div>
              
              <div>Size:</div>
              <div className="text-right">{breakdown.breakdown.sizeFactor}/5</div>
            </div>
          </div>
        )}
        
        {availablePoints > 0 && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="font-semibold text-blue-900">
              +{availablePoints} points available
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Complete your property profile to unlock additional points
            </p>
            <Button asChild className="mt-3 w-full">
              <Link href={`/dashboard/properties/${property.id}/complete-profile`}>
                🔵 Complete Property Profile →
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### **D. Optional Profile Completion Page**

**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/complete-profile/page.tsx` (CREATE NEW)

This page shows:
- Current completion percentage
- Available points by category
- Form sections for optional fields (Systems, Exterior, Safety, Documents)

---

## 3️⃣ IMPACT ON EXISTING FLOWS

### **Critical Areas to Test**

#### **A. Property Creation Flow**
**Current**: Simple 5-field form → Direct save  
**New**: Multi-step wizard (10 mandatory fields) → Health score calculation → Save  
**Impact**: ✅ **Non-breaking** - New properties use new flow, existing data remains valid

#### **B. Property Editing**
**Current**: Edit form with 5 fields  
**New**: Edit form with 10+ fields + health score recalculation  
**Impact**: ⚠️ **Requires migration** - Existing properties need default values for new required fields

#### **C. Property Display**
**Current**: Simple property card  
**New**: Property card + Health Score badge  
**Impact**: ✅ **Enhancement only** - Backward compatible with healthScore defaulting to 0

#### **D. Booking System**
**Current**: Property selection dropdown  
**New**: Same, but with health score indicator  
**Impact**: ✅ **No breaking changes** - Property relationships remain unchanged

#### **E. HomeownerProfile**
**Current**: Has propertyType, propertySize, yearBuilt fields  
**New**: These fields moved to Property model  
**Impact**: ⚠️ **Data migration required** - Must migrate existing data before removing from HomeownerProfile

---

## 4️⃣ MIGRATION STRATEGY

### **Phase 1: Add New Fields (Non-Breaking)**
```sql
-- Add new enums
CREATE TYPE "PropertyType" AS ENUM ('SINGLE_FAMILY', 'TOWNHOME', ...);
CREATE TYPE "OwnershipType" AS ENUM ('OWNER_OCCUPIED', 'RENTED_OUT');
-- ... other enums

-- Add new nullable columns to Property table
ALTER TABLE "properties" ADD COLUMN "propertyType" "PropertyType";
ALTER TABLE "properties" ADD COLUMN "ownershipType" "OwnershipType";
ALTER TABLE "properties" ADD COLUMN "yearBuilt" INTEGER;
ALTER TABLE "properties" ADD COLUMN "squareFootage" INTEGER;
ALTER TABLE "properties" ADD COLUMN "numberOfOccupants" INTEGER DEFAULT 1;
ALTER TABLE "properties" ADD COLUMN "heatingType" "HeatingType";
-- ... all other new fields

-- Add health score fields
ALTER TABLE "properties" ADD COLUMN "healthScore" INTEGER DEFAULT 0;
ALTER TABLE "properties" ADD COLUMN "healthScoreBreakdown" JSONB;
ALTER TABLE "properties" ADD COLUMN "lastScoreCalculation" TIMESTAMP;
```

### **Phase 2: Migrate Existing Data**
```sql
-- Migrate data from HomeownerProfile to Property
UPDATE "properties" p
SET 
  "yearBuilt" = hp."yearBuilt",
  "squareFootage" = hp."propertySize"
FROM "homeowner_profiles" hp
WHERE p."homeownerProfileId" = hp.id
  AND p."yearBuilt" IS NULL;

-- Set defaults for properties without HomeownerProfile data
UPDATE "properties"
SET
  "propertyType" = 'SINGLE_FAMILY',
  "ownershipType" = 'OWNER_OCCUPIED',
  "heatingType" = 'NONE_UNSURE',
  "coolingType" = 'NONE_UNSURE',
  "waterHeaterType" = 'UNKNOWN',
  "roofType" = 'UNKNOWN'
WHERE "propertyType" IS NULL;
```

### **Phase 3: Make Fields Required**
```sql
-- Make new fields NOT NULL
ALTER TABLE "properties" ALTER COLUMN "propertyType" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "ownershipType" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "yearBuilt" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "squareFootage" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "heatingType" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "coolingType" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "waterHeaterType" SET NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "roofType" SET NOT NULL;
```

### **Phase 4: Recalculate All Health Scores**
```typescript
// Run backend script to calculate scores for all existing properties
import { PrismaClient } from '@prisma/client';
import { calculateHealthScore } from './services/property.service';

const prisma = new PrismaClient();

async function recalculateAllScores() {
  const properties = await prisma.property.findMany();
  
  for (const property of properties) {
    const healthScore = calculateHealthScore(property);
    
    await prisma.property.update({
      where: { id: property.id },
      data: {
        healthScore: healthScore.total,
        healthScoreBreakdown: healthScore as any,
        lastScoreCalculation: new Date(),
      }
    });
  }
  
  console.log(`Recalculated scores for ${properties.length} properties`);
}

recalculateAllScores();
```

---

## 5️⃣ API CLIENT UPDATES

**File**: `apps/frontend/src/lib/api/client.ts` (UPDATE)

```typescript
// No changes needed - existing methods already support flexible property data
// The type system will handle the new fields automatically
```

---

## 6️⃣ VALIDATION SUMMARY

### **Backend Validation (Zod)**
- ✅ Required fields enforcement
- ✅ Enum value validation
- ✅ Number range validation
- ✅ Cross-field validation (install year >= yearBuilt)
- ✅ Regex validation (zipCode)

### **Frontend Validation**
- ✅ Real-time field validation
- ✅ Multi-step wizard validation
- ✅ Client-side health score preview
- ✅ Warning messages for unusual values

---

## 7️⃣ IMPLEMENTATION CHECKLIST

### **Backend Tasks**
- [ ] Create new Prisma enums (PropertyType, OwnershipType, etc.)
- [ ] Add new fields to Property model
- [ ] Create migration file
- [ ] Update property.service.ts with health score calculation
- [ ] Update property.controller.ts to include health score in responses
- [ ] Update validation schemas in property.routes.ts
- [ ] Create data migration script for existing properties
- [ ] Test health score calculation algorithm
- [ ] Add health score recalculation endpoint (optional)

### **Frontend Tasks**
- [ ] Update types/index.ts with new enums and Property interface
- [ ] Create PropertyOnboardingForm component (multi-step wizard)
- [ ] Create PropertyHealthScore component
- [ ] Create optional profile completion page
- [ ] Update property list page to show health scores
- [ ] Update property detail page to show health score breakdown
- [ ] Add real-time score preview in forms
- [ ] Create form field components for new inputs
- [ ] Add validation messages and error handling
- [ ] Test multi-step wizard flow

### **Database Tasks**
- [ ] Run Phase 1 migration (add nullable fields)
- [ ] Run data migration script
- [ ] Run Phase 3 migration (make fields required)
- [ ] Run health score recalculation script
- [ ] Verify all existing properties have valid health scores
- [ ] Add database indexes for healthScore and propertyType

### **Testing Tasks**
- [ ] Test new property creation with 10 mandatory fields
- [ ] Test health score calculation accuracy
- [ ] Test property editing updates health score
- [ ] Test existing properties still load correctly
- [ ] Test booking system still works with new property structure
- [ ] Test migration rollback if needed
- [ ] Load test health score calculation performance

---

## 8️⃣ ROLLOUT PLAN

### **Week 1: Backend Foundation**
1. Database schema changes (migrations)
2. Data migration for existing properties
3. Health score calculation service
4. Updated API endpoints

### **Week 2: Frontend Development**
1. Update TypeScript types
2. Create onboarding wizard
3. Create health score display component
4. Update existing property pages

### **Week 3: Testing & Refinement**
1. End-to-end testing
2. Performance optimization
3. Health score algorithm tuning
4. Bug fixes

### **Week 4: Production Deployment**
1. Deploy backend changes
2. Run data migration
3. Deploy frontend changes
4. Monitor for issues
5. Gather user feedback

---

## 9️⃣ RISKS & MITIGATION

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Test migration on staging, create backups |
| Health score calculation too slow | Medium | Calculate async, cache results for 24h |
| Users confused by new form | Medium | Progressive disclosure, tooltips, examples |
| Existing properties break | High | Default values for all new fields |
| Health score algorithm inaccurate | Low | Tunable weights, user feedback loop |

---

## 🎯 SUCCESS METRICS

1. **Adoption Rate**: % of users who complete full property profile
2. **Health Score Distribution**: Average scores across all properties
3. **Completion Time**: Time to complete 10-field onboarding
4. **Abandonment Rate**: % of users who start but don't finish
5. **Optional Field Completion**: % of users who add optional details

---

## 📝 NOTES FOR IMPLEMENTATION

1. **Server-Authoritative Architecture**: Health scores calculated on server, previewed on client
2. **Progressive Enhancement**: New users get full flow, existing users prompted to complete profile
3. **Backward Compatibility**: All existing properties get default values and initial score of 0
4. **Real-Time Updates**: Health score recalculated on every property update
5. **Caching Strategy**: Cache health score for 24 hours, recalculate if stale or manually requested

---

## ✅ CONFIRMATION OF UNDERSTANDING

I have thoroughly reviewed:
- ✅ Current database schema (Property, HomeownerProfile models)
- ✅ Existing backend API structure (controllers, services, routes)
- ✅ Frontend components and form patterns
- ✅ TypeScript type definitions
- ✅ Validation patterns (Zod schemas)
- ✅ Existing property creation/editing flows
- ✅ Related systems (bookings, warranties, documents)

**Ready to proceed with implementation** once you confirm this analysis is accurate and complete.
