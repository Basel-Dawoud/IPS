"""Main Gradio application builder."""
import gradio as gr
from ui.auth_tab import AuthTab
from ui.shop_tab import ShopTab
from ui.chat_tab import ChatTab
from utils import load_json_file
from config import CATEGORIES_FILE


class SmartMallApp:
    """Main application class that assembles all UI components."""

    def __init__(self):
        self.categories_data = load_json_file(CATEGORIES_FILE, [])
        self.session_state = gr.State({})

    def build(self):
        """Build and return the complete Gradio interface."""
        with gr.Blocks(
            theme=gr.themes.Base(primary_hue="cyan", secondary_hue="blue", neutral_hue="slate"),
            css="""
            body { background: #0a0a14 !important; }
            .gradio-container { background: #0a0a14 !important; max-width: 1200px !important; }
            .tab-nav button { font-family: monospace; letter-spacing: 2px; font-size: 12px; }
            .panel { background: #111827; border: 1px solid #1e3a5f; border-radius: 12px; padding: 20px; }
            h1, h2, h3 { font-family: monospace !important; letter-spacing: 3px !important; }
            footer { display: none !important; }
            """,
            title="SmartMall AI System",
        ) as demo:

            # Header
            gr.HTML("""
            <div style="text-align:center;padding:24px 0 8px;font-family:monospace;">
              <div style="font-size:28px;font-weight:900;letter-spacing:6px;
                          background:linear-gradient(90deg,#00d4ff,#00ff88,#ff4466);
                          -webkit-background-clip:text;-webkit-text-fill-color:transparent">
                SMART MALL AI
              </div>
              <div style="color:#555;font-size:11px;letter-spacing:4px;margin-top:6px">
                NAVIGATION · RECOMMENDATIONS · ASSISTANT
              </div>
            </div>
            """)

            # Build tabs
            with gr.Tabs():
                auth_tab = AuthTab(self.session_state)
                auth_tab.build()

                shop_tab = ShopTab(self.session_state, self.categories_data)
                shop_tab.build()

                chat_tab = ChatTab(self.session_state)
                chat_tab.build()

            # Initialize dropdowns on load
            def init_dropdowns():
                types = [t["type"] for t in self.categories_data]
                return gr.update(choices=types), gr.update(choices=types)

            # Note: demo.load needs proper outputs - we'll skip auto-init for simplicity
            # The dropdowns will initialize when users interact with them

        return demo


def create_app():
    """Factory function to create and return the app."""
    app = SmartMallApp()
    return app.build()
