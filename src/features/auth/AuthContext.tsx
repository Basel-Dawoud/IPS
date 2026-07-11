import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "./api";
import { clearStoredToken, getStoredToken, setStoredToken } from "./token";
import type { InternalUser } from "./types";

interface AuthContextValue {
  /** Only ever set when internalRole is present — a plain client login is not enough. */
  user: InternalUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_ADMIN_MESSAGE = "This account does not have admin access.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<InternalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi
      .getMe()
      .then((me) => {
        if (me.internalRole) {
          setUser(me);
        } else {
          clearStoredToken();
        }
      })
      .catch(() => clearStoredToken())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password);
    if (!result.user.internalRole) {
      throw new Error(NOT_ADMIN_MESSAGE);
    }
    setStoredToken(result.token);
    setUser(result.user);
  }

  function logout() {
    clearStoredToken();
    setUser(null);
  }

  function hasPermission(key: string) {
    return user?.internalRole?.permissions.includes(key) ?? false;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
