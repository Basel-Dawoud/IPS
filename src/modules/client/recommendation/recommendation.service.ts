import { Prisma } from "../../../generated/prisma/client";
import prisma from "../../../lib/prisma";

export interface RecommendationInput {
  userId?: string;
  buildingId?: string; // When omitted, recommendations are global (scored across all buildings).
  x?: number;
  y?: number;
  floor?: number;
}

export interface RecommendedPoi {
  id: string;
  name: string;
  code: string | null;
  floorLevel: number;
  x: number;
  y: number;
  description: string | null;
  avgRating: number;
  reviewCount: number;
  visitCount: number;
  categoryName: string | null;
  buildingId: string;
  buildingName: string;
  score: number;
}

//Calculates Euclidean distance between two points.
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

export async function getRecommendations(
  input: RecommendationInput,
): Promise<RecommendedPoi[]> {
  const { userId, buildingId, x, y, floor } = input;

  // 1. Fetch active POIs — in the given building, or across all buildings when
  // no building context (global home recommendations).
  const pois = await prisma.poi.findMany({
    where: { active: true, ...(buildingId ? { buildingId } : {}) },
    include: { category: true, building: { select: { name: true } } },
  });

  if (pois.length === 0) return [];

  // Calculate normalization boundaries
  const maxVisitCount = Math.max(...pois.map((p) => p.visitCount), 1);

  // 2. Load User Profile
  let user: any = null;
  let userInterests: string[] = [];
  let onboardingComplete = false;

  if (userId) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      include: { interests: true },
    });
    if (user) {
      userInterests = user.interests.map((cat: any) => cat.id);
      onboardingComplete = user.onboardingComplete;
    }
  }

  const hasInterests = onboardingComplete && userInterests.length > 0;

  // 3. Collaborative Filtering logic
  const colScores: Record<string, number> = {};
  if (userId && userInterests.length > 0) {
    try {
      const rawScores = await prisma.$queryRaw<any[]>`
        WITH similar_users AS (
          SELECT 
            ui."B" AS "userId",
            COUNT(*)::float / (
              ${userInterests.length}::float + 
              (SELECT COUNT(*)::float FROM "_UserInterests" WHERE "B" = ui."B") - 
              COUNT(*)::float
            ) AS similarity
          FROM "_UserInterests" ui
          WHERE ui."A" IN (${Prisma.join(userInterests)}) AND ui."B" <> ${userId}
          GROUP BY ui."B"
          ORDER BY similarity DESC
          LIMIT 10
        )
        SELECT 
          pv."poiId",
          SUM(
            su.similarity * CASE
              WHEN pv."createdAt" > NOW() - INTERVAL '30 days' THEN 3.0
              WHEN pv."createdAt" > NOW() - INTERVAL '90 days' THEN 2.0
              ELSE 1.0
            END
          )::float AS score
        FROM "PoiVisit" pv
        INNER JOIN similar_users su ON pv."userId" = su."userId"
        WHERE 1=1
          ${buildingId ? Prisma.sql`AND pv."buildingId" = ${buildingId}` : Prisma.empty}
        GROUP BY pv."poiId"
      `;

      for (const r of rawScores) {
        colScores[r.poiId] = r.score;
      }
    } catch (err) {
      console.error(
        "[recommendation.service] Failed computing collaborative scores:",
        err,
      );
    }
  }
  const maxColScore = Math.max(...Object.values(colScores), 1);

  // 4. Personal visit history & recent category history (Returning User only)
  const personalVisitCounts: Record<string, number> = {};
  const personalCategoryCounts: Record<string, number> = {};
  let totalPersonalVisits = 0;

  if (userId) {
    try {
      const personalVisits = await prisma.poiVisit.findMany({
        where: { userId, ...(buildingId ? { buildingId } : {}) },
        include: { poi: true },
      });
      totalPersonalVisits = personalVisits.length;
      for (const v of personalVisits) {
        personalVisitCounts[v.poiId] = (personalVisitCounts[v.poiId] || 0) + 1;
        if (v.poi.categoryId) {
          personalCategoryCounts[v.poi.categoryId] =
            (personalCategoryCounts[v.poi.categoryId] || 0) + 1;
        }
      }
    } catch (err) {
      console.error("[recommendation.service] Failed fetching user visit history:", err);
    }
  }
  const maxPersonalVisits = Math.max(...Object.values(personalVisitCounts), 1);
  const maxPersonalCategoryVisits = Math.max(...Object.values(personalCategoryCounts), 1);

  // Determine user state
  const isNewUser = !userId || totalPersonalVisits === 0;

  // 5. Score POIs
  const scored = pois.map((poi) => {
    // A. Interest score
    const interestMatch = userInterests.includes(poi.categoryId || "") ? 1.0 : 0.0;

    // B. Distance score
    let distanceScore = 0.0;
    if (x !== undefined && y !== undefined && floor !== undefined) {
      const floorDifference = Math.abs(poi.floorLevel - floor);
      const floorPenalty = 15.0; // meters equivalent penalty per floor level change
      const dist = Math.sqrt(
        Math.pow(x - poi.x, 2) +
          Math.pow(y - poi.y, 2) +
          Math.pow(floorDifference * floorPenalty, 2),
      );
      distanceScore = 1.0 / (1.0 + dist);
    }

    // C. Rating score
    const ratingScore = poi.avgRating / 5.0;

    // D. Global popularity score
    const popularityScore = poi.visitCount / maxVisitCount;

    // E. Collaborative score
    const colScore = (colScores[poi.id] || 0) / maxColScore;

    // F. Personal History score
    const historyScore = (personalVisitCounts[poi.id] || 0) / maxPersonalVisits;

    // G. Search / Category match score
    const categoryScore =
      (personalCategoryCounts[poi.categoryId || ""] || 0) / maxPersonalCategoryVisits;

    // Weight combinations
    let score = 0;
    if (isNewUser) {
      if (hasInterests) {
        // New User with interests
        score =
          0.3 * interestMatch +
          0.25 * distanceScore +
          0.15 * ratingScore +
          0.1 * popularityScore +
          0.2 * colScore;
      } else {
        // New User (skipped onboarding / anonymous)
        score =
          0.45 * distanceScore +
          0.25 * ratingScore +
          0.15 * popularityScore +
          0.15 * colScore;
      }
    } else {
      // Returning User
      score =
        0.35 * historyScore +
        0.25 * categoryScore +
        0.2 * colScore +
        0.1 * ratingScore +
        0.1 * distanceScore;
    }

    return {
      id: poi.id,
      name: poi.name,
      code: poi.code,
      floorLevel: poi.floorLevel,
      x: poi.x,
      y: poi.y,
      description: poi.description,
      avgRating: poi.avgRating,
      reviewCount: poi.reviewCount,
      visitCount: poi.visitCount,
      categoryName: poi.category?.name || null,
      buildingId: poi.buildingId,
      buildingName: poi.building.name,
      score: Number(score.toFixed(4)),
    };
  });

  // 6. Sort and return recommendations (descending score order)
  return scored.sort((a, b) => b.score - a.score);
}
