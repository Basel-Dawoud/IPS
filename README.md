# Navimind Chatbot Service

FastAPI service that hosts the **Qwen2.5-3B + RAG chatbot brain** (ported from
`newchatbot/final_version_of_chatbot.py`) and runs it over the **Navimind POI
database**. It replaces the old `llm-service/` SmolLM sidecar.

The Navimind backend (`backend/src/modules/client/chat`) proxies each chat turn
to this service, passing the building's POIs inline. The service resolves the
message to a real POI and returns `{ reply, lang, action? }`, where `action`
drives the app's existing navigation handoff — no app changes required.

## How it works

- **Qwen2.5-3B via Ollama** (Q4_K_M GGUF, CPU, ~2–4 GB) for intent
  understanding, verification, and free-form replies (`llm.py`). Ollama handles
  CPU feature detection itself, so it runs on any x86-64 host — no per-CPU
  instruction-set surprises.
- **sentence-transformers** (`paraphrase-multilingual-MiniLM-L12-v2`) for
  semantic RAG search over POIs, plus a deterministic Arabic-aware alias/keyword
  fast-path (`catalog.py`, `text_utils.py`).
- **Orchestrator** (`brain.py`) mirrors the reference `chatbot_respond`: a
  yes/no confirmation flow ("want me to take you there?"), out-of-scope /
  chitchat guardrails, EN + MSA + Egyptian Arabic.

The POI embedding index is cached per building (keyed by a content hash) so it
is only rebuilt when the POI set changes.

## Setup (local dev)

1. **Install Ollama** (https://ollama.com) and pull the model:
   ```bash
   ollama pull qwen2.5:3b      # Q4_K_M by default, ~1.9 GB
   ```
   Ollama serves on `http://127.0.0.1:11434` by default.

2. **Python deps:**
   ```bash
   cd chatbot-service
   python -m venv venv
   # Windows: .\venv\Scripts\Activate.ps1   |   *nix: source venv/bin/activate
   pip install torch --index-url https://download.pytorch.org/whl/cpu
   pip install -r requirements.txt
   ```

3. **Run:**
   ```bash
   uvicorn app:app --host 127.0.0.1 --port 8000
   ```

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama server URL (compose sets `http://ollama:11434`) |
| `CHATBOT_LLM_MODEL` | `qwen2.5:3b` | Ollama model tag (use `qwen2.5:1.5b` for faster CPU) |
| `OLLAMA_TIMEOUT_S` | `60` | Per-request LLM timeout |
| `CHATBOT_SERVICE_TOKEN` | unset | Optional shared secret (see Security below) |

## Deploying on Coolify

Deployed as **one Coolify Docker Compose resource** bundling two containers —
`ollama` (the official image, serves Qwen) and `chatbot-service` (this app) —
defined in `docker-compose.yml`. Coolify puts both on one private network, so
`chatbot-service` reaches Ollama by service name (`http://ollama:11434`) with no
extra config. Using Ollama means **no model baked into the image and no CPU
instruction-set issues** — Ollama auto-detects the host CPU at runtime.

1. **Add New Resource → Docker Compose**, connect the Navimind Git repo (Public
   Repository, or GitHub App / Deploy Key if private).
2. Set **Base Directory** = `chatbot-service`, **Compose file** =
   `docker-compose.yml`.
3. (Optional) set `CHATBOT_LLM_MODEL` in the resource's env vars to pick a
   different Qwen size; leave `CHATBOT_SERVICE_TOKEN` unset for a private
   deployment. Memory limits are already set in the compose (`mem_limit`:
   4 GB for ollama, 2 GB for chatbot-service).
4. Deploy. **First boot is slow** — the `ollama` container pulls the ~2 GB
   model into the `ollama_data` volume (the compose healthcheck allows a 300 s
   start period). Watch the `ollama` container logs for the pull; subsequent
   restarts reuse the volume and start fast. Don't attach a public domain
   unless you're using the token auth below.
5. **Connecting the backend to it privately** (same Coolify server): enable
   **"Connect to Predefined Network"** on both this resource's and the
   backend's Service Stack pages. Coolify renames the `chatbot-service`
   container with a UUID suffix (`chatbot-service-<uuid>` — check the
   resource's container list for the exact name); set the backend's
   `CHATBOT_SERVICE_URL` to `http://chatbot-service-<uuid>:8000` and redeploy
   the backend. Two separate Coolify resources do **not** share a network by
   default — this step is required, not optional. (The ollama↔chatbot-service
   link needs nothing extra — they're in the same compose stack.)
6. If the backend ever lives elsewhere (different server / not Coolify), give
   this resource a public domain instead and set `CHATBOT_SERVICE_TOKEN` (see
   below) so it's not callable by anyone who finds the URL.

### Security: optional shared-secret token

`CHATBOT_SERVICE_TOKEN` is unset by default (fine for the private-network
setup above — the service is never internet-reachable). If you ever expose
this service on a public domain, set `CHATBOT_SERVICE_TOKEN` on this resource
and have the backend send it as an `X-Chatbot-Token` header on every request
(wire this into `backend/src/modules/client/chat/chat.llm.ts`'s `fetch()` call
and `backend/.env.example` when that need arises — not required for the
same-server / private-network deployment).

## API

- `GET /health` → `{ status, modelLoaded, model }`
- `POST /chat`
  ```json
  {
    "message": "where can I buy a laptop?",
    "buildingId": "bld_123",
    "lang": "en",
    "floorLevel": 3,
    "pendingPoiId": null,
    "pois": [
      { "id": "poi_1", "name": "Computer Systems Hub", "code": "351",
        "type": "STORE", "floorLevel": 3, "category": "Computers",
        "aliases": ["laptop", "pc", "لابتوب"], "productKeywords": ["laptop", "desktop"] }
    ]
  }
  ```
  →
  ```json
  { "reply": "Found it — Computer Systems Hub (floor 3, room 351) in the Computers section. 👍 Want me to guide you there?",
    "lang": "en",
    "action": { "type": "suggest", "poiId": "poi_1", "floorLevel": 3 } }
  ```
  The next turn, send the user's "yes" with `pendingPoiId: "poi_1"`; the service
  replies with an `action.type = "navigate"`.
