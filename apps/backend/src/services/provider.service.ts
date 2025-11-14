// apps/backend/src/services/provider.service.ts

import { PrismaClient, ServiceCategory, Prisma } from '@prisma/client';
import {
  ProviderSearchQuery,
  ProviderSearchResult,
  ProviderWithDistance,
  ProviderDetails,
  ProviderServiceDetails,
  ProviderReview,
  ProviderReviewsResponse,
  PaginationQuery,
} from '../types/provider.types';

const prisma = new PrismaClient();

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 - Latitude of point 1
 * @param lon1 - Longitude of point 1
 * @param lat2 - Latitude of point 2
 * @param lon2 - Longitude of point 2
 * @returns Distance in miles
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export class ProviderService {
  /**
   * Search for providers based on location and service filters
   */
  static async searchProviders(
    query: ProviderSearchQuery
  ): Promise<ProviderSearchResult> {
    const { page, limit, radius, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // --- FIX START: Restructure WHERE clause to ensure category filtering checks actual services ---
    
    // Array to hold all individual filter clauses which will be combined with AND
    const filters: Prisma.ProviderProfileWhereInput[] = [

        { status: { not: 'INACTIVE' } }
    ];

    // Filter by service category: Check denormalized list OR check actual active services
    if (query.category) {
      filters.push({
        OR: [
          // 1. Filter by denormalized serviceCategories list (Original filter)
          {
            serviceCategories: {
              has: query.category,
            },
          },
          // 2. FIX: Fallback/check against the actual active Service records for the Provider
          {
            services: {
              some: {
                isActive: true,
                category: query.category,
              },
            },
          },
        ],
      });
    }

    // Filter by specific service types (original logic, now correctly integrated)
    if (query.inspectionType || query.handymanType) {
      filters.push({
        services: {
          some: {
            isActive: true,
            ...(query.inspectionType && { inspectionType: query.inspectionType }),
            ...(query.handymanType && { handymanType: query.handymanType }),
          },
        },
      });
    }

    // Filter by minimum rating (original logic, now correctly integrated)
    if (query.minRating) {
      filters.push({
        averageRating: {
          gte: query.minRating,
        },
      });
    }

    // Combine all filters into the final WHERE clause
    const where: Prisma.ProviderProfileWhereInput = { AND: filters };

    // --- FIX END ---
    

    // Get location coordinates for distance filtering
    let searchLat: number | undefined;
    let searchLon: number | undefined;

    if (query.latitude && query.longitude) {
      searchLat = query.latitude;
      searchLon = query.longitude;
    } else if (query.zipCode) {
      // If zipCode provided, try to find coordinates
      const address = await prisma.address.findFirst({
        where: { zipCode: query.zipCode },
        select: { latitude: true, longitude: true },
      });
      if (address?.latitude && address?.longitude) {
        searchLat = address.latitude;
        searchLon = address.longitude;
      }
    } else if (query.city && query.state) {
      // If city/state provided, try to find coordinates
      const address = await prisma.address.findFirst({
        where: {
          city: { equals: query.city, mode: 'insensitive' },
          state: query.state,
        },
        select: { latitude: true, longitude: true },
      });
      if (address?.latitude && address?.longitude) {
        searchLat = address.latitude;
        searchLon = address.longitude;
      }
    }

    // Fetch providers
    const providers = await prisma.providerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            address: {
              select: {
                city: true,
                state: true,
                zipCode: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
        services: {
          where: { isActive: true },
          select: {
            id: true,
            category: true,
            name: true,
            basePrice: true,
            priceUnit: true,
          },
          take: 5, // Limit to top 5 services per provider
        },
      },
      orderBy: this.getSortOrder(sortBy, sortOrder),
    });

    // Calculate distances and filter by radius
    let providersWithDistance: ProviderWithDistance[] = providers.map((provider) => {
      let distance: number | undefined;

      if (
        searchLat &&
        searchLon &&
        provider.user.address?.latitude &&
        provider.user.address?.longitude
      ) {
        distance = calculateDistance(
          searchLat,
          searchLon,
          provider.user.address.latitude,
          provider.user.address.longitude
        );
      }

      return {
        id: provider.id,
        businessName: provider.businessName,
        averageRating: provider.averageRating,
        totalReviews: provider.totalReviews,
        totalCompletedJobs: provider.totalCompletedJobs,
        serviceRadius: provider.serviceRadius,
        serviceCategories: provider.serviceCategories,
        distance,
        user: {
          id: provider.user.id,
          firstName: provider.user.firstName,
          lastName: provider.user.lastName,
          avatar: provider.user.avatar,
          address: provider.user.address
            ? {
                city: provider.user.address.city,
                state: provider.user.address.state,
                zipCode: provider.user.address.zipCode,
              }
            : null,
        },
        services: provider.services.map((service) => ({
          id: service.id,
          category: service.category,
          name: service.name,
          basePrice: service.basePrice.toString(),
          priceUnit: service.priceUnit,
        })),
      };
    });

    // Filter by radius if location provided
    if (searchLat && searchLon) {
      providersWithDistance = providersWithDistance.filter((provider) => {
        return (
          provider.distance === undefined ||
          provider.distance <= radius
        );
      });
    }

    // Sort by distance if requested and location provided
    if (sortBy === 'distance' && searchLat && searchLon) {
      providersWithDistance.sort((a, b) => {
        const distA = a.distance ?? Infinity;
        const distB = b.distance ?? Infinity;
        return sortOrder === 'asc' ? distA - distB : distB - distA;
      });
    }

    // Apply pagination
    const total = providersWithDistance.length;
    const paginatedProviders = providersWithDistance.slice(skip, skip + limit);

    return {
      providers: paginatedProviders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        category: query.category,
        location:
          searchLat && searchLon
            ? {
                latitude: searchLat,
                longitude: searchLon,
                radius,
              }
            : undefined,
      },
    };
  }

  /**
   * Get detailed information about a provider
   */
  static async getProviderById(providerId: string): Promise<ProviderDetails | null> {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            bio: true,
            address: {
              select: {
                city: true,
                state: true,
                zipCode: true,
              },
            },
          },
        },
        certifications: {
          select: {
            id: true,
            name: true,
            issuingAuthority: true,
            issueDate: true,
            expiryDate: true,
            verified: true,
          },
          where: {
            OR: [
              { expiryDate: null },
              { expiryDate: { gte: new Date() } },
            ],
          },
        },
        portfolioImages: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            category: true,
          },
          take: 12, // Limit portfolio images
        },
      },
    });

    if (!provider) {
      return null;
    }

    return {
      id: provider.id,
      businessName: provider.businessName,
      businessType: provider.businessType,
      description: provider.description,
      website: provider.website,
      yearsInBusiness: provider.yearsInBusiness,
      teamSize: provider.teamSize,
      serviceCategories: provider.serviceCategories,
      serviceRadius: provider.serviceRadius,
      averageRating: provider.averageRating,
      totalReviews: provider.totalReviews,
      totalCompletedJobs: provider.totalCompletedJobs,
      status: provider.status,
      user: provider.user,
      certifications: provider.certifications,
      portfolioImages: provider.portfolioImages,
    };
  }

  /**
   * Get all services offered by a provider
   */
  static async getProviderServices(
    providerId: string,
    activeOnly: boolean = true
  ): Promise<ProviderServiceDetails[]> {
    // First verify provider exists
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { id: true },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    const services = await prisma.service.findMany({
      where: {
        providerProfileId: providerId,
        ...(activeOnly && { isActive: true }),
      },
      select: {
        id: true,
        category: true,
        inspectionType: true,
        handymanType: true,
        name: true,
        description: true,
        basePrice: true,
        priceUnit: true,
        minimumCharge: true,
        estimatedDuration: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    return services.map((service) => ({
      ...service,
      basePrice: service.basePrice.toString(),
      minimumCharge: service.minimumCharge?.toString() || null,
    }));
  }

  /**
   * Get reviews for a provider
   */
  static async getProviderReviews(
    providerId: string,
    pagination: PaginationQuery
  ): Promise<ProviderReviewsResponse> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // First verify provider exists
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerId },
      select: { id: true, userId: true },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    // Get reviews
    const [reviews, total, ratingStats] = await Promise.all([
      prisma.review.findMany({
        where: {
          providerId: provider.userId,
          status: 'APPROVED',
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          booking: {
            select: {
              id: true,
              service: {
                select: {
                  name: true,
                  category: true,
                },
              },
            },
          },
        },
      }),
      prisma.review.count({
        where: {
          providerId: provider.userId,
          status: 'APPROVED',
        },
      }),
      prisma.review.groupBy({
        by: ['rating'],
        where: {
          providerId: provider.userId,
          status: 'APPROVED',
        },
        _count: {
          rating: true,
        },
      }),
    ]);

    // Calculate rating distribution
    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    ratingStats.forEach((stat) => {
      ratingDistribution[stat.rating as keyof typeof ratingDistribution] =
        stat._count.rating;
    });

    // Calculate average rating
    const totalRatings = Object.values(ratingDistribution).reduce((a, b) => a + b, 0);
    const sumRatings = Object.entries(ratingDistribution).reduce(
      (sum, [rating, count]) => sum + parseInt(rating) * count,
      0
    );
    const averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    return {
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        qualityRating: review.qualityRating,
        communicationRating: review.communicationRating,
        valueRating: review.valueRating,
        professionalismRating: review.professionalismRating,
        response: review.response,
        respondedAt: review.respondedAt,
        createdAt: review.createdAt,
        author: review.author,
        booking: {
          id: review.booking.id,
          service: review.booking.service,
        },
      })),
      summary: {
        averageRating: Number(averageRating.toFixed(2)),
        totalReviews: total,
        ratingDistribution,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Helper method to get sort order for Prisma query
   */
  private static getSortOrder(
    sortBy: string,
    sortOrder: string
  ): Prisma.ProviderProfileOrderByWithRelationInput {
    switch (sortBy) {
      case 'rating':
        return { averageRating: sortOrder as 'asc' | 'desc' };
      case 'reviews':
        return { totalReviews: sortOrder as 'asc' | 'desc' };
      case 'price':
        // For price, we'll sort by the minimum base price of services
        return { services: { _count: sortOrder as 'asc' | 'desc' } };
      default:
        return { averageRating: 'desc' };
    }
  }
}