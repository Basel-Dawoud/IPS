/**
 * Seeds the Product catalog for the "Adham Smart Mall" building from the AI
 * engineer's sort_data.json (the same dataset the original final_chatbot used
 * for its product recommendations).
 *
 * sort_data.json shape:
 *   [ { type, items: [ { category, items: [ { subCategory,
 *         items: [ { Brand, Name, Price, "No of Reviews", Rating } ] } ] } ] } ]
 *
 * Each sort_data `category` maps to a store (Poi) via STORE_CLUSTER (the six
 * Electronics sub-clusters collapse into their hub) or 1:1 by name → room id.
 * Products link to the matching Poi (by `code` == room id) so the chatbot can
 * recommend real products per store.
 *
 * Run:  npx ts-node prisma/seed-products.ts
 * Idempotent: clears this building's products, re-imports, and bumps
 * Building.productUpdatedAt (the chatbot's product-cache version).
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import prisma from "../src/lib/prisma";

// sort_data.json lives at the repo root (Navimind/sort_data.json).
const SORT_DATA_PATH =
  process.env.SORT_DATA_PATH || path.resolve(__dirname, "../../sort_data.json");

const BUILDING_CODE = "ADHAM_MALL";

// sort_data category -> store name, for the Electronics sub-clusters that share
// a single hub store. Every other category maps to a room by its own name.
const STORE_CLUSTER: Record<string, string> = {
  Audio: "Smart Devices Hub",
  Cameras: "Smart Devices Hub",
  "Computer Peripherals": "Computer Systems Hub",
  "Laptop & Desktop": "Computer Systems Hub",
  Mobiles: "Mobile & Tablets Hub",
  Tabelts: "Mobile & Tablets Hub",
};

// room id -> store name (matches seed-pois.ts ROOM_INFO / Poi.name & Poi.code).
const ROOM_INFO: Record<number, string> = {
  350: "Smart Devices Hub", 351: "Computer Systems Hub", 352: "Mobile & Tablets Hub",
  353: "Storage", 354: "Smart Home Automation", 355: "Smart Wearables", 356: "Gaming",
  357: "Laptop Accessories", 358: "Health & Personal Care",
  450: "Bedroom", 451: "Living Room", 452: "Study/Office", 453: "Kitchen",
  454: "Dining Room", 455: "Bathroom", 456: "Furnishings", 457: "Kitchen and Dining",
  458: "Home Decor", 459: "Tools and Utility", 460: "Lighting and Electricals",
  461: "Cleaning and Bath", 462: "Pet and Gardening",
};

// name (lowercased) -> room id. Tolerates minor spelling drift between
// sort_data ("Tools and utility") and ROOM_INFO ("Tools and Utility").
const NAME_TO_ROOM: Record<string, number> = {};
for (const [id, name] of Object.entries(ROOM_INFO)) {
  NAME_TO_ROOM[name.toLowerCase()] = Number(id);
}

function resolveRoomId(category: string): number | null {
  const storeName = STORE_CLUSTER[category] || category;
  const id = NAME_TO_ROOM[storeName.toLowerCase()];
  return id ?? null;
}

// "₹7,989" / "1,200 EGP" -> 7989 / 1200. Non-digits stripped (matches the
// original clean_price).
function cleanPrice(raw: unknown): number {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function toInt(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toFloat(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  if (!fs.existsSync(SORT_DATA_PATH)) {
    throw new Error(
      `sort_data.json not found at ${SORT_DATA_PATH}. Set SORT_DATA_PATH env to override.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(SORT_DATA_PATH, "utf-8")) as any[];

  const building = await prisma.building.findUnique({
    where: { code: BUILDING_CODE },
  });
  if (!building) {
    throw new Error(
      `Building ${BUILDING_CODE} not found — run seed-pois.ts first.`,
    );
  }

  // Map room id -> Poi id for this building.
  const pois = await prisma.poi.findMany({
    where: { buildingId: building.id },
    select: { id: true, code: true },
  });
  const roomToPoiId: Record<number, string> = {};
  for (const p of pois) {
    if (p.code) roomToPoiId[Number(p.code)] = p.id;
  }

  // Flatten sort_data -> Product rows.
  const rows: {
    name: string;
    brand: string | null;
    price: number;
    rating: number;
    reviewCount: number;
    category: string;
    subCategory: string | null;
    poiId: string | null;
    buildingId: string;
  }[] = [];

  const unmapped = new Set<string>();
  for (const typeBlock of raw) {
    for (const cat of typeBlock.items ?? []) {
      const category = cat.category as string;
      const roomId = resolveRoomId(category);
      const poiId = roomId != null ? roomToPoiId[roomId] ?? null : null;
      if (poiId == null) unmapped.add(category);
      for (const sub of cat.items ?? []) {
        const subCategory = sub.subCategory as string | undefined;
        for (const prod of sub.items ?? []) {
          const name = String(prod.Name ?? "").trim();
          if (!name) continue;
          rows.push({
            name,
            brand: prod.Brand ? String(prod.Brand).trim() : null,
            price: cleanPrice(prod.Price),
            rating: toFloat(prod.Rating),
            reviewCount: toInt(prod["No of Reviews"]),
            category,
            subCategory: subCategory ?? null,
            poiId,
            buildingId: building.id,
          });
        }
      }
    }
  }

  // Idempotent re-import for this building.
  await prisma.product.deleteMany({ where: { buildingId: building.id } });

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await prisma.product.createMany({ data: chunk });
    inserted += res.count;
  }

  // Bump the product-catalog version (chatbot cache key).
  await prisma.building.update({
    where: { id: building.id },
    data: { productUpdatedAt: new Date() },
  });

  console.log(
    `Seeded ${inserted} products for "${building.name}" (${building.id}).`,
  );
  if (unmapped.size) {
    console.warn(
      `Categories with no matching Poi (products kept, poiId=null): ${[...unmapped].join(", ")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("Product seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
