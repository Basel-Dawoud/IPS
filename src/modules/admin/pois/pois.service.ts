import prisma from "../../../lib/prisma";
import { CreatePoiInput, UpdatePoiInput } from "./pois.types";
import type { TransitionRegions } from "../../../lib/grid-vectorize";

const flattenCategory = <T extends { category?: { name: string } | null }>(
  poi: T,
): Omit<T, "category"> & { category: string | null } => ({
  ...poi,
  category: poi.category?.name ?? null,
});

const resolveCategoryId = async (name: string): Promise<string> => {
  const trimmed = name.trim();
  const cat = await prisma.poiCategory.upsert({
    where: { name: trimmed },
    update: {},
    create: { name: trimmed },
  });
  return cat.id;
};
const touchBuildingPoiUpdated = async (buildingId: string) => {
  try {
    await prisma.building.update({
      where: { id: buildingId },
      data: { poiUpdatedAt: new Date() },
    });
  } catch (err) {
    console.error(`[pois.service] Failed to touch building ${buildingId}:`, err);
  }
};

export const createPoi = async (data: CreatePoiInput) => {
  const { category, ...rest } = data;
  // Explicit categoryId wins; otherwise map the free-text name.
  if (rest.categoryId === undefined && category?.trim()) {
    rest.categoryId = await resolveCategoryId(category);
  }
  const poi = await prisma.poi.create({ data: rest });
  await touchBuildingPoiUpdated(poi.buildingId);
  return poi;
};

// Auto-create STAIRS/ELEVATOR POIs from detected grid regions (one per shaft),
// skipping any region that already has a same-type POI within DEDUPE_RADIUS_M.
// Called on floor-image upload and by the backfill route. Returns the count
// actually created so callers can report it.
const DEDUPE_RADIUS_M = 2;

export const autoCreateTransitionPois = async (
  buildingId: string,
  floorLevel: number,
  regions: TransitionRegions,
): Promise<{ createdStairs: number; createdElevators: number }> => {
  const existing = await prisma.poi.findMany({
    where: { buildingId, floorLevel, type: { in: ["STAIRS", "ELEVATOR"] } },
    select: { type: true, x: true, y: true },
  });

  const near = (type: "STAIRS" | "ELEVATOR", cx: number, cy: number) =>
    existing.some(
      (p) => p.type === type && Math.hypot(p.x - cx, p.y - cy) <= DEDUPE_RADIUS_M,
    );

  const groups: { type: "STAIRS" | "ELEVATOR"; points: TransitionRegions["stairs"] }[] = [
    { type: "STAIRS", points: regions.stairs },
    { type: "ELEVATOR", points: regions.elevators },
  ];

  let createdStairs = 0;
  let createdElevators = 0;
  for (const { type, points } of groups) {
    let n = 0;
    for (const pt of points) {
      n++;
      if (near(type, pt.cx, pt.cy)) continue;
      const label = type === "STAIRS" ? "Stairs" : "Elevator";
      await createPoi({
        buildingId,
        floorLevel,
        name: `${label} ${n}`,
        type,
        x: Math.round(pt.cx * 100) / 100,
        y: Math.round(pt.cy * 100) / 100,
        active: true,
      });
      // Track it locally so later regions in this same call also dedupe.
      existing.push({ type, x: pt.cx, y: pt.cy });
      if (type === "STAIRS") createdStairs++;
      else createdElevators++;
    }
  }
  return { createdStairs, createdElevators };
};

export const getPois = async (buildingId: string, floorLevel?: number) => {
  const pois = await prisma.poi.findMany({
    where: {
      buildingId,
      ...(floorLevel !== undefined ? { floorLevel } : {}),
    },
    include: { category: true },
    orderBy: [{ floorLevel: "asc" }, { name: "asc" }],
  });
  return pois.map(flattenCategory);
};

export const getPoiById = async (id: string) => {
  const poi = await prisma.poi.findUnique({
    where: { id },
    include: { category: true },
  });
  return poi ? flattenCategory(poi) : poi;
};

export const updatePoi = async (id: string, data: UpdatePoiInput) => {
  const { category, ...rest } = data;
  let categoryId: string | null | undefined = rest.categoryId;
  if (categoryId === undefined && category !== undefined) {
    // Free-text name: resolve to an id; empty string clears the category.
    categoryId = category.trim() ? await resolveCategoryId(category) : null;
  }
  const poi = await prisma.poi.update({
    where: { id },
    data: { ...rest, ...(categoryId !== undefined ? { categoryId } : {}) },
  });
  await touchBuildingPoiUpdated(poi.buildingId);
  return poi;
};

export const deletePoi = async (id: string) => {
  const poi = await prisma.poi.delete({
    where: { id },
  });
  await touchBuildingPoiUpdated(poi.buildingId);
  return poi;
};

export const setPoiIcon = async (id: string, iconUrl: string) => {
  const poi = await prisma.poi.update({
    where: { id },
    data: { iconUrl },
  });
  await touchBuildingPoiUpdated(poi.buildingId);
  return poi;
};

export const addPoiGalleryImage = async (id: string, imageUrl: string) => {
  const poi = await prisma.poi.findUnique({ where: { id } });
  if (!poi) return null;
  // Atomic array push so concurrent uploads never drop images (avoids the
  // read-modify-write race where the last writer overwrites the array).
  const updated = await prisma.poi.update({
    where: { id },
    data: { images: { push: imageUrl } },
    include: { category: true },
  });
  await touchBuildingPoiUpdated(updated.buildingId);
  return flattenCategory(updated);
};

export const removePoiGalleryImage = async (id: string, imageUrl: string) => {
  const poi = await prisma.poi.findUnique({ where: { id } });
  if (!poi) return null;
  const images = poi.images.filter((img) => img !== imageUrl);
  const updated = await prisma.poi.update({
    where: { id },
    data: { images },
    include: { category: true },
  });
  await touchBuildingPoiUpdated(updated.buildingId);
  return flattenCategory(updated);
};
