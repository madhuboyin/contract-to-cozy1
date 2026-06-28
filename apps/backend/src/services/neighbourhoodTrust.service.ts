import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export type EndorsementInput = {
  wouldHireAgain: boolean;
  highlightTags: string[];
  anonymousToNeighbors?: boolean;
};

export class NeighbourhoodTrustService {
  async getHomeownerZipInfo(userId: string): Promise<{ zipCode: string; city: string; state: string } | null> {
    const property = await prisma.property.findFirst({
      where: { homeownerProfile: { userId } },
      orderBy: { createdAt: 'asc' },
      select: { zipCode: true, city: true, state: true },
    });
    if (!property?.zipCode) return null;
    return { zipCode: property.zipCode, city: property.city, state: property.state };
  }

  async getStats(zipCode: string) {
    const [totalEndorsements, activeProviders, recentJobs] = await Promise.all([
      prisma.neighbourhoodEndorsement.count({ where: { zipCode } }),
      prisma.neighbourhoodTrustProfile.count({ where: { zipCode, totalJobs: { gt: 0 } } }),
      prisma.neighbourhoodFeedEntry.count({
        where: {
          zipCode,
          entryType: 'JOB_COMPLETED',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return { totalEndorsements, activeProviders, recentJobs };
  }

  async getFeed(zipCode: string, limit = 30) {
    return prisma.neighbourhoodFeedEntry.findMany({
      where: { zipCode, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getProviders(zipCode: string, category?: string, limit = 20) {
    const trustProfiles = await prisma.neighbourhoodTrustProfile.findMany({
      where: { zipCode },
      orderBy: [{ avgRating: 'desc' }, { totalJobs: 'desc' }],
      take: limit,
      include: {
        providerProfile: {
          select: {
            id: true,
            businessName: true,
            description: true,
            averageRating: true,
            totalCompletedJobs: true,
            insuranceVerified: true,
            licenseVerified: true,
            serviceCategories: true,
            yearsInBusiness: true,
          },
        },
      },
    });

    const filtered = category
      ? trustProfiles.filter((tp) =>
          tp.providerProfile.serviceCategories.includes(category as any)
        )
      : trustProfiles;

    return filtered.map((tp) => ({
      trustProfile: {
        zipCode: tp.zipCode,
        totalJobs: tp.totalJobs,
        verifiedJobs: tp.verifiedJobs,
        avgRating: tp.avgRating,
        avgQualityRating: tp.avgQualityRating,
        avgCommunicationRating: tp.avgCommunicationRating,
        avgValueRating: tp.avgValueRating,
        lastJobAt: tp.lastJobAt?.toISOString() ?? null,
      },
      provider: tp.providerProfile,
    }));
  }

  async getEndorsement(bookingId: string, homeownerId: string) {
    return prisma.neighbourhoodEndorsement.findUnique({
      where: { bookingId },
    }).then((e) => (e?.homeownerId === homeownerId ? e : null));
  }

  async upsertEndorsement(bookingId: string, homeownerId: string, input: EndorsementInput) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: { select: { zipCode: true, city: true, state: true } },
        providerProfile: { select: { id: true, businessName: true } },
      },
    });

    if (!booking) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    if (booking.homeownerId !== homeownerId) throw Object.assign(new Error('Forbidden.'), { statusCode: 403 });
    if (booking.status !== 'COMPLETED') throw Object.assign(new Error('Booking must be completed before endorsing.'), { statusCode: 400 });

    const { zipCode, city, state } = booking.property;
    const providerProfileId = booking.providerProfileId;

    const endorsement = await prisma.neighbourhoodEndorsement.upsert({
      where: { bookingId },
      create: {
        bookingId,
        homeownerId,
        propertyId: booking.propertyId,
        providerProfileId,
        zipCode,
        city,
        state,
        wouldHireAgain: input.wouldHireAgain,
        highlightTags: input.highlightTags,
        anonymousToNeighbors: input.anonymousToNeighbors ?? true,
        visibleToNeighbors: true,
      },
      update: {
        wouldHireAgain: input.wouldHireAgain,
        highlightTags: input.highlightTags,
        anonymousToNeighbors: input.anonymousToNeighbors ?? true,
      },
    });

    // Fire-and-forget side effects
    this.recomputeTrustProfile(providerProfileId, zipCode, city, state).catch((err) =>
      logger.warn({ err }, '[NeighbourhoodTrust] recomputeTrustProfile failed')
    );
    this.upsertServiceZone(providerProfileId, zipCode, city, state).catch((err) =>
      logger.warn({ err }, '[NeighbourhoodTrust] upsertServiceZone failed')
    );
    this.createFeedEntry({
      zipCode,
      city,
      state,
      entryType: 'ENDORSEMENT_ADDED',
      providerProfileId,
      endorsementId: endorsement.id,
      providerBusinessName: booking.providerProfile.businessName,
      serviceCategory: booking.category,
      starRating: null,
      highlightTags: input.highlightTags,
      jobCompletedAt: booking.completedAt ?? null,
    }).catch((err) => logger.warn({ err }, '[NeighbourhoodTrust] createFeedEntry failed'));

    return endorsement;
  }

  private async recomputeTrustProfile(
    providerProfileId: string,
    zipCode: string,
    city: string,
    state: string
  ) {
    const endorsements = await prisma.neighbourhoodEndorsement.findMany({
      where: { providerProfileId, zipCode, visibleToNeighbors: true },
      include: {
        booking: {
          include: { review: { select: { rating: true, qualityRating: true, communicationRating: true, valueRating: true, professionalismRating: true } } },
        },
      },
    });

    const withReviews = endorsements.filter((e) => e.booking.review);
    const avg = (vals: (number | null)[]) => {
      const clean = vals.filter((v): v is number => v !== null);
      return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
    };

    const ratings = withReviews.map((e) => e.booking.review!.rating);
    const qualityRatings = withReviews.map((e) => e.booking.review!.qualityRating);
    const commRatings = withReviews.map((e) => e.booking.review!.communicationRating);
    const valueRatings = withReviews.map((e) => e.booking.review!.valueRating);
    const profRatings = withReviews.map((e) => e.booking.review!.professionalismRating);

    const completedAts = endorsements
      .map((e) => e.booking.completedAt)
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime());

    await prisma.neighbourhoodTrustProfile.upsert({
      where: { providerProfileId_zipCode: { providerProfileId, zipCode } },
      create: {
        providerProfileId,
        zipCode,
        city,
        state,
        totalJobs: endorsements.length,
        verifiedJobs: withReviews.length,
        avgRating: avg(ratings) ?? 0,
        avgQualityRating: avg(qualityRatings),
        avgCommunicationRating: avg(commRatings),
        avgValueRating: avg(valueRatings),
        avgProfessionalismRating: avg(profRatings),
        firstJobAt: completedAts[0] ?? null,
        lastJobAt: completedAts[completedAts.length - 1] ?? null,
        lastComputedAt: new Date(),
      },
      update: {
        totalJobs: endorsements.length,
        verifiedJobs: withReviews.length,
        avgRating: avg(ratings) ?? 0,
        avgQualityRating: avg(qualityRatings),
        avgCommunicationRating: avg(commRatings),
        avgValueRating: avg(valueRatings),
        avgProfessionalismRating: avg(profRatings),
        firstJobAt: completedAts[0] ?? null,
        lastJobAt: completedAts[completedAts.length - 1] ?? null,
        lastComputedAt: new Date(),
      },
    });
  }

  private async upsertServiceZone(
    providerProfileId: string,
    zipCode: string,
    city: string,
    state: string
  ) {
    const existing = await prisma.providerServiceZone.findUnique({
      where: { providerProfileId_zipCode: { providerProfileId, zipCode } },
    });

    if (existing) {
      await prisma.providerServiceZone.update({
        where: { id: existing.id },
        data: { totalJobs: { increment: 1 }, lastJobAt: new Date() },
      });
    } else {
      await prisma.providerServiceZone.create({
        data: { providerProfileId, zipCode, city, state, totalJobs: 1, firstJobAt: new Date(), lastJobAt: new Date() },
      });
    }
  }

  private async createFeedEntry(params: {
    zipCode: string;
    city: string;
    state: string;
    entryType: 'JOB_COMPLETED' | 'ENDORSEMENT_ADDED' | 'PROVIDER_FIRST_JOB';
    providerProfileId: string;
    endorsementId?: string;
    bookingId?: string;
    providerBusinessName: string;
    serviceCategory: string;
    starRating: number | null;
    highlightTags: string[];
    jobCompletedAt: Date | null;
  }) {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await prisma.neighbourhoodFeedEntry.create({
      data: {
        zipCode: params.zipCode,
        city: params.city,
        state: params.state,
        entryType: params.entryType,
        providerProfileId: params.providerProfileId,
        endorsementId: params.endorsementId ?? null,
        bookingId: params.bookingId ?? null,
        providerBusinessName: params.providerBusinessName,
        serviceCategory: params.serviceCategory,
        starRating: params.starRating,
        highlightTags: params.highlightTags,
        jobCompletedAt: params.jobCompletedAt,
        expiresAt,
      },
    });
  }
}
