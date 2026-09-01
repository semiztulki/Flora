import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import * as authApi from "../api/auth";
import { clearToken, getToken, saveToken } from "../api/storage";
import { BanInfo, User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  banInfo: BanInfo | null;
  login: (uin: number, password: string) => Promise<void>;
  register: (displayName: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (update: { displayName?: string; bio?: string }) => Promise<void>;
  reportBanned: (info: BanInfo) => void;
  clearBanInfo: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function extractBanInfo(error: any): BanInfo | null {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === "object" && detail.code === "banned") {
    return { reason: detail.reason, expiresAt: detail.expires_at ?? null };
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);

  useEffect(() => {
    getToken()
      .then(async (stored) => {
        if (!stored) return;
        try {
          const me = await authApi.fetchMe();
          setToken(stored);
          setUser(me);
        } catch (e) {
          const ban = extractBanInfo(e);
          if (ban) setBanInfo(ban);
          await clearToken();
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleAuthResponse = async (response: { access_token: string; user: User }) => {
    await saveToken(response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    setBanInfo(null);
  };

  const login = async (uin: number, password: string) => {
    try {
      const response = await authApi.login(uin, password);
      await handleAuthResponse(response);
    } catch (e) {
      const ban = extractBanInfo(e);
      if (ban) {
        setBanInfo(ban);
        return;
      }
      throw e;
    }
  };

  const register = async (displayName: string, password: string) => {
    const response = await authApi.register(displayName, password);
    await handleAuthResponse(response);
    return response.user;
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

  /** Called when a live WS connection gets cut because the account was just
   * banned — signs the user out and shows the same ban screen a blocked
   * login attempt would. */
  const reportBanned = (info: BanInfo) => {
    setBanInfo(info);
    clearToken();
    setToken(null);
    setUser(null);
  };

  const clearBanInfo = () => setBanInfo(null);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      banInfo,
      login,
      register,
      logout,
      updateProfile,
      reportBanned,
      clearBanInfo,
    }),
    [user, token, isLoading, banInfo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
