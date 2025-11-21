// Add 4 Providers with Numbered Emails
// Run: npx ts-node add-providers-numbered.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function addProviders() {
  console.log('🔧 Adding 4 providers with numbered emails...\n');

  const hashedPassword = await bcrypt.hash('password123', 10);

  try {
    // 1. INSPECTION Provider
    const inspector = await prisma.user.create({
      data: {
        email: 'inspector1@example.com',
        phone: '+1-555-0201',
        firstName: 'Mike',
        lastName: 'Thompson',
        role: 'PROVIDER',
        status: 'ACTIVE',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
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
            businessName: 'Premium Home Inspections',
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
                  description: 'Comprehensive inspection of all major systems',
                  basePrice: 450,
                  priceUnit: 'flat rate',
                  isActive: true,
                },
                {
                  category: 'INSPECTION',
                  name: 'Pre-Purchase Inspection',
                  description: 'Detailed pre-purchase inspection with report',
                  basePrice: 500,
                  priceUnit: 'flat rate',
                  isActive: true,
                },
              ],
            },
          },
        },
      },
    });
    console.log('✅ INSPECTION: inspector1@example.com');

    // 2. HANDYMAN Provider
    const handyman = await prisma.user.create({
      data: {
        email: 'handyman1@example.com',
        phone: '+1-555-0202',
        firstName: 'Tom',
        lastName: 'Williams',
        role: 'PROVIDER',
        status: 'ACTIVE',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
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
            businessName: 'Reliable Handyman Services',
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
                  name: 'Drywall Repair',
                  description: 'Patch and repair drywall',
                  basePrice: 90,
                  priceUnit: 'per hour',
                  isActive: true,
                },
              ],
            },
          },
        },
      },
    });
    console.log('✅ HANDYMAN: handyman1@example.com');

    // 3. PLUMBING Provider
    const plumber = await prisma.user.create({
      data: {
        email: 'plumber1@example.com',
        phone: '+1-555-0203',
        firstName: 'David',
        lastName: 'Chen',
        role: 'PROVIDER',
        status: 'ACTIVE',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        address: {
          create: {
            street1: '300 Plumber Way',
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
            businessName: 'Quick Fix Plumbing',
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
                  name: 'Emergency Leak Repair',
                  description: '24/7 emergency leak repair',
                  basePrice: 150,
                  priceUnit: 'per hour',
                  isActive: true,
                },
                {
                  category: 'PLUMBING',
                  name: 'Fixture Installation',
                  description: 'Install sinks, toilets, faucets',
                  basePrice: 120,
                  priceUnit: 'per hour',
                  isActive: true,
                },
              ],
            },
          },
        },
      },
    });
    console.log('✅ PLUMBING: plumber1@example.com');

    // 4. CLEANING Provider
    const cleaner = await prisma.user.create({
      data: {
        email: 'cleaner1@example.com',
        phone: '+1-555-0204',
        firstName: 'Lisa',
        lastName: 'Brown',
        role: 'PROVIDER',
        status: 'ACTIVE',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        address: {
          create: {
            street1: '400 Sparkle Street',
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
            businessName: 'Elite Cleaning Services',
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
                  name: 'Standard House Cleaning',
                  description: 'Regular house cleaning service',
                  basePrice: 150,
                  priceUnit: 'per service',
                  isActive: true,
                },
                {
                  category: 'CLEANING',
                  name: 'Move-Out Cleaning',
                  description: 'Complete cleaning before moving out',
                  basePrice: 300,
                  priceUnit: 'per service',
                  isActive: true,
                },
              ],
            },
          },
        },
      },
    });
    console.log('✅ CLEANING: cleaner1@example.com');

    console.log('\n🎉 Added 4 providers successfully!');
    console.log('\n📝 Login credentials (all use password: password123):');
    console.log('   - inspector1@example.com (INSPECTION)');
    console.log('   - handyman1@example.com (HANDYMAN)');
    console.log('   - plumber1@example.com (PLUMBING)');
    console.log('   - cleaner1@example.com (CLEANING)\n');

  } catch (error) {
    console.error('❌ Error adding providers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addProviders();
