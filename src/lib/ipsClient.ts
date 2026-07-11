import axios from "axios";

/**
 * Client for the IPS analytics plane (FastAPI server in IPS-main).
 *
 * This is a SECOND API, separate from the Node backend behind axiosClient:
 * it ingests MQTT positions and serves live state + heatmap analytics.
 * FastAPI returns bare JSON (no {success, data} envelope).
 */
const baseURL = import.meta.env.VITE_IPS_API_BASE_URL ?? "http://localhost:8000";

export const ipsClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

/** ws:// (or wss:// when the API is https) URL of the live push socket. */
export function ipsWsUrl(): string {
  const url = new URL(baseURL, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/live";
  url.search = "";
  return url.toString();
}
