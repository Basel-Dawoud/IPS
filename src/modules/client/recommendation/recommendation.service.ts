import prisma from "../../../lib/prisma";

export interface RecommendationInput {
  userId?: string;
  /** When omitted, recommendations are global (scored across all buildings). */
  buildingId?: string;
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

/**
 * Calculates Euclidean distance between two points.
 */
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

/**
 * Recommends POIs based on the user's state, location, and similar users' behavior.
 */
export async function getRecommendations(input: RecommendationInput): Promise<RecommendedPoi[]> {
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
      // Find other users with overlapping interests
      const rawSimilar = await prisma.user.findMany({
        where: {
          id: { not: userId },
          interests: {
            some: {
              id: { in: userInterests },
            },
          },
        },
        include: { interests: true },
      });

      const similarUsers = rawSimilar
        .map((u) => {
          const overlap = u.interests.filter((i: any) => userInterests.includes(i.id)).length;
          return { id: u.id, overlapCount: overlap };
        })
        .sort((a, b) => b.overlapCount - a.overlapCount)
        .slice(0, 10);

      const similarUserIds = similarUsers.map((su) => su.id);

      if (similarUserIds.length > 0) {
        // Query POIs they visited
        const visits = await prisma.poiVisit.findMany({
          where: {
            userId: { in: similarUserIds },
            ...(buildingId ? { buildingId } : {}),
          },
          select: { poiId: true },
        });

        for (const v of visits) {
          colScores[v.poiId] = (colScores[v.poiId] || 0) + 1;
        }
      }
    } catch (err) {
      console.error("[recommendation.service] Failed computing collaborative scores:", err);
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
          personalCategoryCounts[v.poi.categoryId] = (personalCategoryCounts[v.poi.categoryId] || 0) + 1;
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
      if (poi.floorLevel === floor) {
        const dist = getDistance(x, y, poi.x, poi.y);
        distanceScore = 1.0 / (1.0 + dist); // higher is closer
      } else {
        // penalty for different floors
        distanceScore = 0.0;
      }
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
    const categoryScore = (personalCategoryCounts[poi.categoryId || ""] || 0) / maxPersonalCategoryVisits;

    // Weight combinations
    let score = 0;
    if (isNewUser) {
      if (hasInterests) {
        // New User with interests
        score =
          0.30 * interestMatch +
          0.25 * distanceScore +
          0.15 * ratingScore +
          0.10 * popularityScore +
          0.20 * colScore;
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
        0.20 * colScore +
        0.10 * ratingScore +
        0.10 * distanceScore;
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
