/**
 * Shared taxonomy helpers for the granular interest/product category system.
 * Imported by seed-taxonomy.ts and seed-products.ts so the category↔store↔room
 * mapping lives in exactly one place.
 *
 * The 25 granular categories ARE the sort_data.json categories (display-
 * normalized). They double as the PoiCategory interest taxonomy, so onboarding
 * interests, POIs, and products all share one set of names.
 */

// room id -> store name (matches seed-pois.ts ROOM_INFO / Poi.name & Poi.code).
export const ROOM_INFO: Record<number, string> = {
  350: "Smart Devices Hub", 351: "Computer Systems Hub", 352: "Mobile & Tablets Hub",
  353: "Storage", 354: "Smart Home Automation", 355: "Smart Wearables", 356: "Gaming",
  357: "Laptop Accessories", 358: "Health & Personal Care",
  450: "Bedroom", 451: "Living Room", 452: "Study/Office", 453: "Kitchen",
  454: "Dining Room", 455: "Bathroom", 456: "Furnishings", 457: "Kitchen and Dining",
  458: "Home Decor", 459: "Tools and Utility", 460: "Lighting and Electricals",
  461: "Cleaning and Bath", 462: "Pet and Gardening",
};

// sort_data category -> store name, for the Electronics sub-clusters that share
// a single hub store. Every other category maps to a room by its own name.
export const STORE_CLUSTER: Record<string, string> = {
  Audio: "Smart Devices Hub",
  Cameras: "Smart Devices Hub",
  "Computer Peripherals": "Computer Systems Hub",
  "Laptop & Desktop": "Computer Systems Hub",
  Mobiles: "Mobile & Tablets Hub",
  Tabelts: "Mobile & Tablets Hub",
};

// Display normalization for the few raw sort_data names that read badly in the
// onboarding UI. Applied consistently to BOTH Product.category and the
// PoiCategory names so the name-join between them still holds.
const DISPLAY_OVERRIDES: Record<string, string> = {
  Tabelts: "Tablets",
  "Tools and utility": "Tools and Utility",
};

export function normalizeCategoryName(raw: string): string {
  const t = (raw ?? "").trim();
  return DISPLAY_OVERRIDES[t] ?? t;
}

const NAME_TO_ROOM: Record<string, number> = {};
for (const [id, name] of Object.entries(ROOM_INFO)) {
  NAME_TO_ROOM[name.toLowerCase()] = Number(id);
}

// sort_data category -> room id (store). Tolerates spelling drift via ROOM_INFO.
export function resolveRoomId(category: string): number | null {
  const storeName = STORE_CLUSTER[category] || category;
  const id = NAME_TO_ROOM[storeName.toLowerCase()];
  return id ?? null;
}

// Each store's PRIMARY category = the sub-category with the most products
// (computed once from sort_data.json). Used to give every POI a single
// representative categoryId. The 3 multi-category hubs (350/351/352) collapse
// to their largest sub-category; products still carry their exact category.
export const ROOM_PRIMARY_CATEGORY: Record<number, string> = {
  350: "Cameras", 351: "Computer Peripherals", 352: "Mobiles", 353: "Storage",
  354: "Smart Home Automation", 355: "Smart Wearables", 356: "Gaming",
  357: "Laptop Accessories", 358: "Health & Personal Care",
  450: "Bedroom", 451: "Living Room", 452: "Study/Office", 453: "Kitchen",
  454: "Dining Room", 455: "Bathroom", 456: "Furnishings", 457: "Kitchen and Dining",
  458: "Home Decor", 459: "Tools and Utility", 460: "Lighting and Electricals",
  461: "Cleaning and Bath", 462: "Pet and Gardening",
};

