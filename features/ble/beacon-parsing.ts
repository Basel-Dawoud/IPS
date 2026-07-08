/**
 * Beacon advertisement parsing: Eddystone UID/URL, iBeacon, with a MAC→UID
 * cache so multi-slot beacons don't appear as multiple devices.
 */

const EDDYSTONE_FRAME_UID = 0x00;
const EDDYSTONE_FRAME_URL = 0x10;

const macToUid = new Map<string, string>();
const macToName = new Map<string, string>();

/**
 * Cross-platform beacon map: 0xFFF0 service-data hex (lowercased) -> beaconUid.
 * Populated per building from the registered beacons (`setBeaconServiceDataMap`).
 * This is what makes iOS work: ble-plx hides the iBeacon manufacturer data on
 * iOS, but service data 0xFFF0 is read identically on both platforms, so a
 * scanned advertisement resolves to the iBeacon UID the ML model expects.
 */
const serviceDataMap = new Map<string, string>();

/**
 * Replace the service-data -> beaconUid map (from the building's registered
 * beacons). Clears the MAC->UID cache so stale resolutions don't linger.
 */
export function setBeaconServiceDataMap(
  pairs: [string | null | undefined, string][],
): void {
  serviceDataMap.clear();
  for (const [sd, uid] of pairs) {
    if (sd) serviceDataMap.set(sd.toLowerCase(), uid);
  }
  macToUid.clear();
}

/**
 * Extract the 0xFFF0 service-data value as lowercased hex, or null. Broadcast by
 * the Feasycom beacons and read identically on Android & iOS — the cross-platform
 * key used to resolve a device to its iBeacon UID.
 */
function getServiceDataHex(device: any): string | null {
  if (!device?.serviceData) return null;
  for (const [key, val] of Object.entries(device.serviceData)) {
    if (key.toLowerCase().includes("fff0")) {
      const hex = bytesToHex(base64ToBytes(val as string)).toLowerCase();
      return hex || null;
    }
  }
  return null;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(b64: string): number[] {
  if (!b64) return [];
  const bytes: number[] = [];
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    bytes.push((a << 2) | (b >> 4));
    if (i + 2 < clean.length && clean[i + 2] !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
    if (i + 3 < clean.length && clean[i + 3] !== "=") bytes.push(((c & 3) << 6) | d);
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseEddystoneUid(bytes: number[]): { namespace: string; instance: string } | null {
  if (bytes.length < 18 || bytes[0] !== EDDYSTONE_FRAME_UID) return null;
  return {
    namespace: bytesToHex(bytes.slice(2, 12)),
    instance: bytesToHex(bytes.slice(12, 18)),
  };
}

const URL_SCHEMES = ["http://www.", "https://www.", "http://", "https://"];
const URL_CODES: Record<number, string> = {
  0x00: ".com/", 0x01: ".org/", 0x02: ".edu/", 0x03: ".net/", 0x04: ".info/",
  0x05: ".biz/", 0x06: ".gov/", 0x07: ".com", 0x08: ".org", 0x09: ".edu",
  0x0a: ".net", 0x0b: ".info", 0x0c: ".biz", 0x0d: ".gov",
};

function parseEddystoneUrl(bytes: number[]): string | null {
  if (bytes.length < 4 || bytes[0] !== EDDYSTONE_FRAME_URL) return null;
  const scheme = URL_SCHEMES[bytes[2]];
  if (!scheme) return null;
  let url = scheme;
  for (let i = 3; i < bytes.length; i++) {
    const code = URL_CODES[bytes[i]];
    if (code) url += code;
    else if (bytes[i] >= 0x20 && bytes[i] <= 0x7e) url += String.fromCharCode(bytes[i]);
  }
  return url;
}

function parseIBeacon(bytes: number[]): { uuid: string; major: number; minor: number } | null {
  for (let i = 0; i <= bytes.length - 25; i++) {
    if (
      bytes[i] === 0x4c &&
      bytes[i + 1] === 0x00 &&
      bytes[i + 2] === 0x02 &&
      bytes[i + 3] === 0x15
    ) {
      const uuid = [
        bytesToHex(bytes.slice(i + 4, i + 8)),
        bytesToHex(bytes.slice(i + 8, i + 10)),
        bytesToHex(bytes.slice(i + 10, i + 12)),
        bytesToHex(bytes.slice(i + 12, i + 14)),
        bytesToHex(bytes.slice(i + 14, i + 20)),
      ].join("-");
      const major = (bytes[i + 20] << 8) | bytes[i + 21];
      const minor = (bytes[i + 22] << 8) | bytes[i + 23];
      return { uuid, major, minor };
    }
  }
  return null;
}

/**
 * Resolve a BLE advertisement to a stable beacon ID.
 * Priority: MAC cache → Eddystone-UID → Eddystone-URL → iBeacon → MAC fallback.
 */
export function identifyBeacon(device: any): string | null {
  const id: string = device?.id ?? "";
  const name: string = device?.localName || device?.name || "";
  if (name) macToName.set(id, name);

  const cached = macToUid.get(id);
  if (cached) return cached;

  // Cross-platform resolution via the 0xFFF0 service-data map (the iOS path):
  // ble-plx can't read the iBeacon payload on iOS, but it reads 0xFFF0, so we
  // look up the registered beaconUid from it. Consulted before Eddystone/iBeacon.
  if (serviceDataMap.size > 0) {
    const sdHex = getServiceDataHex(device);
    if (sdHex) {
      const mapped = serviceDataMap.get(sdHex);
      if (mapped) {
        macToUid.set(id, mapped);
        return mapped;
      }
    }
  }

  if (device?.serviceData) {
    for (const [key, val] of Object.entries(device.serviceData)) {
      if (key.toLowerCase().includes("feaa")) {
        const bytes = base64ToBytes(val as string);
        const uid = parseEddystoneUid(bytes);
        if (uid) {
          const parsed = `${uid.namespace}:${uid.instance}`;
          macToUid.set(id, parsed);
          return parsed;
        }
        const url = parseEddystoneUrl(bytes);
        if (url) {
          macToUid.set(id, url);
          return url;
        }
      }
    }
  }

  if (device?.manufacturerData) {
    const bytes = base64ToBytes(device.manufacturerData);
    const ib = parseIBeacon(bytes);
    if (ib) {
      const parsed = `${ib.uuid}:${ib.major}:${ib.minor}`;
      macToUid.set(id, parsed);
      return parsed;
    }
  }

  return id || null;
}

export function deriveDisplayName(deviceId: string, beaconUid: string): string | null {
  if (deviceId.toUpperCase().startsWith("DC:0D")) {
    const suffix = deviceId.replace(/:/g, "").slice(-4).toUpperCase();
    return `Feasy-${suffix}`;
  }
  if (beaconUid.includes(":") && !beaconUid.includes("-")) {
    const parts = beaconUid.split(":");
    if (parts.length === 2 && parts[0].length === 20) return `Beacon-${parts[1].toUpperCase()}`;
  }
  if (beaconUid.includes("-") && beaconUid.includes(":")) {
    const parts = beaconUid.split(":");
    if (parts.length === 3) return `iBeacon-${parts[1]}:${parts[2]}`;
  }
  return macToName.get(deviceId) ?? null;
}
