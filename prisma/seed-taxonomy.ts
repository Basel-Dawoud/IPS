/**
 * Builds the 2-level PoiCategory tree (6 parent categories + 25 sub-categories
 * with keywords) and connects each POI to its sub-categories + their parents via
 * the new many-to-many — IN PLACE (no POI delete), preserving visits/reviews and
 * product links.
 *
 * Steps:
 *   1. Upsert the 6 parent categories (parentId = null).
 *   2. Upsert the 25 sub-categories (parentId set, keywords populated).
 *   3. For each POI (by room `code`) connect its sub-categories + their parents.
 *   4. Delete stale categories no longer in the tree and unreferenced.
 *
 * Run AFTER seed-pois.ts; re-run seed-products.ts afterwards. Idempotent.
 *   npx ts-node prisma/seed-taxonomy.ts
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import {
  ALL_CATEGORIES,
  PARENTS,
  PARENT_DESCRIPTIONS,
  CATEGORY_PARENT,
  CATEGORY_DESCRIPTIONS,
  SUBCATEGORY_ROOM,
  subcategoryKeywords,
} from "./taxonomy";

const BUILDING_CODE = "ADHAM_MALL";

async function main() {
  // 1. Parent categories.
  const nameToId: Record<string, string> = {};
  for (const name of Object.keys(PARENTS)) {
    const cat = await prisma.poiCategory.upsert({
      where: { name },
      update: { description: PARENT_DESCRIPTIONS[name] ?? null, parentId: null },
      create: { name, description: PARENT_DESCRIPTIONS[name] ?? null },
    });
    nameToId[name] = cat.id;
  }

  // 2. Sub-categories (children) with keywords, linked to their parent.
  for (const name of ALL_CATEGORIES) {
    const parentId = nameToId[CATEGORY_PARENT[name]];
    const cat = await prisma.poiCategory.upsert({
      where: { name },
      update: {
        description: CATEGORY_DESCRIPTIONS[name] ?? null,
        keywords: subcategoryKeywords(name),
        parentId,
      },
      create: {
        name,
        description: CATEGORY_DESCRIPTIONS[name] ?? null,
        keywords: subcategoryKeywords(name),
        parentId,
      },
    });
    nameToId[name] = cat.id;
  }

  // room id -> [sub-category names] (inverse of SUBCATEGORY_ROOM).
  const roomSubcats: Record<number, string[]> = {};
  for (const [sub, room] of Object.entries(SUBCATEGORY_ROOM)) {
    (roomSubcats[room] = roomSubcats[room] || []).push(sub);
  }

  // 3. Connect POIs (by room code) to their sub-categories + parents.
  const building = await prisma.building.findUnique({ where: { code: BUILDING_CODE } });
  if (!building) throw new Error(`Building ${BUILDING_CODE} not found — run seed-pois.ts first.`);

  let updated = 0;
  for (const [roomStr, subs] of Object.entries(roomSubcats)) {
    const poi = await prisma.poi.findFirst({
      where: { buildingId: building.id, code: roomStr },
      select: { id: true },
    });
    if (!poi) continue;
    const ids = new Set<string>();
    for (const sub of subs) {
      if (nameToId[sub]) ids.add(nameToId[sub]);
      const parent = CATEGORY_PARENT[sub];
      if (parent && nameToId[parent]) ids.add(nameToId[parent]);
    }
    await prisma.poi.update({
      where: { id: poi.id },
      data: { categories: { set: [...ids].map((id) => ({ id })) } },
    });
    updated++;
  }

  // 4. Remove any categories not in the tree that nothing references.
  const keep = [...Object.keys(PARENTS), ...ALL_CATEGORIES];
  const stale = await prisma.poiCategory.findMany({
    where: {
      name: { notIn: keep },
      pois: { none: {} },
      products: { none: {} },
      children: { none: {} },
    },
    select: { id: true, name: true },
  });
  if (stale.length) {
    await prisma.poiCategory.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
  }

  console.log(
    `Taxonomy: ${Object.keys(PARENTS).length} categories + ${ALL_CATEGORIES.length} sub-categories, ` +
      `${updated} POIs connected, removed stale: ${stale.map((c) => c.name).join(", ") || "none"}.`,
  );
}

main()
  .catch((e) => {
    console.error("Taxonomy seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
