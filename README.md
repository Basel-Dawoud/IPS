# 🏪 Smart Mall AI

A professional indoor navigation, recommendation, and AI assistant system for shopping malls.

## 📁 Project Structure

```
smart_mall/
├── main.py                 # Entry point
├── config.py               # All constants & configuration
├── requirements.txt        # Python dependencies
├── database/               # Database package
│   ├── connection.py       # DB setup
│   └── operations.py       # CRUD operations
├── models/                 # Data models
│   ├── store.py            # Store/room mappings
│   └── product.py          # Product structures
├── navigation/             # Pathfinding
│   ├── grid_manager.py     # Grid & danger zones
│   ├── pathfinder.py       # A* algorithm
│   └── instructions.py     # Path visualization
├── chatbot/                # AI assistant
│   ├── intent_detector.py  # Intent classification
│   ├── response_generator.py
│   └── llm_fallback.py     # Local LLM
├── recommendation/         # Recommendation engine
│   ├── store_recommender.py
│   └── product_recommender.py
├── ui/                     # Gradio interface
│   ├── auth_tab.py         # Login/signup
│   ├── shop_tab.py         # Shop & navigate
│   ├── chat_tab.py         # AI assistant
│   └── gradio_app.py       # App builder
├── utils/                  # Utilities
│   ├── helpers.py
│   ├── i18n.py             # Bilingual support
│   └── voice.py            # TTS & STT
└── data/                   # Data files (not in repo)
    ├── categories.json
    ├── sort_data.json
    ├── floor_3_grid.npy
    ├── floor_4_grid.npy
    └── mall.db
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Prepare Data Files

Place your data files in the `data/` directory:
- `categories.json` - Product categories
- `sort_data.json` - Product catalog
- `floor_3_grid.npy` - Floor 3 navigation grid
- `floor_4_grid.npy` - Floor 4 navigation grid

### 3. Run the Application

```bash
python main.py
```

The app will be available at `http://localhost:7860`

## ✨ Features

- 🔐 **User Authentication** - Signup/login with SQLite database
- 📍 **Indoor Navigation** - A* pathfinding with multiple modes
  - Normal navigation
  - Fire emergency mode (danger avoidance)
  - Crowded area mode (crowd avoidance)
  - Special needs mode (elevator-only)
- 🎯 **Store Recommendations** - Based on location & visit history
- 🛍️ **Product Recommendations** - Filtered by budget & gender
- 🤖 **AI Chatbot** - Multilingual (English/Arabic/Egyptian slang)
- 🎤 **Voice Support** - Speech-to-text and text-to-speech
- 🗺️ **Visual Maps** - Path visualization on floor plans

## 🛠️ Configuration

Edit `config.py` to customize:
- Room mappings and centroids
- Store aliases and keywords
- Budget defaults
- Navigation parameters

## 📝 License

MIT License
