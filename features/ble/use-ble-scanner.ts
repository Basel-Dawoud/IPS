import { useCallback, useEffect, useReducer, useState } from "react";
import { getBleManager, isBleAvailable } from "./lazy-ble";
import { requestBlePermissions } from "./permissions";
import {
  DiscoveredBeacon,
  clearDiscoveredBeacons,
  getDiscoveredBeacons,
  getWindowCounts,
  getWindowMeans,
  isScanning,
  startContinuousScan,
  stopContinuousScan,
  subscribeDiscovered,
} from "./ble-scanner";

export interface UseBleScanner {
  available: boolean;
  bluetoothState: string;
  scanning: boolean;
  discoveredBeacons: ReadonlyMap<string, DiscoveredBeacon>;
  start: (options?: { maxBufferAgeMs?: number; allowedUids?: Set<string> | string[] }) => Promise<boolean>;
  stop: () => void;
  requestPermissions: () => Promise<boolean>;
  getWindowMeans: (windowMs: number) => Map<string, number>;
  getWindowCounts: (windowMs: number) => Map<string, number>;
  clearDiscovered: () => void;
}

export function useBleScanner(): UseBleScanner {
  const [bluetoothState, setBluetoothState] = useState("Unknown");
  const [scanning, setScanning] = useState(isScanning());
  const [, tick] = useReducer((c: number) => c + 1, 0);

  useEffect(() => subscribeDiscovered(tick), []);

  useEffect(() => {
    const mgr = getBleManager();
    if (!mgr) return;
    const sub = mgr.onStateChange((state: string) => setBluetoothState(state), true);
    return () => sub?.remove?.();
  }, []);

  const start = useCallback(
    async (options?: { maxBufferAgeMs?: number; allowedUids?: Set<string> | string[] }) => {
      const granted = await requestBlePermissions();
      if (!granted) return false;
      const ok = startContinuousScan(options);
      setScanning(ok);
      return ok;
    },
    [],
  );

  const stop = useCallback(() => {
    stopContinuousScan();
    setScanning(false);
  }, []);

  return {
    available: isBleAvailable(),
    bluetoothState,
    scanning,
    discoveredBeacons: getDiscoveredBeacons(),
    start,
    stop,
    requestPermissions: requestBlePermissions,
    getWindowMeans,
    getWindowCounts,
    clearDiscovered: clearDiscoveredBeacons,
  };
}
