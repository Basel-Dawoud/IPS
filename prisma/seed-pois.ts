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

const CELL_SIZE = 0.2; // meters per grid cell

// floorLevel -> the section/category we group its stores under (chatbot facet)
const FLOOR_CATEGORY: Record<number, string> = {
  3: "Electronics & Tech",
  4: "Home & Living",
};

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

// product keyword -> room id (from config.py PRODUCT_TO_ROOM); inverted below.
const PRODUCT_TO_ROOM: Record<string, number> = {
  camera: 350, cameras: 350, headphones: 350, earbuds: 350, speaker: 350, "smart device": 350, iot: 350, "smart sensor": 350,
  "كاميرا": 350, "كاميرات": 350, "سماعات": 350, "سماعة": 350, "جهاز ذكي": 350, "انترنت الاشياء": 350,
  computer: 351, desktop: 351, pc: 351, server: 351, motherboard: 351, cpu: 351, processor: 351, gpu: 351, ram: 351, "computer system": 351,
  "كمبيوتر": 351, "حاسب": 351, "معالج": 351, "رام": 351, "كارت شاشة": 351,
  mobile: 352, phone: 352, smartphone: 352, tablet: 352, ipad: 352, iphone: 352, samsung: 352, charger: 352, "power bank": 352,
  "موبايل": 352, "هاتف": 352, "تليفون": 352, "تابلت": 352, "ايفون": 352, "سامسونج": 352, "شاحن": 352,
  "hard drive": 353, ssd: 353, hdd: 353, usb: 353, flash: 353, memory: 353, storage: 353, "sd card": 353, "external drive": 353,
  "هارد": 353, "فلاشه": 353, "ذاكرة": 353, "تخزين": 353, "كارت ميموري": 353, "رامات": 353, "راما": 353, "hard disk": 353, "pen drive": 353,
  "ليدر": 353, "ريدر": 353, reader: 353, "mobile memory card": 353,
  "smart home": 354, automation: 354, "smart lock": 354, "smart light": 354, "security camera": 354, "smart switch": 354,
  "بيت ذكي": 354, "قفل ذكي": 354, "كاميرا مراقبة": 354, "اضاءة ذكية": 354,
  "smart watch": 355, smartwatch: 355, wearable: 355, "fitness tracker": 355, vr: 355, "ar glasses": 355,
  "ساعة ذكية": 355, "ويرابل": 355, "نظارة ذكية": 355,
  gaming: 356, game: 356, playstation: 356, xbox: 356, console: 356, controller: 356, "gaming chair": 356, "gaming mouse": 356,
  "جيمينج": 356, "بلايستيشن": 356, "اكس بوكس": 356, "كونسول": 356, "كرسي جيمينج": 356,
  laptop: 357, mouse: 357, keyboard: 357, "laptop stand": 357, dock: 357, webcam: 357, "cooling pad": 357,
  "لابتوب": 357, "كيبورد": 357, "ماوس": 357, "ويب كام": 357,
  health: 358, "personal care": 358, skincare: 358, "hair dryer": 358, massager: 358, "electric toothbrush": 358,
  "صحة": 358, "عناية شخصية": 358, "مجفف شعر": 358, "فرشاة اسنان": 358,
  bed: 450, mattress: 450, pillow: 450, wardrobe: 450, bedroom: 450, "سرير": 450, "مرتبة": 450, "مخدة": 450, "دولاب": 450,
  sofa: 451, couch: 451, tv: 451, television: 451, "coffee table": 451, "living room": 451, "كنبة": 451, "صالون": 451, "تلفزيون": 451, "ركنة": 451,
  desk: 452, "office chair": 452, bookshelf: 452, study: 452, office: 452, printer: 452, "مكتب": 452, "كرسي مكتب": 452, "مكتبة": 452, "طابعة": 452,
  kitchen: 453, fridge: 453, refrigerator: 453, oven: 453, microwave: 453, "air fryer": 453, blender: 453, "مطبخ": 453, "ثلاجة": 453, "بوتاجاز": 453, "ميكروويف": 453,
  dining: 454, "dining table": 454, "dining chair": 454, buffet: 454, "سفرة": 454, "ترابيزة سفرة": 454, "غرفة سفرة": 454,
  bathroom: 455, toilet: 455, shower: 455, sink: 455, towel: 455, "حمام": 455, "دوش": 455, "مغسلة": 455,
  curtain: 456, carpet: 456, rug: 456, bedsheet: 456, blanket: 456, "ستاير": 456, "سجاد": 456, "مفروشات": 456,
  plate: 457, cup: 457, cutlery: 457, cookware: 457, pot: 457, "طبق": 457, "كوب": 457, "حلل": 457,
  decor: 458, vase: 458, mirror: 458, painting: 458, clock: 458, "ديكور": 458, "تحف": 458, "مراية": 458,
  tool: 459, drill: 459, hammer: 459, screwdriver: 459, toolbox: 459, "عدة": 459, "شنيور": 459, "مفك": 459,
  light: 460, lamp: 460, chandelier: 460, bulb: 460, led: 460, "لمبة": 460, "نجف": 460, "اضاءة": 460,
  cleaning: 461, vacuum: 461, detergent: 461, mop: 461, broom: 461, "تنظيف": 461, "مكنسة": 461, "ممسحة": 461,
  pet: 462, dog: 462, cat: 462, plant: 462, garden: 462, flower: 462, "حيوان": 462, "كلب": 462, "قطة": 462, "زرع": 462,
};

function keywordsForRoom(id: number): string[] {
  return Object.entries(PRODUCT_TO_ROOM)
    .filter(([, roomId]) => roomId === id)
    .map(([keyword]) => keyword);
}

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
        category: FLOOR_CATEGORY[floorOf(id)] ?? null,
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
