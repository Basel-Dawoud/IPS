# Minimal phone publisher example
# This script simulates the Android application.
# It connects to the MQTT broker and periodically publishes position updates.

import asyncio
import json
import time
import aiomqtt

# IMPORTANT:
# Because this script runs on your Ubuntu host machine (not inside Docker),
# the MQTT broker is reached through localhost.
# Docker maps the broker's internal port 1883 to your host's port 1883
# using this line in docker-compose.yml:
#   ports:
#     - "1883:1883"
#
# Therefore:
#   Host machine scripts  -> use "localhost"
#   Docker containers     -> use "mosquitto"

MQTT_HOST = "localhost"


async def main():
    # Open a TCP connection to the MQTT broker.
    # aiomqtt.Client is an asynchronous context manager:
    # - __aenter__() connects to the broker
    # - __aexit__() disconnects automatically
    async with aiomqtt.Client(MQTT_HOST) as client:
        # Send five simulated position updates.
        # In the real Android application, this loop would typically run forever
        # and publish whenever a new position is computed.
        
        for i in range(5):
            # Build the message payload as a Python dictionary.
            payload = {
                "device_id": "user1",
                "building_id": "building1",
                "floor": 2,
                "x": 10.0 + i,
                "y": 5.0 + i,
                "ts": int(time.time()),  # current Unix timestamp
            }

            # Convert the dictionary to JSON text and publish it to the topic.
            await client.publish(
                "ips/building1/device/user1/position",
                json.dumps(payload),
            )

            # Show what was sent.
            print("Sent:", payload)

            # Wait two seconds before sending the next update.
            await asyncio.sleep(2)

        """
        We will replace this with the client's mobile phone application, which will run indefinitely and publish position updates whenever they are computed. The server will keep running and processing incoming MQTT messages until it is stopped or encounters an error.
        We need the real time position updates from all mobile phones to visualize them on a real time map in the web application.
        We won't store all the position updates in the database, but we will store a fraction of them (e.g., every 10 seconds) to keep a historical record of device movements. The real time updates will be stored in Redis for quick access and visualization, while the historical data will be stored in PostgreSQL for analysis and record-keeping.
        Also, the server will listen for MQTT messages indefinitely, so we don't want to exit the main function after sending just five updates. Instead, we will keep the MQTT loop running in the background, allowing it to continuously listen for incoming messages and process them as they arrive.
        Finally, we will implement a proper lifespan management for the FastAPI application to ensure that resources like database connections are properly initialized and cleaned up when the server starts and stops.
        """


# Start the asyncio event loop and run the main coroutine.
asyncio.run(main())