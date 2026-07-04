import { z } from "zod";

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  // 500 m = "nearby" (indoor nav); the home screen also queries a wide radius
  // (e.g. 15 km) for the distance-sorted list + outdoor map.
  radiusMeters: z.coerce.number().positive().max(100_000).default(150),
  limit: z.coerce.number().int().positive().max(25).default(5),
});

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;
