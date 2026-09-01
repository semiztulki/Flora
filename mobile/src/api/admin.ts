import { api } from "./client";
import { AdminUserView } from "../types";

export async function lookupUser(uin: number): Promise<AdminUserView> {
  const { data } = await api.get<AdminUserView>(`/admin/users/${uin}`);
  return data;
}

export async function banUser(
  userId: number,
  durationMinutes: number | null,
  reason: string
): Promise<AdminUserView> {
  const { data } = await api.post<AdminUserView>(`/admin/users/${userId}/ban`, {
    duration_minutes: durationMinutes,
    reason,
  });
  return data;
}

export async function unbanUser(userId: number): Promise<AdminUserView> {
  const { data } = await api.post<AdminUserView>(`/admin/users/${userId}/unban`);
  return data;
}

/** Hands a user a specific UIN — the escape hatch for "pretty" numbers
 * (repdigits, round thousands, runs, palindromes) held back from random
 * registration. */
export async function reassignUin(userId: number, uin: number): Promise<AdminUserView> {
  const { data } = await api.post<AdminUserView>(`/admin/users/${userId}/uin`, { uin });
  return data;
}
