"""Navimind Chatbot Service (FastAPI).

Replaces the old llm-service SmolLM sidecar. Hosts the Qwen2.5-3B (Ollama, CPU
quantized) + RAG "brain" ported from newchatbot/. The Navimind backend proxies
each chat turn here, passing the building's POIs inline; this service resolves
the request to a real POI and returns {reply, lang, action?}.
"""
import logging
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

import llm
from catalog import get_catalog, get_embedder
from brain import respond

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chatbot_service")

app = FastAPI(title="Navimind Chatbot Service")


@app.on_event("startup")
def _preload_embedder():
    # Load the RAG embedder now, at container startup, so the first real
    # /chat request never pays for it (the model is baked into the image at
    # build time, so this is just moving weights into memory - no network).
    get_embedder()

# Optional shared-secret auth. Unset (the default for local/internal-network
# deployments) means no auth is enforced — this only matters if the service
# ever gets a public URL instead of staying on Coolify's private network.
_SERVICE_TOKEN = os.environ.get("CHATBOT_SERVICE_TOKEN", "").strip()


def require_token(x_chatbot_token: str | None = Header(default=None)):
    if _SERVICE_TOKEN and x_chatbot_token != _SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Chatbot-Token")


class PoiIn(BaseModel):
    id: str
    name: str = ""
    code: str | None = None
    type: str | None = None
    floorLevel: int = 0
    category: str | None = None
    description: str | None = None
    aliases: list[str] = []
    productKeywords: list[str] = []
    active: bool = True


class ChatRequest(BaseModel):
    message: str
    buildingId: str
    lang: str | None = None
    floorLevel: int | None = None
    pendingPoiId: str | None = None      # = the backend's incoming lastSuggestedPoiId
    pois: list[PoiIn] = []


class ChatAction(BaseModel):
    type: str
    poiId: str
    floorLevel: int


class ChatResponse(BaseModel):
    reply: str
    lang: str
    action: ChatAction | None = None
    # "recommend": the backend should answer this turn from its recommendation
    # engine (user history / ratings / position) instead of this reply.
    handoff: str | None = None
    # True when the pending suggest-offer was declined/consumed; the app clears
    # its lastSuggestedPoiId so a later bare "yes" can't revive a stale offer.
    clearPending: bool | None = None


@app.get("/health")
def health():
    ok = llm.model_available()
    return {"status": "ok" if ok else "degraded", "modelLoaded": ok, "model": llm.LLM_MODEL}


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_token)])
def chat(req: ChatRequest):
    pois = [p.model_dump() for p in req.pois]
    catalog = get_catalog(req.buildingId, pois)
    result = respond(
        message=req.message,
        catalog=catalog,
        pending_poi_id=req.pendingPoiId,
        lang=req.lang,
    )
    return ChatResponse(**result)
