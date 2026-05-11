"""Local LLM fallback for chatbot responses."""


class LLMFallback:
    """Manages local LLM as fallback for chatbot."""

    _instance = None
    _pipe = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._pipe is not None:
            return
        try:
            from transformers import pipeline
            print("⏳ Loading fast local model (SmolLM2-135M-Instruct)...")
            self._pipe = pipeline(
                "text-generation",
                model="HuggingFaceTB/SmolLM2-135M-Instruct",
                max_new_tokens=80,
                do_sample=False,
                return_full_text=False,
            )
            print("✅ Local LLM ready.")
        except Exception as e:
            print(f"⚠️ Could not load local LLM: {e}")
            self._pipe = None

    def generate_reply(self, user_text, lang="en"):
        """Generate a reply using the local LLM."""
        if self._pipe is None:
            return None

        try:
            if lang == "ar":
                prompt = (
                    f"<|im_start|>user\nأنت مساعد ذكي في مول تجاري. رد باختصار جداً على: {user_text}\n"
                    f"<|im_start|>assistant\n"
                )
            else:
                prompt = (
                    f"<|im_start|>user\nYou are a smart mall assistant. Reply very briefly to: {user_text}\n"
                    f"<|im_start|>assistant\n"
                )

            out = self._pipe(prompt)[0]["generated_text"].strip()
            out = out.split("\n")[0].split("<|im_start|>")[0].strip()
            return out if len(out) > 5 else None
        except Exception:
            return None
