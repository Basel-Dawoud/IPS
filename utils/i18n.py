"""Internationalization support."""


class I18n:
    """Simple i18n helper for bilingual support (EN/AR)."""

    MESSAGES = {
        "welcome": {
            "en": "Hello 👋 Welcome to SmartMall! Tell me a store name, a room number, or where you want to go.",
            "ar": "أهلاً بك 👋 أنا مساعد SmartMall. أخبرني باسم المتجر أو رقم الغرفة، أو إلى أين تريد الذهاب."
        },
        "login_first": {
            "en": "❌ Please login first.",
            "ar": "❌ يرجى تسجيل الدخول أولاً."
        },
        "set_location": {
            "en": "❌ Please enter your current location first.",
            "ar": "❌ يرجى إدخال موقعك الحالي أولاً."
        },
        "location_saved": {
            "en": "✅ Location saved: floor {floor}, x={x}, y={y}",
            "ar": "✅ تم حفظ الموقع: الدور {floor}, x={x}, y={y}"
        },
        "no_products": {
            "en": "❌ No products found in your budget range.",
            "ar": "❌ لم يتم العثور على منتجات في نطاق ميزانيتك."
        },
        "select_subcategory": {
            "en": "❌ Please select a sub-category.",
            "ar": "❌ يرجى اختيار فئة فرعية."
        },
        "navigate_first": {
            "en": "❌ Please get a recommendation first.",
            "ar": "❌ يرجى الحصول على توصية أولاً."
        },
        "category_not_mapped": {
            "en": "❌ Could not map the selected category to a store.",
            "ar": "❌ لم يتمكن من ربط الفئة المختارة بمتجر."
        },
        "thanks": {
            "en": "You are welcome.",
            "ar": "عفواً."
        },
        "not_understood": {
            "en": "I'm not sure what you mean. Try mentioning a store name, product, or room number like 351.",
            "ar": "مش فاهم قصدك. قولي اسم المتجر، المنتج، أو رقم الغرفة."
        },
        "signup_exists": {
            "en": "❌ Username already exists.",
            "ar": "❌ اسم المستخدم موجود بالفعل."
        },
        "signup_success": {
            "en": "✅ Welcome, {name}! Account created.",
            "ar": "✅ أهلاً بك، {name}! تم إنشاء الحساب."
        },
        "login_success": {
            "en": "✅ Welcome back, {name}!",
            "ar": "✅ أهلاً بعودتك، {name}!"
        },
        "login_fail": {
            "en": "❌ Invalid credentials.",
            "ar": "❌ بيانات الاعتماد غير صالحة."
        },
    }

    @classmethod
    def get(cls, key, lang="en", **kwargs):
        """Get translated message."""
        msg = cls.MESSAGES.get(key, {}).get(lang, cls.MESSAGES.get(key, {}).get("en", key))
        return msg.format(**kwargs) if kwargs else msg

    @staticmethod
    def detect_language(text):
        """Detect if text contains Arabic characters."""
        if not text:
            return "en"
        if any("\u0600" <= c <= "\u06FF" for c in str(text)):
            return "ar"
        return "en"
