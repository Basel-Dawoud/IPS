#!/bin/bash
# Smart Mall AI - Setup Script
# Run: bash setup.sh

echo "🚀 Setting up Smart Mall AI..."

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "📦 Python version: $python_version"

# Create virtual environment
echo "🌐 Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "✅ Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️ Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Initialize database
echo "🗄️ Initializing database..."
python3 -c "from database import init_database; init_database()"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Place your data files in the data/ directory:"
echo "   - categories.json"
echo "   - sort_data.json"
echo "   - floor_3_grid.npy"
echo "   - floor_4_grid.npy"
echo ""
echo "2. Run the application:"
echo "   python main.py"
echo ""
echo "3. Open your browser at: http://localhost:7860"
