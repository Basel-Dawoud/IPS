/**
 * Lazy singleton accessor for react-native-ble-plx. Loading is wrapped in
 * try/catch so the app keeps working under Expo Go (no native module) — BLE
 * features just report "unavailable" instead of crashing the JS bundle.
 */
let mgr: any = null;
let unavailable = false;

export function getBleManager(): any {
  if (unavailable) return null;
  if (mgr) return mgr;
  try {
    const { BleManager } = require("react-native-ble-plx");
    mgr = new BleManager();
    return mgr;
  } catch (err) {
    unavailable = true;
    console.warn(
      "[BLE] Native module unavailable — run a dev build (npx expo run:android) to enable BLE.",
      err,
    );
    return null;
  }
}

export function isBleAvailable(): boolean {
  return !unavailable && getBleManager() !== null;
}
