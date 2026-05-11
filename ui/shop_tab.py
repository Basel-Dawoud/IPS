"""Shop & Navigate tab UI component."""
import gradio as gr
from utils import set_session_defaults, I18n
from models.store import RoomInfo, StoreMapper
from navigation import GridManager, Pathfinder, InstructionGenerator
from recommendation import StoreRecommender, ProductRecommender
from database import save_navigation_history
from config import NAV_MODES, MEMORY_FILE, STORE_CLUSTER, STORE_CLUSTER_ROOM


class ShopTab:
    """Handles shopping, navigation, and product recommendation UI."""

    def __init__(self, session_state, categories_data):
        self.session_state = session_state
        self.categories_data = categories_data
        self.grid_mgr = GridManager()
        self.pathfinder = Pathfinder(self.grid_mgr)
        self.instruction_gen = InstructionGenerator(self.grid_mgr)
        self.store_rec = StoreRecommender()
        self.product_rec = ProductRecommender()
        self.store_mapper = StoreMapper()

    def build(self):
        """Build the shop & navigate tab interface."""
        with gr.Tab("🏪 SHOP & NAVIGATE"):
            gr.HTML("<div style='color:#00d4ff;font-family:monospace;font-size:13px;margin-bottom:16px'>Get store recommendations and navigate</div>")

            # Location setting
            gr.HTML("<div style='color:#888;font-family:monospace;font-size:11px;margin-bottom:8px'>STEP 0 — SET YOUR LOCATION</div>")
            with gr.Row():
                loc_x = gr.Number(label="X Coordinate")
                loc_y = gr.Number(label="Y Coordinate")
                loc_floor = gr.Dropdown(["3", "4"], label="Floor", value="3")
                set_loc_btn = gr.Button("📍 Set Location")
            loc_status = gr.HTML()

            with gr.Row():
                with gr.Column(scale=1):
                    # Recommendation section
                    gr.HTML("<div style='color:#888;font-family:monospace;font-size:11px;margin-bottom:8px'>STEP 1 — GET RECOMMENDATION</div>")
                    recommend_btn = gr.Button("🎯 Get Store Recommendation", variant="primary")
                    rec_result_html = gr.HTML()
                    rec_agree = gr.Radio(["✅ Yes, navigate me there", "❌ No, I'll choose my own"], 
                                         label="Accept recommendation?")

                    # Category selection
                    gr.HTML("<div style='color:#888;font-family:monospace;font-size:11px;margin-top:20px;margin-bottom:8px'>STEP 2 — CHOOSE CATEGORY</div>")
                    cat_type = gr.Dropdown([t["type"] for t in self.categories_data], label="Main Category")
                    cat_cat = gr.Dropdown([], label="Category")
                    cat_sub = gr.Dropdown([], label="Sub-Category")
                    nav_mode = gr.Dropdown(NAV_MODES, label="Navigation Mode", value="Normal")
                    danger_room = gr.Textbox(label="Fire/Crowded Room Number", placeholder="Example: 350")
                    navigate_btn = gr.Button("🗺️ Start Navigation", variant="primary")

                with gr.Column(scale=1):
                    nav_instructions = gr.Textbox(label="Navigation Instructions", lines=10, interactive=False)
                    nav_image = gr.Image(label="Mall Map", type="filepath")

            # Product recommendations
            gr.HTML("<div style='color:#888;font-family:monospace;font-size:11px;margin-top:20px;margin-bottom:8px'>STEP 3 — PRODUCT RECOMMENDATIONS</div>")
            with gr.Row():
                prod_type = gr.Dropdown([], label="Category Type")
                prod_cat = gr.Dropdown([], label="Category")
                prod_sub = gr.Dropdown([], label="Sub-Category")
            get_products_btn = gr.Button("🛍️ Get Product Recommendations", variant="primary")
            products_html = gr.HTML()

            # Event handlers
            set_loc_btn.click(
                self._set_location,
                [loc_x, loc_y, loc_floor, self.session_state],
                [loc_status, self.session_state]
            )

            recommend_btn.click(
                self._get_recommendation,
                [self.session_state],
                [rec_result_html, self.session_state]
            )

            rec_agree.change(
                self._handle_agreement,
                [rec_agree, self.session_state],
                [cat_type, cat_cat, cat_sub, prod_type]
            )

            cat_type.change(self._update_cat, [cat_type], [cat_cat])
            cat_cat.change(self._update_sub, [cat_type, cat_cat], [cat_sub])
            prod_type.change(self._update_cat, [prod_type], [prod_cat])
            prod_cat.change(self._update_sub, [prod_type, prod_cat], [prod_sub])

            navigate_btn.click(
                self._do_navigate,
                [rec_agree, cat_type, cat_cat, cat_sub, nav_mode, danger_room, self.session_state],
                [nav_instructions, nav_image]
            )

            get_products_btn.click(
                self._get_products,
                [prod_type, prod_cat, prod_sub, self.session_state],
                [products_html]
            )

    def _set_location(self, x, y, floor_choice, session):
        """Set user location."""
        session = set_session_defaults(session)
        if x is None or y is None:
            return I18n.get("set_location", "en"), session

        session["start_floor"] = 0 if str(floor_choice) == "3" else 1
        session["start_xy"] = (float(x), float(y))

        return I18n.get("location_saved", "en", floor=floor_choice, x=x, y=y), session

    def _get_recommendation(self, session):
        """Get store recommendation."""
        session = set_session_defaults(session)
        if not session.get("username"):
            return I18n.get("login_first", "en"), session
        if session.get("start_xy") is None:
            return I18n.get("set_location", "en"), session

        room, store_name, msg = self.store_rec.recommend_for_user(
            session["username"],
            session["start_xy"],
            session["start_floor"],
            session.get("is_new", True)
        )

        session["recommended_room"] = room
        session["nav_target_room"] = room
        session["last_referenced_room"] = room
        session["last_dest_room"] = room

        html = f"""
        <div style="background:linear-gradient(135deg,#1a1a2e,#0d2137);border:1px solid #00d4ff55;
                    border-radius:12px;padding:20px;font-family:monospace;">
          <div style="color:#888;font-size:11px;letter-spacing:2px">{msg}</div>
          <div style="color:#00d4ff;font-size:22px;font-weight:bold;margin:8px 0">{store_name}</div>
          <div style="color:#555;font-size:12px">Room {room}</div>
        </div>"""
        return html, session

    def _handle_agreement(self, choice, session):
        """Handle recommendation acceptance."""
        session = set_session_defaults(session)
        session["accepted_store"] = (choice or "").startswith("✅")
        types = [t["type"] for t in self.categories_data]

        if session["accepted_store"]:
            return gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), gr.update(choices=types, visible=True)
        return gr.update(choices=types, visible=True), gr.update(visible=True), gr.update(visible=True), gr.update(choices=types, visible=True)

    def _update_cat(self, type_name):
        """Update category dropdown."""
        cats = self.product_rec.get_categories_for_type(type_name, self.categories_data)
        return gr.update(choices=cats, value=None)

    def _update_sub(self, type_name, cat_name):
        """Update subcategory dropdown."""
        subs = self.product_rec.get_subcategories(type_name, cat_name, self.categories_data)
        return gr.update(choices=subs, value=None)

    def _do_navigate(self, choice, type_name, cat_name, sub_name, nav_mode_val, danger_room, session):
        """Execute navigation."""
        session = set_session_defaults(session)

        if not session.get("username"):
            return I18n.get("login_first", "en"), None
        if session.get("start_xy") is None:
            return I18n.get("set_location", "en"), None

        self.grid_mgr.reset_grids()

        # Determine destination
        if "Yes" in (choice or ""):
            dest_room = session.get("recommended_room")
            if dest_room is None:
                return I18n.get("navigate_first", "en"), None
        else:
            if not sub_name:
                return I18n.get("select_subcategory", "en"), None

            # Use the store mapper to resolve category to room
            parent = self.store_mapper.sub_to_category.get(sub_name, cat_name)
            store = STORE_CLUSTER.get(parent, parent)
            dest_room = STORE_CLUSTER_ROOM.get(store)

            if dest_room is None:
                return I18n.get("category_not_mapped", "en"), None

        session["dest_room"] = dest_room

        # Navigation mode
        effective_mode = "Special Needs" if session.get("special_needs") else nav_mode_val
        session["nav_mode"] = effective_mode

        # Danger/crowd handling
        room_val = None
        try:
            if danger_room is not None and str(danger_room).strip() != "":
                room_val = int(float(danger_room))
        except:
            room_val = None

        self.grid_mgr.clear_danger()

        if effective_mode == "Fire" and room_val is not None and room_val in RoomInfo.get_all_rooms():
            centroid = self.pathfinder.get_centroid(room_val)
            if centroid:
                self.grid_mgr.activate_fire(room_val, centroid)

        if effective_mode == "Crowded" and room_val is not None and room_val in RoomInfo.get_all_rooms():
            centroid = self.pathfinder.get_centroid(room_val)
            if centroid:
                self.grid_mgr.activate_crowd(room_val, centroid)

        # Save history
        save_navigation_history(
            session["username"],
            (session["start_floor"], session["start_xy"]),
            dest_room
        )

        # Execute navigation
        start, goal, error = self.pathfinder.prepare_points(
            session["start_floor"],
            session["start_xy"],
            dest_room
        )

        if error:
            return error, None

        path = self.pathfinder.find_path(start, goal, effective_mode)
        instructions = self.instruction_gen.path_to_instructions(path)

        img_path = None
        if path:
            img_path = self.instruction_gen.plot_path(path)

        return instructions, img_path

    def _get_products(self, type_name, cat_name, sub_name, session):
        """Get product recommendations."""
        session = set_session_defaults(session)
        if not session.get("username"):
            return I18n.get("login_first", "en")
        if not sub_name:
            return I18n.get("select_subcategory", "en")

        from database import save_preference
        if type_name and cat_name and sub_name:
            save_preference(session["username"], (type_name, cat_name, sub_name))

        gender = session.get("gender", "other")
        low = session.get("low", 500)
        high = session.get("high", 5000)

        result = self.product_rec.recommend(sub_name, gender, low, high)
        session["selected_subcategory"] = sub_name

        return self.product_rec.format_products_html(result["products"], result["store"], result["room"])
