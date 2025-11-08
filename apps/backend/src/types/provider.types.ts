// apps/backend/src/types/provider.types.ts

import { z } from 'zod';
import { ServiceCategory, InspectionType, HandymanType, ProviderStatus } from '@prisma/client';

/**
 * Provider Search Query Schema
 */
export const providerSearchSchema = z.object({
  // Location filters
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  zipCode: z.string().regex(/^\d{5}$/).optional(),
  city: z.string().min(2).optional(),
  state: z.string().length(2).optional(),
  radius: z.coerce.number().min(1).max(100).default(25), // miles

  // Service filters
  category: z.nativeEnum(ServiceCategory).optional(),
  inspectionType: z.nativeEnum(InspectionType).optional(),
  handymanType: z.nativeEnum(HandymanType).optional(),
  
  // Rating & sorting
  minRating: z.coerce.number().min(0).max(5).optional(),
  sortBy: z.enum(['rating', 'distance', 'reviews', 'price']).default('rating'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  
  // Pagination
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
});

export type ProviderSearchQuery = z.infer<typeof providerSearchSchema>;

/**
 * Provider Response Types
 */
export interface ProviderSearchResult {
  providers: ProviderWithDistance[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    category?: ServiceCategory;
    location?: {
      latitude?: number;
      longitude?: number;
      radius: number;
    };
  };
}

export interface ProviderWithDistance {
  id: string;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  serviceRadius: number;
  serviceCategories: ServiceCategory[];
  distance?: number; // miles from search location
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    address: {
      city: string;
      state: string;
      zipCode: string;
    } | null;
  };
  services: {
    id: string;
    category: ServiceCategory;
    name: string;
    basePrice: string;
    priceUnit: string;
  }[];
}

export interface ProviderDetails {
  id: string;
  businessName: string;
  businessType: string | null;
  description: string | null;
  website: string | null;
  yearsInBusiness: number | null;
  teamSize: number | null;
  serviceCategories: ServiceCategory[];
  serviceRadius: number;
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  status: ProviderStatus;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    bio: string | null;
    address: {
      city: string;
      state: string;
      zipCode: string;
    } | null;
  };
  certifications: {
    id: string;
    name: string;
    issuingAuthority: string;
    issueDate: Date;
    expiryDate: Date | null;
    verified: boolean;
  }[];
  portfolioImages: {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string;
    category: ServiceCategory;
  }[];
}

export interface ProviderService {
  id: string;
  category: ServiceCategory;
  inspectionType: InspectionType | null;
  handymanType: HandymanType | null;
  name: string;
  description: string;
  basePrice: string;
  priceUnit: string;
  minimumCharge: string | null;
  estimatedDuration: number | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ProviderReview {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  qualityRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  professionalismRating: number | null;
  response: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
  booking: {
    id: string;
    service: {
      name: string;
      category: ServiceCategory;
    };
  };
}

export interface ProviderReviewsResponse {
  reviews: ProviderReview[];
  summary: {
    averageRating: number;
    totalReviews: number;
    ratingDistribution: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Pagination Schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
