"""AI Assistant chat tab UI component."""
import gradio as gr
from utils import set_session_defaults, VoiceManager, I18n
from models.store import RoomInfo, StoreMapper
from navigation import GridManager, Pathfinder, InstructionGenerator
from database import save_navigation_history
from chatbot.intent_detector import IntentDetector
from chatbot.response_generator import ResponseGenerator
from chatbot.llm_fallback import LLMFallback
from config import MEMORY_FILE
import json


class ChatTab:
    """Handles chatbot UI and conversation logic."""

    def __init__(self, session_state):
        self.session_state = session_state
        self.grid_mgr = GridManager()
        self.pathfinder = Pathfinder(self.grid_mgr)
        self.instruction_gen = InstructionGenerator(self.grid_mgr)
        self.response_gen = ResponseGenerator()
        self.store_mapper = StoreMapper()
        self.llm = LLMFallback()
        self._load_memory()

    def _load_memory(self):
        """Load navigation memory."""
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                self.user_memory = json.load(f)
        except:
            self.user_memory = []
        self.navigation_counter = len(self.user_memory) + 1

    def _save_memory(self):
        """Save navigation memory."""
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(self.user_memory, f, indent=4)

    def build(self):
        """Build the chat tab interface."""
        with gr.Tab("🤖 AI ASSISTANT"):
            gr.HTML("<div style='color:#00d4ff;font-family:monospace;font-size:13px;margin-bottom:16px'>Chat with the mall AI assistant (English, Arabic, Egyptian slang)</div>")

            chatbot_widget = gr.Chatbot(
                label="SmartMall Assistant", height=480,
                value=[("", "👋 Welcome to SmartMall! I understand English, Arabic, and Egyptian slang. Ask me about any store or product, or say 'take me to room 351' / 'عايز اروح غرفة 351'.")],
            )

            with gr.Row():
                chat_msg = gr.Textbox(placeholder="Ask me anything about the mall...", label="Message", scale=4)
                chat_mic = gr.Audio(source="microphone", type="filepath", label="🎤", scale=1)

            chat_audio_out = gr.Audio(label="Voice Response")
            chat_img_out = gr.Image(label="Navigation Map", type="filepath")

            # Event handlers
            chat_msg.submit(
                self._chat_respond,
                [chat_msg, chatbot_widget, self.session_state],
                [chatbot_widget, chat_img_out, chat_audio_out, self.session_state]
            )

            chat_mic.change(
                self._voice_chat,
                [chat_mic, chatbot_widget, self.session_state],
                [chatbot_widget, chat_img_out, chat_audio_out, self.session_state]
            )

    def _chat_respond(self, msg, history, session):
        """Handle chat message response."""
        if not msg or not msg.strip():
            return history, None, None, session

        history, img, audio, session = self._process_message(msg, history, session)
        return history, img, audio, session

    def _voice_chat(self, audio, history, session):
        """Handle voice input."""
        text = VoiceManager.speech_to_text(audio)
        if not text:
            history.append(("🎤 [voice]", "Sorry, I couldn't understand the audio."))
            return history, None, None, session
        return self._chat_respond(text, history, session)

    def _process_message(self, user_text, history, session):
        """Process a chat message and generate response."""
        session = set_session_defaults(session)
        history = history or []

        lower = str(user_text or "").lower().strip()
        lang = IntentDetector.detect_language(user_text)

        # 0. Greetings
        if IntentDetector.is_greeting(user_text):
            reply = self.response_gen.get_greeting(lang)
            history.append((user_text, reply))
            audio = VoiceManager.text_to_speech(reply, lang)
            return history, None, audio, session

        # Extract rooms
        explicit_start, explicit_dest = self.store_mapper.extract_start_and_dest(user_text)
        any_room = self.store_mapper.find_room_in_text(user_text)
        if explicit_dest is None and any_room:
            explicit_dest = any_room

        # Check agreement
        is_agree = IntentDetector.is_agreement(user_text)
        if is_agree and explicit_dest is None:
            explicit_dest = (
                session.get("last_referenced_room")
                or session.get("last_dest_room")
                or session.get("nav_target_room")
                or session.get("chat_dest_room")
            )

        # Intent detection
        is_strong_nav = IntentDetector.is_strong_navigation(user_text)
        wants_info = IntentDetector.is_info_request(user_text)
        wants_product = IntentDetector.is_product_request(user_text)
        wants_nav = is_strong_nav or (is_agree and explicit_dest is not None)

        if IntentDetector.is_go_for_shopping(user_text):
            wants_nav = False
            wants_product = True

        # Handle rejection
        if IntentDetector.is_rejection(user_text):
            reply = self.response_gen.get_rejection_response(lang)
            history.append((user_text, reply))
            audio = VoiceManager.text_to_speech(reply, lang)
            return history, None, audio, session

        # Info about store
        if wants_info and explicit_dest and not is_strong_nav:
            reply = self.response_gen.get_store_info_response(explicit_dest, lang)
            session["last_referenced_room"] = explicit_dest
            session["chat_dest_room"] = explicit_dest
            history.append((user_text, reply))
            audio = VoiceManager.text_to_speech(reply, lang)
            return history, None, audio, session

        # Product query
        if wants_product and explicit_dest and not is_strong_nav and not is_agree:
            store_name = RoomInfo.get_name(explicit_dest)
            session["last_referenced_room"] = explicit_dest
            session["chat_dest_room"] = explicit_dest
            if lang == "ar":
                reply = f"ده موجود في {store_name} (غرفة {explicit_dest}). عايز أوديك هناك؟ قولي 'yes' أو 'ماشي'."
            else:
                reply = f"You can find that at {store_name} (Room {explicit_dest}). Want me to take you there? Say 'yes' or 'ok'."
            history.append((user_text, reply))
            audio = VoiceManager.text_to_speech(reply, lang)
            return history, None, audio, session

        # Navigation
        if wants_nav and explicit_dest is not None:
            return self._handle_navigation(user_text, explicit_dest, explicit_start, history, session, lang)

        # Fallback
        local = self.response_gen.get_local_reply(user_text)
        if local:
            room = self.store_mapper.find_room_in_text(user_text)
            if room:
                session["last_referenced_room"] = room
                session["chat_dest_room"] = room
            history.append((user_text, local))
            audio = VoiceManager.text_to_speech(local, lang)
            return history, None, audio, session

        # LLM fallback
        reply = self.response_gen.get_fallback_response(lang)
        llm_reply = self.llm.generate_reply(user_text, lang)
        if llm_reply:
            reply = llm_reply

        history.append((user_text, reply))
        audio = VoiceManager.text_to_speech(reply, lang)
        return history, None, audio, session

    def _handle_navigation(self, user_text, dest_room, explicit_start, history, session, lang):
        """Handle navigation request."""
        store_name = RoomInfo.get_name(dest_room)

        # Resolve start point
        start_floor, start_xy = None, None

        if explicit_start is not None:
            start_floor = RoomInfo.get_floor(explicit_start)
            start_xy = self.pathfinder.get_centroid(explicit_start)

        if start_xy is None:
            start_floor = session.get("start_floor")
            start_xy = session.get("start_xy")

        if start_xy is None:
            start_floor = session.get("chat_start_floor")
            start_xy = session.get("chat_start_xy")

        if start_floor is None or start_xy is None:
            reply = self.response_gen.get_missing_location_response(lang)
            history.append((user_text, reply))
            audio = VoiceManager.text_to_speech(reply, lang)
            return history, None, audio, session

        # Navigation mode
        nav_mode = "Special Needs" if session.get("special_needs") else session.get("nav_mode", "Normal")

        # Execute navigation
        start, goal, error = self.pathfinder.prepare_points(start_floor, start_xy, dest_room)
        if error:
            history.append((user_text, error))
            return history, None, None, session

        path = self.pathfinder.find_path(start, goal, nav_mode)
        instructions = self.instruction_gen.path_to_instructions(path)

        # Save history
        save_navigation_history(session.get("username", "guest"), (start_floor, start_xy), dest_room)

        # Update memory
        entry = {
            "nav_id": f"N{self.navigation_counter}",
            "start_room": f"floor={start_floor},x={start_xy[0]},y={start_xy[1]}",
            "dest_room": dest_room,
        }
        self.user_memory.append(entry)
        self._save_memory()
        self.navigation_counter += 1

        # Update session
        dest_centroid = self.pathfinder.get_centroid(dest_room)
        if dest_centroid:
            session["chat_start_floor"] = RoomInfo.get_floor(dest_room)
            session["chat_start_xy"] = dest_centroid
        session["chat_dest_room"] = dest_room
        session["last_dest_room"] = dest_room
        session["last_referenced_room"] = dest_room

        # Build response
        reply, voice = self.response_gen.get_navigation_response(store_name, dest_room, instructions, lang)

        history.append((user_text, reply))
        audio = VoiceManager.text_to_speech(voice, lang)

        img_path = None
        if path:
            img_path = self.instruction_gen.plot_path(path)

        return history, img_path, audio, session
