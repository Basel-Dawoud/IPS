import axios, { AxiosInstance } from "axios";
import { env } from "./env";
import { getAuthToken } from "@/features/auth/auth-storage";

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  // If it's a relative path starting with /uploads
  if (url.startsWith("/uploads")) {
    return `${env.staticUrl}${url}`;
  }

  // If it is an absolute URL containing /uploads/, we want to replace the host and port
  // with the actual env.staticUrl so it resolves properly on mobile!
  if (/^https?:\/\//i.test(url)) {
    const uploadsIndex = url.indexOf("/uploads/");
    if (uploadsIndex !== -1) {
      return `${env.staticUrl}${url.substring(uploadsIndex)}`;
    }
  }

  return url;
}

export function resolveAssetSource(url: string | null | undefined) {
  const resolved = resolveAssetUrl(url);
  if (!resolved) return undefined;
  if (/^https?:\/\//i.test(resolved)) {
    return { uri: resolved };
  }
  return resolved;
}

// Attach our app JWT when one is present. Backend treats it as optional
// (so the GraduationProject test app keeps working without one).
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// The backend wraps every response as { success, data, ... } or { success: false, error }.
// Unwrap the data envelope so callers see the payload directly.
apiClient.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body && typeof body === "object" && "success" in body) {
      if (body.success) {
        resp.data = body.data !== undefined ? body.data : body;
        return resp;
      }
      return Promise.reject(new Error(body.error ?? "Request failed"));
    }
    return resp;
  },
  (err) => {
    const msg = err?.response?.data?.error ?? err?.message ?? "Network error";
    return Promise.reject(new Error(msg));
  },
);
