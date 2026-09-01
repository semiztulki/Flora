import { api } from "./client";
import { Group, GroupMessage } from "../types";

export async function fetchGroups(): Promise<Group[]> {
  const { data } = await api.get<Group[]>("/groups");
  return data;
}

export async function createGroup(name: string, memberUins: number[]): Promise<Group> {
  const { data } = await api.post<Group>("/groups", {
    name,
    member_uins: memberUins,
  });
  return data;
}

export async function addGroupMember(groupId: number, uin: number): Promise<Group> {
  const { data } = await api.post<Group>(`/groups/${groupId}/members`, { uin });
  return data;
}

export async function fetchGroupHistory(groupId: number, sinceId = 0): Promise<GroupMessage[]> {
  const { data } = await api.get<GroupMessage[]>(`/groups/${groupId}/messages`, {
    params: sinceId ? { since_id: sinceId } : undefined,
  });
  return data;
}
