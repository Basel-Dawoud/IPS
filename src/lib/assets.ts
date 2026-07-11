import { axiosClient } from "./axiosClient";

/** Origin (scheme + host + port) of the API the dashboard talks to. */
function apiOrigin(): string {
  const base = axiosClient.defaults.baseURL ?? "http://localhost:3000/api";
  try {
    return new URL(base, window.location.origin).origin;
  } catch {
    return base.replace(/\/api\/?$/, "");
  }
}

/**
 * Resolve a backend asset URL (floor `mapUrl`, POI `iconUrl`) into something the
 * browser can actually load. Files are served from the API's `/uploads/...`, but
 * the stored absolute URL may point at a host the browser can't reach (e.g. the
 * backend saved `http://localhost:3000` while the dashboard talks to a remote
 * API). For any `/uploads` path we re-point it at the API origin; everything
 * else passes through unchanged.
 */
export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (u.pathname.startsWith("/uploads")) return apiOrigin() + u.pathname + u.search;
    } catch {
      /* fall through */
    }
    return url;
  }
  if (url.startsWith("/uploads")) return apiOrigin() + url;
  return url;
}
