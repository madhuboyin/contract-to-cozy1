// Working Seed Script - Matches Your Schema
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bookingTimeline.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.property.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.homeownerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Cleared existing data');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // Create Homeowner
  console.log('👤 Creating homeowner...');
  const homeowner1 = await prisma.user.create({
    data: {
      email: 'sarah@example.com',
      phone: '+1-555-0101',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'HOMEOWNER',
      passwordHash: hashedPassword,
      emailVerified: true,
      address: {
        create: {
          street1: '789 Elm St',
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
          totalBudget: 15000,
        },
      },
    },
    include: { homeownerProfile: true },
  });

  const property1 = await prisma.property.create({
    data: {
      homeownerProfileId: homeowner1.homeownerProfile!.id,
      name: 'Main Home',
      address: '789 Elm St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
    },
  });

  console.log('✅ Created homeowner with property');

  // Create Inspector
  console.log('🔍 Creating inspector...');
  const inspector1 = await prisma.user.create({
    data: {
      email: 'mike@inspect.com',
      phone: '+1-555-0201',
      firstName: 'Mike',
      lastName: 'Anderson',
      role: 'PROVIDER',
      passwordHash: hashedPassword,
      emailVerified: true,
      address: {
        create: {
          street1: '456 Oak Ave',
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
          businessName: 'Austin Home Inspections',
          serviceCategories: ['INSPECTION'],
          serviceRadius: 50,
          status: 'ACTIVE',
          yearsInBusiness: 12,
          averageRating: 4.8,
          totalReviews: 156,
        },
      },
    },
    include: { providerProfile: true },
  });

  await prisma.service.createMany({
    data: [
      {
        providerProfileId: inspector1.providerProfile!.id,
        category: 'INSPECTION',
        name: 'Home Inspection',
        description: 'Complete home inspection',
        basePrice: 450,
        priceUnit: 'flat rate',
        isActive: true,
      },
      {
        providerProfileId: inspector1.providerProfile!.id,
        category: 'INSPECTION',
        name: 'Roof Inspection',
        description: 'Detailed roof inspection',
        basePrice: 200,
        priceUnit: 'flat rate',
        isActive: true,
      },
    ],
  });

  console.log('✅ Created inspector with services');

  // Create Handyman
  console.log('🔧 Creating handyman...');
  const handyman1 = await prisma.user.create({
    data: {
      email: 'tom@fixitpro.com',
      phone: '+1-555-0301',
      firstName: 'Tom',
      lastName: 'Williams',
      role: 'PROVIDER',
      passwordHash: hashedPassword,
      emailVerified: true,
      address: {
        create: {
          street1: '123 Maple Dr',
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
          businessName: 'Fix It Pro',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 30,
          status: 'ACTIVE',
          yearsInBusiness: 8,
          averageRating: 4.9,
          totalReviews: 89,
        },
      },
    },
    include: { providerProfile: true },
  });

  await prisma.service.createMany({
    data: [
      {
        providerProfileId: handyman1.providerProfile!.id,
        category: 'HANDYMAN',
        name: 'General Repairs',
        description: 'Minor home repairs',
        basePrice: 85,
        priceUnit: 'per hour',
        isActive: true,
      },
      {
        providerProfileId: handyman1.providerProfile!.id,
        category: 'HANDYMAN',
        name: 'Drywall Repair',
        description: 'Patch and repair drywall',
        basePrice: 90,
        priceUnit: 'per hour',
        isActive: true,
      },
    ],
  });

  console.log('✅ Created handyman with services');

  // Create Bookings
  console.log('📅 Creating bookings...');

  const inspectionService = await prisma.service.findFirst({
    where: { providerProfileId: inspector1.providerProfile!.id },
  });

  const booking1 = await prisma.booking.create({
    data: {
      bookingNumber: 'BK-2025-001',
      homeownerId: homeowner1.id,
      providerId: inspector1.id,
      providerProfileId: inspector1.providerProfile!.id,
      propertyId: property1.id,
      serviceId: inspectionService!.id,
      category: 'INSPECTION',
      status: 'CONFIRMED',
      scheduledDate: new Date('2025-03-20T10:00:00Z'),
      estimatedPrice: 450,
      description: 'Pre-purchase home inspection',
      timeline: {
        create: [
          { status: 'PENDING', note: 'Booking requested' },
          { status: 'CONFIRMED', note: 'Confirmed', createdBy: inspector1.id },
        ],
      },
    },
  });

  const drywallService = await prisma.service.findFirst({
    where: {
      providerProfileId: handyman1.providerProfile!.id,
      name: { contains: 'Drywall' },
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      bookingNumber: 'BK-2025-002',
      homeownerId: homeowner1.id,
      providerId: handyman1.id,
      providerProfileId: handyman1.providerProfile!.id,
      propertyId: property1.id,
      serviceId: drywallService!.id,
      category: 'HANDYMAN',
      status: 'COMPLETED',
      scheduledDate: new Date('2025-02-28T14:00:00Z'),
      estimatedPrice: 180,
      finalPrice: 180,
      description: 'Drywall repair in master bedroom',
      timeline: {
        create: [
          { status: 'PENDING', note: 'Requested' },
          { status: 'CONFIRMED', note: 'Confirmed', createdBy: handyman1.id },
          { status: 'IN_PROGRESS', note: 'Started', createdBy: handyman1.id },
          { status: 'COMPLETED', note: 'Done', createdBy: handyman1.id },
        ],
      },
    },
  });

  console.log('✅ Created bookings');

  // Create Payment
  console.log('💳 Creating payment...');
  await prisma.payment.create({
    data: {
      bookingId: booking2.id,
      amount: 180,
      status: 'CAPTURED',
      description: 'Payment for drywall repair',
    },
  });

  console.log('✅ Created payment');

  // Create Review
  console.log('⭐ Creating review...');
  await prisma.review.create({
    data: {
      bookingId: booking2.id,
      authorId: homeowner1.id,
      providerId: handyman1.id,
      rating: 5,
      title: 'Excellent work!',
      content: 'Very professional and clean.',
      status: 'APPROVED',
    },
  });

  console.log('✅ Created review');

  // Create Messages
  console.log('💬 Creating messages...');
  await prisma.message.createMany({
    data: [
      {
        bookingId: booking1.id,
        senderId: homeowner1.id,
        recipientId: inspector1.id,
        content: 'Looking forward to the inspection!',
        isRead: true,
      },
      {
        bookingId: booking1.id,
        senderId: inspector1.id,
        recipientId: homeowner1.id,
        content: 'I will arrive at 10 AM sharp.',
        isRead: true,
      },
    ],
  });

  console.log('✅ Created messages');

  // Create Notifications
  console.log('🔔 Creating notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: homeowner1.id,
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: 'Your inspection is confirmed',
        isRead: false,
      },
      {
        userId: inspector1.id,
        type: 'new_booking',
        title: 'New Booking',
        message: 'New booking request',
        isRead: true,
      },
    ],
  });

  console.log('✅ Created notifications');

  const counts = {
    users: await prisma.user.count(),
    services: await prisma.service.count(),
    bookings: await prisma.booking.count(),
  };

  console.log('\n🎉 Seeding complete!\n');
  console.log('📊 Summary:');
  console.log(`   Users: ${counts.users}`);
  console.log(`   Services: ${counts.services}`);
  console.log(`   Bookings: ${counts.bookings}`);
  console.log('\n✅ Database ready!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
