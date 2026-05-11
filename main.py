"""Smart Mall AI - Main Entry Point

Run this file to start the application:
    python main.py

Requirements:
    pip install -r requirements.txt

Make sure your data files are in the data/ directory:
    - categories.json
    - sort_data.json
    - floor_3_grid.npy
    - floor_4_grid.npy
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_database
from ui import create_app


def main():
    """Initialize and launch the Smart Mall AI application."""
    print("🚀 Starting Smart Mall AI...")

    # Initialize database
    print("📦 Initializing database...")
    init_database()

    # Create and launch Gradio app
    print("🎨 Building UI...")
    demo = create_app()

    print("✅ Ready! Launching server...")
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        debug=True,
        share=False,  # Set to True for public URL
        show_error=True
    )


if __name__ == "__main__":
    main()
