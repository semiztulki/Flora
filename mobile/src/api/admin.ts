import { api } from "./client";
import { AdminUserView } from "../types";

export async function lookupUser(username: string): Promise<AdminUserView> {
  const { data } = await api.get<AdminUserView>(`/admin/users/${username}`);
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
