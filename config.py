"""Smart Mall AI - Configuration & Constants"""
import os

# ============================================================
# PATHS
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

CATEGORIES_FILE = os.path.join(DATA_DIR, "categories.json")
PRODUCTS_FILE = os.path.join(DATA_DIR, "sort_data.json")
MEMORY_FILE = os.path.join(DATA_DIR, "navigation_memory.json")
GRID_0_FILE = os.path.join(DATA_DIR, "floor_3_grid.npy")
GRID_1_FILE = os.path.join(DATA_DIR, "floor_4_grid.npy")
DB_PATH = os.path.join(DATA_DIR, "mall.db")

# ============================================================
# NAVIGATION CONFIG
# ============================================================
CELL_SIZE = 0.2  # meters per grid cell

# ============================================================
# FLOOR MAPPING
# ============================================================
FLOOR_3_RANGE = range(350, 359)
FLOOR_4_RANGE = range(450, 463)

# ============================================================
# ROOM CENTROIDS
# ============================================================
room_centroids_f3_grid = {
    350: (70, 465),
    351: (70, 435),
    352: (70, 395),
    353: (70, 360),
    354: (70, 320),
    355: (70, 285),
    356: (70, 215),
    357: (70, 160),
    358: (70, 85),
}

room_centroids_f4_grid = {
    450: (80, 460),
    451: (80, 430),
    452: (80, 392),
    453: (80, 350),
    454: (80, 310),
    455: (80, 272),
    456: (80, 235),
    457: (80, 200),
    458: (80, 165),
    459: (80, 130),
    460: (80, 95),
    461: (80, 60),
    462: (80, 25),
}

# ============================================================
# ROOM INFORMATION
# ============================================================
ROOM_INFO = {
    350: "Smart Devices Hub",
    351: "Computer Systems Hub",
    352: "Mobile & Tablets Hub",
    353: "Storage",
    354: "Smart Home Automation",
    355: "Smart Wearables",
    356: "Gaming",
    357: "Laptop Accessories",
    358: "Health & Personal Care",
    450: "Bedroom",
    451: "Living Room",
    452: "Study/Office",
    453: "Kitchen",
    454: "Dining Room",
    455: "Bathroom",
    456: "Furnishings",
    457: "Kitchen and Dining",
    458: "Home Decor",
    459: "Tools and Utility",
    460: "Lighting and Electricals",
    461: "Cleaning and Bath",
    462: "Pet and Gardening",
}

# ============================================================
# STORE CLUSTER MAPPING
# ============================================================
STORE_CLUSTER_ROOM = {
    "Smart Devices Hub": 350,
    "Computer Systems Hub": 351,
    "Mobile & Tablets Hub": 352,
    "Storage": 353,
    "Smart Home Automation": 354,
    "Smart Wearables": 355,
    "Gaming": 356,
    "Laptop Accessories": 357,
    "Health & Personal Care": 358,
    "Bedroom": 450,
    "Living Room": 451,
    "Study/Office": 452,
    "Kitchen": 453,
    "Dining Room": 454,
    "Bathroom": 455,
    "Furnishings": 456,
    "Kitchen and Dining": 457,
    "Home Decor": 458,
    "Tools and Utility": 459,
    "Lighting and Electricals": 460,
    "Cleaning and Bath": 461,
    "Pet and Gardening": 462,
}

STORE_CLUSTER = {
    "Audio": "Smart Devices Hub",
    "Cameras": "Smart Devices Hub",
    "Computer Peripherals": "Computer Systems Hub",
    "Laptop & Desktop": "Computer Systems Hub",
    "Mobiles": "Mobile & Tablets Hub",
    "Tabelts": "Mobile & Tablets Hub",
}

