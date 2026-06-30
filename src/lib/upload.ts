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
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/uploads/floors/${filename}`;
}
