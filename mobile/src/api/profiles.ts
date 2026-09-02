import { api } from "./client";
import { PublicProfile } from "../types";

export async function fetchPublicProfile(uin: number): Promise<PublicProfile> {
  const { data } = await api.get<PublicProfile>(`/profiles/${uin}`);
  return data;
}
