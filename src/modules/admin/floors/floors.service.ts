import { prisma } from "../../../lib/prisma";
import {
  CreateFloorInput,
  UpdateFloorInput,
  SetFloorImageInput,
} from "./floors.types";

interface CalibrationInputs {
  metersPerPixel?: number | null;
  widthMeters?: number | null;
  heightMeters?: number | null;
  imageWidthPx?: number | null;
  imageHeightPx?: number | null;
}

// Keep metersPerPixel and the real-world extent consistent. The dashboard sends
// real width/height (m) — the primary path — so we derive
// metersPerPixel = widthMeters / imageWidthPx. The inverse (mpp → extent) is
// kept for completeness. Returns only the fields it can compute.
function computeCalibration(input: CalibrationInputs): {
  metersPerPixel?: number;
  widthMeters?: number;
  heightMeters?: number;
} {
  const w = input.imageWidthPx;
  const h = input.imageHeightPx;

  if (input.widthMeters && w) {
    const mpp = input.widthMeters / w;
    return {
      metersPerPixel: mpp,
      widthMeters: input.widthMeters,
      heightMeters: input.heightMeters ?? (h ? h * mpp : undefined),
    };
  }
  if (input.metersPerPixel && w && h) {
    return {
      metersPerPixel: input.metersPerPixel,
      widthMeters: w * input.metersPerPixel,
      heightMeters: h * input.metersPerPixel,
    };
  }
  return {};
}

export const createFloor = async (data: CreateFloorInput) => {
  const calc = computeCalibration(data);
  return prisma.floor.create({
    data: { ...data, ...calc },
  });
};

export const getFloorsByBuilding = async (buildingId: string) => {
  return prisma.floor.findMany({
    where: { buildingId },
    orderBy: { level: "asc" },
  });
};

export const getFloorById = async (id: string) => {
  return prisma.floor.findUnique({
    where: { id },
  });
};

export const updateFloor = async (id: string, data: UpdateFloorInput) => {
  const patch: UpdateFloorInput = { ...data };

  const touchesCalibration =
    data.metersPerPixel !== undefined ||
    data.widthMeters !== undefined ||
    data.heightMeters !== undefined ||
    data.imageWidthPx !== undefined ||
    data.imageHeightPx !== undefined;

  if (touchesCalibration) {
    const current = await prisma.floor.findUnique({ where: { id } });
    const calc = computeCalibration({
      metersPerPixel: data.metersPerPixel ?? current?.metersPerPixel,
      widthMeters: data.widthMeters ?? current?.widthMeters,
      heightMeters: data.heightMeters ?? current?.heightMeters,
      imageWidthPx: data.imageWidthPx ?? current?.imageWidthPx,
      imageHeightPx: data.imageHeightPx ?? current?.imageHeightPx,
    });
    Object.assign(patch, calc);
  }

  return prisma.floor.update({
    where: { id },
    data: patch,
  });
};

export const setFloorImage = async (id: string, input: SetFloorImageInput) => {
  const current = await prisma.floor.findUnique({ where: { id } });
  // Re-derive the extent against the new pixel size if the floor already has a
  // real width entered or a meters-per-pixel set.
  const calc = computeCalibration({
    metersPerPixel: current?.metersPerPixel,
    widthMeters: current?.widthMeters,
    heightMeters: current?.heightMeters,
    imageWidthPx: input.imageWidthPx,
    imageHeightPx: input.imageHeightPx,
  });
  return prisma.floor.update({
    where: { id },
    data: {
      mapUrl: input.mapUrl,
      imageWidthPx: input.imageWidthPx,
      imageHeightPx: input.imageHeightPx,
      // Set vectorMap when a grid was uploaded; clear it for raster images.
      vectorMap: (input.vectorMap ?? null) as never,
      ...calc,
    },
  });
};

export const deleteFloor = async (id: string) => {
  return prisma.floor.delete({
    where: { id },
  });
};
