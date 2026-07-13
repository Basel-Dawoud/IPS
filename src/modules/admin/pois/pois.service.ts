import prisma from "../../../lib/prisma";
import { CreatePoiInput, UpdatePoiInput } from "./pois.types";
import type { TransitionRegions } from "../../../lib/grid-vectorize";

type CatNode = { id: string; name: string; parentId: string | null };

// Flatten the many-to-many `categories` relation into a structured list plus a
// single `category` name (the first sub-category, else the first category) for
// legacy single-category consumers (app map, search, chat.retrieval).
const flattenCategory = <T extends { categories?: CatNode[] }>(poi: T) => {
  const cats = poi.categories ?? [];
  const primary = cats.find((c) => c.parentId) ?? cats[0];
  const { categories: _drop, ...rest } = poi;
  return {
    ...rest,
    categories: cats.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId })),
    category: primary?.name ?? null,
  };
};

const CAT_SELECT = { select: { id: true, name: true, parentId: true } } as const;
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
  const { categoryIds, ...rest } = data;
  const poi = await prisma.poi.create({
    data: {
      ...rest,
      ...(categoryIds && categoryIds.length
        ? { categories: { connect: categoryIds.map((id) => ({ id })) } }
        : {}),
    },
    include: { categories: CAT_SELECT },
  });
  await touchBuildingPoiUpdated(poi.buildingId);
  return flattenCategory(poi);
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
    include: { categories: CAT_SELECT },
    orderBy: [{ floorLevel: "asc" }, { name: "asc" }],
  });
  return pois.map(flattenCategory);
};

export const getPoiById = async (id: string) => {
  const poi = await prisma.poi.findUnique({
    where: { id },
    include: { categories: CAT_SELECT },
  });
  return poi ? flattenCategory(poi) : poi;
};

export const updatePoi = async (id: string, data: UpdatePoiInput) => {
  const { categoryIds, ...rest } = data;
  const poi = await prisma.poi.update({
    where: { id },
    data: {
      ...rest,
      // `set` replaces the whole membership; omit when categoryIds not sent.
      ...(categoryIds !== undefined
        ? { categories: { set: categoryIds.map((cid) => ({ id: cid })) } }
        : {}),
    },
    include: { categories: CAT_SELECT },
  });
  await touchBuildingPoiUpdated(poi.buildingId);
  return flattenCategory(poi);
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
    include: { categories: CAT_SELECT },
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
    include: { categories: CAT_SELECT },
  });
  await touchBuildingPoiUpdated(updated.buildingId);
  return flattenCategory(updated);
};
