FROM python:3.11-slim

WORKDIR /app

# CPU-only torch wheel first, on its own layer — it's the largest dependency
# (needed by sentence-transformers for the RAG embedder) and rarely changes,
# so this keeps rebuilds fast when only app code changes.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the RAG embedder at build time and bake it into this layer, so
# the running container never needs network access to Hugging Face (that was
# costing ~15-20s on the first /chat after every restart/redeploy, plus risked
# HF's unauthenticated rate limit). Must match EMBED_MODEL_NAME in catalog.py.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

COPY . .

# The Qwen model is served by a separate Ollama container (see
# docker-compose.yml) reached at OLLAMA_URL — this image ships no model and
# does no LLM compilation, so it stays small and builds fast.
ENV PYTHONUNBUFFERED=1 \
    USE_TF=0 \
    OLLAMA_URL=http://ollama:11434

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=5).status==200 else 1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