// Short blurbs for the onboarding chips, keyed by normalized display name.
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Audio: "Headphones, earbuds, speakers",
  Cameras: "Cameras and accessories",
  "Computer Peripherals": "Mice, keyboards, monitors",
  Gaming: "Consoles, games, gear",
  "Health & Personal Care": "Grooming and wellness devices",
  "Laptop Accessories": "Chargers, bags, stands",
  "Laptop & Desktop": "Laptops and desktop PCs",
  "Smart Home Automation": "Smart locks, lights, sensors",
  "Smart Wearables": "Smartwatches and fitness bands",
  Storage: "SSDs, drives, memory cards",
  Tablets: "Tablets and iPads",
  Mobiles: "Smartphones and accessories",
  Bedroom: "Beds, mattresses, wardrobes",
  "Living Room": "Sofas, tables, TV units",
  "Study/Office": "Desks, chairs, shelves",
  Kitchen: "Kitchen appliances and cooking",
  "Dining Room": "Dining tables and seating",
  Bathroom: "Fixtures and bath essentials",
  Furnishings: "Curtains, carpets, textiles",
  "Kitchen and Dining": "Cookware and utensils",
  "Home Decor": "Decor and accessories",
  "Tools and Utility": "Tools and hardware",
  "Lighting and Electricals": "Lights and fixtures",
  "Cleaning and Bath": "Cleaning and bath supplies",
  "Pet and Gardening": "Pet care and gardening",
};

// The full granular category set (25) = the keys above.
export const ALL_CATEGORIES: string[] = Object.keys(CATEGORY_DESCRIPTIONS);

// --- 2-level tree: parent CATEGORIES (onboarding-interest level) -> children --
// Each parent groups several sub-categories. Onboarding shows only the parents.
export const PARENTS: Record<string, string[]> = {
  "Phones & Tablets": ["Mobiles", "Tablets"],
  Computers: ["Computer Peripherals", "Laptop & Desktop", "Laptop Accessories", "Storage"],
  // Parent name must differ from its "Gaming" sub-category (names are globally unique).
  "Gaming & Entertainment": ["Gaming"],
  "Audio & Smart Devices": [
    "Audio", "Cameras", "Smart Home Automation", "Smart Wearables", "Health & Personal Care",
  ],
  Furniture: ["Bedroom", "Living Room", "Study/Office", "Kitchen", "Dining Room", "Bathroom"],
  Household: [
    "Furnishings", "Kitchen and Dining", "Home Decor", "Tools and Utility",
    "Lighting and Electricals", "Cleaning and Bath", "Pet and Gardening",
  ],
};

export const PARENT_DESCRIPTIONS: Record<string, string> = {
  "Phones & Tablets": "Smartphones and tablets",
  Computers: "Laptops, desktops, peripherals & storage",
  "Gaming & Entertainment": "Consoles, games and gear",
  "Audio & Smart Devices": "Audio, cameras, wearables & smart home",
  Furniture: "Bedroom, living, kitchen, bath & more",
  Household: "Decor, cleaning, tools, lighting & pets",
};

// child sub-category -> its parent category name.
export const CATEGORY_PARENT: Record<string, string> = {};
for (const [parent, kids] of Object.entries(PARENTS)) {
  for (const k of kids) CATEGORY_PARENT[k] = parent;
}

// normalized sub-category -> room id (store), for deriving per-node keywords.
export const SUBCATEGORY_ROOM: Record<string, number> = {
  Audio: 350, Cameras: 350,
  "Computer Peripherals": 351, "Laptop & Desktop": 351,
  Mobiles: 352, Tablets: 352,
  Storage: 353, "Smart Home Automation": 354, "Smart Wearables": 355, Gaming: 356,
  "Laptop Accessories": 357, "Health & Personal Care": 358,
  Bedroom: 450, "Living Room": 451, "Study/Office": 452, Kitchen: 453,
  "Dining Room": 454, Bathroom: 455, Furnishings: 456, "Kitchen and Dining": 457,
  "Home Decor": 458, "Tools and Utility": 459, "Lighting and Electricals": 460,
  "Cleaning and Bath": 461, "Pet and Gardening": 462,
};

// product keyword -> room id (from config.py PRODUCT_TO_ROOM). Kept here (a pure
// module) so both seed-pois.ts and seed-taxonomy.ts can use it without importing
// the self-executing seed-pois.ts.
export const PRODUCT_TO_ROOM: Record<string, number> = {
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

export function keywordsForRoom(id: number): string[] {
  return Object.entries(PRODUCT_TO_ROOM)
    .filter(([, roomId]) => roomId === id)
    .map(([keyword]) => keyword);
}

// Keywords stored on a sub-category node = the keyword set of its store/room.
export function subcategoryKeywords(name: string): string[] {
  const room = SUBCATEGORY_ROOM[name];
  return room ? keywordsForRoom(room) : [];
}
