/**
 * Anonymized MQTT position telemetry for the IPS heatmap/analytics plane.
 *
 * Publishes fire-and-forget position messages (QoS 0) to the Mosquitto
 * broker over WebSocket, per the IPS contract:
 *   topic   ips/<buildingId>/device/<deviceId>/position
 *   payload {type, device_id, building_id, floor, x, y, accuracy, motion,
 *            ts, units:"meters"}
 *
 * Privacy: deviceId is a random "user-<8hex>" generated PER SESSION — never
 * the user id and never persisted. The heatmap can't tell who a dot is.
 * Identified sharing stays on the /location socket (location-sharing).
 *
 * Failure tolerance: the broker being down must NEVER affect positioning or
 * navigation. Every entry point is try/caught; a failed require/construct
 * disables telemetry for the rest of the session with a single warning.
 *
 * Library note: paho-mqtt (pure JS, WebSocket transport only — exactly our
 * case) instead of mqtt.js, which needs Node polyfills (Buffer/process/url)
 * under Hermes. Paho requires a localStorage global for its QoS>0 buffering;
 * we only send QoS 0 but stub it so the constructor doesn't throw. Lazily
 * required per the project convention (see features/ble/lazy-ble.ts).
 */

interface PahoMessage {
  destinationName: string;
  qos: number;
  retained: boolean;
}

interface PahoFailure {
  errorCode?: number;
  errorMessage?: string;
}

interface PahoClient {
  connect(opts: Record<string, unknown>): void;
  disconnect(): void;
  send(message: PahoMessage): void;
  isConnected(): boolean;
  onConnectionLost: ((err: { errorCode: number; errorMessage?: string }) => void) | null;
}

const TAG = "[mqtt-telemetry]";
const RECONNECT_DELAY_MS = 5000;

let client: PahoClient | null = null;
let messageCtor: (new (payload: string) => PahoMessage) | null = null;
let deviceId: string | null = null;
let brokerUrl = "";
let connected = false;
let disabledThisSession = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let publishCount = 0;
let dropCount = 0;

function randomDeviceId(): string {
  let hex = "";
  for (let i = 0; i < 8; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `user-${hex}`;
}

/**
 * Parse the broker URL into what Paho's 3-arg Client(host, port, clientId)
 * needs plus a TLS flag. Using host/port (not the URI form) sidesteps Paho's
 * strict URI regex; `useSSL` is passed to connect() to switch ws↔wss.
 *   wss:// (e.g. through Traefik on 443) → useSSL true, default port 443
 *   ws://  (e.g. local mosquitto)        → useSSL false, default port 9001
 */
function parseBrokerUrl(url: string): { host: string; port: number; useSSL: boolean } {
  const match = url.match(/^(wss?):\/\/([^/:]+)(?::(\d+))?/i);
  const secure = (match?.[1] ?? "ws").toLowerCase() === "wss";
  return {
    host: match?.[2] ?? "localhost",
    port: match?.[3] ? parseInt(match[3], 10) : secure ? 443 : 9001,
    useSSL: secure,
  };
}

function connectClient(): void {
  if (!client) return;
  const { host, port, useSSL } = parseBrokerUrl(brokerUrl);
  console.log(`${TAG} connecting to ${useSSL ? "wss" : "ws"}://${host}:${port} as ${deviceId}`);
  try {
    client.connect({
      useSSL,
      reconnect: true, // Paho auto-reconnect — but only AFTER a first success…
      keepAliveInterval: 30,
      timeout: 4,
      cleanSession: true,
      onSuccess: () => {
        connected = true;
        dropCount = 0;
        console.log(`${TAG} connected ✓`);
      },
      onFailure: (e: PahoFailure) => {
        connected = false;
        console.warn(
          `${TAG} connect failed: ${e?.errorMessage ?? e?.errorCode ?? "unknown"} — retrying in ${RECONNECT_DELAY_MS / 1000}s`,
        );
        // …so we retry the INITIAL connect ourselves until it lands once.
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectClient, RECONNECT_DELAY_MS);
      },
    });
  } catch (e) {
    console.warn(`${TAG} connect threw`, e);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectClient, RECONNECT_DELAY_MS);
  }
}

/** Connect to the broker with a fresh anonymous device id. Safe to call twice. */
export function startTelemetry(brokerWsUrl: string): void {
  if (disabledThisSession || client) return;
  try {
    // Paho's constructor checks for a DOM localStorage; RN doesn't have one.
    // In-memory stub is fine — QoS 0 sends never touch stored messages.
    const g = globalThis as Record<string, unknown>;
    if (typeof g.localStorage === "undefined") {
      const store = new Map<string, string>();
      g.localStorage = {
        setItem: (k: string, v: string) => void store.set(k, v),
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => void store.delete(k),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Paho = require("paho-mqtt");
    deviceId = randomDeviceId();
    brokerUrl = brokerWsUrl;
    messageCtor = Paho.Message;
    publishCount = 0;
    dropCount = 0;
    const { host, port } = parseBrokerUrl(brokerWsUrl);
    client = new Paho.Client(host, port, deviceId) as PahoClient;

    client.onConnectionLost = (e) => {
      connected = false;
      console.warn(
        `${TAG} connection lost: ${e?.errorMessage ?? e?.errorCode ?? "unknown"} (auto-reconnecting)`,
      );
    };

    connectClient();
  } catch (err) {
    disabledThisSession = true;
    client = null;
    console.warn(`${TAG} unavailable — telemetry disabled for this session:`, err);
  }
}

/** End the connection and forget the session device id. */
export function stopTelemetry(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const c = client;
  client = null;
  connected = false;
  deviceId = null;
  if (!c) return;
  try {
    c.disconnect();
  } catch {
    // Disconnecting while already closed throws in Paho — ignore.
  }
}

export interface TelemetryPosition {
  buildingId: string;
  floor: number;
  x: number;
  y: number;
  motion: "walking" | "stationary";
}

/** Fire-and-forget position publish; silently dropped while disconnected. */
export function publishPosition(p: TelemetryPosition): void {
  if (!client || !deviceId || !messageCtor) return; // telemetry not started
  if (!connected || !client.isConnected()) {
    dropCount += 1;
    if (dropCount === 1 || dropCount % 10 === 0) {
      console.log(`${TAG} not connected yet — position not sent (dropped ${dropCount})`);
    }
    return;
  }
  try {
    const topic = `ips/${p.buildingId}/device/${deviceId}/position`;
    const payload = JSON.stringify({
      type: "position",
      device_id: deviceId,
      building_id: p.buildingId,
      floor: p.floor,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      accuracy: 2.0,
      motion: p.motion,
      ts: Math.floor(Date.now() / 1000),
      units: "meters",
    });
    const message = new messageCtor(payload);
    message.destinationName = topic;
    message.qos = 0;
    message.retained = false;
    client.send(message);

    publishCount += 1;
    if (publishCount === 1) {
      console.log(`${TAG} first position published → ${topic} (${message ? "ok" : ""})`);
    } else if (publishCount % 20 === 0) {
      console.log(`${TAG} published ${publishCount} positions (last ${p.x.toFixed(1)},${p.y.toFixed(1)} floor ${p.floor})`);
    }
  } catch (e) {
    console.warn(`${TAG} publish error`, e);
  }
}
