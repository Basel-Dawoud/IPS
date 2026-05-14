# Minimal working server example -- This is the REAL backend server.
# It listens to MQTT messages from the broker, updates live state in Redis (in the future), and saves data to PostgreSQL.
# connects to MQTT broker - subscribes to device messages - receives positions - stores them in PostgreSQL - can publish commands back
# server/main.py


import asyncio # MQTT async client library. Used for asynchronous programming, allowing the server to handle multiple tasks concurrently without blocking. For example, it allows the MQTT listener to run in the background while the FastAPI server handles HTTP requests.
import json # For parsing MQTT message payloads, which are expected to be JSON strings. Python dict <-> JSON string
import os   # For environment variable access. Reads environment variables.
import time # For getting the current timestamp when saving device position data to PostgreSQL. Used in the save_to_postgres function to record when the position data was received.
from contextlib import asynccontextmanager # For managing the lifecycle of the FastAPI application. It allows us to define setup and teardown logic for resources like the PostgreSQL connection pool when the application starts and stops.

import aiomqtt  # Asynchronous MQTT client library. Used to connect to the MQTT broker, subscribe to topics, and receive messages asynchronously. It allows the server to listen for MQTT messages without blocking other operations, such as handling HTTP requests.
import asyncpg   # Asynchronous PostgreSQL client library. Used to connect to the PostgreSQL database and perform asynchronous database operations, such as inserting device position data. It allows the server to save data to the database without blocking other operations.
from fastapi import FastAPI # Used here to create a simple web server that can handle HTTP requests. In this code, it's used to create a FastAPI application that has a health check endpoint and manages the lifecycle of the MQTT listener.

# Load environment variables from .env file
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto") # MQTT broker host, default is "mosquitto"
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres") # PostgreSQL database host, default is "postgres"
POSTGRES_DB = os.getenv("POSTGRES_DB", "ipsdb") # PostgreSQL database name, default is "ipsdb"
POSTGRES_USER = os.getenv("POSTGRES_USER", "ipsuser") # PostgreSQL database user, default is "ipsuser"
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "ipspass") # PostgreSQL database password, default is "ipspass"
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432") # PostgreSQL database port, default is "5432"

# Build one connection string for the async pool
POSTGRES_DSN = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# Create the async PostgreSQL pool
pg_pool = None


async def save_position_to_postgres(data: dict):
    """Saves the device position data to PostgreSQL database."""
    global pg_pool
    if pg_pool is None:
        raise RuntimeError("PostgreSQL connection pool is not initialized") # Ensure that the PostgreSQL connection pool is initialized before trying to use it. If it's not initialized, raise an error.
    
    async with pg_pool.acquire() as conn: # Acquire a connection from the PostgreSQL connection pool. This allows the server to execute SQL commands without blocking other operations, as the connection is managed asynchronously.
        await conn.execute(
            """
            INSERT INTO device_positions (device_id, building_id, floor, x, y, ts)
            VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
            """,
            data["device_id"],
            data["building_id"],
            data["floor"],
            data["x"],
            data["y"],
            int(data.get("ts", time.time())), # Use the timestamp from the data if available, otherwise use the current time. This ensures that the position data is recorded with an accurate timestamp in the database.
        )
        print(f"Saved position to PostgreSQL for device {data['device_id']}")