# ============================================================
# STORE ALIASES (Multilingual)
# ============================================================
STORE_ALIASES = {
    350: ["Smart Devices Hub", "smart devices", "smart", "devices", "audio", "cameras", "wearables", 
          "سمارت", "أجهزة ذكية", "كاميرات", "سماعات", "ساعات ذكية"],
    351: ["Computer Systems Hub", "computer", "computers", "laptop", "desktop", "pc",
          "كمبيوتر", "لابتوب", "لاب توب", "كمبيوترات"],
    352: ["Mobile & Tablets Hub", "mobile", "tablet", "Tabelts", "phone", "phones", "smartphone",
          "موبايل", "موبايلات", "تابلت", "تليفون", "هواتف"],
    353: ["Storage", "storage", "ssd", "hdd", "flash", "memory",
          "تخزين", "هارد", "فلاش"],
    354: ["Smart Home Automation", "smart home", "automation", "iot", "home control",
          "منزل ذكي", "أتمتة"],
    355: ["Smart Wearables", "wearables", "smartwatch", "watch", "fitness band",
          "ساعات ذكية", "أجهزة قابلة للارتداء"],
    356: ["Gaming", "gaming", "games", "playstation", "xbox", "nintendo",
          "ألعاب", "جيمينج", "بلايستيشن"],
    357: ["Laptop Accessories", "laptop accessories", "charger", "mouse", "keyboard", "laptop bag",
          "إكسسوارات لابتوب", "شاحن", "ماوس"],
    358: ["Health & Personal Care", "health", "personal care", "beauty", "skincare",
          "صحة", "عناية شخصية", "جمال", "بشرة"],
    450: ["Bedroom", "bedroom", "bed", "sleep",
          "غرفة نوم", "نوم", "سرير"],
    451: ["Living Room", "living room", "living", "sofa", "couch",
          "صالة", "ركنة", "انتريه", "صالون"],
    452: ["Study/Office", "study", "office", "desk", "work",
          "مكتب", "دراسة", "مذاكرة"],
    453: ["Kitchen", "kitchen", "cook", "cooking",
          "مطبخ", "طبخ", "أكل"],
    454: ["Dining Room", "dining", "dining room", "table",
          "سفرة", "غرفة سفرة"],
    455: ["Bathroom", "bathroom", "bath", "shower",
          "حمام", "دوش"],
    456: ["Furnishings", "furnishings", "curtains", "carpet", "rug",
          "مفروشات", "ستاير", "سجاد"],
    457: ["Kitchen and Dining", "cookware", "utensils", "pots", "pans",
          "أدوات مطبخ", "حلل", "معالق"],
    458: ["Home Decor", "home decor", "decor", "decoration",
          "ديكور", "تحف"],
    459: ["Tools and Utility", "tools", "utility", "hardware",
          "عدة", "أدوات"],
    460: ["Lighting and Electricals", "lighting", "lights", "electrical", "lamps",
          "اضاءة", "لمبات", "نجف"],
    461: ["Cleaning and Bath", "cleaning", "bath products", "detergent",
          "تنظيف", "منظفات"],
    462: ["Pet and Gardening", "pet", "pets", "gardening", "garden", "plants",
          "حيوانات", "حديقة", "زرع"],
}

