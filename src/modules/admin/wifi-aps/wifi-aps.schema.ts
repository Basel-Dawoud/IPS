import { z } from "zod";

export const createWifiApSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  bssid: z.string().min(1, "BSSID is required"),
  ssid: z.string().optional(),
  description: z.string().optional(),
  floorLevel: z.number().int().optional(),
});

export const updateWifiApSchema = z.object({
  ssid: z.string().optional(),
  description: z.string().optional(),
  floorLevel: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
});
