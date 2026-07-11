// Shared with the axiosClient interceptor, which cannot import AuthContext
// (would create a circular dependency: AuthContext -> api -> axiosClient).
const TOKEN_KEY = "navimind_internal_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
