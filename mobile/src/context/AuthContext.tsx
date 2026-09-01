import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import * as authApi from "../api/auth";
import { clearToken, getToken, saveToken } from "../api/storage";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (update: { displayName?: string; bio?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getToken()
      .then(async (stored) => {
        if (!stored) return;
        try {
          const me = await authApi.fetchMe();
          setToken(stored);
          setUser(me);
        } catch {
          await clearToken();
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleAuthResponse = async (response: { access_token: string; user: User }) => {
    await saveToken(response.access_token);
    setToken(response.access_token);
    setUser(response.user);
  };

  const login = async (username: string, password: string) => {
    const response = await authApi.login(username, password);
    await handleAuthResponse(response);
  };

  const register = async (username: string, displayName: string, password: string) => {
    const response = await authApi.register(username, displayName, password);
    await handleAuthResponse(response);
  };

  const logout = async () => {
    await clearToken();
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (update: { displayName?: string; bio?: string }) => {
    const updated = await authApi.updateProfile(update);
    setUser(updated);
  };

  const value = useMemo(
    () => ({ user, token, isLoading, login, register, logout, updateProfile }),
    [user, token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
