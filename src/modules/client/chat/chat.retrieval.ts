import * as poiService from "../../admin/pois/pois.service";

export interface ScoreResult {
  poi: any; // Poi DB type
  score: number;
}

/**
 * Searches and scores POIs in a building against a user message.
 * Returns the best match if it exceeds a confidence threshold.
 */
export async function matchPoi(
  buildingId: string,
  message: string,
  floorLevel?: number
): Promise<any | null> {
  const allPois = await poiService.getPois(buildingId, floorLevel);
  const activePois = allPois.filter((p) => p.active);

  const lowMsg = message.toLowerCase().trim();
  const msgTokens = lowMsg.split(/\s+/).filter((t) => t.length > 1);

  if (lowMsg.length === 0) return null;

  let bestMatch: any = null;
  let bestScore = 0;

  for (const poi of activePois) {
    let score = 0;
    const name = (poi.name || "").toLowerCase();
    const code = (poi.code || "").toLowerCase();
    const category = (poi.category || "").toLowerCase();
    const aliases = (poi.aliases || []).map((a: string) => a.toLowerCase());
    const keywords = (poi.productKeywords || []).map((k: string) => k.toLowerCase());

    // 1. Exact or direct substring match on Name
    if (lowMsg === name) {
      score += 20;
    } else if (name.includes(lowMsg)) {
      score += 15;
    }

    // 2. Exact match on Code (room number / store ID)
    if (code && (lowMsg === code || lowMsg.includes(code))) {
      score += 18;
    }

    // 3. Substring match on Aliases
    for (const alias of aliases) {
      if (lowMsg === alias) {
        score += 18;
      } else if (alias.includes(lowMsg) || lowMsg.includes(alias)) {
        score += 12;
      }
    }

    // 4. Matches on Product Keywords
    for (const keyword of keywords) {
      if (lowMsg === keyword) {
        score += 15;
      } else if (lowMsg.includes(keyword)) {
        score += 10;
      }
    }

    // 5. Matches on Category
    if (category && (lowMsg === category || category.includes(lowMsg))) {
      score += 8;
    }

    // 6. Token overlap matching for multi-word queries
    let tokenOverlap = 0;
    for (const token of msgTokens) {
      if (name.includes(token)) tokenOverlap += 3;
      if (code && code.includes(token)) tokenOverlap += 3;
      if (category && category.includes(token)) tokenOverlap += 1;
      if (aliases.some((a: string) => a.includes(token))) tokenOverlap += 2;
      if (keywords.some((k: string) => k.includes(token))) tokenOverlap += 2.5;
    }
    score += tokenOverlap;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = poi;
    }
  }

  // Define a minimum threshold for match confidence
  const THRESHOLD = 5;
  if (bestScore >= THRESHOLD) {
    return bestMatch;
  }

  return null;
}
