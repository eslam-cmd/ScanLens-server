// server/prisma/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating payments for subscribed users...');

  // ✅ جلب جميع المستخدمين المشتركين
  const users = await prisma.user.findMany({
    where: {
      plan: { not: 'free' },
    },
  });

  let created = 0;

  for (const user of users) {
    const existing = await prisma.payment.count({
      where: {
        userId: user.id,
        status: 'SUCCEEDED',
      },
    });

    if (existing === 0) {
      const price =
        user.plan === 'pro' ? 29.99 : user.plan === 'extra' ? 49.99 : 19.99;

      await prisma.payment.create({
        data: {
          userId: user.id,
          amount: price,
          currency: 'USD',
          status: 'SUCCEEDED',
          description: `${user.plan} Plan - monthly subscription`,
          paidAt: new Date(),
          metadata: {
            planId: user.plan,
            billingCycle: 'monthly',
            expiresAt: user.subscriptionExpiresAt,
            isSimulated: true,
          },
        },
      });

      created++;
      console.log(`✅ Payment created for ${user.email} (${user.plan})`);
    }
  }

  console.log(`✅ Created ${created} payments`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
