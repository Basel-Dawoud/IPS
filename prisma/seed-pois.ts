/**
 * Seeds the "Adham Smart Mall" building (floors 3 & 4) and its 22 store POIs.
 *
 * Source of truth: IPS-Adham-Smart-Mall/config.py — the room ids, names,
 * grid centroids, descriptions, multilingual aliases and product-keyword maps
 * were hard-coded there. This script lifts them into the database so the
 * dashboard can manage them and the chatbot can later read the same records.
 *
 * Coordinate conversion: config.py stores grid-cell centroids as (row, col) at
 * CELL_SIZE = 0.2 m/cell. We map x = col * 0.2, y = row * 0.2 (numpy [row][col]
 * convention). There is no hosted floor image yet, so the absolute orientation
 * is provisional — fine-tune via the dashboard picker once a plan image exists.
 *
 * Run:  npx ts-node prisma/seed-pois.ts
 * Idempotent: re-running replaces this building's POIs (safe while no MapNodes
 * reference them).
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { PoiType } from "../src/generated/prisma/enums";
import { keywordsForRoom } from "./taxonomy";

const CELL_SIZE = 0.2; // meters per grid cell

// id -> (row, col) grid centroid (from config.py room_centroids_f3/f4_grid)
const CENTROIDS: Record<number, [number, number]> = {
  350: [70, 465], 351: [70, 435], 352: [70, 395], 353: [70, 360], 354: [70, 320],
  355: [70, 285], 356: [70, 215], 357: [70, 160], 358: [70, 85],
  450: [80, 460], 451: [80, 430], 452: [80, 392], 453: [80, 350], 454: [80, 310],
  455: [80, 272], 456: [80, 235], 457: [80, 200], 458: [80, 165], 459: [80, 130],
  460: [80, 95], 461: [80, 60], 462: [80, 25],
};

const ROOM_INFO: Record<number, string> = {
  350: "Smart Devices Hub", 351: "Computer Systems Hub", 352: "Mobile & Tablets Hub",
  353: "Storage", 354: "Smart Home Automation", 355: "Smart Wearables", 356: "Gaming",
  357: "Laptop Accessories", 358: "Health & Personal Care",
  450: "Bedroom", 451: "Living Room", 452: "Study/Office", 453: "Kitchen",
  454: "Dining Room", 455: "Bathroom", 456: "Furnishings", 457: "Kitchen and Dining",
  458: "Home Decor", 459: "Tools and Utility", 460: "Lighting and Electricals",
  461: "Cleaning and Bath", 462: "Pet and Gardening",
};

const STORE_DESCRIPTIONS: Record<number, string> = {
  350: "Smart devices, smart home gadgets, IoT products, and electronics.",
  351: "Computer systems including desktops, laptops, and PC components.",
  352: "Mobile & tablets including smartphones and accessories.",
  353: "Storage devices like SSDs, HDDs, flash drives, and memory cards.",
  354: "Smart home automation devices and IoT control systems.",
  355: "Smart wearables including smartwatches and fitness bands.",
  356: "Gaming consoles, games, and gaming accessories.",
  357: "Laptop accessories like chargers, bags, mice, and keyboards.",
  358: "Health and personal care products including beauty and wellness items.",
  450: "Bedroom furniture and sleep essentials.",
  451: "Living room furniture and decor items.",
  452: "Study and office furniture and productivity tools.",
  453: "Kitchen appliances and cooking essentials.",
  454: "Dining room furniture and dining essentials.",
  455: "Bathroom fixtures and bathroom essentials.",
  456: "Home furnishings like curtains, carpets, and textiles.",
  457: "Kitchen and dining tools, utensils, and cookware.",
  458: "Home decor items and decorative accessories.",
  459: "Tools and utility equipment for home use.",
  460: "Lighting systems and electrical products.",
  461: "Cleaning supplies and bath-related products.",
  462: "Pet supplies and gardening products.",
};

const STORE_ALIASES: Record<number, string[]> = {
  350: ["Smart Devices Hub", "smart devices", "smart", "devices", "audio", "cameras", "wearables", "سمارت", "أجهزة ذكية", "كاميرات", "سماعات", "ساعات ذكية"],
  351: ["Computer Systems Hub", "computer", "computers", "laptop", "desktop", "pc", "كمبيوتر", "لابتوب", "لاب توب", "كمبيوترات"],
  352: ["Mobile & Tablets Hub", "mobile", "tablet", "Tabelts", "phone", "phones", "smartphone", "موبايل", "موبايلات", "تابلت", "تليفون", "هواتف"],
  353: ["Storage", "storage", "ssd", "hdd", "flash", "memory", "تخزين", "هارد", "فلاش"],
  354: ["Smart Home Automation", "smart home", "automation", "iot", "home control", "منزل ذكي", "أتمتة"],
  355: ["Smart Wearables", "wearables", "smartwatch", "watch", "fitness band", "ساعات ذكية", "أجهزة قابلة للارتداء"],
  356: ["Gaming", "gaming", "games", "playstation", "xbox", "nintendo", "ألعاب", "جيمينج", "بلايستيشن"],
  357: ["Laptop Accessories", "laptop accessories", "charger", "mouse", "keyboard", "laptop bag", "إكسسوارات لابتوب", "شاحن", "ماوس"],
  358: ["Health & Personal Care", "health", "personal care", "beauty", "skincare", "صحة", "عناية شخصية", "جمال", "بشرة"],
  450: ["Bedroom", "bedroom", "bed", "sleep", "غرفة نوم", "نوم", "سرير"],
  451: ["Living Room", "living room", "living", "sofa", "couch", "صالة", "ركنة", "انتريه", "صالون"],
  452: ["Study/Office", "study", "office", "desk", "work", "مكتب", "دراسة", "مذاكرة"],
  453: ["Kitchen", "kitchen", "cook", "cooking", "مطبخ", "طبخ", "أكل"],
  454: ["Dining Room", "dining", "dining room", "table", "سفرة", "غرفة سفرة"],
  455: ["Bathroom", "bathroom", "bath", "shower", "حمام", "دوش"],
  456: ["Furnishings", "furnishings", "curtains", "carpet", "rug", "مفروشات", "ستاير", "سجاد"],
  457: ["Kitchen and Dining", "cookware", "utensils", "pots", "pans", "أدوات مطبخ", "حلل", "معالق"],
  458: ["Home Decor", "home decor", "decor", "decoration", "ديكور", "تحف"],
  459: ["Tools and Utility", "tools", "utility", "hardware", "عدة", "أدوات"],
  460: ["Lighting and Electricals", "lighting", "lights", "electrical", "lamps", "اضاءة", "لمبات", "نجف"],
  461: ["Cleaning and Bath", "cleaning", "bath products", "detergent", "تنظيف", "منظفات"],
  462: ["Pet and Gardening", "pet", "pets", "gardening", "garden", "plants", "حيوانات", "حديقة", "زرع"],
};

function floorOf(id: number): number {
  return id < 400 ? 3 : 4;
}

async function main() {
  const building = await prisma.building.upsert({
    where: { code: "ADHAM_MALL" },
    update: { name: "Adham Smart Mall" },
    create: {
      code: "ADHAM_MALL",
      name: "Adham Smart Mall",
      description: "Smart shopping mall — indoor navigation pilot (floors 3 & 4).",
    },
  });

  for (const [level, name] of [
    [3, "Third Floor"],
    [4, "Fourth Floor"],
  ] as const) {
    await prisma.floor.upsert({
      where: { buildingId_level: { buildingId: building.id, level } },
      update: { name },
      create: { buildingId: building.id, level, name },
    });
  }

  // Categories/sub-categories and their POI links are owned by seed-taxonomy.ts
  // (run it after this). Here we only create POIs + their productKeywords.

  // Idempotent: clear this building's POIs before re-importing. Safe while no
  // MapNode references them (no map/routing data seeded yet).
  await prisma.poi.deleteMany({ where: { buildingId: building.id } });

  const ids = Object.keys(CENTROIDS).map(Number);
  let created = 0;
  for (const id of ids) {
    const [row, col] = CENTROIDS[id];

    await prisma.poi.create({
      data: {
        buildingId: building.id,
        floorLevel: floorOf(id),
        name: ROOM_INFO[id],
        code: String(id),
        type: PoiType.ROOM,
        x: col * CELL_SIZE,
        y: row * CELL_SIZE,
        description: STORE_DESCRIPTIONS[id] ?? null,
        aliases: STORE_ALIASES[id] ?? [],
        productKeywords: keywordsForRoom(id),
      },
    });
    created++;
  }

  const total = await prisma.poi.count({ where: { buildingId: building.id } });
  console.log(
    `Seeded building "${building.name}" (${building.id}): created ${created} POIs, total now ${total}.`
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
