import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyProfile() {
  try {
    const users = await prisma.user.findMany({
      include: { homeownerProfile: true },
    });

    users.forEach((user) => {
      console.log(`User: ${user.email}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Has Profile: ${user.homeownerProfile ? '✅ YES' : '❌ NO'}`);
      if (user.homeownerProfile) {
        console.log(`  Profile ID: ${user.homeownerProfile.id}`);
      }
      console.log('');
    });

    const homeownersWithoutProfile = users.filter(
      u => u.role === 'HOMEOWNER' && !u.homeownerProfile
    );

    if (homeownersWithoutProfile.length > 0) {
      console.log('⚠️  Users without profiles:');
      homeownersWithoutProfile.forEach(u => console.log(`  - ${u.email}`));
    }
  } finally {
    await prisma.$disconnect();
  }
}

verifyProfile();