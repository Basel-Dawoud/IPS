"""Product recommendation models."""
import json
import random
from config import PRODUCTS_FILE, SUB_TO_CATEGORY, STORE_CLUSTER, STORE_CLUSTER_ROOM


class ProductRecommender:
    """Handles product filtering, sorting, and recommendation logic."""

    def __init__(self):
        self.products_data = self._load_products()

    def _load_products(self):
        """Load products from JSON file."""
        try:
            with open(PRODUCTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    @staticmethod
    def clean_price(price_str) -> int:
        """Extract numeric value from price string."""
        digits = "".join(filter(str.isdigit, str(price_str)))
        return int(digits) if digits else 0

    def get_products(self, subcategory: str) -> list[dict]:
        """Get products matching a subcategory."""
        if not subcategory:
            return []

        result = []
        subcategory = str(subcategory).strip().lower()

        for type_block in self.products_data:
            for cat in type_block.get("items", []):
                cat_name = cat.get("category")
                for sub in cat.get("items", []):
                    sub_name = sub.get("subCategory")
                    if cat_name and cat_name.lower() == subcategory:
                        result.extend(sub.get("items", []))
                    elif sub_name and sub_name.lower() == subcategory:
                        result.extend(sub.get("items", []))
        return result

    def filter_by_budget(self, products: list[dict], low: float, high: float) -> list[dict]:
        """Filter products by budget range."""
        filtered = []
        for p in products:
            price = self.clean_price(p.get("Price", 0))
            if low <= price <= high:
                item = dict(p)
                item["price_int"] = price
                filtered.append(item)
        return filtered

    def gender_filter(self, products: list[dict], gender: str) -> list[dict]:
        """Sort products by gender preference keywords."""
        if gender not in ["male", "female"]:
            return products

        keywords = {
            "male": ["gaming", "tool", "power", "sports", "fitness"],
            "female": ["beauty", "hair", "skin", "cosmetic", "makeup", "fashion"],
        }

        preferred, others = [], []
        for p in products:
            name = str(p.get("Name", "")).lower()
            if any(k in name for k in keywords[gender]):
                preferred.append(p)
            else:
                others.append(p)
        return preferred + others

    def add_promotions(self, products: list[dict]) -> list[dict]:
        """Add random discount promotions to products."""
        result = []
        for p in products:
            discount = random.randint(10, 50)
            original = self.clean_price(p.get("Price", 0))
            discounted = int(original * (1 - discount / 100))
            result.append({
                "Name": p.get("Name", "Unknown Product"),
                "Brand": p.get("Brand", "N/A"),
                "Original": f"{original}",
                "Discounted": f"{discounted}",
                "Discount": discount,
                "Rating": p.get("Rating", 0),
                "Reviews": p.get("No of Reviews", 0),
            })
        return result

    def recommend(self, subcategory: str, gender: str, low_budget: float, high_budget: float) -> dict:
        """Get full recommendation result for a subcategory."""
        products = self.get_products(subcategory)
        if not products:
            return {"store": "Unknown", "room": None, "products": []}

        # Try budget filter
        filtered = self.filter_by_budget(products, low_budget, high_budget)
        if not filtered:
            filtered = products

        # Apply gender sorting
        filtered = self.gender_filter(filtered, gender)

        # Sort by rating and take top 5
        filtered = sorted(filtered, key=lambda x: x.get("Rating", 0), reverse=True)
        top_products = self.add_promotions(filtered[:5])

        # Resolve store
        parent_category = SUB_TO_CATEGORY.get(subcategory)
        store_name = STORE_CLUSTER.get(parent_category, parent_category) if parent_category else None
        room = STORE_CLUSTER_ROOM.get(store_name) if store_name else None

        return {
            "store": store_name or "Unknown",
            "room": room,
            "products": top_products
        }
