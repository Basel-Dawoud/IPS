import { useEffect, useRef, useState } from "react";
import { ipsWsUrl } from "@/lib/ipsClient";
import type { CrowdAlert, LivePosition, WsMessage } from "../types";

const RECONNECT_DELAY_MS = 2000;

export interface LiveSocketHandlers {
  onSnapshot?: (items: LivePosition[], activeAlerts: CrowdAlert[]) => void;
  onPosition?: (position: LivePosition) => void;
  onAlert?: (alert: CrowdAlert, level: "warning" | "clear") => void;
}

/**
 * Connection to the FastAPI /ws/live push socket, with 2s auto-reconnect.
 *
 * The server broadcasts ALL buildings to every client; this hook filters to
 * `buildingId` before invoking handlers (deliberate design — see IPS-main
 * server/main.py's ConnectionManager). Handlers are kept in a ref so message
 * traffic never re-runs the effect; position bursts must not re-render React
 * per message — consumers keep device state in refs and animate via rAF.
 */
export function useLiveSocket(buildingId: string, handlers: LiveSocketHandlers) {
  const [connected, setConnected] = useState(false);
  const [msgsPerSec, setMsgsPerSec] = useState(0);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const msgCountRef = useRef(0);

  useEffect(() => {
    if (!buildingId) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(ipsWsUrl());

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        msgCountRef.current += 1;

        if (msg.type === "snapshot") {
          handlersRef.current.onSnapshot?.(
            msg.items.filter((p) => p.building_id === buildingId),
            (msg.active_alerts ?? []).filter((a) => a.building_id === buildingId),
          );
        } else if (msg.type === "position") {
          if (msg.building_id === buildingId) handlersRef.current.onPosition?.(msg);
        } else if (msg.type === "alert") {
          if (msg.building_id === buildingId) handlersRef.current.onAlert?.(msg, msg.level);
        }
        // "status" messages are ignored for now (battery/online state).
      };

      ws.onerror = () => ws?.close();

      ws.onclose = () => {
        setConnected(false);
        if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    const rateTimer = setInterval(() => {
      setMsgsPerSec(msgCountRef.current);
      msgCountRef.current = 0;
    }, 1000);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(rateTimer);
      ws?.close();
    };
  }, [buildingId]);

  return { connected, msgsPerSec };
}
