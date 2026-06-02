import { z } from "zod";

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().positive().max(5000).default(150),
});

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;
