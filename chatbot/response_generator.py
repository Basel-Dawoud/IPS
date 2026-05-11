"""Generate chatbot responses based on intents and context."""
from models.store import RoomInfo, StoreMapper
from chatbot.intent_detector import IntentDetector


class ResponseGenerator:
    """Generates contextual responses for the chatbot."""

    def __init__(self):
        self.store_mapper = StoreMapper()

    def get_intro_message(self):
        """Get the chatbot introduction message."""
        stores = "\n".join([f"- {name} ({room})" for room, name in RoomInfo.get_all_rooms().items()])
        return (
            "Hello 👋 Welcome to the Mall Navigation Assistant.\n"
            "You can navigate to:\n"
            f"{stores}\n"
            "If you're hungry, you can go to the kitchen/dining or cafeteria-related stores."
        )

    def get_greeting(self, lang="en"):
        """Get greeting response."""
        if lang == "ar":
            return "أهلاً بك 👋 أنا مساعد SmartMall. أخبرني باسم المتجر أو رقم الغرفة، أو إلى أين تريد الذهاب."
        return "Hello 👋 Welcome to SmartMall! Tell me a store name, a room number, or where you want to go."

    def get_rejection_response(self, lang="en"):
        """Get response for user rejection."""
        if lang == "ar":
            return "ماشي، قولي لو محتاج حاجة تانية."
        return "Okay, let me know if you need anything else."

    def get_store_info_response(self, room, lang="en", suggest_nav=True):
        """Get store information response."""
        info = RoomInfo.get_info(room)
        if not suggest_nav:
            return info

        if lang == "ar":
            return f"{info}\n\nعايز أوديك هناك؟ قولي 'yes' أو 'ماشي'."
        return f"{info}\n\nWould you like me to take you there? Say 'yes' or 'ok'."

    def get_product_location_response(self, room, lang="en"):
        """Get product location response."""
        store_name = RoomInfo.get_name(room)
        if lang == "ar":
            return f"ده موجود في {store_name} (غرفة {room}). عايز أوديك هناك؟ قولي 'yes' أو 'ماشي'."
        return f"You can find that at {store_name} (Room {room}). Want me to take you there? Say 'yes' or 'ok'."

    def get_navigation_response(self, store_name, room, instructions, lang="en"):
        """Get navigation response with instructions."""
        if lang == "ar":
            reply = f"🗺️ تمام، هنروح {store_name} (غرفة {room})\n\n{instructions}"
            voice = f"تمام، هنروح {store_name}. {instructions.replace(chr(10), ' ')}"
        else:
            reply = f"🗺️ Navigating to {store_name} (Room {room})\n\n{instructions}"
            voice = f"Navigating to {store_name}. {instructions.replace(chr(10), ' ')}"
        return reply, voice

    def get_missing_location_response(self, lang="en"):
        """Get response when location is not set."""
        if lang == "ar":
            return "يرجى تحديد موقعك أولاً في تبويب التسوق والتنقل، أو أخبرني من أين تبدأ (مثال: من غرفة 350)."
        return "Please set your starting location in the Shop & Navigate tab first, or tell me where you are (e.g., 'from room 350')."

    def get_fallback_response(self, lang="en"):
        """Get fallback response when intent is unclear."""
        if lang == "ar":
            return "مش فاهم قصدك. قولي اسم المتجر، المنتج، أو رقم الغرفة."
        return "I'm not sure what you mean. Try mentioning a store name, product, or room number like 351."

    def get_thanks_response(self, lang="en"):
        """Get response for thanks."""
        return "You are welcome."

    def get_local_reply(self, text):
        """Try to generate a local reply without LLM."""
        low = (text or "").lower().strip()
        if not low:
            return "Please type a message or ask about a store."

        if any(w in low for w in ["thanks", "thank you"]):
            return "You are welcome."

        room = self.store_mapper.find_room_in_text(text)
        if room is not None and any(k in low for k in ["what", "tell", "about", "info", "describe", "where"]):
            info = RoomInfo.get_info(room)
            if info:
                return info

        return None
