import prisma from "../../../lib/prisma";
import { CreatePoiInput, UpdatePoiInput } from "./pois.types";

// The API contract (dashboard + app) exposes `category` as the category NAME
// string; the relation object stays internal. Writes accept either a
// `categoryId` or a free-text `category` name (find-or-create).
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
  const images = [...poi.images, imageUrl];
  const updated = await prisma.poi.update({
    where: { id },
    data: { images },
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
