import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import * as authApi from "../api/auth";
import { clearToken, getToken, saveToken } from "../api/storage";
import { setDbScope, wipeLocalDb } from "../db/database";
import { BanInfo, User } from "../types";
import { clearAttachmentCache, setAttachmentCacheScope } from "../utils/attachmentCache";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  banInfo: BanInfo | null;
  login: (uin: number, password: string) => Promise<void>;
  register: (displayName: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (update: authApi.ProfileUpdateInput) => Promise<void>;
  updateAvatar: (attachmentId: number | null) => Promise<void>;
  reportBanned: (info: BanInfo) => void;
  clearBanInfo: () => void;
  /** Wipes this account's local message log and cached attachments on THIS
   * device only — nothing server-side is touched. Mainly an escape hatch for
   * dev testing (the backend DB got wiped and reused low ids, so this
   * device's stale local cache no longer matches reality), but also useful
   * as a plain "reset local data" action. */
  wipeLocalData: () => Promise<void>;
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

  // Scopes local storage (SQLite message log + cached attachment files) to
  // whichever account is actually signed in right now — covers login,
  // register, session restore, and logout/ban in one place, since all of
  // them ultimately just change `user`.
  useEffect(() => {
    setDbScope(user?.id ?? null);
    setAttachmentCacheScope(user?.id ?? null);
  }, [user?.id]);

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

  const updateProfile = async (update: authApi.ProfileUpdateInput) => {
    const updated = await authApi.updateProfile(update);
    setUser(updated);
  };

  const updateAvatar = async (attachmentId: number | null) => {
    const updated = await authApi.updateAvatar(attachmentId);
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

  const wipeLocalData = async () => {
    await wipeLocalDb();
    await clearAttachmentCache();
  };

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
      updateAvatar,
      reportBanned,
      clearBanInfo,
      wipeLocalData,
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
