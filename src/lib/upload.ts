import multer from "multer";
import path from "path";
import fs from "fs";

// Floor plan images are stored on local disk under backend/uploads/floors and
// served statically at /uploads (see app.ts). mapUrl points to the absolute URL
// built by `publicUrlForFloorImage`.
export const UPLOADS_ROOT = path.join(__dirname, "../../uploads");
export const FLOORS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "floors");
fs.mkdirSync(FLOORS_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

const extForMime = (mime: string): string =>
  mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FLOORS_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || extForMime(file.mimetype);
    const id = req.params.id ?? "floor";
    cb(null, `${id}-${Date.now()}${ext}`);
  },
});

export const floorImageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    // .npy grids arrive as application/octet-stream — allow by extension.
    if (path.extname(file.originalname).toLowerCase() === ".npy") return cb(null, true);
    cb(new Error("Only PNG, JPEG, WebP images or .npy grids are allowed"));
  },
});

/** Absolute, loadable URL for a stored floor image filename. */
export function publicUrlForFloorImage(filename: string): string {
  return `${publicBase()}/uploads/floors/${filename}`;
}

// --- POI marker icons -------------------------------------------------------
// Stored under backend/uploads/pois and served at /uploads/pois. Uploaded
// images are processed in memory (sharp) into a small WebP before saving, so
// multer keeps the raw bytes in the request rather than writing to disk.
export const POIS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "pois");
fs.mkdirSync(POIS_UPLOAD_DIR, { recursive: true });

export const poiIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed"));
  },
});

/** Absolute, loadable URL for a stored POI icon filename. */
export function publicUrlForPoiIcon(filename: string): string {
  return `${publicBase()}/uploads/pois/${filename}`;
}

export const POIS_GALLERY_UPLOAD_DIR = path.join(UPLOADS_ROOT, "pois-gallery");
fs.mkdirSync(POIS_GALLERY_UPLOAD_DIR, { recursive: true });

export const poiGalleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed"));
  },
});

export function publicUrlForPoiGalleryImage(filename: string): string {
  return `${publicBase()}/uploads/pois-gallery/${filename}`;
}

// --- Deal banner images -----------------------------------------------------
// Stored under backend/uploads/deals and served at /uploads/deals. Processed
// in memory (sharp) into a web-friendly WebP banner before saving.
export const DEALS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "deals");
fs.mkdirSync(DEALS_UPLOAD_DIR, { recursive: true });

export const dealImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed"));
  },
});

/** Absolute, loadable URL for a stored deal banner filename. */
export function publicUrlForDealImage(filename: string): string {
  return `${publicBase()}/uploads/deals/${filename}`;
}

// --- Building images --------------------------------------------------------
export const BUILDINGS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "buildings");
fs.mkdirSync(BUILDINGS_UPLOAD_DIR, { recursive: true });

export const buildingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed"));
  },
});

/** Absolute, loadable URL for a stored building image filename. */
export function publicUrlForBuildingImage(filename: string): string {
  return `${publicBase()}/uploads/buildings/${filename}`;
}

// --- User avatars -----------------------------------------------------------
// Stored under backend/uploads/avatars and served at /uploads/avatars.
// Processed in memory (sharp) into a small square WebP before saving.
export const AVATARS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "avatars");
fs.mkdirSync(AVATARS_UPLOAD_DIR, { recursive: true });

export const avatarImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PNG, JPEG or WebP images are allowed"));
  },
});

/** Absolute, loadable URL for a stored avatar filename. */
export function publicUrlForAvatar(filename: string): string {
  return `${publicBase()}/uploads/avatars/${filename}`;
}

function publicBase(): string {
  return (
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}
