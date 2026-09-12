import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse } from "./api";
import { setToken } from "./api";

interface AuthState {
  user: AuthResponse["user"] | null;
  account: AuthResponse["account"] | null;
  isAuthenticated: boolean;
  login: (auth: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "monitoring-saas-session";

function loadStoredSession(): { user: AuthResponse["user"]; account: AuthResponse["account"] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredSession();
  const [user, setUser] = useState(stored?.user ?? null);
  const [account, setAccount] = useState(stored?.account ?? null);

  const login = (auth: AuthResponse) => {
    setToken(auth.token);
    setUser(auth.user);
    setAccount(auth.account);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: auth.user, account: auth.account }));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAccount(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, account, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
