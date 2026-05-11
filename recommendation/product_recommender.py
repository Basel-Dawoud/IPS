"""Product recommendation with filtering and promotions."""
import json
import random
from models.product import ProductRecommender as ProductModel
from models.store import StoreMapper
from config import SUB_TO_CATEGORY, STORE_CLUSTER, STORE_CLUSTER_ROOM


class ProductRecommender:
    """High-level product recommendation interface."""

    def __init__(self):
        self.product_model = ProductModel()
        self.store_mapper = StoreMapper()

    def recommend(self, subcategory, gender, low_budget, high_budget):
        """Get product recommendations for a subcategory."""
        return self.product_model.recommend(subcategory, gender, low_budget, high_budget)

    def get_categories_for_type(self, type_name, categories_data):
        """Get categories for a main type."""
        for t in categories_data:
            if t.get("type") == type_name:
                return [c.get("category") for c in t.get("categories", [])]
        return []

    def get_subcategories(self, type_name, category_name, categories_data):
        """Get subcategories for a category."""
        for t in categories_data:
            if t.get("type") == type_name:
                for c in t.get("categories", []):
                    if c.get("category") == category_name:
                        return c.get("subCategories", [])
        return []

    def format_products_html(self, promos, store_name, room):
        """Format product recommendations as HTML cards."""
        if not promos:
            return "<div style='color:#ff6b6b;padding:20px;text-align:center;font-family:monospace'>❌ No products found in your budget range.</div>"

        cards = ""
        for p in promos:
            stars = "⭐" * int(round(float(p.get("Rating", 0))))
            cards += f"""
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #00d4ff33;
                        border-radius:12px;padding:16px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                <div style="flex:1;">
                  <div style="font-size:11px;color:#888;font-family:monospace;margin-bottom:4px">{p.get('Brand','N/A')}</div>
                  <div style="color:#e0e0e0;font-size:13px;font-family:monospace;line-height:1.4">{p.get('Name','Unknown')}</div>
                  <div style="margin-top:8px;font-size:12px;color:#ffd700">{stars} {p.get('Rating',0)} ({int(p.get('Reviews',0)):,} reviews)</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="color:#ff6b6b;font-size:12px;text-decoration:line-through;font-family:monospace">{p.get('Original','0')} EGP</div>
                  <div style="color:#00ff88;font-size:16px;font-weight:bold;font-family:monospace">{p.get('Discounted','0')} EGP</div>
                  <div style="background:#ff4500;color:white;border-radius:20px;padding:3px 10px;
                              font-size:11px;font-weight:bold;margin-top:4px;font-family:monospace">{p.get('Discount',0)}% OFF 🔥</div>
                </div>
              </div>
            </div>"""

        return f"""
        <div style="font-family:monospace;max-height:500px;overflow-y:auto;padding:4px;">
          <div style="color:#00d4ff;font-size:14px;font-weight:bold;margin-bottom:12px;
                      padding-bottom:8px;border-bottom:1px solid #00d4ff33;">
            🏪 {store_name} · Room {room}
          </div>
          {cards}
        </div>"""
