import "dotenv/config";
import prisma from "../src/lib/prisma";
import * as argon2 from "argon2";

async function main() {
  console.log("Starting fake data seeding for recommendation testing...");

  // 1. Find Building
  const building = await prisma.building.findUnique({
    where: { code: "ADHAM_MALL" },
  });
  if (!building) {
    console.error("Error: Seed building 'ADHAM_MALL' not found. Please run seed-pois first!");
    process.exit(1);
  }

  // 2. Fetch Categories & POIs
  const categories = await prisma.poiCategory.findMany();
  const pois = await prisma.poi.findMany({
    where: { buildingId: building.id },
  });

  if (categories.length === 0 || pois.length === 0) {
    console.error("Error: Categories or POIs are empty. Make sure seed-pois has completed.");
    process.exit(1);
  }

  const catMap = new Map(categories.map((c) => [c.name, c.id]));
  const poiCodeMap = new Map(pois.map((p) => [p.code, p.id]));

  // Helper to get category ID by name
  const getCatId = (name: string) => catMap.get(name);
  // Helper to get POI ID by room code
  const getPoiId = (code: string) => poiCodeMap.get(code);

  // 3. Clear previous test data (visits, reviews, test users)
  console.log("Cleaning old recommendation test data...");
  const testEmails = [
    "alice@example.com",
    "bob@example.com",
    "charlie@example.com",
    "david@example.com",
    "emma@example.com",
  ];
  await prisma.poiReview.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.poiVisit.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });

  // Reset POI aggregate counts to 0 before calculating fresh ones
  await prisma.poi.updateMany({
    where: { buildingId: building.id },
    data: { visitCount: 0, avgRating: 0, reviewCount: 0 },
  });

  // 4. Create Test Users
  console.log("Creating test users with diverse interest profiles...");
  const passwordHash = await argon2.hash("password123");

  const usersData = [
    {
      email: "alice@example.com",
      name: "Alice Smith",
      interests: ["Electronics & Tech"],
    },
    {
      email: "bob@example.com",
      name: "Bob Jones",
      interests: ["Electronics & Tech", "Home & Living"],
    },
    {
      email: "charlie@example.com",
      name: "Charlie Brown",
      interests: ["Home & Living"],
    },
    {
      email: "david@example.com",
      name: "David Lee",
      interests: ["Electronics & Tech"],
    },
    {
      email: "emma@example.com",
      name: "Emma Davis",
      interests: ["Home & Living"],
    },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of usersData) {
    const interestIds = u.interests
      .map((name) => getCatId(name))
      .filter((id): id is string => !!id);

    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        onboardingComplete: true,
        interests: {
          connect: interestIds.map((id) => ({ id })),
        },
      },
    });
    createdUsers[u.email] = user;
    console.log(`Created user: ${user.name} (${user.email})`);
  }

  // 5. Seed Visits (confirmed and unconfirmed)
  console.log("Seeding visits history...");
  const visitsData = [
    // Alice (likes Tech): visits Tech stores
    { email: "alice@example.com", code: "350", confirmed: true },  // Smart Devices Hub
    { email: "alice@example.com", code: "351", confirmed: true },  // Computer Systems Hub
    { email: "alice@example.com", code: "356", confirmed: true },  // Gaming
    { email: "alice@example.com", code: "350", confirmed: false }, // smart devices again

    // Bob (likes Tech + Home): visits both
    { email: "bob@example.com", code: "350", confirmed: true },    // Smart Devices Hub
    { email: "bob@example.com", code: "450", confirmed: true },    // Bedroom
    { email: "bob@example.com", code: "451", confirmed: true },    // Living Room
    { email: "bob@example.com", code: "456", confirmed: true },    // Furnishings

    // Charlie (likes Home): visits Home stores
    { email: "charlie@example.com", code: "450", confirmed: true }, // Bedroom
    { email: "charlie@example.com", code: "451", confirmed: true }, // Living Room
    { email: "charlie@example.com", code: "456", confirmed: true }, // Furnishings
    { email: "charlie@example.com", code: "453", confirmed: true }, // Kitchen

    // David (likes Tech): visits Tech stores (overlaps with Alice)
    { email: "david@example.com", code: "350", confirmed: true },  // Smart Devices Hub
    { email: "david@example.com", code: "356", confirmed: true },  // Gaming

    // Emma (likes Home): visits Home stores
    { email: "emma@example.com", code: "450", confirmed: true },   // Bedroom
    { email: "emma@example.com", code: "456", confirmed: false },  // Furnishings
  ];

  for (const v of visitsData) {
    const user = createdUsers[v.email];
    const poiId = getPoiId(v.code);
    if (user && poiId) {
      await prisma.poiVisit.create({
        data: {
          userId: user.id,
          poiId,
          buildingId: building.id,
          confirmed: v.confirmed,
        },
      });
    }
  }

  // 6. Seed Reviews (Ratings & Comments)
  console.log("Seeding reviews and ratings...");
  const reviewsData = [
    // Alice
    { email: "alice@example.com", code: "350", rating: 5, comment: "Amazing IoT products! Highly recommended." },
    { email: "alice@example.com", code: "351", rating: 4, comment: "Great customer support for PC builds." },
    { email: "alice@example.com", code: "356", rating: 5, comment: "The best gaming setup in town!" },

    // Bob
    { email: "bob@example.com", code: "350", rating: 4, comment: "Friendly staff and clean environment." },
    { email: "bob@example.com", code: "450", rating: 5, comment: "Super comfortable mattresses." },
    { email: "bob@example.com", code: "456", rating: 3, comment: "Curtains are a bit overpriced." },

    // Charlie
    { email: "charlie@example.com", code: "450", rating: 4, comment: "Good quality bed furniture." },
    { email: "charlie@example.com", code: "451", rating: 5, comment: "Love the sofa sets here!" },
    { email: "charlie@example.com", code: "456", rating: 5, comment: "Stunning carpets and home furnishings." },

    // David
    { email: "david@example.com", code: "350", rating: 5, comment: "Best smart lighting hub." },

    // Emma
    { email: "emma@example.com", code: "450", rating: 4, comment: "Great selection of wardrobes." },
  ];

  for (const r of reviewsData) {
    const user = createdUsers[r.email];
    const poiId = getPoiId(r.code);
    if (user && poiId) {
      await prisma.poiReview.create({
        data: {
          userId: user.id,
          poiId,
          rating: r.rating,
          comment: r.comment,
        },
      });
    }
  }

  // 7. Update Aggregates on POIs
  console.log("Recalculating rating averages and visit counts on POIs...");
  for (const p of pois) {
    const visitsCount = await prisma.poiVisit.count({
      where: { poiId: p.id },
    });

    const aggregates = await prisma.poiReview.aggregate({
      where: { poiId: p.id },
      _avg: { rating: true },
      _count: { id: true },
    });

    await prisma.poi.update({
      where: { id: p.id },
      data: {
        visitCount: visitsCount,
        avgRating: aggregates._avg.rating || 0.0,
        reviewCount: aggregates._count.id || 0,
      },
    });
  }

  console.log("Seeding fake recommendation test data completed successfully!");
}

main()
  .catch((e) => {
    console.error("Fake data seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
