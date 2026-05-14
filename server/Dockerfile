# Base Linux image with Python installed.
# We use the slim variant to reduce image size and speed up downloads/builds.
# Python 3.11 is a stable and widely supported version.
FROM python:3.11-slim

# Set the working directory inside the container.
# All subsequent commands will be executed from /app.
WORKDIR /app

# Copy only requirements.txt first.
# This allows Docker to cache dependency installation and avoid reinstalling
# packages unless requirements.txt changes.
COPY requirements.txt .

# Install Python dependencies listed in requirements.txt.
# --no-cache-dir prevents pip from storing package caches,
# which keeps the image smaller.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source code into the container.
# Because the Dockerfile is located inside server/,
# COPY . . copies main.py, requirements.txt, and any future modules.
COPY . .

# Document that the container listens on port 8000.
# This does not publish the port; docker-compose handles that.
EXPOSE 8000

# Start the FastAPI application using Uvicorn.
# "main:app" means:
#   - main.py is the Python module
#   - app is the FastAPI instance defined inside main.py
# --host 0.0.0.0 makes the server accessible from outside the container.
# --port 8000 tells Uvicorn which port to listen on.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]