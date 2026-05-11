"""Intent detection and entity extraction for chatbot."""


class IntentDetector:
    """Detects user intents from chat messages."""

    # Navigation intent keywords
    NAV_KEYWORDS = [
        "go to", "take me to", "navigate to", "guide me to", "directions to", "path to",
        "how to reach", "send me to", "show me the way to", "walk me to", "move to",
        "i want to go", "want to go", "need to go", "get me to", "let's go", "lets go",
        "from", "من", "اذهب", "اخذني", "دلني", "طريق", "وديني", "عايز اروح", "عاوز اروح",
        "هيا بنا", "مشي", "روح", "إلى", "الي", "لـ", "لغرفة", "عايز انزل", "هنروح",
    ]

    # Product/shopping keywords
    PRODUCT_KEYWORDS = [
        "buy", "looking for", "where can i find", "i want", "searching", "do you have",
        "need", "want to purchase", "shopping", "get me", "find",
        "اشتري", "ابحث", "اين اجد", "عايز", "عاوز", "فين", "عندكم", "محتاج",
        "جيب", "هاشتري", "عايز انزل اشتري", "دور على", "لو سمحت"
    ]

    # Agreement keywords
    AGREE_PHRASES = [
        "take me there", "guide me there", "go there", "navigate me there",
        "lets go", "let's go", "yes take me", "yes navigate", "please do", "do it",
        "navigate", "mashi", "tamam",
        "اخذني هناك", "اذهب هناك", "هيا بنا", "تمام", "ماشي", "فضل",
        "يلا بينا", "وديني", "روح بيا", "هنروح", "كمل", "يسطا"
    ]

    AGREE_WORDS = ["ok", "okay", "yes", "sure", "go", "نعم", "اوكي"]

    # Info request keywords
    INFO_KEYWORDS = [
        "what is", "tell me about", "info about", "describe", "where is", "about",
        "information", "ما هو", "اخبرني", "معلومات", "وصف", "اين", "عن", "مكان",
        "ايه", "ايه هو", "فين مكان", "عايز اعرف", "اقولي"
    ]

    # Greeting keywords
    GREETINGS_EN = ["hi", "hello", "hey", "good morning", "good evening", "how are you"]
    GREETINGS_AR = ["مرحبا", "السلام عليكم", "هاي", "أهلا", "اهلا", "صباح الخير", "مساء الخير", "هلا"]

    # Rejection keywords
    REJECT_KEYWORDS = ["no", "لا", "لأ", "مش دلوقتي", "not now"]

    @classmethod
    def detect_language(cls, text):
        """Detect if text is Arabic or English."""
        if not text:
            return "en"
        if any("\u0600" <= c <= "\u06FF" for c in str(text)):
            return "ar"
        return "en"

    @classmethod
    def is_strong_navigation(cls, text):
        """Check if user explicitly wants to navigate."""
        low = str(text or "").lower()
        return any(w in low for w in cls.NAV_KEYWORDS)

    @classmethod
    def is_product_request(cls, text):
        """Check if user is asking about a product."""
        low = str(text or "").lower()
        return any(w in low for w in cls.PRODUCT_KEYWORDS)

    @classmethod
    def is_agreement(cls, text):
        """Check if user agrees to a suggestion."""
        low = str(text or "").lower().strip()
        if any(w in low for w in cls.AGREE_PHRASES):
            return True
        words = low.split()
        return any(w in words for w in cls.AGREE_WORDS)

    @classmethod
    def is_info_request(cls, text):
        """Check if user wants store information."""
        low = str(text or "").lower()
        return any(w in low for w in cls.INFO_KEYWORDS)

    @classmethod
    def is_greeting(cls, text):
        """Check if text is a greeting."""
        low = str(text or "").lower()
        return any(w in low for w in cls.GREETINGS_EN) or any(w in low for w in cls.GREETINGS_AR)

    @classmethod
    def is_rejection(cls, text):
        """Check if user is rejecting a suggestion."""
        low = str(text or "").lower()
        return any(w in low for w in cls.REJECT_KEYWORDS)

    @classmethod
    def is_go_for_shopping(cls, text):
        """Check if 'go for' means shopping, not navigation."""
        return "go for" in str(text or "").lower()
