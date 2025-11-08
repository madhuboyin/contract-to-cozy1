// Database Seed Script - FIXED
// Sample data for Inspection + Handyman categories

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data (development only!)
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bookingTimeline.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.providerAvailability.deleteMany();
  await prisma.providerPortfolio.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.property.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.homeownerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Cleared existing data');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // =========================================================================
  // HOMEOWNERS
  // =========================================================================

  console.log('👤 Creating homeowners...');

  const homeowner1 = await prisma.user.create({
    data: {
      email: 'sarah.johnson@example.com',
      phone: '+1-555-0101',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      address: {
        create: {
          street1: '789 Elm Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          country: 'USA',
          latitude: 30.2672,
          longitude: -97.7431,
        },
      },
      homeownerProfile: {
        create: {
          propertyType: 'Single Family',
          propertySize: 2400,
          yearBuilt: 2018,
          bedrooms: 4,
          bathrooms: 2.5,
          closingDate: new Date('2025-03-15'),
          purchasePrice: 525000,
          preferredContactMethod: 'email',
          totalBudget: 15000,
          spentAmount: 0,
        },
      },
    },
    include: {
      homeownerProfile: true,
    },
  });

  // Create property for homeowner1
  const property1 = await prisma.property.create({
    data: {
      homeownerProfileId: homeowner1.homeownerProfile!.id,
      name: 'Main Home',
      address: '789 Elm Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      isPrimary: true,
    },
  });

  console.log('✅ Created 1 homeowner with property');

  // =========================================================================
  // PROVIDERS - INSPECTORS
  // =========================================================================

  console.log('🔍 Creating inspection providers...');

  const inspector1 = await prisma.user.create({
    data: {
      email: 'mike.anderson@homeinspect.com',
      phone: '+1-555-0201',
      firstName: 'Mike',
      lastName: 'Anderson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      address: {
        create: {
          street1: '456 Oak Avenue',
          city: 'Austin',
          state: 'TX',
          zipCode: '78702',
          country: 'USA',
          latitude: 30.2711,
          longitude: -97.7437,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Austin Home Inspections LLC',
          businessType: 'LLC',
          serviceCategories: ['INSPECTION'],
          serviceRadius: 50,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-01-15'),
          insuranceVerified: true,
          licenseVerified: true,
          yearsInBusiness: 12,
          teamSize: 3,
          description: 'Certified home inspector with over 12 years of experience. Thorough inspections with same-day reports.',
          website: 'https://austinhomeinspections.com',
          averageRating: 4.8,
          totalReviews: 156,
          totalCompletedJobs: 1248,
          stripeOnboarded: true,
        },
      },
    },
    include: {
      providerProfile: true,
    },
  });

  // Add services for inspector1
  await prisma.service.createMany({
    data: [
      {
        category: 'INSPECTION',
        name: 'Comprehensive Home Inspection',
        description: 'Complete home inspection covering all major systems and components',
        basePrice: 450,
        priceUnit: 'flat rate',
        isActive: true,
      },
      {
        category: 'INSPECTION',
        name: 'Roof Inspection',
        description: 'Detailed roof inspection including shingles, flashing, and structural integrity',
        basePrice: 200,
        priceUnit: 'flat rate',
        isActive: true,
      },
    ],
  });

  console.log('✅ Created 1 inspector with 2 services');

  // =========================================================================
  // PROVIDERS - HANDYMAN
  // =========================================================================

  console.log('🔧 Creating handyman providers...');

  const handyman1 = await prisma.user.create({
    data: {
      email: 'tom.williams@fixitpro.com',
      phone: '+1-555-0301',
      firstName: 'Tom',
      lastName: 'Williams',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      address: {
        create: {
          street1: '123 Maple Drive',
          city: 'Austin',
          state: 'TX',
          zipCode: '78703',
          country: 'USA',
          latitude: 30.2849,
          longitude: -97.7551,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Fix It Pro Handyman Services',
          businessType: 'Sole Proprietor',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 30,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-02-01'),
          insuranceVerified: true,
          licenseVerified: false,
          yearsInBusiness: 8,
          teamSize: 1,
          description: 'Experienced handyman for all your home repair needs. Same-day service available.',
          averageRating: 4.9,
          totalReviews: 89,
          totalCompletedJobs: 542,
          stripeOnboarded: true,
        },
      },
    },
    include: {
      providerProfile: true,
    },
  });

  // Add services for handyman1 - FIXED ENUM VALUES
  await prisma.service.createMany({
    data: [
      {
        category: 'HANDYMAN',
        name: 'General Home Repairs',
        description: 'Small repairs around the house including minor fixes and maintenance',
        basePrice: 85,
        priceUnit: 'per hour',
        minimumCharge: 170,
        isActive: true,
      },
      {
        category: 'HANDYMAN',
        name: 'Fixture Installation',
        description: 'Install light fixtures, ceiling fans, shelving, and more',
        basePrice: 95,
        priceUnit: 'per hour',
        minimumCharge: 95,
        isActive: true,
      },
      {
        category: 'HANDYMAN',
        name: 'Drywall Repair & Painting',
        description: 'Patch holes, repair drywall damage, and paint touch-ups',
        basePrice: 90,
        priceUnit: 'per hour',
        minimumCharge: 180,
        isActive: true,
      },
    ],
  });

  console.log('✅ Created 1 handyman with 3 services');

  // Create another handyman
  const handyman2 = await prisma.user.create({
    data: {
      email: 'carlos.rodriguez@handy.com',
      phone: '+1-555-0302',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      address: {
        create: {
          street1: '789 Pine Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78704',
          country: 'USA',
          latitude: 30.2515,
          longitude: -97.7559,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Rodriguez Handyman & Repair',
          businessType: 'Sole Proprietor',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 25,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-03-01'),
          insuranceVerified: true,
          licenseVerified: false,
          yearsInBusiness: 5,
          teamSize: 1,
          description: 'Quality handyman services specializing in furniture assembly and home maintenance',
          averageRating: 4.7,
          totalReviews: 42,
          totalCompletedJobs: 187,
          stripeOnboarded: true,
        },
      },
    },
    include: {
      providerProfile: true,
    },
  });

  // Add services for handyman2 - FIXED ENUM VALUES
  await prisma.service.createMany({
    data: [
      {
        category: 'HANDYMAN',
        name: 'Furniture Assembly',
        description: 'Professional assembly of IKEA and other furniture',
        basePrice: 75,
        priceUnit: 'per hour',
        minimumCharge: 75,
        isActive: true,
      },
      {
        category: 'HANDYMAN',
        name: 'Home Maintenance',
        description: 'Regular home maintenance including cleaning gutters, changing filters, etc.',
        basePrice: 80,
        priceUnit: 'per hour',
        minimumCharge: 160,
        isActive: true,
      },
    ],
  });

  console.log('✅ Created 2nd handyman with 2 services');

  // =========================================================================
  // BOOKINGS
  // =========================================================================

  console.log('📅 Creating bookings...');

  // Get the first service from inspector1
  const inspectionService = await prisma.service.findFirst({
    where: {
      category: 'INSPECTION',
    },
  });

  const booking1 = await prisma.booking.create({
    data: {
      homeownerId: homeowner1.id,
      providerId: inspector1.id,
      propertyId: property1.id,
      serviceId: inspectionService!.id,
      category: 'INSPECTION',
      status: 'CONFIRMED',
      bookingNumber: 'BK-2025-001',
      scheduledDate: new Date('2025-03-20T10:00:00Z'),
      estimatedPrice: 450,
      description: 'Pre-purchase home inspection for new home',
      timeline: {
        create: [
          {
            status: 'PENDING',
            note: 'Booking requested',
          },
          {
            status: 'CONFIRMED',
            note: 'Booking confirmed by provider',
            createdBy: inspector1.id,
          },
        ],
      },
    },
  });

  // Get handyman service
  const handymanService = await prisma.service.findFirst({
    where: {
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      homeownerId: homeowner1.id,
      providerId: handyman1.id,
      propertyId: property1.id,
      serviceId: handymanService!.id,
      category: 'HANDYMAN',
      status: 'COMPLETED',
      bookingNumber: 'BK-2025-002',
      scheduledDate: new Date('2025-02-28T14:00:00Z'),
      estimatedPrice: 180,
      description: 'Drywall repair in master bedroom',
      finalPrice: 180,
      timeline: {
        create: [
          {
            status: 'PENDING',
            note: 'Booking requested',
          },
          {
            status: 'CONFIRMED',
            note: 'Booking confirmed',
            createdBy: handyman1.id,
          },
          {
            status: 'IN_PROGRESS',
            note: 'Work started',
            createdBy: handyman1.id,
          },
          {
            status: 'COMPLETED',
            note: 'Work completed successfully',
            createdBy: handyman1.id,
          },
        ],
      },
    },
  });

  console.log('✅ Created 2 bookings');

  // =========================================================================
  // PAYMENTS
  // =========================================================================

  console.log('💳 Creating payments...');

  await prisma.payment.create({
    data: {
      bookingId: booking2.id,
      amount: 180,
      currency: 'USD',
      status: 'CAPTURED',
      isDeposit: false,
      description: 'Payment for drywall repair',
      stripePaymentIntentId: 'pi_test_1234567890',
      stripeChargeId: 'ch_test_0987654321',
    },
  });

  console.log('✅ Created 1 payment');

  // =========================================================================
  // REVIEWS
  // =========================================================================

  console.log('⭐ Creating reviews...');

  await prisma.review.create({
    data: {
      bookingId: booking2.id,
      authorId: homeowner1.id,
      providerId: handyman1.id,
      rating: 5,
      title: 'Excellent work!',
      content: 'Tom did an amazing job repairing the drywall. Very professional and clean. Highly recommend!',
      qualityRating: 5,
      communicationRating: 5,
      valueRating: 5,
      professionalismRating: 5,
      status: 'APPROVED',
      response: 'Thank you for the kind words! It was a pleasure working with you.',
      respondedAt: new Date('2025-03-01T10:00:00Z'),
    },
  });

  console.log('✅ Created 1 review');

  // =========================================================================
  // MESSAGES
  // =========================================================================

  console.log('💬 Creating messages...');

  await prisma.message.createMany({
    data: [
      {
        bookingId: booking1.id,
        senderId: homeowner1.id,
        recipientId: inspector1.id,
        type: 'TEXT',
        content: 'Hi Mike, looking forward to the inspection next week!',
        isRead: true,
        readAt: new Date('2025-03-11T09:30:00Z'),
      },
      {
        bookingId: booking1.id,
        senderId: inspector1.id,
        recipientId: homeowner1.id,
        type: 'TEXT',
        content: 'Great! I will arrive at 10 AM sharp. Please ensure all utilities are turned on.',
        isRead: true,
        readAt: new Date('2025-03-11T14:00:00Z'),
      },
    ],
  });

  console.log('✅ Created 2 messages');

  // =========================================================================
  // NOTIFICATIONS
  // =========================================================================

  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: homeowner1.id,
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: 'Your home inspection has been confirmed for March 20, 2025',
        actionUrl: `/bookings/${booking1.id}`,
        isRead: false,
      },
      {
        userId: homeowner1.id,
        type: 'booking_completed',
        title: 'Service Completed',
        message: 'Your drywall repair has been completed. Please leave a review!',
        actionUrl: `/bookings/${booking2.id}/review`,
        isRead: true,
        readAt: new Date('2025-03-01T17:00:00Z'),
      },
      {
        userId: inspector1.id,
        type: 'new_booking',
        title: 'New Booking Request',
        message: 'You have a new booking request from Sarah Johnson',
        actionUrl: `/provider/bookings/${booking1.id}`,
        isRead: true,
        readAt: new Date('2025-03-10T13:00:00Z'),
      },
    ],
  });

  console.log('✅ Created 3 notifications');

  // =========================================================================
  // SYSTEM SETTINGS
  // =========================================================================

  console.log('⚙️  Creating system settings...');

  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'booking_auto_cancel_hours',
        value: 24,
        description: 'Auto-cancel unconfirmed bookings after X hours',
      },
      {
        key: 'provider_service_radius_max',
        value: 100,
        description: 'Maximum service radius in miles',
      },
      {
        key: 'review_moderation_enabled',
        value: true,
        description: 'Require admin approval for reviews',
      },
      {
        key: 'stripe_platform_fee_percentage',
        value: 5,
        description: 'Platform fee percentage for payments',
      },
    ],
  });

  console.log('✅ Created 4 system settings');

  // =========================================================================
  // SUMMARY
  // =========================================================================

  const counts = {
    users: await prisma.user.count(),
    providers: await prisma.providerProfile.count(),
    homeowners: await prisma.homeownerProfile.count(),
    services: await prisma.service.count(),
    bookings: await prisma.booking.count(),
    reviews: await prisma.review.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
  };

  console.log('\n🎉 Database seeding complete!\n');
  console.log('📊 Summary:');
  console.log(`   Users: ${counts.users}`);
  console.log(`   Homeowners: ${counts.homeowners}`);
  console.log(`   Providers: ${counts.providers}`);
  console.log(`   Services: ${counts.services}`);
  console.log(`   Bookings: ${counts.bookings}`);
  console.log(`   Reviews: ${counts.reviews}`);
  console.log(`   Messages: ${counts.messages}`);
  console.log(`   Notifications: ${counts.notifications}`);
  console.log('\n✅ Ready for development!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
