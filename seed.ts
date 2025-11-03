// Database Seed Script
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
          properties: {
            create: {
              name: 'Main Home',
              address: '789 Elm Street',
              city: 'Austin',
              state: 'TX',
              zipCode: '78701',
              isPrimary: true,
            },
          },
        },
      },
    },
  });

  const homeowner2 = await prisma.user.create({
    data: {
      email: 'david.chen@example.com',
      phone: '+1-555-0102',
      firstName: 'David',
      lastName: 'Chen',
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      address: {
        create: {
          street1: '456 Oak Avenue',
          city: 'Austin',
          state: 'TX',
          zipCode: '78702',
          country: 'USA',
          latitude: 30.2747,
          longitude: -97.7294,
        },
      },
      homeownerProfile: {
        create: {
          propertyType: 'Condo',
          propertySize: 1800,
          yearBuilt: 2020,
          bedrooms: 3,
          bathrooms: 2,
          closingDate: new Date('2025-04-01'),
          purchasePrice: 385000,
          preferredContactMethod: 'phone',
          totalBudget: 8000,
          spentAmount: 0,
          properties: {
            create: {
              name: 'Downtown Condo',
              address: '456 Oak Avenue',
              city: 'Austin',
              state: 'TX',
              zipCode: '78702',
              isPrimary: true,
            },
          },
        },
      },
    },
  });

  console.log('✅ Created 2 homeowners');

  // =========================================================================
  // INSPECTION PROVIDERS
  // =========================================================================

  console.log('🔍 Creating inspection providers...');

  const inspector1 = await prisma.user.create({
    data: {
      email: 'mike.thompson@homeinspect.com',
      phone: '+1-555-0201',
      firstName: 'Mike',
      lastName: 'Thompson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed home inspector with 15 years of experience. InterNACHI certified.',
      address: {
        create: {
          street1: '123 Business Park',
          city: 'Austin',
          state: 'TX',
          zipCode: '78703',
          country: 'USA',
          latitude: 30.2845,
          longitude: -97.7560,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Thompson Home Inspections',
          businessType: 'LLC',
          serviceCategories: ['INSPECTION'],
          serviceRadius: 50,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-12-01'),
          insuranceVerified: true,
          licenseVerified: true,
          yearsInBusiness: 15,
          teamSize: 3,
          description: 'Full-service home inspection company serving Central Texas. We provide detailed reports with photos within 24 hours.',
          website: 'https://thompsoninspections.com',
          averageRating: 4.8,
          totalReviews: 127,
          totalCompletedJobs: 450,
          stripeOnboarded: true,
          services: {
            create: [
              {
                category: 'INSPECTION',
                inspectionType: 'HOME_INSPECTION',
                name: 'Complete Home Inspection',
                description: 'Comprehensive inspection covering structure, roof, HVAC, plumbing, electrical, and more. Includes thermal imaging.',
                basePrice: 450,
                priceUnit: 'flat rate',
                estimatedDuration: 180,
                isActive: true,
              },
              {
                category: 'INSPECTION',
                inspectionType: 'PEST_INSPECTION',
                name: 'Termite & Pest Inspection',
                description: 'Thorough inspection for termites, carpenter ants, and other wood-destroying insects.',
                basePrice: 150,
                priceUnit: 'flat rate',
                estimatedDuration: 60,
                isActive: true,
              },
              {
                category: 'INSPECTION',
                inspectionType: 'RADON_TESTING',
                name: 'Radon Testing',
                description: '48-hour radon test with EPA-approved equipment. Results within 72 hours.',
                basePrice: 175,
                priceUnit: 'flat rate',
                estimatedDuration: 30,
                isActive: true,
              },
            ],
          },
          certifications: {
            create: [
              {
                name: 'InterNACHI Certified Professional Inspector',
                issuingAuthority: 'International Association of Certified Home Inspectors',
                certificateNumber: 'NACHI-12345',
                issueDate: new Date('2015-03-15'),
                expiryDate: new Date('2026-03-15'),
                verified: true,
              },
              {
                name: 'Texas Real Estate Commission License',
                issuingAuthority: 'TREC',
                certificateNumber: 'TX-INS-98765',
                issueDate: new Date('2010-06-01'),
                verified: true,
              },
            ],
          },
        },
      },
    },
  });

  const inspector2 = await prisma.user.create({
    data: {
      email: 'rachel.martinez@precisioninspect.com',
      phone: '+1-555-0202',
      firstName: 'Rachel',
      lastName: 'Martinez',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Structural engineer turned home inspector. Specializing in foundation and structural issues.',
      address: {
        create: {
          street1: '555 Tech Boulevard',
          city: 'Austin',
          state: 'TX',
          zipCode: '78704',
          country: 'USA',
          latitude: 30.2515,
          longitude: -97.7537,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Precision Home Inspections',
          businessType: 'LLC',
          serviceCategories: ['INSPECTION'],
          serviceRadius: 40,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-11-15'),
          insuranceVerified: true,
          licenseVerified: true,
          yearsInBusiness: 8,
          teamSize: 2,
          description: 'Engineer-led inspection services with a focus on structural integrity. Detailed reports with 3D modeling for major issues.',
          website: 'https://precisioninspect.com',
          averageRating: 4.9,
          totalReviews: 89,
          totalCompletedJobs: 320,
          stripeOnboarded: true,
          services: {
            create: [
              {
                category: 'INSPECTION',
                inspectionType: 'HOME_INSPECTION',
                name: 'Engineering-Grade Home Inspection',
                description: 'In-depth structural analysis with engineering perspective. Perfect for older homes or homes with visible issues.',
                basePrice: 550,
                priceUnit: 'flat rate',
                estimatedDuration: 240,
                isActive: true,
              },
              {
                category: 'INSPECTION',
                inspectionType: 'FOUNDATION_INSPECTION',
                name: 'Foundation Inspection',
                description: 'Comprehensive foundation assessment with elevation measurements and crack mapping.',
                basePrice: 350,
                priceUnit: 'flat rate',
                estimatedDuration: 120,
                isActive: true,
              },
              {
                category: 'INSPECTION',
                inspectionType: 'MOLD_INSPECTION',
                name: 'Mold Inspection & Testing',
                description: 'Visual inspection plus air quality testing. Lab analysis included.',
                basePrice: 275,
                priceUnit: 'flat rate',
                estimatedDuration: 90,
                isActive: true,
              },
            ],
          },
          certifications: {
            create: [
              {
                name: 'Professional Engineer License',
                issuingAuthority: 'Texas Board of Professional Engineers',
                certificateNumber: 'PE-54321',
                issueDate: new Date('2012-01-15'),
                verified: true,
              },
            ],
          },
        },
      },
    },
  });

  console.log('✅ Created 2 inspection providers');

  // =========================================================================
  // HANDYMAN PROVIDERS
  // =========================================================================

  console.log('🔧 Creating handyman providers...');

  const handyman1 = await prisma.user.create({
    data: {
      email: 'james.wilson@fixitall.com',
      phone: '+1-555-0301',
      firstName: 'James',
      lastName: 'Wilson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Jack of all trades with 20 years in residential maintenance and repair.',
      address: {
        create: {
          street1: '321 Repair Lane',
          city: 'Austin',
          state: 'TX',
          zipCode: '78705',
          country: 'USA',
          latitude: 30.2895,
          longitude: -97.7448,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Fix It All Handyman Services',
          businessType: 'Sole Proprietor',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 30,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-10-01'),
          insuranceVerified: true,
          licenseVerified: true,
          yearsInBusiness: 20,
          teamSize: 1,
          description: 'One-call solution for all your home repair needs. No job too small. Same-day service available.',
          averageRating: 4.7,
          totalReviews: 203,
          totalCompletedJobs: 1250,
          stripeOnboarded: true,
          services: {
            create: [
              {
                category: 'HANDYMAN',
                handymanType: 'MINOR_REPAIRS',
                name: 'Minor Home Repairs',
                description: 'Fix loose handles, squeaky doors, leaky faucets, and other small repairs.',
                basePrice: 85,
                priceUnit: 'per hour',
                minimumCharge: 85,
                estimatedDuration: 60,
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                handymanType: 'FIXTURE_INSTALLATION',
                name: 'Fixture Installation',
                description: 'Install light fixtures, ceiling fans, towel bars, shelving, and more.',
                basePrice: 95,
                priceUnit: 'per hour',
                minimumCharge: 95,
                estimatedDuration: 90,
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                handymanType: 'FURNITURE_ASSEMBLY',
                name: 'Furniture Assembly',
                description: 'Expert assembly of IKEA and other flat-pack furniture. Tools provided.',
                basePrice: 75,
                priceUnit: 'per hour',
                minimumCharge: 75,
                estimatedDuration: 120,
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                handymanType: 'DRYWALL_REPAIR',
                name: 'Drywall Repair & Painting',
                description: 'Patch holes, fix cracks, and match paint. Perfect finish guaranteed.',
                basePrice: 90,
                priceUnit: 'per hour',
                minimumCharge: 150,
                estimatedDuration: 120,
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });

  const handyman2 = await prisma.user.create({
    data: {
      email: 'carlos.rodriguez@homepro.com',
      phone: '+1-555-0302',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Professional handyman specializing in carpentry and exterior work.',
      address: {
        create: {
          street1: '888 Workshop Drive',
          city: 'Austin',
          state: 'TX',
          zipCode: '78706',
          country: 'USA',
          latitude: 30.2801,
          longitude: -97.7601,
        },
      },
      providerProfile: {
        create: {
          businessName: 'HomePro Handyman',
          businessType: 'LLC',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 35,
          status: 'ACTIVE',
          backgroundCheckDate: new Date('2024-09-15'),
          insuranceVerified: true,
          licenseVerified: true,
          yearsInBusiness: 12,
          teamSize: 2,
          description: 'Quality craftsmanship for all interior and exterior repairs. Carpentry specialist.',
          averageRating: 4.9,
          totalReviews: 156,
          totalCompletedJobs: 780,
          stripeOnboarded: true,
          services: {
            create: [
              {
                category: 'HANDYMAN',
                handymanType: 'DECK_FENCE_REPAIR',
                name: 'Deck & Fence Repair',
                description: 'Fix broken boards, reinforce posts, staining and sealing available.',
                basePrice: 95,
                priceUnit: 'per hour',
                minimumCharge: 150,
                estimatedDuration: 180,
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                handymanType: 'DOOR_WINDOW_REPAIR',
                name: 'Door & Window Repair',
                description: 'Repair sticky doors, broken windows, replace weatherstripping.',
                basePrice: 90,
                priceUnit: 'per hour',
                minimumCharge: 90,
                estimatedDuration: 90,
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                handymanType: 'GENERAL_MAINTENANCE',
                name: 'General Maintenance',
                description: 'Preventive maintenance, seasonal prep, honey-do lists.',
                basePrice: 85,
                priceUnit: 'per hour',
                minimumCharge: 170,
                estimatedDuration: 120,
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });

  console.log('✅ Created 2 handyman providers');

  // =========================================================================
  // BOOKINGS
  // =========================================================================

  console.log('📅 Creating sample bookings...');

  const homeowner1Property = await prisma.property.findFirst({
    where: { homeownerProfileId: homeowner1.homeownerProfile!.id },
  });

  const inspector1Service = await prisma.service.findFirst({
    where: {
      providerProfileId: inspector1.providerProfile!.id,
      inspectionType: 'HOME_INSPECTION',
    },
  });

  const booking1 = await prisma.booking.create({
    data: {
      bookingNumber: 'B-2025-001001',
      homeownerId: homeowner1.id,
      providerId: inspector1.id,
      providerProfileId: inspector1.providerProfile!.id,
      propertyId: homeowner1Property!.id,
      serviceId: inspector1Service!.id,
      category: 'INSPECTION',
      status: 'CONFIRMED',
      requestedDate: new Date('2025-03-18'),
      scheduledDate: new Date('2025-03-18T10:00:00Z'),
      estimatedPrice: 450,
      description: 'Pre-purchase home inspection for 2400 sq ft single family home',
      specialRequests: 'Please focus on foundation and roof condition',
      timeline: {
        create: [
          {
            status: 'DRAFT',
            note: 'Booking created',
            createdBy: homeowner1.id,
          },
          {
            status: 'PENDING',
            note: 'Submitted for approval',
            createdBy: homeowner1.id,
          },
          {
            status: 'CONFIRMED',
            note: 'Provider confirmed appointment',
            createdBy: inspector1.id,
          },
        ],
      },
    },
  });

  const handyman1Service = await prisma.service.findFirst({
    where: {
      providerProfileId: handyman1.providerProfile!.id,
      handymanType: 'FIXTURE_INSTALLATION',
    },
  });

  const homeowner2Property = await prisma.property.findFirst({
    where: { homeownerProfileId: homeowner2.homeownerProfile!.id },
  });

  const booking2 = await prisma.booking.create({
    data: {
      bookingNumber: 'B-2025-001002',
      homeownerId: homeowner2.id,
      providerId: handyman1.id,
      providerProfileId: handyman1.providerProfile!.id,
      propertyId: homeowner2Property!.id,
      serviceId: handyman1Service!.id,
      category: 'HANDYMAN',
      status: 'COMPLETED',
      requestedDate: new Date('2025-03-01'),
      scheduledDate: new Date('2025-03-01T14:00:00Z'),
      startTime: new Date('2025-03-01T14:00:00Z'),
      endTime: new Date('2025-03-01T16:00:00Z'),
      actualStartTime: new Date('2025-03-01T14:05:00Z'),
      actualEndTime: new Date('2025-03-01T16:30:00Z'),
      estimatedPrice: 190,
      finalPrice: 237.5,
      description: 'Install 3 ceiling fans and 2 light fixtures',
      completedAt: new Date('2025-03-01T16:30:00Z'),
      timeline: {
        create: [
          {
            status: 'PENDING',
            note: 'Booking created and submitted',
            createdBy: homeowner2.id,
          },
          {
            status: 'CONFIRMED',
            note: 'Provider confirmed',
            createdBy: handyman1.id,
          },
          {
            status: 'IN_PROGRESS',
            note: 'Work started',
            createdBy: handyman1.id,
          },
          {
            status: 'COMPLETED',
            note: 'All fixtures installed successfully',
            createdBy: handyman1.id,
          },
        ],
      },
      payments: {
        create: {
          amount: 237.5,
          currency: 'USD',
          status: 'CAPTURED',
          description: 'Payment for fixture installation service',
        },
      },
    },
  });

  // Review for completed booking
  await prisma.review.create({
    data: {
      bookingId: booking2.id,
      authorId: homeowner2.id,
      providerId: handyman1.id,
      rating: 5,
      title: 'Excellent work!',
      content: 'James did a fantastic job installing all the fixtures. Very professional and cleaned up afterwards. Highly recommend!',
      qualityRating: 5,
      communicationRating: 5,
      valueRating: 5,
      professionalismRating: 5,
      status: 'APPROVED',
    },
  });

  console.log('✅ Created 2 sample bookings with timeline');

  // =========================================================================
  // MESSAGES
  // =========================================================================

  console.log('💬 Creating sample messages...');

  await prisma.message.createMany({
    data: [
      {
        bookingId: booking1.id,
        senderId: homeowner1.id,
        recipientId: inspector1.id,
        type: 'TEXT',
        content: 'Hi Mike, looking forward to the inspection on the 18th. What time works best for you?',
        isRead: true,
        readAt: new Date('2025-03-10T15:30:00Z'),
      },
      {
        bookingId: booking1.id,
        senderId: inspector1.id,
        recipientId: homeowner1.id,
        type: 'TEXT',
        content: "Hello Sarah! 10 AM works great. I'll plan for 3 hours. Please ensure utilities are on.",
        isRead: true,
        readAt: new Date('2025-03-10T16:00:00Z'),
      },
      {
        bookingId: booking1.id,
        senderId: homeowner1.id,
        recipientId: inspector1.id,
        type: 'TEXT',
        content: 'Perfect! All utilities will be on. See you then!',
        isRead: true,
        readAt: new Date('2025-03-10T16:15:00Z'),
      },
    ],
  });

  console.log('✅ Created sample messages');

  // =========================================================================
  // NOTIFICATIONS
  // =========================================================================

  console.log('🔔 Creating sample notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: homeowner1.id,
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: 'Your home inspection with Thompson Home Inspections has been confirmed for March 18, 2025 at 10:00 AM',
        actionUrl: `/bookings/${booking1.id}`,
        isRead: true,
        readAt: new Date('2025-03-10T14:00:00Z'),
      },
      {
        userId: homeowner2.id,
        type: 'booking_completed',
        title: 'Service Completed',
        message: 'Your handyman service has been completed. Please leave a review!',
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

  console.log('✅ Created sample notifications');

  // =========================================================================
  // SYSTEM SETTINGS
  // =========================================================================

  console.log('⚙️ Creating system settings...');

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

  console.log('✅ Created system settings');

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
