import * as poiService from "../../admin/pois/pois.service";
import { ChatReply } from "./chat.types";
import { ChatMessageInput } from "./chat.schema";

/**
 * Client for the Navimind Chatbot Service (Qwen2.5-3B + RAG brain).
 *
 * Replaces the old llm-service `/generate` sidecar. We send the user's message
 * plus the building's POIs inline; the service resolves the request to a real
 * POI and returns a full {reply, lang, action}. The service is stateless, so we
 * pass the pending confirmation target (the app's `lastSuggestedPoiId`) through
 * as `pendingPoiId` and it decides yes/no relative to that.
 *
 * Returns null if the service is unreachable/misbehaving, so the caller can
 * fall back to the local rule-based pipeline.
 */
export interface ChatbotServiceReply extends ChatReply {
  /** Set when the service wants the backend to answer this turn itself
   *  (e.g. "recommend" -> use the recommendation engine). */
  handoff?: "recommend";
  /** True when the pending suggest-offer was declined/consumed. */
  clearPending?: boolean;
}

export async function callChatbotService(
  input: ChatMessageInput,
  lang: "en" | "ar"
): Promise<ChatbotServiceReply | null> {
  const serviceUrl = process.env.CHATBOT_SERVICE_URL || "http://127.0.0.1:8000";
  // Qwen on CPU can take a few seconds; default generously.
  const timeoutMs = Number(process.env.CHATBOT_SERVICE_TIMEOUT_MS || 60000);

  // Build the POI catalog payload from the DB (the service caches its embedding
  // index per building, keyed by a content hash, so this is cheap to resend).
  const pois = await poiService.getPois(input.buildingId);
  const poiPayload = pois
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      type: p.type,
      floorLevel: p.floorLevel,
      category: p.category ?? null,
      description: p.description,
      aliases: p.aliases ?? [],
      productKeywords: p.productKeywords ?? [],
      active: p.active,
    }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${serviceUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        buildingId: input.buildingId,
        lang,
        floorLevel: input.floorLevel,
        pendingPoiId: input.lastSuggestedPoiId ?? null,
        pois: poiPayload,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[chat.llm] Chatbot service returned status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      reply?: string;
      lang?: "en" | "ar";
      action?: { type: "navigate" | "suggest"; poiId: string; floorLevel: number } | null;
      handoff?: string | null;
      clearPending?: boolean | null;
    } | null;

    if (!data) return null;

    // A handoff turn intentionally has an empty reply — the backend answers it.
    if (data.handoff === "recommend") {
      return { reply: "", lang: data.lang || lang, handoff: "recommend" };
    }

    if (typeof data.reply === "string" && data.reply.trim().length > 0) {
      return {
        reply: data.reply.trim(),
        lang: data.lang || lang,
        ...(data.action ? { action: data.action } : {}),
        ...(data.clearPending ? { clearPending: true } : {}),
      };
    }
    return null;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.warn(`[chat.llm] Timeout calling chatbot service at ${serviceUrl}`);
    } else {
      console.warn(`[chat.llm] Error calling chatbot service:`, error.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
