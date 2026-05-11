"""Authentication tab UI component."""
import gradio as gr
from database import save_user, get_user
from utils import set_session_defaults, I18n


class AuthTab:
    """Handles login and signup UI."""

    def __init__(self, session_state):
        self.session_state = session_state

    def build(self):
        """Build the authentication tab interface."""
        with gr.Tab("🔐 LOGIN / SIGNUP"):
            gr.HTML("<div style='color:#00d4ff;font-family:monospace;font-size:13px;margin-bottom:16px'>Enter your credentials to begin</div>")

            with gr.Row():
                with gr.Column(scale=1):
                    auth_username = gr.Textbox(label="Username", placeholder="your_username")
                    auth_password = gr.Textbox(label="Password", type="password", placeholder="••••••••")
                    auth_name = gr.Textbox(label="Full Name (signup only)", placeholder="John Doe")
                    auth_age = gr.Number(label="Age (signup only)", value=25)
                    auth_gender = gr.Dropdown(["male", "female", "other"], label="Gender (signup only)", value="male")
                    special_needs = gr.Radio(["No", "Yes"], label="Are you a person with special needs?", value="No")
                    auth_budget_l = gr.Number(label="Min Budget EGP (signup only)", value=500)
                    auth_budget_h = gr.Number(label="Max Budget EGP (signup only)", value=5000)

                    with gr.Row():
                        signup_btn = gr.Button("SIGNUP", variant="primary")
                        login_btn = gr.Button("LOGIN", variant="secondary")

                    auth_status = gr.HTML()

            # Event handlers
            signup_btn.click(
                self._do_signup,
                [auth_username, auth_password, auth_name, auth_age, auth_gender, 
                 auth_budget_l, auth_budget_h, special_needs, self.session_state],
                [auth_status, self.session_state]
            )

            login_btn.click(
                self._do_login,
                [auth_username, auth_password, self.session_state],
                [auth_status, self.session_state]
            )

    def _do_signup(self, username, password, name, age, gender, low, high, special, session):
        """Handle signup logic."""
        if not username or not password:
            return I18n.get("signup_exists", "en"), session

        from database import user_exists
        if user_exists(username):
            return I18n.get("signup_exists", "en"), session

        special_flag = (special == "Yes")
        save_user(username, password, name, age, gender, low, high, special_flag)

        session = set_session_defaults(session)
        session.update({
            "username": username,
            "gender": gender,
            "low": low,
            "high": high,
            "is_new": True,
            "special_needs": special_flag,
            "nav_mode": "Special Needs" if special_flag else "Normal"
        })

        return I18n.get("signup_success", "en", name=name), session

    def _do_login(self, username, password, session):
        """Handle login logic."""
        user = get_user(username, password)
        if not user:
            return I18n.get("login_fail", "en"), session

        session = set_session_defaults(session)
        session.update({
            "username": user[0],
            "gender": user[4],
            "low": user[5],
            "high": user[6],
            "is_new": False,
            "special_needs": bool(user[7]) if len(user) > 7 else False
        })

        return I18n.get("login_success", "en", name=user[2]), session
