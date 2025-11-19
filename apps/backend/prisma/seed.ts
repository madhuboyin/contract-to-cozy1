// Comprehensive Seed Script - All Service Categories
// Run: npx prisma db seed

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding comprehensive test data for all service categories...');
  console.log('');

  // Clear existing data
  console.log('🧹 Clearing existing data...');
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
  await prisma.checklistItem.deleteMany();
  await prisma.checklist.deleteMany();
  await prisma.providerAvailability.deleteMany();
  await prisma.providerPortfolio.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.property.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.homeownerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Cleared existing data');
  console.log('');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // =========================================================================
  // HOMEOWNERS
  // =========================================================================

  console.log('👤 Creating homeowners...');

  // 1. HOME_BUYER User
  const homeBuyer = await prisma.user.create({
    data: {
      email: 'buyer@example.com',
      phone: '+1-555-0101',
      firstName: 'Emily',
      lastName: 'Martinez',
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'First-time home buyer, closing next month!',
      address: {
        create: {
          street1: '456 Oak Avenue',
          city: 'Austin',
          state: 'TX',
          zipCode: '78704',
          country: 'USA',
          latitude: 30.2500,
          longitude: -97.7500,
        },
      },
      homeownerProfile: {
        create: {
          segment: 'HOME_BUYER',
          propertyType: 'Single Family',
          propertySize: 1850,
          yearBuilt: 2019,
          bedrooms: 3,
          bathrooms: 2,
          closingDate: new Date('2025-12-15'),
          purchasePrice: 425000,
          totalBudget: 15000,
          spentAmount: 0,
          preferredContactMethod: 'email',
        },
      },
    },
    include: { homeownerProfile: true },
  });

  await prisma.property.create({
    data: {
      homeownerProfileId: homeBuyer.homeownerProfile!.id,
      name: 'Future Home',
      address: '456 Oak Avenue',
      city: 'Austin',
      state: 'TX',
      zipCode: '78704',
      isPrimary: true,
    },
  });

  console.log('✅ Created HOME_BUYER: buyer@example.com');

  // 2. EXISTING_OWNER User
  const existingOwner = await prisma.user.create({
    data: {
      email: 'owner@example.com',
      phone: '+1-555-0102',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Homeowner for 5 years, love maintaining my home!',
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
          segment: 'EXISTING_OWNER',
          propertyType: 'Single Family',
          propertySize: 2400,
          yearBuilt: 2018,
          bedrooms: 4,
          bathrooms: 2.5,
          preferredContactMethod: 'email',
        },
      },
    },
    include: { homeownerProfile: true },
  });

  await prisma.property.create({
    data: {
      homeownerProfileId: existingOwner.homeownerProfile!.id,
      name: 'My Home',
      address: '789 Elm Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      isPrimary: true,
    },
  });

  console.log('✅ Created EXISTING_OWNER: owner@example.com');
  console.log('');

  // =========================================================================
  // PROVIDERS - ALL SERVICE CATEGORIES
  // =========================================================================

  console.log('🔧 Creating providers for all service categories...');
  console.log('');

  // 1. INSPECTION Provider
  const inspector = await prisma.user.create({
    data: {
      email: 'inspector@example.com',
      phone: '+1-555-0201',
      firstName: 'Mike',
      lastName: 'Thompson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed home inspector with 15+ years experience',
      address: {
        create: {
          street1: '100 Inspector Lane',
          city: 'Austin',
          state: 'TX',
          zipCode: '78702',
          country: 'USA',
          latitude: 30.2700,
          longitude: -97.7400,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Austin Home Inspections',
          serviceCategories: ['INSPECTION'],
          serviceRadius: 50,
          status: 'ACTIVE',
          yearsInBusiness: 15,
          averageRating: 4.9,
          totalReviews: 245,
          services: {
            create: [
              {
                category: 'INSPECTION',
                name: 'Complete Home Inspection',
                description: 'Comprehensive inspection of all major systems and structure',
                basePrice: 450,
                priceUnit: 'flat rate',
                isActive: true,
              },
              {
                category: 'INSPECTION',
                name: 'Roof Inspection',
                description: 'Detailed roof condition assessment',
                basePrice: 200,
                priceUnit: 'flat rate',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ INSPECTION: inspector@example.com');

  // 2. HANDYMAN Provider
  const handyman = await prisma.user.create({
    data: {
      email: 'handyman@example.com',
      phone: '+1-555-0202',
      firstName: 'Tom',
      lastName: 'Williams',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Experienced handyman for all home repairs',
      address: {
        create: {
          street1: '200 Handyman Road',
          city: 'Austin',
          state: 'TX',
          zipCode: '78703',
          country: 'USA',
          latitude: 30.2800,
          longitude: -97.7500,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Fix It Pro Handyman',
          serviceCategories: ['HANDYMAN'],
          serviceRadius: 30,
          status: 'ACTIVE',
          yearsInBusiness: 10,
          averageRating: 4.8,
          totalReviews: 189,
          services: {
            create: [
              {
                category: 'HANDYMAN',
                name: 'General Repairs',
                description: 'Minor home repairs and fixes',
                basePrice: 85,
                priceUnit: 'per hour',
                isActive: true,
              },
              {
                category: 'HANDYMAN',
                name: 'Furniture Assembly',
                description: 'Professional furniture assembly service',
                basePrice: 75,
                priceUnit: 'per hour',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ HANDYMAN: handyman@example.com');

  // 3. MOVING Provider
  const mover = await prisma.user.create({
    data: {
      email: 'mover@example.com',
      phone: '+1-555-0203',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Professional moving company with 20 years experience',
      address: {
        create: {
          street1: '300 Moving Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78704',
          country: 'USA',
          latitude: 30.2600,
          longitude: -97.7600,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Austin Movers Pro',
          serviceCategories: ['MOVING'],
          serviceRadius: 100,
          status: 'ACTIVE',
          yearsInBusiness: 20,
          averageRating: 4.7,
          totalReviews: 312,
          services: {
            create: [
              {
                category: 'MOVING',
                name: 'Local Moving Service',
                description: 'Full-service local moving within 50 miles',
                basePrice: 150,
                priceUnit: 'per hour',
                isActive: true,
              },
              {
                category: 'MOVING',
                name: 'Packing Service',
                description: 'Professional packing service',
                basePrice: 100,
                priceUnit: 'per hour',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ MOVING: mover@example.com');

  // 4. PLUMBING Provider
  const plumber = await prisma.user.create({
    data: {
      email: 'plumber@example.com',
      phone: '+1-555-0204',
      firstName: 'David',
      lastName: 'Chen',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed plumber specializing in residential repairs',
      address: {
        create: {
          street1: '400 Plumber Way',
          city: 'Austin',
          state: 'TX',
          zipCode: '78705',
          country: 'USA',
          latitude: 30.2900,
          longitude: -97.7400,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Austin Plumbing Experts',
          serviceCategories: ['PLUMBING'],
          serviceRadius: 40,
          status: 'ACTIVE',
          yearsInBusiness: 12,
          averageRating: 4.9,
          totalReviews: 178,
          services: {
            create: [
              {
                category: 'PLUMBING',
                name: 'Leak Repair',
                description: 'Fix leaky faucets, pipes, and fixtures',
                basePrice: 120,
                priceUnit: 'per hour',
                isActive: true,
              },
              {
                category: 'PLUMBING',
                name: 'Drain Cleaning',
                description: 'Professional drain and sewer cleaning',
                basePrice: 150,
                priceUnit: 'per service',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ PLUMBING: plumber@example.com');

  // 5. ELECTRICAL Provider
  const electrician = await prisma.user.create({
    data: {
      email: 'electrician@example.com',
      phone: '+1-555-0205',
      firstName: 'James',
      lastName: 'Wilson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Master electrician with 18 years experience',
      address: {
        create: {
          street1: '500 Electric Avenue',
          city: 'Austin',
          state: 'TX',
          zipCode: '78706',
          country: 'USA',
          latitude: 30.3000,
          longitude: -97.7500,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Bright Electric Services',
          serviceCategories: ['ELECTRICAL'],
          serviceRadius: 35,
          status: 'ACTIVE',
          yearsInBusiness: 18,
          averageRating: 4.8,
          totalReviews: 156,
          services: {
            create: [
              {
                category: 'ELECTRICAL',
                name: 'Outlet & Switch Repair',
                description: 'Repair or replace outlets and switches',
                basePrice: 100,
                priceUnit: 'per hour',
                isActive: true,
              },
              {
                category: 'ELECTRICAL',
                name: 'Ceiling Fan Installation',
                description: 'Install new ceiling fans',
                basePrice: 150,
                priceUnit: 'per fan',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ ELECTRICAL: electrician@example.com');

  // 6. LANDSCAPING Provider
  const landscaper = await prisma.user.create({
    data: {
      email: 'landscaper@example.com',
      phone: '+1-555-0206',
      firstName: 'Maria',
      lastName: 'Garcia',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Professional landscaping and lawn care services',
      address: {
        create: {
          street1: '600 Garden Lane',
          city: 'Austin',
          state: 'TX',
          zipCode: '78707',
          country: 'USA',
          latitude: 30.2750,
          longitude: -97.7650,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Green Thumb Landscaping',
          serviceCategories: ['LANDSCAPING'],
          serviceRadius: 45,
          status: 'ACTIVE',
          yearsInBusiness: 8,
          averageRating: 4.7,
          totalReviews: 134,
          services: {
            create: [
              {
                category: 'LANDSCAPING',
                name: 'Lawn Maintenance',
                description: 'Regular mowing, edging, and trimming',
                basePrice: 60,
                priceUnit: 'per visit',
                isActive: true,
              },
              {
                category: 'LANDSCAPING',
                name: 'Tree Trimming',
                description: 'Professional tree and shrub trimming',
                basePrice: 150,
                priceUnit: 'per hour',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ LANDSCAPING: landscaper@example.com');

  // 7. HVAC Provider
  const hvac = await prisma.user.create({
    data: {
      email: 'hvac@example.com',
      phone: '+1-555-0207',
      firstName: 'Robert',
      lastName: 'Anderson',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Certified HVAC technician specializing in repairs and maintenance',
      address: {
        create: {
          street1: '700 Climate Control Drive',
          city: 'Austin',
          state: 'TX',
          zipCode: '78708',
          country: 'USA',
          latitude: 30.2850,
          longitude: -97.7550,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Cool Comfort HVAC',
          serviceCategories: ['HVAC'],
          serviceRadius: 50,
          status: 'ACTIVE',
          yearsInBusiness: 14,
          averageRating: 4.9,
          totalReviews: 203,
          services: {
            create: [
              {
                category: 'HVAC',
                name: 'AC Repair',
                description: 'Air conditioning repair and diagnostics',
                basePrice: 125,
                priceUnit: 'per hour',
                isActive: true,
              },
              {
                category: 'HVAC',
                name: 'System Tune-Up',
                description: 'Preventive maintenance and system check',
                basePrice: 99,
                priceUnit: 'flat rate',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ HVAC: hvac@example.com');

  // 8. CLEANING Provider
  const cleaner = await prisma.user.create({
    data: {
      email: 'cleaner@example.com',
      phone: '+1-555-0208',
      firstName: 'Lisa',
      lastName: 'Brown',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Professional cleaning services for homes and move-ins',
      address: {
        create: {
          street1: '800 Sparkle Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78709',
          country: 'USA',
          latitude: 30.2950,
          longitude: -97.7450,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Sparkle Clean Services',
          serviceCategories: ['CLEANING'],
          serviceRadius: 30,
          status: 'ACTIVE',
          yearsInBusiness: 6,
          averageRating: 4.8,
          totalReviews: 267,
          services: {
            create: [
              {
                category: 'CLEANING',
                name: 'Deep Cleaning',
                description: 'Thorough deep cleaning of entire home',
                basePrice: 200,
                priceUnit: 'per service',
                isActive: true,
              },
              {
                category: 'CLEANING',
                name: 'Move-In Cleaning',
                description: 'Complete cleaning before moving in',
                basePrice: 250,
                priceUnit: 'per service',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ CLEANING: cleaner@example.com');

  // 9. LOCKSMITH Provider
  const locksmith = await prisma.user.create({
    data: {
      email: 'locksmith@example.com',
      phone: '+1-555-0209',
      firstName: 'Kevin',
      lastName: 'Smith',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed locksmith providing 24/7 emergency service',
      address: {
        create: {
          street1: '900 Lock Lane',
          city: 'Austin',
          state: 'TX',
          zipCode: '78710',
          country: 'USA',
          latitude: 30.2650,
          longitude: -97.7350,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Secure Lock Services',
          serviceCategories: ['LOCKSMITH'],
          serviceRadius: 40,
          status: 'ACTIVE',
          yearsInBusiness: 11,
          averageRating: 4.9,
          totalReviews: 198,
          services: {
            create: [
              {
                category: 'LOCKSMITH',
                name: 'Lock Rekeying',
                description: 'Rekey locks for new homeowners',
                basePrice: 75,
                priceUnit: 'per lock',
                isActive: true,
              },
              {
                category: 'LOCKSMITH',
                name: 'Lock Installation',
                description: 'Install new locks and deadbolts',
                basePrice: 100,
                priceUnit: 'per lock',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ LOCKSMITH: locksmith@example.com');

  // 10. PEST_CONTROL Provider
  const pestControl = await prisma.user.create({
    data: {
      email: 'pestcontrol@example.com',
      phone: '+1-555-0210',
      firstName: 'Mark',
      lastName: 'Taylor',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed pest control specialist with eco-friendly solutions',
      address: {
        create: {
          street1: '1000 Pest Free Road',
          city: 'Austin',
          state: 'TX',
          zipCode: '78711',
          country: 'USA',
          latitude: 30.2550,
          longitude: -97.7250,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Bug Busters Pest Control',
          serviceCategories: ['PEST_CONTROL'],
          serviceRadius: 55,
          status: 'ACTIVE',
          yearsInBusiness: 9,
          averageRating: 4.7,
          totalReviews: 145,
          services: {
            create: [
              {
                category: 'PEST_CONTROL',
                name: 'General Pest Treatment',
                description: 'Quarterly pest control service',
                basePrice: 95,
                priceUnit: 'per visit',
                isActive: true,
              },
              {
                category: 'PEST_CONTROL',
                name: 'Termite Inspection',
                description: 'Complete termite inspection and report',
                basePrice: 150,
                priceUnit: 'flat rate',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ PEST_CONTROL: pestcontrol@example.com');

  // 11. INSURANCE Provider
  const insurance = await prisma.user.create({
    data: {
      email: 'insurance@example.com',
      phone: '+1-555-0211',
      firstName: 'Jennifer',
      lastName: 'White',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Licensed insurance agent specializing in homeowners insurance',
      address: {
        create: {
          street1: '1100 Insurance Way',
          city: 'Austin',
          state: 'TX',
          zipCode: '78712',
          country: 'USA',
          latitude: 30.2450,
          longitude: -97.7150,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Safe Home Insurance Agency',
          serviceCategories: ['INSURANCE'],
          serviceRadius: 100,
          status: 'ACTIVE',
          yearsInBusiness: 16,
          averageRating: 4.8,
          totalReviews: 89,
          services: {
            create: [
              {
                category: 'INSURANCE',
                name: 'Homeowners Insurance Quote',
                description: 'Get personalized insurance quotes',
                basePrice: 0,
                priceUnit: 'free consultation',
                isActive: true,
              },
              {
                category: 'INSURANCE',
                name: 'Policy Review',
                description: 'Review existing policies for better coverage',
                basePrice: 0,
                priceUnit: 'free consultation',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ INSURANCE: insurance@example.com');

  // 12. ATTORNEY Provider
  const attorney = await prisma.user.create({
    data: {
      email: 'attorney@example.com',
      phone: '+1-555-0212',
      firstName: 'Michael',
      lastName: 'Davis',
      role: 'PROVIDER',
      status: 'ACTIVE',
      passwordHash: hashedPassword,
      emailVerified: true,
      phoneVerified: true,
      bio: 'Real estate attorney specializing in residential transactions',
      address: {
        create: {
          street1: '1200 Legal Lane',
          city: 'Austin',
          state: 'TX',
          zipCode: '78713',
          country: 'USA',
          latitude: 30.2350,
          longitude: -97.7050,
        },
      },
      providerProfile: {
        create: {
          businessName: 'Davis Real Estate Law',
          serviceCategories: ['ATTORNEY'],
          serviceRadius: 75,
          status: 'ACTIVE',
          yearsInBusiness: 22,
          averageRating: 4.9,
          totalReviews: 76,
          services: {
            create: [
              {
                category: 'ATTORNEY',
                name: 'Closing Assistance',
                description: 'Legal representation at closing',
                basePrice: 500,
                priceUnit: 'flat rate',
                isActive: true,
              },
              {
                category: 'ATTORNEY',
                name: 'Contract Review',
                description: 'Review purchase contracts and documents',
                basePrice: 300,
                priceUnit: 'per review',
                isActive: true,
              },
            ],
          },
        },
      },
    },
  });
  console.log('✅ ATTORNEY: attorney@example.com');

  console.log('');
  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 TEST ACCOUNTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('🏠 HOMEOWNER ACCOUNTS:');
  console.log('   1. HOME_BUYER:');
  console.log('      Email: buyer@example.com');
  console.log('      Password: password123');
  console.log('      Segment: HOME_BUYER');
  console.log('      Closing: 2025-12-15');
  console.log('');
  console.log('   2. EXISTING_OWNER:');
  console.log('      Email: owner@example.com');
  console.log('      Password: password123');
  console.log('      Segment: EXISTING_OWNER');
  console.log('');
  console.log('🔧 PROVIDER ACCOUNTS (All passwords: password123):');
  console.log('   1. INSPECTION      → inspector@example.com');
  console.log('   2. HANDYMAN        → handyman@example.com');
  console.log('   3. MOVING          → mover@example.com');
  console.log('   4. PLUMBING        → plumber@example.com');
  console.log('   5. ELECTRICAL      → electrician@example.com');
  console.log('   6. LANDSCAPING     → landscaper@example.com');
  console.log('   7. HVAC            → hvac@example.com');
  console.log('   8. CLEANING        → cleaner@example.com');
  console.log('   9. LOCKSMITH       → locksmith@example.com');
  console.log('   10. PEST_CONTROL   → pestcontrol@example.com');
  console.log('   11. INSURANCE      → insurance@example.com');
  console.log('   12. ATTORNEY       → attorney@example.com');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
