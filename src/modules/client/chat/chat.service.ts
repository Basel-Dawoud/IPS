import { detectLanguage, detectIntent } from "./chat.intent";
import { matchPoi } from "./chat.retrieval";
import * as responder from "./chat.responder";
import { callChatbotService } from "./chat.llm";
import { ChatReply } from "./chat.types";
import { ChatMessageInput } from "./chat.schema";
import * as poiService from "../../admin/pois/pois.service";
import { getRecommendations } from "../recommendation/recommendation.service";

/**
 * Main orchestration service for processing chatbot messages.
 *
 * Primary path: proxy to the Navimind Chatbot Service (Qwen2.5-3B + RAG brain),
 * which owns intent understanding, POI resolution, and the confirm flow. If that
 * service is unreachable, we degrade gracefully to the local rule-based pipeline
 * (`processMessageFallback`) so the chatbot still works offline.
 */
export async function processMessage(input: ChatMessageInput, userId?: string): Promise<ChatReply> {
  const lang = detectLanguage(input.message);
  console.log(`[chat.service] Incoming message to process: "${input.message}" (lang=${lang}, userId=${userId || 'guest'})`);

  try {
    const serviceReply = await callChatbotService(input, lang);
    if (serviceReply) {
      console.log(`[chat.service] Successfully received reply from chatbot-service:`, JSON.stringify(serviceReply, null, 2));
      // The brain classified this turn as a recommendation request — answer it
      // from the backend's recommendation engine (it owns user history/ratings).
      if (serviceReply.handoff === "recommend") {
        console.log(`[chat.service] Chatbot service requested handoff to recommendation engine.`);
        const recReply = await buildRecommendationsReply(input, userId, lang);
        if (recReply) {
          console.log(`[chat.service] Recommendation reply generated successfully:`, JSON.stringify(recReply, null, 2));
          return recReply;
        }
        return {
          reply:
            lang === "ar"
              ? "معنديش اقتراحات ليك دلوقتي، بس قولي بتدور على ايه وهساعدك."
              : "I don't have recommendations for you yet — tell me what you're looking for and I'll help.",
          lang,
        };
      }
      return serviceReply;
    } else {
      console.log(`[chat.service] Chatbot service returned null. Transitioning to local offline fallback.`);
    }
  } catch (err) {
    console.error("[chat.service] Chatbot service threw an exception during execution:", err);
  }

  console.log(`[chat.service] Executing local offline fallback rules for message: "${input.message}"`);
  const fallbackResult = await processMessageFallback(input, userId, lang);
  console.log(`[chat.service] Offline fallback generated reply:`, JSON.stringify(fallbackResult, null, 2));
  return fallbackResult;
}

/**
 * Builds a chatbot reply from the recommendation engine (top 3 POIs for this
 * user/position). Shared by the chatbot-service "recommend" handoff and the
 * offline fallback pipeline.
 */
async function buildRecommendationsReply(
  input: ChatMessageInput,
  userId: string | undefined,
  lang: "en" | "ar"
): Promise<ChatReply | null> {
  try {
    const recs = await getRecommendations({
      userId,
      buildingId: input.buildingId,
      x: input.position?.x,
      y: input.position?.y,
      floor: input.position?.floor ?? input.floorLevel,
    });

    if (recs.length === 0) return null;

    const topThree = recs.slice(0, 3);
    const names = topThree
      .map((r, i) => `${i + 1}. ${r.name} (${r.categoryName || ""})`)
      .join("\n");

    const reply = lang === "ar"
      ? `إليك بعض الأماكن المقترحة لك:\n${names}\n\nحابب تروح لأي واحد منهم؟`
      : `Here are some recommendations for you:\n${names}\n\nWould you like to visit any of them?`;

    return {
      reply,
      lang,
      action: {
        type: "suggest",
        poiId: topThree[0].id,
        floorLevel: topThree[0].floorLevel,
      },
    };
  } catch (err) {
    console.error("[chat.service] Error getting recommendations for chatbot:", err);
    return null;
  }
}

/**
 * Local rule-based fallback: intent detection + POI retrieval + templated
 * replies. Used only when the chatbot service is unavailable. Has no LLM, so
 * free-form queries resolve to a generic fallback response.
 */
async function processMessageFallback(
  input: ChatMessageInput,
  userId: string | undefined,
  lang: "en" | "ar"
): Promise<ChatReply> {
  const { buildingId, message, floorLevel, lastSuggestedPoiId } = input;

  const intent = detectIntent(message);

  // 1. Check Agreement (e.g. user says "yes" / "ماشي" after we suggested a store)
  if (intent === "agree" && lastSuggestedPoiId) {
    try {
      const poi = await poiService.getPoiById(lastSuggestedPoiId);
      if (poi && poi.active && poi.buildingId === buildingId) {
        return {
          reply: responder.getNavigationResponse(poi.name, poi.code || "", lang),
          lang,
          action: {
            type: "navigate",
            poiId: poi.id,
            floorLevel: poi.floorLevel,
          },
        };
      }
    } catch (err) {
      console.error("[chat.service] Error checking last suggested POI:", err);
    }
  }

  // 2. Check Rejection (e.g. user says "no" / "مش دلوقتي")
  if (intent === "reject") {
    return {
      reply: responder.getRejectionResponse(lang),
      lang,
    };
  }

  // 3. Check Greeting
  if (intent === "greet") {
    return {
      reply: responder.getGreeting(lang),
      lang,
    };
  }

  // 4. Check Thanks
  if (intent === "thanks") {
    return {
      reply: responder.getThanksResponse(lang),
      lang,
    };
  }

  // 5. Check Recommendations
  if (intent === "recommend") {
    const recReply = await buildRecommendationsReply(input, userId, lang);
    if (recReply) return recReply;
  }

  // 6. POI Matching (for Navigate, Product, Info, or Unknown intents)
  const matchedPoi = await matchPoi(buildingId, message, floorLevel);

  if (matchedPoi) {
    const isNav = intent === "navigate";
    const isProduct = intent === "product";
    const isInfo = intent === "info";

    // If explicit navigation intent OR it was unknown but user typed a store name directly and we matched it,
    // we can either suggest or directly navigate. Let's make explicit navigation direct,
    // and matching a store name direct if they used a nav verb, or suggest it if they asked about info/products.
    if (isNav) {
      return {
        reply: responder.getNavigationResponse(matchedPoi.name, matchedPoi.code || "", lang),
        lang,
        action: {
          type: "navigate",
          poiId: matchedPoi.id,
          floorLevel: matchedPoi.floorLevel,
        },
      };
    } else if (isProduct) {
      return {
        reply: responder.getProductLocationResponse(matchedPoi.name, matchedPoi.code || "", lang),
        lang,
        action: {
          type: "suggest",
          poiId: matchedPoi.id,
          floorLevel: matchedPoi.floorLevel,
        },
      };
    } else {
      // Treat as Info request
      return {
        reply: responder.getStoreInfoResponse(
          matchedPoi.description || "",
          matchedPoi.name,
          matchedPoi.code || "",
          lang
        ),
        lang,
        action: {
          type: "suggest",
          poiId: matchedPoi.id,
          floorLevel: matchedPoi.floorLevel,
        },
      };
    }
  }

  // 6. Last resort fallback response (no local LLM in this degraded path).
  return {
    reply: responder.getFallbackResponse(lang),
    lang,
  };
}