# ============================================================
# PRODUCT KEYWORDS TO ROOM MAPPING (Multilingual)
# ============================================================
PRODUCT_TO_ROOM = {
    # 350 - Smart Devices Hub
    "camera": 350, "cameras": 350, "headphones": 350, "earbuds": 350,
    "speaker": 350, "smart device": 350, "iot": 350, "smart sensor": 350,
    "كاميرا": 350, "كاميرات": 350, "سماعات": 350, "سماعة": 350,
    "جهاز ذكي": 350, "انترنت الاشياء": 350,

    # 351 - Computer Systems Hub
    "computer": 351, "desktop": 351, "pc": 351, "server": 351,
    "motherboard": 351, "cpu": 351, "processor": 351, "gpu": 351,
    "ram": 351, "computer system": 351,
    "كمبيوتر": 351, "حاسب": 351, "معالج": 351, "رام": 351, "كارت شاشة": 351,

    # 352 - Mobile & Tablets Hub
    "mobile": 352, "phone": 352, "smartphone": 352, "tablet": 352,
    "ipad": 352, "iphone": 352, "samsung": 352, "charger": 352, "power bank": 352,
    "موبايل": 352, "هاتف": 352, "تليفون": 352, "تابلت": 352,
    "ايفون": 352, "سامسونج": 352, "شاحن": 352,

    # 353 - Storage
    "hard drive": 353, "ssd": 353, "hdd": 353, "usb": 353,
    "flash": 353, "memory": 353, "storage": 353, "sd card": 353, "external drive": 353,
    "هارد": 353, "فلاشه": 353, "ذاكرة": 353, "تخزين": 353, "كارت ميموري": 353,
    "رامات": 353, "راما": 353, "hard disk": 353, "pen drive": 353,
    "ليدر": 353, "ريدر": 353, "reader": 353, "mobile memory card": 353,

    # 354 - Smart Home Automation
    "smart home": 354, "automation": 354, "smart lock": 354, "smart light": 354,
    "security camera": 354, "smart switch": 354,
    "بيت ذكي": 354, "قفل ذكي": 354, "كاميرا مراقبة": 354, "اضاءة ذكية": 354,

    # 355 - Smart Wearables
    "smart watch": 355, "smartwatch": 355, "wearable": 355, "fitness tracker": 355,
    "vr": 355, "ar glasses": 355,
    "ساعة ذكية": 355, "ويرابل": 355, "نظارة ذكية": 355,

    # 356 - Gaming
    "gaming": 356, "game": 356, "playstation": 356, "xbox": 356,
    "console": 356, "controller": 356, "gaming chair": 356, "gaming mouse": 356,
    "جيمينج": 356, "بلايستيشن": 356, "اكس بوكس": 356, "كونسول": 356, "كرسي جيمينج": 356,

    # 357 - Laptop Accessories
    "laptop": 357, "mouse": 357, "keyboard": 357, "laptop stand": 357,
    "dock": 357, "webcam": 357, "cooling pad": 357,
    "لابتوب": 357, "كيبورد": 357, "ماوس": 357, "ويب كام": 357,

    # 358 - Health & Personal Care
    "health": 358, "personal care": 358, "skincare": 358, "hair dryer": 358,
    "massager": 358, "electric toothbrush": 358,
    "صحة": 358, "عناية شخصية": 358, "مجفف شعر": 358, "فرشاة اسنان": 358,

    # 450 - Bedroom
    "bed": 450, "mattress": 450, "pillow": 450, "wardrobe": 450, "bedroom": 450,
    "سرير": 450, "مرتبة": 450, "مخدة": 450, "دولاب": 450,

    # 451 - Living Room
    "sofa": 451, "couch": 451, "tv": 451, "television": 451, "coffee table": 451,
    "living room": 451, "كنبة": 451, "صالون": 451, "تلفزيون": 451, "ركنة": 451,

    # 452 - Study/Office
    "desk": 452, "office chair": 452, "bookshelf": 452, "study": 452, "office": 452, "printer": 452,
    "مكتب": 452, "كرسي مكتب": 452, "مكتبة": 452, "طابعة": 452,

    # 453 - Kitchen
    "kitchen": 453, "fridge": 453, "refrigerator": 453, "oven": 453,
    "microwave": 453, "air fryer": 453, "blender": 453,
    "مطبخ": 453, "ثلاجة": 453, "بوتاجاز": 453, "ميكروويف": 453,

    # 454 - Dining Room
    "dining": 454, "dining table": 454, "dining chair": 454, "buffet": 454,
    "سفرة": 454, "ترابيزة سفرة": 454, "غرفة سفرة": 454,

    # 455 - Bathroom
    "bathroom": 455, "toilet": 455, "shower": 455, "sink": 455, "towel": 455,
    "حمام": 455, "دوش": 455, "مغسلة": 455,

    # 456 - Furnishings
    "curtain": 456, "carpet": 456, "rug": 456, "bedsheet": 456, "blanket": 456,
    "ستاير": 456, "سجاد": 456, "مفروشات": 456,

    # 457 - Kitchen and Dining
    "plate": 457, "cup": 457, "cutlery": 457, "cookware": 457, "pot": 457,
    "طبق": 457, "كوب": 457, "حلل": 457,

    # 458 - Home Decor
    "decor": 458, "vase": 458, "mirror": 458, "painting": 458, "clock": 458,
    "ديكور": 458, "تحف": 458, "مراية": 458,

    # 459 - Tools and Utility
    "tool": 459, "drill": 459, "hammer": 459, "screwdriver": 459, "toolbox": 459,
    "عدة": 459, "شنيور": 459, "مفك": 459,

    # 460 - Lighting and Electricals
    "light": 460, "lamp": 460, "chandelier": 460, "bulb": 460, "led": 460,
    "لمبة": 460, "نجف": 460, "اضاءة": 460,

    # 461 - Cleaning and Bath
    "cleaning": 461, "vacuum": 461, "detergent": 461, "mop": 461, "broom": 461,
    "تنظيف": 461, "مكنسة": 461, "ممسحة": 461,

    # 462 - Pet and Gardening
    "pet": 462, "dog": 462, "cat": 462, "plant": 462, "garden": 462, "flower": 462,
    "حيوان": 462, "كلب": 462, "قطة": 462, "زرع": 462,
}

# ============================================================
# STORE DESCRIPTIONS
# ============================================================
STORE_DESCRIPTIONS = {
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
}

# ============================================================
# SYSTEM PROMPT (for OpenRouter/LLM fallback)
# ============================================================
SYSTEM_PROMPT = """You are an AI assistant for indoor navigation inside a shopping mall.

Mall stores:
350 Smart Devices Hub
351 Computer Systems Hub
352 Mobile & Tablets Hub
353 Storage
354 Smart Home Automation
355 Smart Wearables
356 Gaming
357 Laptop Accessories
358 Health & Personal Care
450 Bedroom
451 Living Room
452 Study/Office
453 Kitchen
454 Dining Room
455 Bathroom
456 Furnishings
457 Kitchen and Dining
458 Home Decor
459 Tools and Utility
460 Lighting and Electricals
461 Cleaning and Bath
462 Pet and Gardening

Rules:
- If the user asks about a store, answer with store information.
- If the user asks for navigation, help them navigate.
- If the user says he is hungry, suggest kitchen / dining / food-related stores.
- Keep answers concise and helpful.
"""

# ============================================================
# NAVIGATION MODES
# ============================================================
NAV_MODES = ["Normal", "Fire", "Crowded", "Special Needs"]

# ============================================================
# DEFAULT BUDGET
# ============================================================
DEFAULT_LOW_BUDGET = 500
DEFAULT_HIGH_BUDGET = 5000
