import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { apiClient } from "@/lib/api-client";

/** An inaccessible rectangle drawn by the admin, in floor-plan METER coords. */
export interface BlockedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  floorLevel: number;
}

export interface EmergencyData {
  id: string;
  buildingId: string;
  isActive: boolean;
  message: string | null;
  gatheringPointId: string | null;
  blockedPoiIds: string[];
  /** Inaccessible areas the navigation must route around. May be absent on older payloads. */
  blockedZones?: BlockedZone[];
}

export function useEmergencyAlert(
  buildingId: string | null | undefined,
  initialAlert?: EmergencyData | null
) {
  const [isEmergencyActive, setIsEmergencyActive] = useState(
    initialAlert?.isActive ?? false
  );
  const [emergencyData, setEmergencyData] = useState<EmergencyData | null>(
    initialAlert?.isActive ? initialAlert : null
  );
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (initialAlert && initialAlert.isActive) {
      setIsEmergencyActive(true);
      setEmergencyData(initialAlert);
    } else {
      setIsEmergencyActive(false);
      setEmergencyData(null);
    }
  }, [initialAlert]);

  useEffect(() => {
    if (!buildingId) {
      setIsEmergencyActive(false);
      setEmergencyData(null);
      return;
    }

    if (initialAlert) return;

    const fetchEmergency = async () => {
      try {
        const res = await apiClient.get(`/client/buildings/${buildingId}/emergency`);
        const data = res.data?.data as EmergencyData | null;
        if (data && data.isActive) {
          setIsEmergencyActive(true);
          setEmergencyData(data);
        } else {
          setIsEmergencyActive(false);
          setEmergencyData(null);
        }
      } catch (err) {
        console.warn("[EmergencyAlert] Failed to fetch initial emergency state:", err);
      }
    };

    fetchEmergency();
  }, [buildingId, initialAlert]);

  useEffect(() => {
    if (!buildingId) return;

    const socketUrl = env.apiUrl.replace(/\/api$/, "");
    console.log(`[EmergencySocket] Connecting to building socket at: ${socketUrl}`);

    const socket = io(socketUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[EmergencySocket] Connected to server, joining building room:", buildingId);
      socket.emit("join_building", buildingId);
    });

    socket.on("emergency_alert", (data: EmergencyData) => {
      console.log("[EmergencySocket] RECEIVED EMERGENCY ALERT:", data);
      if (data.buildingId === buildingId) {
        setIsEmergencyActive(data.isActive);
        setEmergencyData(data.isActive ? data : null);
      }
    });

    socket.on("emergency_clear", (data: { buildingId: string }) => {
      console.log("[EmergencySocket] RECEIVED EMERGENCY CLEAR for building:", data.buildingId);
      if (data.buildingId === buildingId) {
        setIsEmergencyActive(false);
        setEmergencyData(null);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[EmergencySocket] Disconnected:", reason);
    });

    return () => {
      console.log("[EmergencySocket] Cleaning up socket connection...");
      socket.emit("leave_building", buildingId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [buildingId]);

  return {
    isEmergencyActive,
    emergencyData,
  };
}
