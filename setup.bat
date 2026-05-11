@echo off
REM Smart Mall AI - Setup Script for Windows
REM Run: setup.bat

echo 🚀 Setting up Smart Mall AI...

REM Check Python version
for /f "tokens=2" %%a in ('python --version') do set PYTHON_VERSION=%%a
echo 📦 Python version: %PYTHON_VERSION%

REM Create virtual environment
echo 🌐 Creating virtual environment...
python -m venv venv

REM Activate virtual environment
echo ✅ Activating virtual environment...
call venv\Scripts\activate.bat

REM Upgrade pip
echo ⬆️ Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo 📥 Installing dependencies...
pip install -r requirements.txt

REM Create data directory
echo 📁 Creating data directory...
mkdir data 2>nul

REM Initialize database
echo 🗄️ Initializing database...
python -c "from database import init_database; init_database()"

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Place your data files in the data/ directory:
echo    - categories.json
echo    - sort_data.json
echo    - floor_3_grid.npy
echo    - floor_4_grid.npy
echo.
echo 2. Run the application:
echo    python main.py
echo.
echo 3. Open your browser at: http://localhost:7860
echo.
pause
