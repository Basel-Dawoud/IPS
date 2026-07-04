"""Language detection, Arabic normalization, and deterministic confirmation/list
detection. Ported (trimmed) from newchatbot/final_version_of_chatbot.py — the
comments there explain the root causes each rule fixes; kept brief here.
"""
import re

# --- language -------------------------------------------------------------

def detect_language(text: str) -> str:
    if not text:
        return "en"
    if any("؀" <= c <= "ۿ" for c in str(text)):
        return "ar"
    return "en"


# --- Arabic normalization -------------------------------------------------
# Same letter can be written several visually-similar ways (أ/إ/آ/ا, ة/ه, ى/ي);
# normalize both stored aliases and incoming text to one canonical form before
# comparing, and collapse doubled letters (a common typo/mic-transcription
# artifact) so we don't need a stored variant for every spelling.
_ARABIC_DIACRITICS_RE = re.compile(r"[ؗ-ًؚ-ْٰ]")
_ARABIC_REPEAT_RE = re.compile(r"([؀-ۿ])\1+")


def normalize_arabic(text: str) -> str:
    if not text:
        return ""
    t = str(text)
    t = _ARABIC_DIACRITICS_RE.sub("", t)
    t = re.sub(r"[إأآا]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    t = _ARABIC_REPEAT_RE.sub(r"\1", t)
    return t


def norm(text: str) -> str:
    return normalize_arabic(str(text or "").lower())


def phrase_matches(phrase_norm: str, text_norm: str) -> bool:
    """Whole-word check for an alias phrase against normalized text. Multi-word
    phrases match word-by-word (each word present somewhere) so Arabic's
    definite article 'ال' on either word doesn't break a contiguous check;
    single words match as whole tokens so a short alias can't match inside an
    unrelated longer word."""
    text_words = set(re.findall(r"[؀-ۿa-zA-Z0-9]+", text_norm))
    words = [w for w in phrase_norm.split() if w]
    if not words:
        return False
    if len(words) == 1:
        return words[0] in text_words
    return all(w in text_norm for w in words)


# --- deterministic yes/no confirmation ------------------------------------
YES_WORDS = {"yes", "yeah", "yep", "sure", "ok", "okay", "ايوه", "ايوة", "اه",
             "ااه", "تمام", "ماشي", "يلا", "اكيد", "اوك", "نعم", "اوكي"}
NO_WORDS = {"no", "nope", "nah", "لا", "لأ", "مش عايز", "مش محتاج", "خلاص"}


_LATIN_REPEAT_RE = re.compile(r"([a-z])\1+")


def _clean_for_confirmation(text: str) -> str:
    t = norm(text)
    t = re.sub(r"[^\w\s]", "", t).strip()
    # Collapse repeated Latin letters ("Yepppp" -> "yep", "okkk" -> "ok") the
    # same way normalize_arabic collapses "ايوووه" -> "ايوه". The YES/NO word
    # sets pass through this same function, so comparison stays consistent.
    return _LATIN_REPEAT_RE.sub(r"\1", t)


def detect_yes_no(text: str):
    """Only fires on a short standalone confirmation phrase (<=3 tokens) so it
    can never swallow a genuine new request that merely contains a filler word
    like 'تمام'."""
    normed = _clean_for_confirmation(text)
    if not normed or len(normed.split()) > 3:
        return None
    yes = {_clean_for_confirmation(w) for w in YES_WORDS}
    no = {_clean_for_confirmation(w) for w in NO_WORDS}
    if normed in yes:
        return "yes"
    if normed in no:
        return "no"
    return None


# --- "list what you have" hints -------------------------------------------
_LIST_HINTS = [norm(h) for h in [
    "انواع", "ماركات", "براندات", "براند", "متوفر", "متاحه", "عندكم ايه",
    "انهي نوع", "what types", "which brands", "list of", "options available",
    "what do you have", "show me all",
]]


def looks_like_list_query(text: str) -> bool:
    low = norm(text)
    return any(h in low for h in _LIST_HINTS)


# --- tokenization for the keyword index -----------------------------------
_STOPWORDS = {
    "and", "the", "of", "for", "with", "unit", "units", "set", "sets", "store",
    "shop", "device", "devices", "system", "systems", "machine", "machines",
    "room", "section", "want", "need", "buy", "find", "get", "where", "please",
}


def tokenize(text: str):
    return [t for t in re.findall(r"[a-zA-Z]+", str(text).lower())
            if len(t) >= 3 and t not in _STOPWORDS]


def singular(token: str) -> str:
    return token[:-1] if token.endswith("s") and len(token) > 3 else token
