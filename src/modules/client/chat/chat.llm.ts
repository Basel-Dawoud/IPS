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
  lang: "en" | "ar",
  userId?: string
): Promise<ChatbotServiceReply | null> {
  const serviceUrl = process.env.CHATBOT_SERVICE_URL || "http://127.0.0.1:8000";
  // Qwen on CPU can take a few seconds; default generously.
  const timeoutMs = Number(process.env.CHATBOT_SERVICE_TIMEOUT_MS || 60000);

  // The logged-in user's interest categories personalize product recommendations.
  // Interests are stored at the parent-category level; products carry sub-category
  // names, so expand each interest to its sub-categories (+ itself) before sending.
  let interests: string[] = [];
  if (userId) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        include: { interests: { include: { children: { select: { name: true } } } } },
      });
      const set = new Set<string>();
      for (const parent of u?.interests ?? []) {
        set.add(parent.name);
        for (const child of parent.children) set.add(child.name);
      }
      interests = [...set];
    } catch (err) {
      console.error("[chat.llm] Error fetching user interests:", err);
    }
  }

  // 1. Get the building's POI + product version timestamps
  let version = new Date().toISOString();
  let productsVersion = version;
  try {
    const building = await prisma.building.findUnique({
      where: { id: input.buildingId },
      select: { poiUpdatedAt: true, productUpdatedAt: true },
    });
    if (building?.poiUpdatedAt) {
      version = building.poiUpdatedAt.toISOString();
    }
    if (building?.productUpdatedAt) {
      productsVersion = building.productUpdatedAt.toISOString();
    }
  } catch (err) {
    console.error("[chat.llm] Error fetching building versions:", err);
  }

  const makeRequest = async (poisPayload: any[] | null) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const hasPois = poisPayload !== null;

    try {
      const token = process.env.CHATBOT_SERVICE_TOKEN;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["X-Chatbot-Token"] = token;
      }

      const requestBody = {
        message: input.message,
        buildingId: input.buildingId,
        lang,
        floorLevel: input.floorLevel,
        pendingPoiId: input.lastSuggestedPoiId ?? null,
        version,
        productsVersion,
        interests,
        pois: poisPayload,
      };

      console.log(`[chat.llm] Sending POST request to ${serviceUrl}/chat (hasPoisPayload=${hasPois})`);
      console.log(`[chat.llm] Request payload:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${serviceUrl}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const responseText = await response.text();
      console.log(`[chat.llm] Received status ${response.status} ${response.statusText}`);
      console.log(`[chat.llm] Raw response text:`, responseText);

      let responseJson = null;
      try {
        if (responseText) {
          responseJson = JSON.parse(responseText);
        }
      } catch (err) {
        console.warn(`[chat.llm] Failed to parse chatbot response as JSON:`, err);
      }

      return {
        status: response.status,
        ok: response.ok,
        json: responseJson,
      };
    } catch (e: any) {
      console.error(`[chat.llm] Fetch request inside makeRequest failed:`, e);
      throw e;
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
          categories: (p.categories ?? []).map((c) => c.name),
          description: p.description,
          aliases: p.aliases ?? [],
          productKeywords: p.productKeywords ?? [],
          active: p.active,
        }));

      result = await makeRequest(poiPayload);
    }

    if (!result.ok || !result.json) {
      console.warn(`[chat.llm] Chatbot service returned non-OK status (${result.status}) or empty JSON:`, result.json);
      return null;
    }

    const data = result.json as {
      reply?: string;
      lang?: "en" | "ar";
      action?: { type: "navigate" | "suggest"; poiId: string; floorLevel: number } | null;
      handoff?: string | null;
      clearPending?: boolean | null;
    };

    console.log(`[chat.llm] Parsed chatbot service response:`, JSON.stringify(data, null, 2));

    // A handoff turn intentionally has an empty reply — the backend answers it.
    if (data.handoff === "recommend") {
      console.log(`[chat.llm] Handoff intent detected: recommend. Delegating back to backend recommendation service.`);
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

    console.warn(`[chat.llm] Chatbot service returned empty reply string.`);
    return null;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[chat.llm] Request timed out calling chatbot service at ${serviceUrl} (limit ${timeoutMs}ms)`);
    } else {
      console.error(`[chat.llm] Exception encountered while contacting chatbot service:`, error);
    }
    return null;
  }
}
