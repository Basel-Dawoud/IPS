/**
 * Seeds demo content for the Home screen work (July 2026): a handful of real
 * Egyptian malls with just a map pin (no floors/POIs — they only need to show
 * up on the outdoor map + distance list + "Directions" flow, not indoor nav),
 * and a batch of fake "hot deals" attached to the existing ADHAM_MALL POIs
 * (Deal requires a poiId, so deals can only live on a building that already
 * has POIs — see seed-pois.ts).
 *
 * Run:  npx ts-node prisma/seed-home-demo.ts
 * Idempotent: upserts buildings by code, replaces deals whose title starts
 * with the DEMO_DEAL_PREFIX tag so re-running doesn't pile up duplicates.
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";

const DEMO_DEAL_PREFIX = "[demo] ";

interface DemoBuilding {
  code: string;
  name: string;
  description: string;
  pinLat: number;
  pinLng: number;
}

// Real Egyptian malls/landmarks — pin-only, no zone/floors (outdoor map + far list).
const BUILDINGS: DemoBuilding[] = [
  {
    code: "CITY_STARS",
    name: "City Stars",
    description: "One of the largest malls in the Middle East, Nasr City, Cairo.",
    pinLat: 30.0731,
    pinLng: 31.3459,
  },
  {
    code: "CAIRO_FESTIVAL_CITY",
    name: "Cairo Festival City Mall",
    description: "Premium shopping and dining destination in New Cairo.",
    pinLat: 30.0287,
    pinLng: 31.4061,
  },
  {
    code: "MALL_OF_EGYPT",
    name: "Mall of Egypt",
    description: "Family entertainment mall with an indoor ski slope, 6th of October City.",
    pinLat: 29.9627,
    pinLng: 30.9548,
  },
  {
    code: "POINT_90_MALL",
    name: "Point 90 Mall",
    description: "Open-air retail and dining destination in New Cairo.",
    pinLat: 30.0091,
    pinLng: 31.4353,
  },
  {
    code: "ALEX_CITY_CENTER",
    name: "City Center Alexandria",
    description: "Major shopping mall in Alexandria, near Smouha.",
    pinLat: 31.2129,
    pinLng: 29.9509,
  },
  {
    code: "MALL_OF_ARABIA",
    name: "Mall of Arabia",
    description: "Large shopping and entertainment complex in 6th of October City.",
    pinLat: 29.9744,
    pinLng: 30.9384,
  },
];

// [title, description, discountPct, poiCode, validDays]
const DEALS: [string, string, number | null, string, number][] = [
  ["Summer Tech Blowout", "Up to 40% off select smart home gadgets.", 40, "350", 21],
  ["Build Week", "Save on custom PC builds and components.", 20, "351", 14],
  ["Mobile Trade-In Bonus", "Extra credit when you trade in your old phone.", 15, "352", 10],
  ["Storage Sale", "SSDs and flash drives at clearance prices.", 30, "353", 30],
  ["Wearables Weekend", "Smartwatches and fitness bands discounted.", 25, "355", 7],
  ["Gamer's Friday", "Consoles, games, and accessories on sale.", 35, "356", 5],
  ["Laptop Essentials", "Bags, chargers, and mice bundle discount.", 20, "357", 14],
  ["Bedroom Refresh", "New season mattresses and bed frames.", 25, "450", 21],
  ["Living Room Makeover", "Sofas and living sets discounted.", 30, "451", 14],
  ["Home Decor Days", "Rugs, art, and decor pieces on sale.", 20, "458", 10],
];

async function upsertBuildings() {
  console.log("Seeding Egyptian demo buildings (pin-only)...");
  for (const b of BUILDINGS) {
    await prisma.building.upsert({
      where: { code: b.code },
      update: {
        name: b.name,
        description: b.description,
        pinLat: b.pinLat,
        pinLng: b.pinLng,
      },
      create: {
        code: b.code,
        name: b.name,
        description: b.description,
        pinLat: b.pinLat,
        pinLng: b.pinLng,
      },
    });
    console.log(`  ${b.code} -> (${b.pinLat}, ${b.pinLng})`);
  }
}

async function seedDeals() {
  const building = await prisma.building.findUnique({ where: { code: "ADHAM_MALL" } });
  if (!building) {
    console.warn("ADHAM_MALL not found — skipping deals (run seed-pois.ts first).");
    return;
  }
  const pois = await prisma.poi.findMany({ where: { buildingId: building.id } });
  const poiByCode = new Map(pois.map((p) => [p.code, p.id]));

  console.log("Clearing previous demo deals...");
  await prisma.deal.deleteMany({ where: { title: { startsWith: DEMO_DEAL_PREFIX } } });

  console.log("Seeding demo deals...");
  const now = Date.now();
  for (const [title, description, discountPct, code, validDays] of DEALS) {
    const poiId = poiByCode.get(code);
    if (!poiId) {
      console.warn(`  skip "${title}" — no POI with code ${code}`);
      continue;
    }
    await prisma.deal.create({
      data: {
        poiId,
        title: `${DEMO_DEAL_PREFIX}${title}`,
        description,
        discountPct: discountPct ?? undefined,
        validUntil: new Date(now + validDays * 24 * 60 * 60 * 1000),
        active: true,
      },
    });
    console.log(`  ${title} (-${discountPct}%) on POI ${code}`);
  }
}

async function main() {
  await upsertBuildings();
  await seedDeals();
  console.log("Home demo seeding complete.");
}

main()
  .catch((e) => {
    console.error("Home demo seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