# MQTT loop runs in the background, listening to device messages and updating live state in Redis and saving to PostgreSQL.
async def mqtt_loop(): # main server event loop
    while True: # This loop runs indefinitely, allowing the server to continuously listen for MQTT messages. The server will keep running and processing incoming MQTT messages until it is stopped or encounters an error.
        try:
            print("Connecting to MQTT broker...") # Log message indicating that the server is attempting to connect to the MQTT broker. This is useful for debugging and monitoring purposes.
            async with aiomqtt.Client(MQTT_HOST, port=1883) as client: # Connect to MQTT broker "TCP connection to broker"
                await client.subscribe("ips/+/device/+/position") # Listen for all position updates
                print("Subscribed to MQTT topic: ips/+/device/+/position") # Log message indicating that the server has successfully subscribed to the MQTT topic. This confirms that the server is now listening for position updates from devices.

                await client.subscribe("ips/+/device/+/status") # Listen for device status updates (optional, for future use)
                print("Subscribed to MQTT topic: ips/+/device/+/status") # Log message

                await client.subscribe("ips/+/device/+/alert") # Listen for device alerts (optional, for future use)
                print("Subscribed to MQTT topic: ips/+/device/+/alert") # Log message

                async for message in client.messages: # This waits asynchronously for new MQTT messages.
                    try:
                        payload = message.payload.decode() # bytes -> string. MQTT payload arrives as bytes.
                        data = json.loads(payload) # string -> dict. Parse the JSON string into a Python dictionary.
                    except (json.JSONDecodeError, UnicodeDecodeError) as e:
                        print(f"Bad message format, skipping: {e}")
                        continue  # ← skip this message, keep the loop alive
                    required = {"device_id", "building_id", "floor", "x", "y"}
                    if not required.issubset(data.keys()):
                        print(f"Missing fields in payload, skipping: {data}")
                        continue  # ← skip, don't crash
                    print(f"Received MQTT message on topic {message.topic}: {data}") # Log the received message for debugging purposes.
                    
                    # Save to DB
                    await save_position_to_postgres(data) # Save the device position data to PostgreSQL database.
                    
                    # Reply topic where we can send commands back to the device if needed.
                    reply_topic = f'ips/{data["building_id"]}/device/{data["device_id"]}/command'
                    reply = {
                        "type": "ack",
                        "status": "stored",
                        "device_id": data["device_id"],
                    }
                    await client.publish(reply_topic, json.dumps(reply))
                    print(f"Sent MQTT reply to topic {reply_topic}: {reply}") # Log the sent reply for debugging purposes.
                    
        except Exception as e:
            print(f"Error in MQTT loop: {e}") # Log any exceptions that occur in the MQTT loop for debugging purposes. This helps identify issues with the MQTT connection or message processing.
            print("Reconnecting to MQTT broker in 5 seconds...") # Log message indicating that the server will attempt to reconnect to the MQTT broker after a delay. This is useful for handling temporary connection issues.
            await asyncio.sleep(5) # Wait before retrying to connect to the MQTT broker. This prevents the server from continuously trying to reconnect in case of a persistent issue, allowing time for the broker to recover or for network issues to be resolved.

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool
    # Initialize PostgreSQL connection pool when the application starts.
    # Retry pool creation up to 5 times
    for attempt in range(5):
        try:
            pg_pool = await asyncpg.create_pool(POSTGRES_DSN, min_size=1, max_size=5)
            print("PostgreSQL connection pool created")
            break
        except Exception as e:
            print(f"Postgres not ready (attempt {attempt+1}/5): {e}")
            await asyncio.sleep(3)
    else:
        raise RuntimeError("Could not connect to PostgreSQL after 5 attempts")

    task = asyncio.create_task(mqtt_loop()) # Start the MQTT loop as a background task. This allows the server to listen for MQTT messages while still being able to handle HTTP requests and other operations concurrently.
    try:
        yield # This allows the application to run while the connection pool is active. The code before this line runs when the application starts, and the code after this line runs when the application shuts down.
    finally:
        # Cleanup resources when the application shuts down.
        task.cancel() # Cancel the MQTT loop task to stop it from running when the application is shutting down. This ensures that the server can cleanly exit without leaving background tasks running.
        await pg_pool.close() # Close the PostgreSQL connection pool to release database connections and clean
        print("PostgreSQL connection pool closed") # Log message indicating that the PostgreSQL connection pool has been closed. This confirms that the server has successfully cleaned up its resources during shutdown.

app = FastAPI(lifespan=lifespan) # Create a FastAPI application instance. This is the main entry point for the web server, allowing us to define routes and manage the application's lifecycle.

# Creates the HTTP server.
# Later:
# REST APIs - admin dashboard - health checks - analytics APIs

# Health check endpoint to verify that the server is running.
@app.get("/health")
async def health_check():
    return {"status": "ok"} # Simple health check endpoint that returns a JSON response indicating that the server is running. This can be used by monitoring tools to check the health of the server.

