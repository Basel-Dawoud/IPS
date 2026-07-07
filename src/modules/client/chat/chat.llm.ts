import prisma from "../../../lib/prisma";
import * as poiService from "../../admin/pois/pois.service";
import { ChatReply } from "./chat.types";
import { ChatMessageInput } from "./chat.schema";

/**
 * Client for the Navimind Chatbot Service (Qwen2.5-3B + RAG brain).
 *
 * We send the user's message plus the building's POI version timestamp.
 * If the chatbot service has this version cached, it replies immediately (Fast Path).
 * If not (status 409), we fetch the POIs from the DB and retry with the full payload (Slow Path).
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

  // 1. Get the building's POI version timestamp
  let version = new Date().toISOString();
  try {
    const building = await prisma.building.findUnique({
      where: { id: input.buildingId },
      select: { poiUpdatedAt: true },
    });
    if (building?.poiUpdatedAt) {
      version = building.poiUpdatedAt.toISOString();
    }
  } catch (err) {
    console.error("[chat.llm] Error fetching building poiUpdatedAt:", err);
  }

  const makeRequest = async (poisPayload: any[] | null) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = process.env.CHATBOT_SERVICE_TOKEN;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["X-Chatbot-Token"] = token;
      }

      const response = await fetch(`${serviceUrl}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: input.message,
          buildingId: input.buildingId,
          lang,
          floorLevel: input.floorLevel,
          pendingPoiId: input.lastSuggestedPoiId ?? null,
          version,
          pois: poisPayload,
        }),
        signal: controller.signal,
      });

      return {
        status: response.status,
        ok: response.ok,
        json: response.ok || response.status === 409 ? await response.json() : null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    // 2. Try the fast path first (no POI list payload)
    let result = await makeRequest(null);

    // 3. Cache Miss (409 Conflict): retry with full list
    if (result.status === 409) {
      console.log(`[chat.llm] Cache miss for building ${input.buildingId} (version ${version}). Retrying with full POIs.`);
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

      result = await makeRequest(poiPayload);
    }

    if (!result.ok || !result.json) {
      console.warn(`[chat.llm] Chatbot service returned status ${result.status}`);
      return null;
    }

    const data = result.json as {
      reply?: string;
      lang?: "en" | "ar";
      action?: { type: "navigate" | "suggest"; poiId: string; floorLevel: number } | null;
      handoff?: string | null;
      clearPending?: boolean | null;
    };

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
  }
}
