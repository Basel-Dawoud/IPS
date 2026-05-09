# Base Linux image with Python installed. We use the slim version to keep the image size small, which is good for faster downloads and less storage usage. Python 3.11 is chosen for its performance improvements and new features.
FROM python:3.11-slim

# We will need to track everything in the other parts that will be included to the server.

# Inside container: Set the working directory to /app. This means that all subsequent commands will be run from this directory. It's a common practice to keep application code organized in a specific directory within the container.
WORKDIR /app

# Install the required Python packages for the application. The --no-cache-dir option is used to prevent pip from caching the downloaded packages, which helps to reduce the size of the Docker image.
# The packages being installed are: fastapi, uvicorn, aiomqtt, asyncpg
RUN pip install --no-cache-dir fastapi uvicorn aiomqtt asyncpg

# Copy the main.py file from the host machine (the directory where the Dockerfile is located) to the /app directory inside the container. This makes the application code available inside the container so it can be executed when the container runs.
COPY main.py /app/main.py

# Expose port 8000 to allow external access to the FastAPI server running inside the container. This means that when the container is run, it will listen for incoming HTTP requests on port 8000.
EXPOSE 8000

# Start FastAPI server automatically.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
# The CMD instruction specifies the command to run when the container starts.
# In this case, it runs the uvicorn server, which is an ASGI server for Python web applications. 
# The command tells uvicorn to run the FastAPI application defined in main.py (specifically, the app object) and to listen on all network interfaces
# Expose port 8000 to allow external access to the FastAPI server running inside the container. This means that when the container is run, it will listen for incoming HTTP requests on port 8000.
